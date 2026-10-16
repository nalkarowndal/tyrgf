import express from 'express';
import { AgentService } from './agent-service';
import { ToolService } from './tool-service';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import { z } from 'zod';
import { Store } from './store';
import {
  PublicError,
  listModels,
  streamReply,
  selectContext,
  validateProvider,
  type ProviderConfig,
} from './providers';
import {
  settingsSchema,
  registry,
  providerId,
  type ChatMessage,
  type ProviderId,
  type Settings,
  type StreamEvent,
} from '../../../packages/shared/src/contracts';
const replySchema = z
  .object({
    text: z.string().trim().min(1).max(32000).optional(),
    regenerate: z.boolean().optional(),
    editId: z.string().uuid().optional(),
  })
  .strict()
  .refine(
    (v) => Boolean(v.text) !== Boolean(v.regenerate) && !(v.regenerate && v.editId),
    '메시지를 입력해 주세요.',
  );
export function createApp({ dataDir, port }: { dataDir: string; port: number }) {
  const app = express();
  const store = new Store(dataDir);
  const toolService = new ToolService(store, dataDir);
  const token = randomBytes(32).toString('hex');
  const keys = new Map<ProviderId, string>();
  const active = new Map<string, AbortController>();
  let closed = false;
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const origins = new Set([...hosts].map((h) => `http://${h}`));
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
    });
    if (
      !hosts.has(req.headers.host ?? '') ||
      (req.headers.origin && !origins.has(req.headers.origin)) ||
      req.headers['sec-fetch-site'] === 'cross-site'
    )
      return res.status(403).json({ error: '이 앱이 열린 로컬 화면에서만 접근할 수 있습니다.' });
    if (req.path.toLowerCase().startsWith('/api/') && !['GET', 'HEAD'].includes(req.method)) {
      const supplied = req.header('X-Aura-Token') ?? '';
      if (
        !/^[a-f0-9]{64}$/.test(supplied) ||
        !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))
      )
        return res
          .status(403)
          .json({ error: '연결 확인이 만료되었습니다. 화면을 새로고침해 주세요.' });
    }
    next();
  });
  app.use(express.json({ limit: '128kb' }));
  const config = (): ProviderConfig => {
    const s = store.settings();
    return { ...s, key: keys.get(s.provider) };
  };
  const agentService = new AgentService(store, toolService, config);
  function session(id: string) {
    const found = store.session(id);
    if (!found) throw new PublicError('대화를 찾을 수 없습니다. 새 대화를 시작해 주세요.', 404);
    return found;
  }
  function idle(id: string) {
    session(id);
    if (active.has(id)) throw new PublicError('답변을 중단한 뒤 다시 시도해 주세요.', 409);
  }
  app.get('/api/bootstrap', (_req, res) =>
    res.json({
      token,
      settings: store.settings(),
      keyStatus: Object.fromEntries([...keys].map(([k]) => [k, true])),
      capabilities: { tools: toolService.files.roots.size > 0 || toolService.browserEnabled },
      usage: store.usage(),
    }),
  );
  app.post('/api/settings', (req, res) => {
    const old = store.settings();
    const parsed = settingsSchema.partial().parse(req.body);
    // Zod defaults also apply inside optional fields; only merge explicitly supplied keys.
    const patch = Object.fromEntries(
      Object.keys(req.body).map((key) => [key, parsed[key as keyof Settings]]),
    ) as Partial<Settings>;
    const s = settingsSchema.parse({
      ...old,
      ...(patch.provider && patch.provider !== old.provider
        ? { externalConsent: false, freeConfirmed: false }
        : {}),
      ...patch,
    });
    if (s.provider !== 'ollama' && !registry[s.provider].models.includes(s.model))
      throw new PublicError('지원하는 무료 모델을 선택해 주세요.');
    if (s.provider === 'ollama' && /cloud/i.test(s.model))
      throw new PublicError('Ollama 로컬 모델만 사용할 수 있습니다.');
    store.saveSettings(s);
    res.json(s);
  });
  app.post('/api/keys', (req, res) => {
    const { provider, key } = z
      .object({ provider: z.enum(['gemini', 'groq']), key: z.string().trim().min(1).max(512) })
      .strict()
      .parse(req.body);
    keys.set(provider, key);
    res.json({ saved: true, storage: 'memory' });
  });
  app.post('/api/keys/remove', (req, res) => {
    const { provider } = z.object({ provider: providerId }).parse(req.body);
    keys.delete(provider);
    res.json({ removed: true });
  });
  app.post('/api/providers/models', async (_req, res) => {
    res.json({ models: await listModels(config(), AbortSignal.timeout(15000)) });
  });
  app.post('/api/providers/test', async (_req, res) => {
    const c = config();
    validateProvider(c);
    const signal = AbortSignal.timeout(30000);
    const models = await listModels(c, signal);
    if (!models.includes(c.model))
      throw new PublicError('선택한 모델을 사용할 수 없습니다. 모델 목록에서 다시 선택하세요.');
    let chars = 0,
      tokens = 0,
      estimated = true;
    for await (const e of streamReply(
      c,
      [{ role: 'user', content: '한국어로 안녕하세요 한마디만 답하세요.' }],
      signal,
    )) {
      if (e.type === 'delta') chars += e.text.length;
      else {
        tokens = e.tokens;
        estimated = e.estimated;
      }
    }
    store.recordUsage(c.provider, tokens || Math.ceil(chars / 3), estimated);
    res.json({
      ok: true,
      simulated: c.provider === 'mock',
      message:
        c.provider === 'mock'
          ? '모의 공급자 동작을 확인했습니다. 실제 API 연결 테스트가 아닙니다.'
          : '선택한 모델의 실제 응답을 확인했습니다.',
      models,
    });
  });
  app.get('/api/sessions', (req, res) =>
    res.json(
      store.sessions(
        z
          .string()
          .max(200)
          .parse(req.query.q ?? ''),
      ),
    ),
  );
  app.post('/api/sessions', (_req, res) => res.status(201).json(store.createSession()));
  app.get('/api/sessions/:id', (req, res) => {
    res.json({ ...session(req.params.id), messages: store.messages(req.params.id) });
  });
  app.post('/api/sessions/:id/rename', (req, res) => {
    idle(req.params.id);
    const { title } = z.object({ title: z.string().trim().min(1).max(100) }).parse(req.body);
    store.rename(req.params.id, title);
    res.json({ ok: true });
  });
  app.post('/api/sessions/:id/delete', (req, res) => {
    idle(req.params.id);
    store.deleteSession(req.params.id);
    res.json({ ok: true });
  });
  app.post('/api/sessions/:id/stop', (req, res) => {
    session(req.params.id);
    active.get(req.params.id)?.abort();
    res.json({ ok: true });
  });
  app.get('/api/export', (_req, res) => {
    res.setHeader('Content-Disposition', 'attachment; filename="aura-conversations.json"');
    res.json({
      version: 1,
      exportedAt: new Date().toISOString(),
      sessions: store.sessions().map((s) => ({ ...s, messages: store.messages(s.id) })),
    });
  });
  app.post('/api/sessions/:id/reply', async (req, res) => {
    const id = req.params.id;
    idle(id);
    if (active.size >= 2)
      throw new PublicError(
        '동시에 두 대화까지 응답할 수 있습니다. 다른 답변이 끝난 뒤 다시 시도해 주세요.',
        429,
      );
    const body = replySchema.parse(req.body);
    const c = config();
    validateProvider(c);
    const s = store.settings();
    let history = store.messages(id);
    let cut: number | undefined;
    if (body.editId) {
      const index = history.findIndex((m) => m.id === body.editId && m.role === 'user');
      if (index < 0) throw new PublicError('수정할 질문을 찾을 수 없습니다.');
      cut = history[index].seq;
      history = history.slice(0, index);
    }
    if (body.regenerate) {
      let i = history.length - 1;
      while (i >= 0 && history[i].role !== 'user') i--;
      if (i < 0) throw new PublicError('다시 생성할 질문이 없습니다.');
      cut = history[i + 1]?.seq;
      history = history.slice(0, i + 1);
    }
    const input = [
      ...history
        .filter((m) => m.role === 'user' || m.status === 'complete')
        .map((m) => ({ role: m.role, content: m.content })),
      ...(body.text ? [{ role: 'user' as const, content: body.text }] : []),
    ];
    const context = selectContext(input, s.contextBudget);
    const controller = new AbortController();
    active.set(id, controller);
    const timeout = setTimeout(() => controller.abort(new Error('timeout')), 120000);
    const abort = () => controller.abort();
    res.on('close', abort);
    let assistantId = '',
      content = '',
      status: ChatMessage['status'] = 'streaming',
      tokens = 0,
      estimated = true;
    try {
      assistantId = store.transaction(() => {
        if (cut !== undefined) store.truncate(id, cut);
        if (body.text) store.addMessage(id, 'user', body.text, s);
        if (session(id).title === '새 대화')
          store.rename(id, (body.text ?? history.at(-1)?.content ?? '대화').slice(0, 40));
        return store.addMessage(id, 'assistant', '', s);
      });
      res.set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Accel-Buffering': 'no' });
      res.flushHeaders();
      async function emit(event: StreamEvent) {
        if (res.destroyed) return;
        if (!res.write(JSON.stringify(event) + '\n'))
          await once(res, 'drain', { signal: controller.signal });
      }
      await emit({ type: 'start', id: assistantId });
      if (context.omitted)
        await emit({
          type: 'notice',
          message: `대화 길이를 줄이기 위해 이전 메시지 ${context.omitted}개를 이번 요청에서 제외했습니다. 자동 요약은 준비 중입니다.`,
        });
      for await (const event of streamReply(c, context.messages, controller.signal)) {
        if (event.type === 'delta') {
          content += event.text;
          store.updateMessage(assistantId, content, 'streaming');
          await emit(event);
        } else {
          tokens = event.tokens;
          estimated = event.estimated;
        }
      }
      status = 'complete';
    } catch (e) {
      status = controller.signal.aborted ? 'interrupted' : 'error';
      if (!res.destroyed) {
        if (!res.headersSent) res.setHeader('Content-Type', 'application/x-ndjson');
        res.write(
          JSON.stringify({
            type: 'error',
            message: controller.signal.aborted
              ? '응답이 중단되었습니다. 부분 답변을 저장했습니다.'
              : e instanceof PublicError
                ? e.message
                : '응답을 처리하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.',
          }) + '\n',
        );
      }
    } finally {
      clearTimeout(timeout);
      res.off('close', abort);
      active.delete(id);
      if (assistantId && !closed) {
        store.updateMessage(assistantId, content, status);
        store.recordUsage(
          c.provider,
          tokens ||
            Math.ceil(
              (context.messages.reduce((n, m) => n + m.content.length, 0) + content.length) / 3,
            ),
          estimated,
        );
      }
      if (!res.destroyed) res.end(JSON.stringify({ type: 'done', status }) + '\n');
    }
  });
  agentService.mount(app);
  toolService.mount(app);
  app.use('/api', (_req, res) => res.status(404).json({ error: '지원하지 않는 요청입니다.' }));
  app.use(
    (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (res.headersSent) return res.end();
      const aborted =
        err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      res
        .status(
          err instanceof PublicError
            ? err.status
            : err instanceof z.ZodError
              ? 400
              : aborted
                ? 504
                : 500,
        )
        .json({
          error:
            err instanceof PublicError
              ? err.message
              : err instanceof z.ZodError
                ? '입력값을 확인해 주세요. 빈 값, 모델 이름 또는 설정 범위가 올바르지 않습니다.'
                : aborted
                  ? '연결 시간이 초과되었습니다. 서비스 실행 상태를 확인하고 다시 시도해 주세요.'
                  : '처리 중 문제가 발생했습니다. 다시 시도해 주세요.',
        });
    },
  );
  return {
    app,
    store,
    close() {
      if (closed) return;
      closed = true;
      for (const controller of active.values()) controller.abort();
      agentService.close();
      toolService.close();
      keys.clear();
      store.close();
    },
  };
}
