import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Express } from 'express';
import type { Store } from './store';
import { PublicError } from './providers';
import { skillInput, type SavedSkill } from '../../../packages/shared/src/knowledge';
import type { AgentTask } from '../../../packages/shared/src/agent';
const versionBody = z.object({ version: z.number().int().positive() }).strict();
export class SkillsStore {
  constructor(private store: Store) {
    store.db.exec('CREATE TABLE IF NOT EXISTS skills(id TEXT PRIMARY KEY,payload TEXT NOT NULL)');
  }
  private put(s: SavedSkill) {
    this.store.db
      .prepare(
        'INSERT INTO skills VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
      )
      .run(s.id, JSON.stringify(s));
    return s;
  }
  get(id: string) {
    const r = this.store.db.prepare('SELECT payload FROM skills WHERE id=?').get(id) as
      { payload: string } | undefined;
    if (!r) throw new PublicError('스킬이 삭제되었거나 없습니다.', 409);
    return JSON.parse(r.payload) as SavedSkill;
  }
  list() {
    return (
      this.store.db.prepare('SELECT payload FROM skills ORDER BY rowid DESC').all() as {
        payload: string;
      }[]
    ).map((r) => {
      const s = JSON.parse(r.payload) as SavedSkill;
      const run = this.store.db
        .prepare(
          "SELECT payload FROM agent_tasks WHERE json_extract(payload,'$.skillId')=? ORDER BY rowid DESC LIMIT 1",
        )
        .get(s.id) as { payload: string } | undefined;
      if (run) {
        const t = JSON.parse(run.payload) as AgentTask;
        s.lastResult = {
          taskId: t.id,
          status: t.status,
          message: t.message,
          version: t.skillVersion!,
        };
      }
      return s;
    });
  }
  private permissions(tools: SavedSkill['tools']) {
    return [
      ...(tools.some((t) => t.startsWith('file.')) ? ['선택 폴더 읽기'] : []),
      ...(tools.includes('file.write') ? ['폴더 쓰기 권한', '파일 변경 시 매번 승인'] : []),
      ...(tools.includes('browser.read') ? ['공개 웹 읽기 권한', '웹 연결 시 매번 승인'] : []),
    ];
  }
  require(id: string, version: number) {
    const s = this.get(id);
    if (s.version !== version || s.approvedVersion !== version)
      throw new PublicError(
        '스킬이 변경되었거나 검토 승인이 필요합니다. 현재 버전으로 새 작업을 시작하세요.',
        409,
      );
    return s;
  }
  fromTask(id: string) {
    const r = this.store.db.prepare('SELECT payload FROM agent_tasks WHERE id=?').get(id) as
      { payload: string } | undefined;
    if (!r) throw new PublicError('작업을 찾을 수 없습니다.', 404);
    const t = JSON.parse(r.payload) as AgentTask;
    if (t.status !== 'completed')
      throw new PublicError('완료된 작업만 스킬로 저장할 수 있습니다.', 409);
    if (this.list().length >= 100) throw new PublicError('스킬은 100개까지 저장할 수 있습니다.');
    const done = t.steps.filter((s) => s.status === 'succeeded');
    const input = skillInput.parse({
      name: t.goal.slice(0, 100),
      purpose: t.goal,
      steps: done.map((s) => s.reason),
      tools: [...new Set(done.map((s) => s.tool))],
      verification:
        '최소 2개 도구 성공 후 읽거나 저장한 파일의 정체성과 내용을 비교한다. 결과의 의미적 정확성은 직접 확인한다.',
    });
    const now = new Date().toISOString();
    return this.put({
      ...input,
      id: randomUUID(),
      version: 1,
      approvedVersion: null,
      sourceTaskId: id,
      permissions: this.permissions(input.tools),
      createdAt: now,
      updatedAt: now,
    });
  }
  mount(app: Express) {
    app.get('/api/skills', (_req, res) => res.json(this.list()));
    app.post('/api/skills/from-task', (req, res) =>
      res
        .status(201)
        .json(
          this.fromTask(z.object({ taskId: z.string().uuid() }).strict().parse(req.body).taskId),
        ),
    );
    app.post('/api/skills/:id/update', (req, res) => {
      const b = skillInput
        .extend({ version: z.number().int().positive() })
        .strict()
        .parse(req.body);
      const s = this.get(req.params.id);
      if (s.version !== b.version)
        throw new PublicError('스킬 버전이 바뀌었습니다. 새로고침해 주세요.', 409);
      res.json(
        this.put({
          ...s,
          ...b,
          version: s.version + 1,
          approvedVersion: null,
          permissions: this.permissions(b.tools),
          updatedAt: new Date().toISOString(),
        }),
      );
    });
    app.post('/api/skills/:id/approve', (req, res) => {
      const { version } = versionBody.parse(req.body);
      const s = this.get(req.params.id);
      if (s.version !== version) throw new PublicError('현재 스킬 버전을 확인하세요.', 409);
      s.approvedVersion = version;
      res.json(this.put(s));
    });
    app.post('/api/skills/:id/delete', (req, res) => {
      const { version } = versionBody.parse(req.body);
      const s = this.get(req.params.id);
      if (s.version !== version) throw new PublicError('현재 스킬 버전을 확인하세요.', 409);
      this.store.db.prepare('DELETE FROM skills WHERE id=?').run(s.id);
      res.json({ ok: true });
    });
  }
}
