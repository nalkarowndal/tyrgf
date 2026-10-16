import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../apps/server/src/app';
let dir: string, root: string, token: string, rootId: string, server: ReturnType<typeof createApp>;
const post = (p: string, b = {}) =>
  request(server.app)
    .post('/api' + p)
    .set('Host', '127.0.0.1:4317')
    .set('X-Aura-Token', token)
    .send(b);
const get = (p: string) =>
  request(server.app)
    .get('/api' + p)
    .set('Host', '127.0.0.1:4317');
async function boot() {
  server = createApp({ dataDir: join(dir, 'data'), port: 4317 });
  token = (await get('/bootstrap')).body.token;
  rootId = (await post('/tools/roots', { path: root, write: true })).body.id;
}
async function settle(id: string) {
  for (let i = 0; i < 150; i++) {
    const r = await get('/tasks/' + id);
    if (r.body.status !== 'running') return r.body;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw Error('task did not settle');
}
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'aura-agent-'));
  root = join(dir, 'work');
  mkdirSync(root);
  writeFileSync(join(root, 'notes.txt'), '회의: 제품 데모를 금요일에 확인합니다.');
  await boot();
});
afterEach(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});
describe.runIf(process.platform === 'linux')('durable agent', () => {
  it('runs multiple real file tools in labeled demo and waits for exact write approval', async () => {
    const r = await post('/tasks', { goal: '폴더를 읽고 보고서를 만들어 주세요', rootId });
    expect(r.status).toBe(201);
    const t = await settle(r.body.id);
    expect(t.status).toBe('awaiting_approval');
    expect(t.simulated).toBe(true);
    expect(t.steps.map((s: { tool: string }) => s.tool)).toEqual(['file.list', 'file.read']);
    const preview = (await get('/tools/runs/' + t.pendingRun)).body;
    expect(preview.after).toContain('모의');
    expect(preview.after).toContain('notes.txt');
    expect((await post('/tasks/' + t.id + '/approve', { runId: 'wrong' })).status).toBe(409);
    expect((await post('/tasks/' + t.id + '/approve', { runId: t.pendingRun })).status).toBe(202);
    const done = await settle(t.id);
    expect(done.status).toBe('completed');
    expect(done.steps).toHaveLength(3);
    expect(done.verification).toContain('확인');
    expect(readFileSync(join(root, 'aura-report.md'), 'utf8')).toContain('회의');
    expect((await post('/tasks/' + t.id + '/resume', {})).status).toBe(409);
    expect(
      server.store.db.prepare('SELECT count(*) AS n FROM agent_checkpoints').get(),
    ).toMatchObject({ n: 1 });
  });
  it('reconciles an approved tool receipt after restart without executing the write again', async () => {
    const r = await post('/tasks', { goal: '보고서', rootId });
    const t = await settle(r.body.id);
    await post('/tools/runs/' + t.pendingRun + '/approve', {});
    const count = () =>
      server.store.db
        .prepare(
          "SELECT count(*) AS n FROM tool_runs WHERE status='succeeded' AND json_extract(payload,'$.tool')='file.write'",
        )
        .get();
    expect(count()).toMatchObject({ n: 1 });
    server.close();
    await boot();
    expect((await get('/tasks/' + t.id)).body.status).toBe('paused');
    await post('/tasks/' + t.id + '/resume', { rootId });
    const done = await settle(t.id);
    expect(done.status).toBe('completed');
    expect(count()).toMatchObject({ n: 1 });
  });
  it('requires fresh approval after restart expires the old preview', async () => {
    const r = await post('/tasks', { goal: '보고서', rootId });
    const t = await settle(r.body.id);
    server.close();
    await boot();
    await post('/tasks/' + t.id + '/resume', { rootId });
    const next = await settle(t.id);
    expect(next.status).toBe('awaiting_approval');
    expect(next.pendingRun).not.toBe(t.pendingRun);
    expect((await post('/tasks/' + t.id + '/approve', { runId: t.pendingRun })).status).toBe(409);
  });
  it('refuses another folder on resume and does not silently change provider', async () => {
    const r = await post('/tasks', { goal: '보고서', rootId });
    const t = await settle(r.body.id);
    await post('/tasks/' + t.id + '/pause');
    const other = join(dir, 'other');
    mkdirSync(other);
    const otherId = (await post('/tools/roots', { path: other, write: true })).body.id;
    expect((await post('/tasks/' + t.id + '/resume', { rootId: otherId })).status).toBe(403);
    await post('/settings', { provider: 'groq', model: 'openai/gpt-oss-20b' });
    expect((await post('/tasks/' + t.id + '/resume', { rootId })).status).toBe(409);
  });
  it('treats user denial as cancellation and never silently replans it', async () => {
    const r = await post('/tasks', { goal: '보고서', rootId });
    const t = await settle(r.body.id);
    await post('/tasks/' + t.id + '/deny', { runId: t.pendingRun });
    expect((await get('/tasks/' + t.id)).body.status).toBe('cancelled');
    expect((await post('/tasks/' + t.id + '/resume', {})).status).toBe(409);
  });
  it('does not claim success when a completed tool result was changed externally', async () => {
    const r = await post('/tasks', { goal: '보고서', rootId });
    const t = await settle(r.body.id);
    await post('/tools/runs/' + t.pendingRun + '/approve');
    writeFileSync(join(root, 'aura-report.md'), '외부 변경 보존');
    await post('/tasks/' + t.id + '/resume');
    expect((await settle(t.id)).status).toBe('needs_review');
    expect((await post('/tasks/' + t.id + '/pause')).status).toBe(409);
    expect((await post('/tasks/' + t.id + '/resume')).status).toBe(409);
    expect(readFileSync(join(root, 'aura-report.md'), 'utf8')).toBe('외부 변경 보존');
  });
  it('requires review when verification cannot access an observed source', async () => {
    const r = await post('/tasks', { goal: '보고서', rootId });
    const t = await settle(r.body.id);
    await post('/tools/runs/' + t.pendingRun + '/approve');
    rmSync(join(root, 'notes.txt'));
    await post('/tasks/' + t.id + '/resume');
    expect((await settle(t.id)).status).toBe('needs_review');
  });
  it('never replans a failed write receipt that may have published a file', async () => {
    const r = await post('/tasks', { goal: '보고서', rootId });
    const t = await settle(r.body.id);
    await post('/tools/runs/' + t.pendingRun + '/approve');
    server.store.db.prepare("UPDATE tool_runs SET status='failed' WHERE id=?").run(t.pendingRun);
    await post('/tasks/' + t.id + '/resume');
    const stopped = await settle(t.id);
    expect(stopped.status).toBe('needs_review');
    expect(stopped.pendingRun).toBe(t.pendingRun);
  });
  it('stops within its persisted tool budget', async () => {
    const r = await post('/tasks', { goal: '보고서', rootId, maxSteps: 2 });
    const t = await settle(r.body.id);
    expect(t.status).toBe('failed');
    expect(t.message).toContain('예산');
    expect(t.pendingRun).toBeUndefined();
  });
});
it('guards task APIs and rejects unsafe model transfers before execution', async () => {
  expect(
    (
      await request(server.app)
        .post('/api/tasks')
        .set('Host', '127.0.0.1:4317')
        .send({ goal: 'test', rootId })
    ).status,
  ).toBe(403);
  await post('/keys', { provider: 'groq', key: 'test-not-real' });
  await post('/settings', {
    provider: 'groq',
    model: 'openai/gpt-oss-20b',
    externalConsent: true,
    freeConfirmed: true,
  });
  expect((await post('/tasks', { goal: 'send files', rootId })).status).toBe(403);
});
