import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../apps/server/src/app';
import { exportBackup, restoreBackup, openBackup, sealBackup } from '../apps/server/src/backup';
import { acquireDataLock } from '../apps/server/src/runtime-lock';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
const dirs: string[] = [];
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'aura-backup-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const password = '테스트 전용 암호 123456';
async function seeded(dir: string, text = '보존할 한글 대화') {
  const app = createApp({ dataDir: dir, port: 4317 });
  const session = app.store.createSession();
  app.store.addMessage(session.id, 'user', text, app.store.settings());
  app.store.saveSettings({
    ...app.store.settings(),
    provider: 'groq',
    model: 'openai/gpt-oss-20b',
    externalConsent: true,
    freeConfirmed: true,
    theme: 'dark',
  });
  await app.close();
  return session;
}
it('round trips encrypted data while resetting external consent and approvals', async () => {
  const source = temp(),
    target = temp(),
    file = join(temp(), 'save.aura-backup');
  await seeded(source);
  const seededApp = createApp({ dataDir: source, port: 4317 });
  const now = new Date().toISOString();
  seededApp.store.db
    .prepare('INSERT INTO memories VALUES(?,?)')
    .run(
      randomUUID(),
      JSON.stringify({
        id: randomUUID(),
        title: '기억',
        category: '선호',
        content: '복원 후 재검토',
        version: 1,
        active: true,
        source: { kind: 'user' },
        createdAt: now,
        updatedAt: now,
      }),
    );
  seededApp.store.db
    .prepare('INSERT INTO skills VALUES(?,?)')
    .run(
      randomUUID(),
      JSON.stringify({
        id: randomUUID(),
        name: '절차',
        purpose: '확인',
        steps: ['읽기'],
        tools: ['file.read'],
        verification: '직접 확인',
        version: 1,
        approvedVersion: 1,
        createdAt: now,
        updatedAt: now,
      }),
    );
  const sid = seededApp.store.sessions()[0].id;
  seededApp.store.db.prepare('INSERT INTO context_boundaries VALUES(?,?)').run(sid, 1);
  await seededApp.close();
  await exportBackup(source, file, password);
  expect(readFileSync(file).includes(Buffer.from('보존할 한글'))).toBe(false);
  const decoded = openBackup(readFileSync(file), password);
  expect(decoded.sessions).toHaveLength(1);
  await restoreBackup(target, file, password);
  const app = createApp({ dataDir: target, port: 4317 });
  try {
    expect(app.store.messages(app.store.sessions()[0].id)[0].content).toBe('보존할 한글 대화');
    expect(app.store.settings()).toMatchObject({
      provider: 'mock',
      externalConsent: false,
      freeConfirmed: false,
      theme: 'dark',
    });
    expect(
      JSON.parse(String(app.store.db.prepare('SELECT payload FROM memories').get()!.payload))
        .active,
    ).toBe(false);
    expect(
      JSON.parse(String(app.store.db.prepare('SELECT payload FROM skills').get()!.payload))
        .approvedVersion,
    ).toBe(null);
    expect(app.store.db.prepare('SELECT seq FROM context_boundaries').get()!.seq).toBe(1);
  } finally {
    await app.close();
  }
});
it('refuses a newer database without downgrading its schema or making a backup', async () => {
  const dir = temp(),
    file = join(temp(), 'future.aura-backup');
  await seeded(dir);
  const db = new DatabaseSync(join(dir, 'aura.sqlite'));
  db.exec('PRAGMA user_version=99');
  db.close();
  await expect(exportBackup(dir, file, password)).rejects.toThrow('새 버전');
  const reopened = new DatabaseSync(join(dir, 'aura.sqlite'));
  try {
    expect(reopened.prepare('PRAGMA user_version').get()!.user_version).toBe(99);
  } finally {
    reopened.close();
  }
});
it('rejects wrong passwords and tampering before changing an existing database', async () => {
  const dir = temp(),
    file = join(temp(), 'save.aura-backup');
  await seeded(dir);
  await exportBackup(dir, file, password);
  const before = readFileSync(join(dir, 'aura.sqlite'));
  await expect(restoreBackup(dir, file, 'wrong-password-123')).rejects.toThrow();
  expect(readFileSync(join(dir, 'aura.sqlite'))).toEqual(before);
  const bytes = readFileSync(file);
  bytes[bytes.length - 1] ^= 1;
  expect(() => openBackup(bytes, password)).toThrow();
});
it('keeps an encrypted safety copy before replacement and never overwrites a backup', async () => {
  const source = temp(),
    target = temp(),
    file = join(temp(), 'save.aura-backup');
  await seeded(source, '새 기록');
  await seeded(target, '기존 기록');
  await exportBackup(source, file, password);
  await expect(exportBackup(source, file, password)).rejects.toThrow();
  const result = await restoreBackup(target, file, password);
  expect(openBackup(readFileSync(result.safetyCopy!), password).messages[0].content).toBe(
    '기존 기록',
  );
});
it('rejects unsupported versions, unknown fields, duplicate IDs and orphan messages', async () => {
  const dir = temp(),
    file = join(temp(), 'save.aura-backup');
  await seeded(dir);
  await exportBackup(dir, file, password);
  const data = openBackup(readFileSync(file), password);
  for (const invalid of [
    { ...data, version: 999 },
    { ...data, apiKey: 'never-accept' },
    { ...data, sessions: [...data.sessions, ...data.sessions] },
    { ...data, sessions: [] },
  ])
    expect(() => sealBackup(invalid, password)).toThrow();
  expect(() => sealBackup(data, 'short')).toThrow();
  expect(() => openBackup(Buffer.alloc(33 * 1024 * 1024), password)).toThrow();
});
it('blocks simultaneous app or maintenance access and releases the lock', async () => {
  const dir = temp();
  const release = await acquireDataLock(dir);
  try {
    await expect(acquireDataLock(dir)).rejects.toThrow('실행');
  } finally {
    await release();
  }
  const again = await acquireDataLock(dir);
  await again();
});
