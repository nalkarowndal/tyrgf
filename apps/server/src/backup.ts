import { createCipheriv, createDecipheriv, randomBytes, scryptSync, randomUUID } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  statSync,
  existsSync,
  mkdtempSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { createApp } from './app';
import { acquireDataLock } from './runtime-lock';
import { settingsSchema, providerId } from '../../../packages/shared/src/contracts';
import { memoryInput, skillInput } from '../../../packages/shared/src/knowledge';

const limit = 32 * 1024 * 1024;
const magic = Buffer.from('AURA-BACKUP-1\n');
const id = z.string().uuid();
const date = z.string().datetime();
const preference = settingsSchema
  .pick({ theme: true, advanced: true, contextBudget: true, hiddenMenus: true })
  .strict();
const sessionSchema = z
  .object({ id, title: z.string().max(200), createdAt: date, updatedAt: date })
  .strict();
const messageSchema = z
  .object({
    seq: z.number().int().positive(),
    id,
    sessionId: id,
    role: z.enum(['user', 'assistant']),
    content: z.string().max(2 * 1024 * 1024),
    status: z.enum(['complete', 'streaming', 'interrupted', 'error']),
    provider: providerId,
    model: z.string().max(150),
    createdAt: date,
  })
  .strict();
const schema = z
  .object({
    format: z.literal('aura-data'),
    version: z.literal(1),
    createdAt: date,
    preferences: preference,
    sessions: z.array(sessionSchema).max(10000),
    messages: z.array(messageSchema).max(100000),
    memories: z
      .array(
        memoryInput.extend({
          id,
          version: z.number().int().positive(),
          createdAt: date,
          updatedAt: date,
        }),
      )
      .max(100),
    skills: z
      .array(
        skillInput.extend({
          id,
          version: z.number().int().positive(),
          createdAt: date,
          updatedAt: date,
        }),
      )
      .max(100),
    boundaries: z
      .array(z.object({ sessionId: id, seq: z.number().int().nonnegative() }).strict())
      .max(10000),
  })
  .strict()
  .superRefine((data, ctx) => {
    const unique = (values: unknown[]) => new Set(values).size === values.length;
    const sessions = new Set(data.sessions.map((s) => s.id));
    const lastSeq = new Map<string, number>();
    for (const m of data.messages)
      lastSeq.set(m.sessionId, Math.max(lastSeq.get(m.sessionId) ?? 0, m.seq));
    const valid =
      unique(data.sessions.map((s) => s.id)) &&
      unique(data.messages.map((m) => m.id)) &&
      unique(data.messages.map((m) => m.seq)) &&
      unique(data.memories.map((m) => m.id)) &&
      unique(data.skills.map((m) => m.id)) &&
      unique(data.boundaries.map((b) => b.sessionId)) &&
      data.messages.every((m) => sessions.has(m.sessionId)) &&
      data.boundaries.every(
        (b) => sessions.has(b.sessionId) && b.seq <= (lastSeq.get(b.sessionId) ?? 0),
      );
    if (!valid)
      ctx.addIssue({ code: 'custom', message: '백업의 ID 또는 대화 참조가 올바르지 않습니다.' });
  });
export type BackupData = z.infer<typeof schema>;
function key(password: string, salt: Buffer) {
  if (password.length < 12 || password.length > 256)
    throw new Error('백업 암호는 12~256자로 입력하세요.');
  return scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}
