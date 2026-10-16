import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../apps/server/src/app';
let server: ReturnType<typeof createApp>, dir: string, token: string;
const get = (p: string) =>
  request(server.app)
    .get('/api' + p)
    .set('Host', '127.0.0.1:4317');
const post = (p: string, b: object = {}) =>
  request(server.app)
    .post('/api' + p)
    .set('Host', '127.0.0.1:4317')
    .set('X-Aura-Token', token)
    .send(b);
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'aura-memory-'));
  server = createApp({ dataDir: dir, port: 4317 });
  token = (await get('/bootstrap')).body.token;
});
afterEach(() => {
  vi.unstubAllGlobals();
  server.close();
  rmSync(dir, { recursive: true, force: true });
});
const draft = () =>
  post('/memories', { title: '답변 취향', category: '선호', content: '짧은 한국어로 답해주세요' });
it('keeps memories as drafts, requires exact version approval and invalidates approval on edit', async () => {
  const r = await draft();
  expect(r.status).toBe(201);
  const m = r.body;
  expect(m.active).toBe(false);
  expect(m.source.kind).toBe('user');
  expect((await post('/memories/' + m.id + '/approve', { version: 99 })).status).toBe(409);
  expect((await post('/memories/' + m.id + '/approve', { version: 1 })).body.active).toBe(true);
  const edit = await post('/memories/' + m.id + '/update', {
    version: 1,
    title: '새 취향',
    category: '선호',
    content: '항상 예를 들어주세요',
  });
  expect(edit.body.version).toBe(2);
  expect(edit.body.active).toBe(false);
  expect((await post('/memories/' + m.id + '/approve', { version: 1 })).status).toBe(409);
  expect((await get('/memories?q=새&category=선호')).body).toHaveLength(1);
  expect((await get('/memories/export')).body.memories[0].content).toContain('예를');
  server.close();
  server = createApp({ dataDir: dir, port: 4317 });
  token = (await get('/bootstrap')).body.token;
  expect((await get('/memories')).body[0].version).toBe(2);
  await post('/memories/' + m.id + '/delete', { version: 2 });
  expect((await get('/memories')).body).toEqual([]);
});
it('requires explicit whole-list deletion and guards mutations', async () => {
  await draft();
  expect((await post('/memories/delete-all', {})).status).toBe(400);
  expect(
    (await request(server.app).post('/api/memories').set('Host', '127.0.0.1:4317').send({})).status,
  ).toBe(403);
  expect((await post('/memories/delete-all', { confirm: true })).status).toBe(200);
  expect((await get('/memories/export')).body.memories).toEqual([]);
});
it('reads fresh approved memories across sessions and excludes derived old history after deletion', async () => {
  const bodies: { messages: { content: string }[] }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      bodies.push(JSON.parse(init.body));
      return new Response(
        'data: ' +
          JSON.stringify({
            choices: [{ delta: { content: '기억에서 가져온 민트' }, finish_reason: 'stop' }],
          }) +
          '\n\ndata: [DONE]\n\n',
      );
    }),
  );
  await post('/keys', { provider: 'groq', key: 'fixture-key' });
  await post('/settings', {
    provider: 'groq',
    model: 'openai/gpt-oss-20b',
    externalConsent: true,
    freeConfirmed: true,
  });
  const m = (await post('/memories', { title: '테스트', category: '선호', content: '색상은 민트' }))
    .body;
  expect(m.id).toBeTruthy();
  const a = (await post('/sessions')).body.id;
  await post('/sessions/' + a + '/reply', { text: '내 색상?' });
  expect(JSON.stringify(bodies.at(-1))).not.toContain('색상은 민트');
  await post('/memories/' + m.id + '/approve', { version: 1 });
  const b = (await post('/sessions')).body.id;
  await post('/sessions/' + b + '/reply', { text: '색상?' });
  expect(JSON.stringify(bodies.at(-1))).toContain('색상은 민트');
  expect((await get('/sessions/' + b)).body.messages[0].content).toBe('색상?');
  await post('/memories/' + m.id + '/delete', { version: 1 });
  await post('/sessions/' + b + '/reply', { text: '지금은?' });
  expect(JSON.stringify(bodies.at(-1))).not.toContain('민트');
  expect((await get('/sessions/' + b)).body.messages).toHaveLength(4);
});
it('bounds active context without claiming excluded entries were used', async () => {
  for (let i = 0; i < 4; i++) {
    const m = (
      await post('/memories', { title: '항목 ' + i, category: '기타', content: '가'.repeat(1900) })
    ).body;
    expect(m.id).toBeTruthy();
    await post('/memories/' + m.id + '/approve', { version: 1 });
  }
  const c = (await get('/memories/context')).body;
  expect(c.count).toBe(3);
  expect(c.omitted).toBe(1);
  expect(c.text.length).toBeLessThanOrEqual(6000);
});
it('creates labeled summary drafts with provenance and rejects approval after source changes', async () => {
  const s = server.store.createSession();
  const cfg = server.store.settings();
  server.store.addMessage(s.id, 'user', '회의는 금요일입니다', cfg);
  const r = await post('/memories/summarize', { sessionId: s.id });
  expect(r.status).toBe(201);
  expect(r.body.active).toBe(false);
  expect(r.body.source.simulated).toBe(true);
  expect(r.body.content).toContain('모의');
  expect((await post('/memories/' + r.body.id + '/approve', { version: 1 })).status).toBe(200);
  server.store.updateMessage(server.store.messages(s.id)[0].id, '회의는 월요일입니다', 'complete');
  expect((await get('/memories')).body[0].active).toBe(false);
  expect((await get('/memories/context')).body.count).toBe(0);
  expect((await post('/memories/' + r.body.id + '/approve', { version: 1 })).status).toBe(409);
});
it('preserves original conversation and no memory when summary provider fails', async () => {
  await post('/keys', { provider: 'groq', key: 'fixture-key' });
  await post('/settings', {
    provider: 'groq',
    model: 'openai/gpt-oss-20b',
    externalConsent: true,
    freeConfirmed: true,
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('no', { status: 503 })),
  );
  const s = server.store.createSession();
  server.store.addMessage(s.id, 'user', '보존할 원문', server.store.settings());
  expect((await post('/memories/summarize', { sessionId: s.id })).status).toBe(502);
  expect((await get('/memories')).body).toEqual([]);
  expect(server.store.messages(s.id)[0].content).toBe('보존할 원문');
});
it('rejects a late summary after memory deletion while the request is in flight', async () => {
  await post('/keys', { provider: 'groq', key: 'fixture-key' });
  await post('/settings', {
    provider: 'groq',
    model: 'openai/gpt-oss-20b',
    externalConsent: true,
    freeConfirmed: true,
  });
  let finish!: (r: Response) => void;
  let started!: () => void;
  const ready = new Promise<void>((r) => {
    started = r;
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((r) => {
          finish = r;
          started();
        }),
    ),
  );
  const s = server.store.createSession();
  server.store.addMessage(s.id, 'user', '원문', server.store.settings());
  const pending = post('/memories/summarize', { sessionId: s.id }).then((r) => r);
  await ready;
  await post('/memories/delete-all', { confirm: true });
  finish(
    new Response(
      'data: ' +
        JSON.stringify({ choices: [{ delta: { content: '늦은 요약' }, finish_reason: 'stop' }] }) +
        '\n\ndata: [DONE]\n\n',
    ),
  );
  expect((await pending).status).toBe(409);
  expect((await get('/memories')).body).toEqual([]);
});
it('allows a user-corrected summary to be approved as an explicit user memory', async () => {
  const s = server.store.createSession();
  server.store.addMessage(s.id, 'user', '원문', server.store.settings());
  const m = (await post('/memories/summarize', { sessionId: s.id })).body;
  await post('/memories/' + m.id + '/approve', { version: 1 });
  const changed = await post('/memories/' + m.id + '/update', {
    version: 1,
    title: m.title,
    category: m.category,
    content: '사용자가 수정한 사실',
  });
  expect(changed.body.source.kind).toBe('user');
  expect(changed.body.source.sessionId).toBe(s.id);
  expect((await post('/memories/' + m.id + '/approve', { version: 2 })).status).toBe(200);
});
