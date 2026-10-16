import type { Express } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { Store } from './store';
import { PublicError } from './providers';
import { SafeFiles } from './safe-files';
import {
  toolInput,
  toolRegistry,
  type ToolRun,
  type ToolState,
} from '../../../packages/shared/src/tools';
import { readBrowser, validatePublicUrl } from './web-reader';
const empty = z.object({}).strict();
export class ToolService {
  readonly files: SafeFiles;
  onRootRevoked: (rootId: string) => void = () => {};
  browserEnabled = false;
  private active = new Map<string, AbortController>();
  private closed = false;
  private approvalGuard: (runId: string) => void = () => {};
  setApprovalGuard(guard: (runId: string) => void) {
    this.approvalGuard = guard;
  }
  constructor(
    private store: Store,
    dataDir: string,
  ) {
    this.files = new SafeFiles(dataDir);
    store.db.exec(
      `CREATE TABLE IF NOT EXISTS tool_runs(id TEXT PRIMARY KEY,status TEXT NOT NULL,expiresAt TEXT NOT NULL,payload TEXT NOT NULL); PRAGMA user_version=2;`,
    );
    for (const run of this.runs(undefined, true))
      if (run.status === 'pending' || run.status === 'running') {
        run.status = run.status === 'pending' ? 'expired' : 'interrupted';
        run.message =
          '앱이 재시작되었습니다. 자동 재실행하지 않습니다. 결과를 확인하고 새 요청을 만드세요.';
        this.save(run);
      }
  }
  private save(run: ToolRun) {
    this.store.db
      .prepare(
        'INSERT INTO tool_runs VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,expiresAt=excluded.expiresAt,payload=excluded.payload',
      )
      .run(run.id, run.status, run.expiresAt, JSON.stringify(run));
    return run;
  }
  private runs(limit?: number, activeOnly = false): ToolRun[] {
    const rows = this.store.db
      .prepare(
        'SELECT payload,status,expiresAt FROM tool_runs' +
          (activeOnly ? " WHERE status IN ('pending','running')" : '') +
          ' ORDER BY rowid DESC' +
          (limit ? ' LIMIT ?' : ''),
      )
      .all(...(limit ? [limit] : [])) as {
      payload: string;
      status: ToolRun['status'];
      expiresAt: string;
    }[];
    return rows.map((r) => ({
      ...JSON.parse(r.payload),
      status: r.status,
      expiresAt: r.expiresAt,
    }));
  }
  get(id: string) {
    const r = this.store.db
      .prepare('SELECT payload,status,expiresAt FROM tool_runs WHERE id=?')
      .get(id) as { payload: string; status: ToolRun['status']; expiresAt: string } | undefined;
    if (!r) throw new PublicError('실행 기록을 찾을 수 없습니다.', 404);
    return { ...JSON.parse(r.payload), status: r.status, expiresAt: r.expiresAt } as ToolRun;
  }
  private pending(id: string) {
    const run = this.get(id);
    if (run.status === 'pending' && Date.parse(run.expiresAt) <= Date.now()) {
      run.status = 'expired';
      run.message = '승인 시간이 지났습니다. 새 미리보기를 만들어 주세요.';
      this.save(run);
    }
    if (run.status !== 'pending')
      throw new PublicError('이미 처리했거나 만료된 요청입니다. 새 미리보기를 만들어 주세요.', 409);
    return run;
  }
  state(): ToolState {
    for (const run of this.runs(undefined, true))
      if (run.status === 'pending' && Date.parse(run.expiresAt) <= Date.now()) {
        run.status = 'expired';
        run.message = '승인 시간이 지났습니다.';
        this.save(run);
      }
    return {
      roots: [...this.files.roots.values()].map(({ id, path, write }) => ({ id, path, write })),
      browserEnabled: this.browserEnabled,
      filesSupported: this.files.supported,
      suggestedPath: this.files.suggestedPath,
      registry: toolRegistry,
      runs: this.runs(50).map((run) =>
        run.result ? { ...run, result: { ...run.result, screenshot: '' } } : run,
      ),
    };
  }
  private record(tool: string, target: string): ToolRun {
    return {
      id: randomUUID(),
      tool,
      target,
      status: 'pending',
      before: null,
      after: null,
      fingerprint: '',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      message: '내용을 확인하고 승인해 주세요.',
    };
  }
  preview(body: unknown) {
    const input = toolInput.parse(body);
    if (this.runs(undefined, true).filter((r) => r.status === 'pending').length >= 20)
      throw new PublicError('대기 중인 요청을 승인하거나 거절한 뒤 다시 시도하세요.', 429);
    if (input.tool === 'browser.read') {
      if (!this.browserEnabled)
        throw new PublicError('먼저 공개 웹페이지 읽기 권한을 켜 주세요.', 403);
      const url = validatePublicUrl(input.url);
      return this.save({
        ...this.record(input.tool, url.href),
        message:
          '이 주소를 해당 사이트로 전송합니다. URL에 개인정보가 없는지 확인하세요. 리다이렉트·로그인·입력은 지원하지 않습니다.',
      });
    }
    const root = this.files.root(input.rootId, true);
    const snapshot = this.files.snapshot(input.rootId, input.path);
    if (input.tool === 'file.delete' && snapshot.content === null)
      throw new PublicError('삭제할 파일이 없습니다.', 404);
    if (
      input.tool === 'file.write' &&
      (Buffer.byteLength(input.content) > 24000 || input.content.includes('\0'))
    )
      throw new PublicError('UTF-8 텍스트 24KB까지 저장할 수 있습니다.');
    return this.save({
      ...this.record(input.tool, join(root.path, input.path)),
      rootId: input.rootId,
      path: input.path,
      before: snapshot.content,
      after: input.tool === 'file.write' ? input.content : null,
      fingerprint: snapshot.fingerprint,
      message: '아래 전후 내용을 확인하세요. 한 번 승인하면 이 파일 하나에만 적용됩니다.',
    });
  }
  async approve(id: string) {
    const run = this.pending(id);
    this.approvalGuard(id);
    if (this.active.size)
      throw new PublicError('실행 중인 도구가 끝난 뒤 다시 시도해 주세요.', 409);
    const controller = new AbortController();
    if (run.rootId && run.path && run.before !== null)
      run.recoveryPath = this.files.recoveryPath(run.rootId, run.path, run.id);
    this.active.set(id, controller);
    run.status = 'running';
    run.message = '실행 중입니다.';
    const claimed = this.store.db
      .prepare(
        "UPDATE tool_runs SET status='running',payload=? WHERE id=? AND status='pending' AND expiresAt>?",
      )
      .run(JSON.stringify(run), id, new Date().toISOString());
    if (claimed.changes !== 1) {
      this.active.delete(id);
      throw new PublicError('이미 처리했거나 만료된 요청입니다.', 409);
    }
    try {
      if (run.tool === 'browser.read') {
        if (!this.browserEnabled) throw new PublicError('웹 읽기 권한이 해제되었습니다.', 403);
        run.result = await readBrowser(
          run.target,
          AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
        );
      } else {
        const result = this.files.change(
          run.rootId!,
          run.path!,
          run.fingerprint,
          run.after,
          run.id,
        );
        run.fingerprint = result.fingerprint;
      }
      if (controller.signal.aborted) throw new PublicError('실행을 중단했습니다.');
      run.status = 'succeeded';
      run.message = '실행 결과를 확인했습니다.';
    } catch (e) {
      run.status = controller.signal.aborted ? 'interrupted' : 'failed';
      run.message =
        e instanceof PublicError
          ? e.message
          : '실행하지 못했습니다. 경로·연결·브라우저 설치 상태를 확인하고 새 요청을 만드세요.';
    } finally {
      this.active.delete(id);
    }
    return this.closed ? run : this.save(run);
  }
  private invalidate(predicate: (r: ToolRun) => boolean) {
    for (const run of this.runs(undefined, true))
      if (predicate(run)) {
        if (run.status === 'pending') {
          run.status = 'denied';
          run.message = '권한을 해제하여 요청을 취소했습니다.';
          this.save(run);
        }
        this.active.get(run.id)?.abort();
      }
  }
  deny(id: string) {
    const run = this.pending(id);
    run.status = 'denied';
    run.message = '실행하지 않았습니다.';
    return this.save(run);
  }
  stop(id: string) {
    this.active.get(id)?.abort();
  }
  read(rootId: string, path: string, asFile = false) {
    const root = this.files.root(rootId),
      run = this.record(path ? 'file.read' : 'file.list', join(root.path, path));
    const snapshot = asFile ? this.files.snapshot(rootId, path) : undefined;
    if (asFile && snapshot?.content === null) throw new PublicError('파일이 없습니다.', 404);
    const result = snapshot ? { content: snapshot.content! } : this.files.read(rootId, path);
    run.status = 'succeeded';
    run.message = '허용한 범위에서 읽었습니다.';
    this.save(run);
    return { run, result, fingerprint: snapshot?.fingerprint };
  }
  mount(app: Express) {
    app.get('/api/tools', (_req, res) => res.json(this.state()));
    app.get('/api/tools/runs/:id', (req, res) => res.json(this.get(req.params.id)));
    app.post('/api/tools/roots', (req, res) => {
      const b = z
        .object({ path: z.string().min(1).max(1000), write: z.boolean() })
        .strict()
        .parse(req.body);
      res.status(201).json(this.files.grant(b.path, b.write));
    });
    app.post('/api/tools/roots/revoke', (req, res) => {
      const { rootId } = z.object({ rootId: z.string() }).strict().parse(req.body);
      this.files.roots.delete(rootId);
      this.onRootRevoked(rootId);
      this.invalidate((r) => r.rootId === rootId);
      res.json({ ok: true });
    });
    app.post('/api/tools/permissions', (req, res) => {
      const { browserEnabled } = z.object({ browserEnabled: z.boolean() }).strict().parse(req.body);
      this.browserEnabled = browserEnabled;
      if (!browserEnabled) this.invalidate((r) => r.tool === 'browser.read');
      res.json({ ok: true });
    });
    app.post('/api/tools/read', (req, res) => {
      const { rootId, path } = z
        .object({ rootId: z.string(), path: z.string().max(500) })
        .strict()
        .parse(req.body);
      const root = this.files.root(rootId),
        run = this.record('file.read', join(root.path, path));
      try {
        const result = this.files.read(rootId, path);
        run.status = 'succeeded';
        run.message = '이 화면에서 읽었습니다. AI로 전송하지 않았습니다.';
        this.save(run);
        res.json(result);
      } catch (e) {
        run.status = 'failed';
        run.message = '읽기가 차단되었거나 파일을 찾지 못했습니다.';
        this.save(run);
        throw e;
      }
    });
    app.post('/api/tools/preview', (req, res) => res.status(201).json(this.preview(req.body)));
    app.post('/api/tools/runs/:id/approve', async (req, res) => {
      empty.parse(req.body);
      res.json(await this.approve(req.params.id));
    });
    app.post('/api/tools/runs/:id/deny', (req, res) => {
      empty.parse(req.body);
      const run = this.pending(req.params.id);
      run.status = 'denied';
      run.message = '실행하지 않았습니다.';
      res.json(this.save(run));
    });
    app.post('/api/tools/runs/:id/stop', (req, res) => {
      empty.parse(req.body);
      this.active.get(req.params.id)?.abort();
      res.json({ ok: true });
    });
    app.post('/api/tools/runs/:id/restore', (req, res) => {
      empty.parse(req.body);
      const old = this.get(req.params.id);
      if (old.status !== 'succeeded' || !['file.write', 'file.delete'].includes(old.tool))
        throw new PublicError('복구할 수 있는 파일 변경 기록이 아닙니다.', 409);
      this.files.root(old.rootId!, true);
      if (this.files.snapshot(old.rootId!, old.path!).fingerprint !== old.fingerprint)
        throw new PublicError(
          '실행 이후 파일이 바뀌었습니다. 현재 파일을 덮어쓰지 않도록 복구를 중단했습니다.',
          409,
        );
      const run = this.preview(
        old.before === null
          ? { tool: 'file.delete', rootId: old.rootId, path: old.path }
          : { tool: 'file.write', rootId: old.rootId, path: old.path, content: old.before },
      );
      run.restoreOf = old.id;
      res.status(201).json(this.save(run));
    });
  }
  close() {
    this.closed = true;
    for (const c of this.active.values()) c.abort();
    this.files.roots.clear();
  }
}