export function sealBackup(input: unknown, password: string): Buffer {
  const data = Buffer.from(JSON.stringify(schema.parse(input)));
  if (data.length > limit - 128) throw new Error('백업 크기는 32MiB 이하여야 합니다.');
  const salt = randomBytes(16),
    iv = randomBytes(12),
    secret = key(password, salt);
  try {
    const cipher = createCipheriv('aes-256-gcm', secret, iv, { authTagLength: 16 });
    cipher.setAAD(magic);
    const bytes = Buffer.concat([cipher.update(data), cipher.final()]);
    return Buffer.concat([magic, salt, iv, cipher.getAuthTag(), bytes]);
  } finally {
    secret.fill(0);
  }
}
export function openBackup(bytes: Buffer, password: string): BackupData {
  const p = magic.length;
  if (bytes.length > limit || bytes.length < p + 45 || !bytes.subarray(0, p).equals(magic))
    throw new Error('지원하지 않는 백업 형식 또는 크기입니다.');
  const secret = key(password, bytes.subarray(p, p + 16));
  let plain: Buffer;
  try {
    const cipher = createDecipheriv('aes-256-gcm', secret, bytes.subarray(p + 16, p + 28), {
      authTagLength: 16,
    });
    cipher.setAAD(magic);
    cipher.setAuthTag(bytes.subarray(p + 28, p + 44));
    plain = Buffer.concat([cipher.update(bytes.subarray(p + 44)), cipher.final()]);
  } catch {
    throw new Error(
      '백업 암호가 다르거나 파일이 손상되었습니다. 기존 데이터는 변경하지 않았습니다.',
    );
  } finally {
    secret.fill(0);
  }
  return schema.parse(JSON.parse(plain.toString('utf8')));
}
async function capture(dir: string): Promise<BackupData> {
  const app = createApp({ dataDir: dir, port: 4317 });
  try {
    const db = app.store.db;
    const payloads = (table: 'memories' | 'skills') =>
      db
        .prepare(`SELECT payload FROM ${table}`)
        .all()
        .map((row) => JSON.parse(String(row.payload)));
    return schema.parse({
      format: 'aura-data',
      version: 1,
      createdAt: new Date().toISOString(),
      preferences: preference.parse(
        Object.fromEntries(
          Object.entries(app.store.settings()).filter(([k]) =>
            ['theme', 'advanced', 'contextBudget', 'hiddenMenus'].includes(k),
          ),
        ),
      ),
      sessions: app.store.sessions(),
      messages: db.prepare('SELECT * FROM messages ORDER BY seq').all(),
      memories: payloads('memories').map((m) => ({
        id: m.id,
        title: m.title,
        category: m.category,
        content: m.content,
        version: m.version,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      })),
      skills: payloads('skills').map((s) => ({
        id: s.id,
        name: s.name,
        purpose: s.purpose,
        steps: s.steps,
        tools: s.tools,
        verification: s.verification,
        version: s.version,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
      boundaries: db.prepare('SELECT * FROM context_boundaries').all(),
    });
  } finally {
    await app.close();
  }
}
export async function exportBackup(dir: string, file: string, password: string) {
  const release = await acquireDataLock(dir);
  try {
    if (!existsSync(join(dir, 'aura.sqlite'))) throw new Error('백업할 AURA 데이터가 없습니다.');
    const bytes = sealBackup(await capture(dir), password);
    writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 });
  } finally {
    await release();
  }
}
export async function restoreBackup(
  dir: string,
  file: string,
  password: string,
): Promise<{ safetyCopy?: string }> {
  if (statSync(file).size > limit) throw new Error('백업 크기는 32MiB 이하여야 합니다.');
  const data = openBackup(readFileSync(file), password);
  const release = await acquireDataLock(dir);
  let stage = '';
  try {
    stage = mkdtempSync(join(dirname(resolve(dir)), '.aura-restore-'));
    const app = createApp({ dataDir: stage, port: 4317 });
    try {
      app.store.transaction(() => {
        app.store.saveSettings({
          ...settingsSchema.parse({}),
          ...data.preferences,
          onboarded: true,
        });
        const db = app.store.db;
        for (const s of data.sessions)
          db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(
            s.id,
            s.title,
            s.createdAt,
            s.updatedAt,
          );
        for (const m of data.messages)
          db.prepare(
            'INSERT INTO messages(seq,id,sessionId,role,content,status,provider,model,createdAt) VALUES(?,?,?,?,?,?,?,?,?)',
          ).run(
            m.seq,
            m.id,
            m.sessionId,
            m.role,
            m.content,
            m.status === 'streaming' ? 'interrupted' : m.status,
            m.provider,
            m.model,
            m.createdAt,
          );
        for (const m of data.memories)
          db.prepare('INSERT INTO memories VALUES(?,?)').run(
            m.id,
            JSON.stringify({ ...m, active: false, source: { kind: 'user' } }),
          );
        for (const s of data.skills)
          db.prepare('INSERT INTO skills VALUES(?,?)').run(
            s.id,
            JSON.stringify({
              ...s,
              approvedVersion: null,
              sourceTaskId: randomUUID(),
              permissions: ['복원된 절차와 도구 권한을 다시 확인하세요.'],
            }),
          );
        for (const b of data.boundaries)
          db.prepare('INSERT INTO context_boundaries VALUES(?,?)').run(b.sessionId, b.seq);
      });
    } finally {
      await app.close();
    }
    let safetyCopy: string | undefined;
    if (existsSync(join(dir, 'aura.sqlite'))) {
      safetyCopy = join(dir, `before-restore-${randomUUID()}.aura-backup`);
      writeFileSync(safetyCopy, sealBackup(await capture(dir), password), {
        flag: 'wx',
        mode: 0o600,
      });
    }
    // capture() closes the last SQLite connection and checkpoints WAL before replacement.
    for (const suffix of ['-wal', '-shm']) {
      const path = join(dir, 'aura.sqlite' + suffix);
      if (existsSync(path))
        throw new Error('데이터베이스가 아직 사용 중입니다. 복원을 중단했습니다.');
    }
    renameSync(join(stage, 'aura.sqlite'), join(dir, 'aura.sqlite'));
    return { safetyCopy };
  } finally {
    if (stage) rmSync(stage, { recursive: true, force: true });
    await release();
  }
}
