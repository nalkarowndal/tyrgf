import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  settingsSchema,
  type Settings,
  type ChatMessage,
  type Session,
  type ProviderId,
  type Usage,
} from '../../../packages/shared/src/contracts';
export class Store {
  readonly db: DatabaseSync;
  constructor(dir: string) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const file = join(dir, 'aura.sqlite');
    this.db = new DatabaseSync(file);
    chmodSync(file, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON;
   CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,title TEXT NOT NULL,createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS messages(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,sessionId TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,role TEXT NOT NULL,content TEXT NOT NULL,status TEXT NOT NULL,provider TEXT NOT NULL,model TEXT NOT NULL,createdAt TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS usage(id INTEGER PRIMARY KEY,provider TEXT NOT NULL,tokens INTEGER NOT NULL,estimated INTEGER NOT NULL,createdAt TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS messages_session ON messages(sessionId,seq);
   PRAGMA user_version=1;`);
    this.db.prepare("UPDATE messages SET status='interrupted' WHERE status='streaming'").run();
  }
  settings(): Settings {
    const row = this.db.prepare('SELECT value FROM settings WHERE id=1').get() as
      { value: string } | undefined;
    return settingsSchema.parse(row ? JSON.parse(row.value) : {});
  }
  saveSettings(value: Settings) {
    this.db
      .prepare(
        'INSERT INTO settings(id,value) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',
      )
      .run(JSON.stringify(value));
  }
  sessions(q = ''): Session[] {
    return this.db
      .prepare(
        `SELECT * FROM sessions WHERE title LIKE ? ESCAPE '\\' OR id IN (SELECT sessionId FROM messages WHERE content LIKE ? ESCAPE '\\') ORDER BY updatedAt DESC`,
      )
      .all(...Array(2).fill('%' + q.replace(/[\\%_]/g, '\\$&') + '%')) as unknown as Session[];
  }
  session(id: string) {
    return this.db.prepare('SELECT * FROM sessions WHERE id=?').get(id) as unknown as
      Session | undefined;
  }
  createSession(): Session {
    const s = {
      id: randomUUID(),
      title: '새 대화',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.db
      .prepare('INSERT INTO sessions VALUES(?,?,?,?)')
      .run(s.id, s.title, s.createdAt, s.updatedAt);
    return s;
  }
  rename(id: string, title: string) {
    this.db
      .prepare('UPDATE sessions SET title=?,updatedAt=? WHERE id=?')
      .run(title, new Date().toISOString(), id);
  }
  deleteSession(id: string) {
    this.db.prepare('DELETE FROM sessions WHERE id=?').run(id);
  }
  messages(id: string): ChatMessage[] {
    return this.db
      .prepare('SELECT * FROM messages WHERE sessionId=? ORDER BY seq')
      .all(id) as unknown as ChatMessage[];
  }
  addMessage(
    sessionId: string,
    role: ChatMessage['role'],
    content: string,
    config: Settings,
  ): string {
    const id = randomUUID();
    this.db
      .prepare(
        'INSERT INTO messages(id,sessionId,role,content,status,provider,model,createdAt) VALUES(?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        sessionId,
        role,
        content,
        role === 'assistant' ? 'streaming' : 'complete',
        config.provider,
        config.model,
        new Date().toISOString(),
      );
    this.db
      .prepare('UPDATE sessions SET updatedAt=? WHERE id=?')
      .run(new Date().toISOString(), sessionId);
    return id;
  }
  updateMessage(id: string, content: string, status: ChatMessage['status']) {
    this.db.prepare('UPDATE messages SET content=?,status=? WHERE id=?').run(content, status, id);
  }
  truncate(sessionId: string, seq: number) {
    this.db.prepare('DELETE FROM messages WHERE sessionId=? AND seq>=?').run(sessionId, seq);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  recordUsage(provider: ProviderId, tokens: number, estimated: boolean) {
    this.db
      .prepare('INSERT INTO usage(provider,tokens,estimated,createdAt) VALUES(?,?,?,?)')
      .run(provider, tokens, Number(estimated), new Date().toISOString());
  }
  usage(): Usage[] {
    return (
      this.db
        .prepare(
          'SELECT provider,count(*) AS requests,sum(tokens) AS tokens,max(estimated) AS estimated FROM usage GROUP BY provider',
        )
        .all() as unknown as Usage[]
    ).map((r) => ({ ...r, estimated: Boolean(r.estimated) }));
  }
  close() {
    this.db.close();
  }
}
