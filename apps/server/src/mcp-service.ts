import type { Express } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Store } from './store';
import type { ToolService } from './tool-service';
import { PublicError } from './providers';
import { discover, executable, redact, runtime, validateArguments } from './mcp-runtime';
import {
  mcpCatalog,
  type McpProfile,
  type McpRun,
  type McpServer,
  type McpTool,
} from '../../../packages/shared/src/mcp';
const empty = z.object({}).strict();
type Live = ReturnType<typeof runtime> & {
  generation: string;
  controller: AbortController;
  tools: McpTool[];
  allowed: string[];
  connected: boolean;
  token: string;
  busy: boolean;
  version?: string;
};
export class McpService {
  private profiles = new Map<string, McpProfile>();
  private live = new Map<string, Live>();
  private messages = new Map<string, string>();
  private closed = false;
  private closing = new Set<Promise<void>>();
  constructor(
    private store: Store,
    private tools: ToolService,
    private dataDir: string,
  ) {
    store.db
      .exec(`CREATE TABLE IF NOT EXISTS mcp_profiles(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS mcp_runs(id TEXT PRIMARY KEY,status TEXT NOT NULL,payload TEXT NOT NULL); PRAGMA user_version=5;`);
    for (const row of store.db.prepare('SELECT payload FROM mcp_profiles').all() as {
      payload: string;
    }[]) {
      const p = JSON.parse(row.payload) as McpProfile;
      this.profiles.set(p.id, p);
    }
    for (const r of this.runs(true)) {
      r.status = r.status === 'running' ? 'interrupted' : 'expired';
      r.result = '앱이 재시작되어 만료되었습니다. 새 연결과 승인이 필요합니다.';
      this.save(r);
    }
    tools.onRootRevoked = (rootId) => {
      for (const p of this.profiles.values()) if (p.rootId === rootId) void this.disconnect(p.id);
    };
  }
  private save(r: McpRun) {
    if (!this.closed)
      this.store.db
        .prepare(
          'INSERT INTO mcp_runs VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,payload=excluded.payload',
        )
        .run(r.id, r.status, JSON.stringify(r));
    return r;
  }
  private runs(active = false): McpRun[] {
    return (
      this.store.db
        .prepare(
          'SELECT payload FROM mcp_runs' +
            (active ? " WHERE status IN ('pending','running')" : ' ORDER BY rowid DESC LIMIT 100'),
        )
        .all() as { payload: string }[]
    ).map((r) => JSON.parse(r.payload));
  }
  private get(id: string): McpRun {
    const r = this.store.db.prepare('SELECT payload FROM mcp_runs WHERE id=?').get(id) as
      { payload: string } | undefined;
    if (!r) throw new PublicError('MCP 실행 기록을 찾을 수 없습니다.', 404);
    return JSON.parse(r.payload);
  }
  private profile(id: string) {
    const p = this.profiles.get(id);
    if (!p) throw new PublicError('서버를 찾을 수 없습니다.', 404);
    return p;
  }
  private view(id: string): McpServer {
    const p = this.profile(id),
      l = this.live.get(id);
    return {
      ...p,
      status: l ? (l.connected ? 'connected' : 'connecting') : 'disconnected',
      generation: l?.generation ?? '',
      tools: l?.tools ?? [],
      allowedTools: l?.allowed ?? [],
      message: this.messages.get(id) ?? '연결 전입니다. 재시작 후에는 다시 연결해야 합니다.',
      version: l?.version,
    };
  }
  private root(p: McpProfile) {
    if (!p.rootId) return;
    const r = this.tools.files.root(p.rootId);
    if (r.path !== p.rootPath || r.identity !== p.rootIdentity)
      throw new PublicError('폴더가 바뀌었습니다. 다시 등록하세요.', 409);
    this.tools.files.read(r.id, ''); // Verify the original inode still occupies the granted path.
  }
  private ready(id: string) {
    const l = this.live.get(id);
    if (!l?.connected) throw new PublicError('먼저 서버를 연결하세요.', 409);
    this.root(this.profile(id));
    return l;
  }
  private invalidate(id: string) {
    for (const r of this.runs(true))
      if (r.serverId === id) {
        r.status = r.status === 'running' ? 'interrupted' : 'expired';
        r.result =
          '연결 또는 권한이 바뀌어 중단되었습니다. 결과를 확인하고 새 미리보기를 만드세요.';
        this.save(r);
      }
  }
  disconnect(
    id: string,
    message = '연결이 해제되었습니다. 도구 권한과 대기 승인이 만료되었습니다.',
  ) {
    const l = this.live.get(id);
    this.live.delete(id);
    if (!this.closed) {
      this.invalidate(id);
      this.messages.set(id, message);
    }
    if (l) {
      l.controller.abort();
      l.token = '';
      const closing = l.client
        .close()
        .catch(() => {})
        .then(async () => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([
              l.exited,
              new Promise<void>((resolve) => {
                timer = setTimeout(resolve, 1000);
              }),
            ]);
          } finally {
            clearTimeout(timer);
          }
        });
      this.closing.add(closing);
      void closing.finally(() => this.closing.delete(closing));
      return closing;
    }
    return Promise.resolve();
  }
  async connect(id: string, body: unknown) {
    const b = z
      .object({
        confirmed: z.literal(true),
        token: z.string().trim().max(512).optional(),
        rootId: z.string().optional(),
      })
      .strict()
      .parse(body);
    const p = this.profile(id);
    if (this.live.has(id))
      throw new PublicError('이미 연결 중입니다. 해제 후 다시 연결하세요.', 409);
    if (this.live.size + this.closing.size >= 3)
      throw new PublicError('동시에 연결할 수 있는 서버는 3개입니다.', 409);
    if (b.rootId) {
      const r = this.tools.files.root(b.rootId);
      if (r.path !== p.rootPath || r.identity !== p.rootIdentity)
        throw new PublicError('처음 등록한 폴더를 다시 허용하세요.', 409);
      p.rootId = b.rootId;
      this.store.db
        .prepare('UPDATE mcp_profiles SET payload=? WHERE id=?')
        .run(JSON.stringify(p), id);
    }
    this.root(p);
    if (p.kind === 'github' && !b.token)
      throw new PublicError('이번 연결에 사용할 GitHub 읽기 권한 PAT를 입력하세요.');
    const l: Live = {
      ...runtime(p, this.dataDir, b.token ?? ''),
      generation: randomUUID(),
      controller: new AbortController(),
      tools: [],
      allowed: [],
      connected: false,
      token: b.token ?? '',
      busy: false,
    };
    this.live.set(id, l);
    this.messages.set(id, '서버를 시작하고 실제 도구 목록을 확인하는 중입니다.');
    l.client.onclose = () => {
      if (this.live.get(id) === l)
        void this.disconnect(
          id,
          '서버 프로세스가 종료되었습니다. 설치 상태와 인증을 확인하고 다시 연결하세요.',
        );
    };
    const signal = AbortSignal.any([l.controller.signal, AbortSignal.timeout(20000)]);
    try {
      await l.client.connect(l.transport, { timeout: 20000, signal });
      const found = await discover(l.client, p.kind, l.token, signal);
      signal.throwIfAborted();
      if (this.live.get(id) !== l) throw new Error('Superseded');
      this.root(p);
      l.tools = found;
      l.connected = true;
      const version = l.client.getServerVersion();
      l.version = redact(`${version?.name ?? ''} ${version?.version ?? ''}`, l.token).slice(0, 200);
      this.messages.set(
        id,
        '실제 MCP 연결과 도구 발견을 확인했습니다. 사용할 도구를 선택해 허용하세요.',
      );
      return this.view(id);
    } catch {
      if (this.live.get(id) === l)
        await this.disconnect(
          id,
          '연결하지 못했습니다. 실행 파일·필수 런타임·네트워크·인증을 확인하세요. 도구 50개/수신 1MiB/20초 제한도 확인하세요.',
        );
      else await l.client.close().catch(() => {});
      throw new PublicError(
        '연결하지 못했거나 연결이 취소되었습니다. 서버 카드의 안내를 확인하세요.',
        502,
      );
    }
  }
  private permissions(id: string, body: unknown) {
    const b = z
        .object({ generation: z.string(), tools: z.array(z.string()).max(50) })
        .strict()
        .parse(body),
      l = this.ready(id);
    if (b.generation !== l.generation)
      throw new PublicError('연결이 바뀌었습니다. 목록을 새로 확인하세요.', 409);
    if (b.tools.some((name) => !l.tools.some((t) => t.name === name && t.eligible)))
      throw new PublicError('검토된 조회 도구만 허용할 수 있습니다.', 403);
    if (l.busy) {
      void this.disconnect(id);
      throw new PublicError(
        '실행을 중단하고 연결을 해제했습니다. 다시 연결해 권한을 설정하세요.',
        409,
      );
    }
    this.invalidate(id);
    l.allowed = [...new Set(b.tools)];
    return this.view(id);
  }
  private preview(body: unknown) {
    const b = z
      .object({
        serverId: z.string(),
        tool: z.string().max(128),
        arguments: z.record(z.string(), z.unknown()),
      })
      .strict()
      .parse(body);
    const l = this.ready(b.serverId),
      tool = l.tools.find((t) => t.name === b.tool && t.eligible);
    if (!tool || !l.allowed.includes(b.tool))
      throw new PublicError('먼저 이 도구의 사용을 허용하세요.', 403);
    validateArguments(tool, b.arguments);
    if (l.token && JSON.stringify(b.arguments).includes(l.token))
      throw new PublicError('인증키는 도구 입력에 넣지 마세요.');
    this.expire();
    if (this.runs(true).length >= 20)
      throw new PublicError('대기 중인 요청을 처리하거나 거절한 뒤 다시 시도하세요.', 409);
    return this.save({
      id: randomUUID(),
      ...b,
      serverName: mcpCatalog[this.profile(b.serverId).kind].name,
      generation: l.generation,
      schemaHash: tool.hash,
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 600000).toISOString(),
      result: '',
    });
  }
  private expire() {
    for (const r of this.runs(true))
      if (r.status === 'pending' && Date.parse(r.expiresAt) <= Date.now()) {
        r.status = 'expired';
        r.result = '승인 시간이 지났습니다.';
        this.save(r);
      }
  }
  async approve(id: string) {
    this.expire();
    const r = this.get(id);
    if (r.status !== 'pending') throw new PublicError('이미 처리했거나 만료된 요청입니다.', 409);
    const l = this.ready(r.serverId);
    if (r.generation !== l.generation || !l.allowed.includes(r.tool))
      throw new PublicError('연결 또는 권한이 바뀌었습니다.', 409);
    if (l.busy) throw new PublicError('이 서버의 다른 실행이 끝난 뒤 시도하세요.', 409);
    r.status = 'running';
    this.save(r);
    l.busy = true;
    const signal = AbortSignal.any([l.controller.signal, AbortSignal.timeout(20000)]);
    try {
      const found = await discover(l.client, this.profile(r.serverId).kind, l.token, signal);
      const tool = found.find((t) => t.name === r.tool && t.eligible);
      if (!tool || tool.hash !== r.schemaHash) {
        l.tools = found;
        l.allowed = [];
        this.messages.set(r.serverId, '도구 스키마가 바뀌었습니다. 권한과 입력을 다시 검토하세요.');
        this.invalidate(r.serverId);
        throw new PublicError('도구 스키마가 바뀌었습니다. 권한과 입력을 다시 검토하세요.', 409);
      }
      signal.throwIfAborted();
      this.root(this.profile(r.serverId));
      if (this.live.get(r.serverId) !== l || !l.allowed.includes(r.tool))
        throw new Error('Revoked');
      validateArguments(tool, r.arguments);
      const output = await l.client.callTool({ name: r.tool, arguments: r.arguments }, undefined, {
        timeout: 20000,
        signal,
      });
      signal.throwIfAborted();
      if (this.closed || this.live.get(r.serverId) !== l || this.get(id).status !== 'running')
        return { ...r, status: 'interrupted' as const, result: '실행이 중단되었습니다.' };
      const text = Array.isArray(output.content)
        ? output.content
            .filter((c) => c.type === 'text' && typeof c.text === 'string')
            .map((c) => c.text)
            .join('\n')
        : '';
      const safe = redact(text, l.token);
      r.result =
        safe.slice(0, 24000) + (safe.length > 24000 ? '\n[길이 제한으로 이후 내용 생략]' : '') ||
        '텍스트 결과가 없습니다. 이미지·리소스는 표시하지 않습니다.';
      r.status = output.isError ? 'failed' : 'succeeded';
      this.save(r);
    } catch (e) {
      if (!this.closed && this.get(id).status === 'running') {
        r.status = 'failed';
        r.result =
          e instanceof PublicError
            ? e.message
            : '호출에 실패했습니다. 시간 제한·서버 상태·입력을 확인하세요. 자동 재시도하지 않습니다.';
        this.save(r);
      }
      if (signal.aborted && this.live.get(r.serverId) === l) await this.disconnect(r.serverId);
    } finally {
      l.busy = false;
    }
    return this.closed
      ? { ...r, status: 'interrupted' as const, result: '앱이 종료되었습니다.' }
      : this.get(id);
  }
  mount(app: Express) {
    app.get('/api/mcp', (_req, res) => {
      this.expire();
      res.json({
        servers: [...this.profiles.keys()].map((id) => this.view(id)),
        runs: this.runs(),
      });
    });
    app.post('/api/mcp/servers', (req, res) => {
      const b = z
        .object({
          kind: z.enum(['aura', 'github', 'serena', 'repomix']),
          rootId: z.string().optional(),
          executable: z.string().max(1000).optional(),
        })
        .strict()
        .parse(req.body);
      if (this.profiles.size >= 8)
        throw new PublicError('서버는 최대 8개입니다. 사용하지 않는 서버를 삭제하세요.');
      const root = b.kind === 'github' ? undefined : this.tools.files.root(b.rootId ?? '');
      const p: McpProfile = {
        id: randomUUID(),
        kind: b.kind,
        ...(root ? { rootId: root.id, rootPath: root.path, rootIdentity: root.identity } : {}),
        ...(b.kind === 'aura' ? {} : executable(b.executable ?? '', b.kind)),
      };
      this.profiles.set(p.id, p);
      this.store.db.prepare('INSERT INTO mcp_profiles VALUES(?,?)').run(p.id, JSON.stringify(p));
      res.status(201).json(this.view(p.id));
    });
    app.post('/api/mcp/servers/:id/connect', async (req, res) =>
      res.json(await this.connect(req.params.id, req.body)),
    );
    app.post('/api/mcp/servers/:id/disconnect', async (req, res) => {
      empty.parse(req.body);
      this.profile(req.params.id);
      await this.disconnect(req.params.id);
      res.json(this.view(req.params.id));
    });
    app.post('/api/mcp/servers/:id/delete', async (req, res) => {
      empty.parse(req.body);
      this.profile(req.params.id);
      const closing = this.disconnect(req.params.id);
      this.profiles.delete(req.params.id);
      this.store.db.prepare('DELETE FROM mcp_profiles WHERE id=?').run(req.params.id);
      await closing;
      res.json({ ok: true });
    });
    app.post('/api/mcp/servers/:id/permissions', (req, res) =>
      res.json(this.permissions(req.params.id, req.body)),
    );
    app.post('/api/mcp/preview', (req, res) => res.status(201).json(this.preview(req.body)));
    app.post('/api/mcp/runs/:id/approve', async (req, res) => {
      empty.parse(req.body);
      res.json(await this.approve(req.params.id));
    });
    app.post('/api/mcp/runs/:id/deny', (req, res) => {
      empty.parse(req.body);
      const r = this.get(req.params.id);
      if (r.status !== 'pending') throw new PublicError('이미 처리된 요청입니다.', 409);
      r.status = 'denied';
      r.result = '실행을 거절했습니다.';
      res.json(this.save(r));
    });
  }
  close() {
    for (const id of this.live.keys()) void this.disconnect(id);
    this.closed = true;
    return Promise.all([...this.closing]).then(() => {});
  }
}
