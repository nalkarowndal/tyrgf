import { beforeEach, afterEach, it, expect } from 'vitest';
import request from 'supertest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../apps/server/src/app';
let server: ReturnType<typeof createApp>, dir: string, root: string, rootId: string, token: string;
const post = (p: string, b: object = {}) =>
  request(server.app)
    .post('/api' + p)
    .set('Host', '127.0.0.1:4317')
    .set('X-Aura-Token', token)
    .send(b);
const get = (p: string) =>
  request(server.app)
    .get('/api' + p)
    .set('Host', '127.0.0.1:4317');
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'aura-skills-'));
  root = join(dir, 'work');
  mkdirSync(root);
  writeFileSync(join(root, 'notes.txt'), '회의');
  server = createApp({ dataDir: join(dir, 'data'), port: 4317 });
  token = (await get('/bootstrap')).body.token;
  rootId = (await post('/tools/roots', { path: root, write: true })).body.id;
});
afterEach(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});
async function settle(id: string) {
  for (let i = 0; i < 150; i++) {
    const t = (await get('/tasks/' + id)).body;
    if (t.status !== 'running') return t;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw Error('timeout');
}
async function completed() {
  const t = await settle((await post('/tasks', { rootId, goal: '메모 보고서' })).body.id);
  await post('/tasks/' + t.id + '/approve', { runId: t.pendingRun });
  return settle(t.id);
}
it.runIf(process.platform === 'linux')(
  'saves a completed procedure as draft and runs only the reviewed version with fresh approval',
  async () => {
    const task = await completed();
    const r = await post('/skills/from-task', { taskId: task.id });
    expect(r.status).toBe(201);
    const s = r.body;
    expect(s.approvedVersion).toBe(null);
    expect(s.permissions).toContain('파일 변경 시 매번 승인');
    expect(JSON.stringify(s)).not.toContain('runId');
    expect(
      (await post('/tasks', { rootId, goal: '다시', skillId: s.id, skillVersion: 1 })).status,
    ).toBe(409);
    await post('/skills/' + s.id + '/approve', { version: 1 });
    const run = await settle(
      (await post('/tasks', { rootId, goal: '다시', skillId: s.id, skillVersion: 1 })).body.id,
    );
    expect(run.status).toBe('awaiting_approval');
    expect(run.pendingRun).not.toBe(task.pendingRun);
    await post('/skills/' + s.id + '/delete', { version: 1 });
    expect((await post('/tasks/' + run.id + '/approve', { runId: run.pendingRun })).status).toBe(
      409,
    );
  },
);
it.runIf(process.platform === 'linux')(
  'rejects unfinished sources and revokes approval when a skill is edited; enforces allowed tools',
  async () => {
    const pending = await settle((await post('/tasks', { rootId, goal: '보고서' })).body.id);
    expect((await post('/skills/from-task', { taskId: pending.id })).status).toBe(409);
    await post('/tasks/' + pending.id + '/approve', { runId: pending.pendingRun });
    await settle(pending.id);
    const s = (await post('/skills/from-task', { taskId: pending.id })).body;
    expect(s.id).toBeTruthy();
    await post('/skills/' + s.id + '/approve', { version: 1 });
    const edited = await post('/skills/' + s.id + '/update', {
      version: 1,
      name: s.name,
      purpose: s.purpose,
      steps: s.steps,
      tools: ['file.list'],
      verification: s.verification,
    });
    expect(edited.body.version).toBe(2);
    expect(edited.body.approvedVersion).toBe(null);
    expect((await post('/skills/' + s.id + '/approve', { version: 1 })).status).toBe(409);
    await post('/skills/' + s.id + '/approve', { version: 2 });
    rmSync(join(root, 'aura-report.md'));
    const run = await settle(
      (await post('/tasks', { rootId, goal: '목록만', skillId: s.id, skillVersion: 2 })).body.id,
    );
    expect(run.status).toBe('failed');
    expect(run.steps).toHaveLength(1);
    expect(existsSync(join(root, 'aura-report.md'))).toBe(false);
    expect((await get('/skills')).body[0].lastResult.status).toBe('failed');
  },
);
it.runIf(process.platform === 'linux').each(['delete', 'edit'])(
  'blocks the shared tool approval endpoint after skill %s',
  async (mode) => {
    const done = await completed();
    const s = (await post('/skills/from-task', { taskId: done.id })).body;
    await post('/skills/' + s.id + '/approve', { version: 1 });
    rmSync(join(root, 'aura-report.md'));
    const task = await settle(
      (await post('/tasks', { rootId, goal: '재사용', skillId: s.id, skillVersion: 1 })).body.id,
    );
    expect(task.status).toBe('awaiting_approval');
    if (mode === 'delete') await post('/skills/' + s.id + '/delete', { version: 1 });
    else
      await post('/skills/' + s.id + '/update', {
        version: 1,
        name: s.name,
        purpose: '새로운 목적',
        steps: s.steps,
        tools: s.tools,
        verification: s.verification,
      });
    expect((await post('/tools/runs/' + task.pendingRun + '/approve')).status).toBe(409);
    expect(existsSync(join(root, 'aura-report.md'))).toBe(false);
  },
);
