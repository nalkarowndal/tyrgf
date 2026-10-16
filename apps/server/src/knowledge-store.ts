import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import type { Express } from 'express';
import { memoryInput, type MemoryEntry } from '../../../packages/shared/src/knowledge';
import type { Store } from './store';
import { PublicError } from './providers';
const versionBody = z.object({ version: z.number().int().positive() }).strict();
export class KnowledgeStore {
  constructor(
    readonly store: Store,
    private onInvalidate: () => void = () => {},
  ) {
    store.db.exec(`CREATE TABLE IF NOT EXISTS memories(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS knowledge_meta(id INTEGER PRIMARY KEY CHECK(id=1),epoch INTEGER NOT NULL);
  INSERT OR IGNORE INTO knowledge_meta VALUES(1,0);
  CREATE TABLE IF NOT EXISTS context_boundaries(sessionId TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,seq INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS skills(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
  PRAGMA user_version=4;`);
  }
  get epoch() {
    return (this.store.db.prepare('SELECT epoch FROM knowledge_meta').get() as { epoch: number })
      .epoch;
  }
  history(id: string) {
    const row = this.store.db
      .prepare('SELECT seq FROM context_boundaries WHERE sessionId=?')
      .get(id) as { seq: number } | undefined;
    return this.store.messages(id).filter((m) => m.seq > (row?.seq ?? 0));
  }
  source(id: string, throughSeq = Number.MAX_SAFE_INTEGER) {
    return this.history(id).filter((m) => m.seq <= throughSeq && m.status === 'complete');
  }
  sourceHash(id: string, throughSeq: number) {
    return createHash('sha256')
      .update(JSON.stringify(this.source(id, throughSeq).map((m) => [m.id, m.content, m.role])))
      .digest('hex');
  }
  memories(q = '', category = ''): MemoryEntry[] {
    return (
      this.store.db.prepare('SELECT payload FROM memories ORDER BY rowid DESC').all() as {
        payload: string;
      }[]
    )
      .map((r) => JSON.parse(r.payload) as MemoryEntry)
      .map((m) => ({ ...m, active: m.active && this.valid(m) }))
      .filter(
        (m) =>
          (!category || m.category === category) &&
          (!q || (m.title + ' ' + m.content).toLocaleLowerCase().includes(q.toLocaleLowerCase())),
      );
  }
  memory(id: string) {
    const row = this.store.db.prepare('SELECT payload FROM memories WHERE id=?').get(id) as
      { payload: string } | undefined;
    if (!row) throw new PublicError('기억을 찾을 수 없습니다.', 404);
    return JSON.parse(row.payload) as MemoryEntry;
  }
  private put(m: MemoryEntry) {
    this.store.db
      .prepare(
        'INSERT INTO memories VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
      )
      .run(m.id, JSON.stringify(m));
    return m;
  }
  private invalidate() {
    this.store.db.exec(
      `UPDATE knowledge_meta SET epoch=epoch+1; INSERT INTO context_boundaries SELECT id,COALESCE((SELECT MAX(seq) FROM messages WHERE sessionId=sessions.id),0) FROM sessions WHERE true ON CONFLICT(sessionId) DO UPDATE SET seq=excluded.seq;`,
    );
    for (const m of this.memories())
      if (m.source.kind === 'summary') {
        m.active = false;
        delete m.approvedAt;
        this.put(m);
      }
    this.onInvalidate();
  }
  createMemory(body: unknown, source: MemoryEntry['source'] = { kind: 'user' }) {
    const input = memoryInput.parse(body);
    if (this.memories().length >= 100)
      throw new PublicError('기억은 100개까지 저장할 수 있습니다. 먼저 정리해 주세요.');
    const now = new Date().toISOString();
    return this.put({
      ...input,
      id: randomUUID(),
      source,
      version: 1,
      active: false,
      createdAt: now,
      updatedAt: now,
    });
  }
  updateMemory(id: string, body: unknown) {
    const b = memoryInput.extend({ version: z.number().int().positive() }).strict().parse(body);
    const m = this.memory(id);
    this.match(m, b.version);
    return this.store.transaction(() => {
      this.invalidate();
      return this.put({
        ...m,
        title: b.title,
        category: b.category,
        content: b.content,
        source: { ...m.source, kind: 'user' },
        active: false,
        approvedAt: undefined,
        version: m.version + 1,
        updatedAt: new Date().toISOString(),
      });
    });
  }
  private match(m: MemoryEntry, version: number) {
    if (m.version !== version)
      throw new PublicError('기억이 변경되었습니다. 새로고침 후 현재 버전을 확인하세요.', 409);
  }
  private valid(m: MemoryEntry) {
    return (
      m.source.kind !== 'summary' ||
      (!!this.store.session(m.source.sessionId!) &&
        this.sourceHash(m.source.sessionId!, m.source.throughSeq!) === m.source.hash)
    );
  }
  approveMemory(id: string, version: number) {
    const m = this.memory(id);
    this.match(m, version);
    if (!this.valid(m))
      throw new PublicError('요약 원문이 바뀌었습니다. 새 요약을 만들어 주세요.', 409);
    m.active = true;
    m.approvedAt = new Date().toISOString();
    return this.put(m);
  }
  deleteMemory(id: string, version: number) {
    const m = this.memory(id);
    this.match(m, version);
    this.store.transaction(() => {
      this.store.db.prepare('DELETE FROM memories WHERE id=?').run(id);
      this.invalidate();
    });
  }
  context(budget = 6000) {
    let text = '',
      count = 0,
      omitted = 0;
    for (const m of this.memories()) {
      if (!m.active || !this.valid(m)) continue;
      const item =
        JSON.stringify({ title: m.title, category: m.category, content: m.content }) + '\n';
      if (text.length + item.length > budget) {
        omitted++;
        continue;
      }
      text += item;
      count++;
    }
    return { text, count, omitted };
  }
  mount(app: Express) {
    app.get('/api/memories', (req, res) =>
      res.json(
        this.memories(
          z
            .string()
            .max(200)
            .parse(req.query.q ?? ''),
          z
            .string()
            .max(40)
            .parse(req.query.category ?? ''),
        ),
      ),
    );
    app.get('/api/memories/context', (_req, res) => res.json(this.context()));
    app.get('/api/memories/export', (_req, res) =>
      res.json({ format: 1, exportedAt: new Date().toISOString(), memories: this.memories() }),
    );
    app.post('/api/memories', (req, res) => res.status(201).json(this.createMemory(req.body)));
    app.post('/api/memories/delete-all', (req, res) => {
      z.object({ confirm: z.literal(true) })
        .strict()
        .parse(req.body);
      this.store.transaction(() => {
        this.store.db.exec('DELETE FROM memories');
        this.invalidate();
      });
      res.json({ ok: true });
    });
    app.post('/api/memories/:id/update', (req, res) =>
      res.json(this.updateMemory(req.params.id, req.body)),
    );
    app.post('/api/memories/:id/approve', (req, res) =>
      res.json(this.approveMemory(req.params.id, versionBody.parse(req.body).version)),
    );
    app.post('/api/memories/:id/delete', (req, res) => {
      this.deleteMemory(req.params.id, versionBody.parse(req.body).version);
      res.json({ ok: true });
    });
  }
}
