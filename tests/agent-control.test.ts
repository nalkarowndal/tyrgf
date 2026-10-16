import { beforeEach, afterEach, it, expect, vi } from 'vitest';
vi.mock('../apps/server/src/agent-planner', () => ({ planNext: vi.fn() }));
import { planNext } from '../apps/server/src/agent-planner';
import { createApp } from '../apps/server/src/app';
import request from 'supertest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
let dir: string, token: string, rootId: string, server: ReturnType<typeof createApp>;
const post = (p: string, b = {}) =>
  request(server.app)
    .post('/api' + p)
    .set('Host', '127.0.0.1:4317')
    .set('X-Aura-Token', token)
    .send(b);
const get = (id: string) =>
  request(server.app)
    .get('/api/tasks/' + id)
    .set('Host', '127.0.0.1:4317');
async function settle(id: string) {
  for (let i = 0; i < 150; i++) {
    const r = await get(id);
    if (r.body.status !== 'running') return r.body;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw Error('timeout');
}
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'aura-control-'));
  const root = join(dir, 'root');
  mkdirSync(root);
  writeFileSync(join(root, 'a.txt'), 'source');
  server = createApp({ dataDir: join(dir, 'data'), port: 4317 });
  token = (await request(server.app).get('/api/bootstrap').set('Host', '127.0.0.1:4317')).body
    .token;
  rootId = (await post('/tools/roots', { path: root, write: true })).body.id;
  vi.mocked(planNext).mockReset();
});
afterEach(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});
it.runIf(process.platform === 'linux')(
  'discards a late model result after the user pauses',
  async () => {
    let finish!: (v: Awaited<ReturnType<typeof planNext>>) => void;
    let ready!: () => void;
    const started = new Promise<void>((r) => {
      ready = r;
    });
    vi.mocked(planNext).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
          ready();
        }),
    );
    const t = (await post('/tasks', { goal: 'test', rootId })).body;
    await started;
    await post('/tasks/' + t.id + '/pause');
    finish({ tool: 'file.write', path: 'late.txt', content: 'should not write', reason: 'late' });
    await new Promise((r) => setTimeout(r, 30));
    const stopped = (await get(t.id)).body;
    expect(stopped.status).toBe('paused');
    expect(stopped.pendingRun).toBeUndefined();
    expect(stopped.steps).toEqual([]);
  },
);
it.runIf(process.platform === 'linux')(
  'replans after rejecting an unsupported early completion',
  async () => {
    vi.mocked(planNext)
      .mockResolvedValueOnce({ tool: 'finish', answer: 'unproven', reason: 'guess' })
      .mockResolvedValueOnce({ tool: 'file.list', path: '', reason: 'list' })
      .mockResolvedValueOnce({ tool: 'file.read', path: 'a.txt', reason: 'read' })
      .mockResolvedValue({ tool: 'finish', answer: 'verified', reason: 'evidence' });
    const t = (await post('/tasks', { goal: 'test', rootId })).body;
    expect((await settle(t.id)).status).toBe('recoverable_error');
    await post('/tasks/' + t.id + '/resume');
    const done = await settle(t.id);
    expect(done.status).toBe('completed');
    expect(done.answer).toBe('verified');
  },
);
it.runIf(process.platform === 'linux')(
  'turns a blocked model path into an observation and replans within budget',
  async () => {
    vi.mocked(planNext)
      .mockResolvedValueOnce({
        tool: 'file.write',
        path: '../outside.txt',
        content: 'x',
        reason: 'bad path',
      })
      .mockResolvedValueOnce({ tool: 'file.list', path: '', reason: 'list' })
      .mockResolvedValueOnce({ tool: 'file.read', path: 'a.txt', reason: 'read' })
      .mockResolvedValue({ tool: 'finish', answer: 'verified', reason: 'evidence' });
    const t = (await post('/tasks', { goal: 'test', rootId })).body;
    const done = await settle(t.id);
    expect(done.status).toBe('completed');
    expect(done.steps[0].status).toBe('failed');
    expect(done.pendingRun).toBeUndefined();
  },
);
it.runIf(process.platform === 'linux')(
  'cannot reset the recovery budget by pausing an errored task',
  async () => {
    vi.mocked(planNext).mockRejectedValue(new Error('offline'));
    const t = (await post('/tasks', { goal: 'test', rootId })).body;
    expect((await settle(t.id)).status).toBe('recoverable_error');
    for (let i = 0; i < 2; i++) {
      await post('/tasks/' + t.id + '/pause');
      await post('/tasks/' + t.id + '/resume');
      await settle(t.id);
    }
    expect((await get(t.id)).body.status).toBe('failed');
    expect((await post('/tasks/' + t.id + '/resume')).status).toBe(409);
  },
);
