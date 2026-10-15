import { afterEach, beforeEach, expect, it, describe } from 'vitest';
import request from 'supertest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  symlinkSync,
  linkSync,
  mkdirSync,
  renameSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../apps/server/src/app';
let dir: string, root: string, token: string, server: ReturnType<typeof createApp>;
const host = '127.0.0.1:4317';
const get = (p: string) =>
  request(server.app)
    .get('/api/tools' + p)
    .set('Host', host);
const post = (p: string, body = {}) =>
  request(server.app)
    .post('/api/tools' + p)
    .set('Host', host)
    .set('X-Aura-Token', token)
    .send(body);
const grant = async () => (await post('/roots', { path: root, write: true })).body.id as string;
const preview = (rootId: string, content = '새 내용') =>
  post('/preview', { tool: 'file.write', rootId, path: 'note.txt', content });
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'aura-tools-'));
  root = join(dir, 'work');
  mkdirSync(root);
  server = createApp({ dataDir: join(dir, 'data'), port: 4317 });
  token = (await request(server.app).get('/api/bootstrap').set('Host', host)).body.token;
});
afterEach(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});
it('denies ungranted tools and enforces the existing mutation token guard', async () => {
  const state = await get('');
  expect(state.status).toBe(200);
  expect(state.body.roots).toEqual([]);
  expect(state.body.browserEnabled).toBe(false);
  expect((await preview('unknown')).status).toBe(403);
  expect(
    (
      await request(server.app)
        .post('/api/tools/roots')
        .set('Host', host)
        .send({ path: root, write: true })
    ).status,
  ).toBe(403);
});
it.runIf(process.platform === 'linux')(
  'does not write until approval, persists exact preview and rejects approval tampering and replay',
  async () => {
    const rootId = await grant();
    const p = await preview(rootId);
    expect(p.status).toBe(201);
    expect(p.body.before).toBe(null);
    expect(p.body.after).toBe('새 내용');
    expect(existsSync(join(root, 'note.txt'))).toBe(false);
    expect((await post(`/runs/${p.body.id}/approve`, { content: 'swapped' })).status).toBe(400);
    expect((await post(`/runs/${p.body.id}/approve`)).body.status).toBe('succeeded');
    expect(readFileSync(join(root, 'note.txt'), 'utf8')).toBe('새 내용');
    expect((await post(`/runs/${p.body.id}/approve`)).status).toBe(409);
    expect((await get('')).body.runs[0].status).toBe('succeeded');
  },
);
describe.runIf(process.platform === 'linux')('Linux anchored file tools', () => {
  it('requires write permission independently of read permission', async () => {
    writeFileSync(join(root, 'note.txt'), '원본');
    const rootId = (await post('/roots', { path: root, write: false })).body.id;
    expect((await post('/read', { rootId, path: 'note.txt' })).body.content).toBe('원본');
    expect((await preview(rootId)).status).toBe(403);
  });
  it('refuses changed contents and leaves the outside edit intact', async () => {
    const rootId = await grant();
    writeFileSync(join(root, 'note.txt'), '원본');
    const p = await preview(rootId);
    writeFileSync(join(root, 'note.txt'), '외부 수정');
    expect((await post(`/runs/${p.body.id}/approve`)).body.status).toBe('failed');
    expect(readFileSync(join(root, 'note.txt'), 'utf8')).toBe('외부 수정');
  });
  it('denies traversal, hidden secrets, symlinks, hardlinks and non-text files', async () => {
    const rootId = await grant();
    writeFileSync(join(dir, 'secret.txt'), 'private');
    symlinkSync(join(dir, 'secret.txt'), join(root, 'link.txt'));
    linkSync(join(dir, 'secret.txt'), join(root, 'hard.txt'));
    writeFileSync(join(root, 'binary.txt'), Buffer.from([0, 1, 2]));
    for (const path of [
      '../secret.txt',
      '/etc/passwd',
      '.env',
      'link.txt',
      'hard.txt',
      'binary.txt',
      'file.txt:ads',
      'CON.txt',
    ]) {
      expect((await post('/read', { rootId, path })).status, path).toBeGreaterThanOrEqual(400);
    }
    expect((await post('/roots', { path: join(dir, 'data'), write: true })).status).toBe(403);
  });
  it('rejects replacing a granted directory or child directory with a symlink', async () => {
    const rootId = await grant();
    mkdirSync(join(root, 'nested'));
    writeFileSync(join(root, 'nested', 'a.txt'), 'old');
    const p = await post('/preview', {
      tool: 'file.write',
      rootId,
      path: 'nested/a.txt',
      content: 'new',
    });
    renameSync(join(root, 'nested'), join(root, 'moved'));
    symlinkSync(dir, join(root, 'nested'));
    expect((await post(`/runs/${p.body.id}/approve`)).body.status).toBe('failed');
    renameSync(root, root + '-moved');
    mkdirSync(root);
    expect((await post('/read', { rootId, path: '' })).status).toBeGreaterThanOrEqual(400);
  });
  it('denial and permission revocation invalidate pending requests', async () => {
    const rootId = await grant();
    const p = await preview(rootId);
    expect((await post(`/runs/${p.body.id}/deny`)).body.status).toBe('denied');
    expect((await post(`/runs/${p.body.id}/approve`)).status).toBe(409);
    const p2 = await preview(rootId);
    await post('/roots/revoke', { rootId });
    expect((await post(`/runs/${p2.body.id}/approve`)).status).toBe(409);
    expect(existsSync(join(root, 'note.txt'))).toBe(false);
  });
  it('deletes and restores only through a fresh approved preview', async () => {
    const rootId = await grant();
    writeFileSync(join(root, 'note.txt'), '복구할 원본');
    const p = await post('/preview', { tool: 'file.delete', rootId, path: 'note.txt' });
    const deleted = await post(`/runs/${p.body.id}/approve`);
    expect(readFileSync(deleted.body.recoveryPath, 'utf8')).toBe('복구할 원본');
    expect(existsSync(join(root, 'note.txt'))).toBe(false);
    const restore = await post(`/runs/${p.body.id}/restore`);
    expect(restore.status).toBe(201);
    expect(existsSync(join(root, 'note.txt'))).toBe(false);
    await post(`/runs/${restore.body.id}/approve`);
    expect(readFileSync(join(root, 'note.txt'), 'utf8')).toBe('복구할 원본');
  });
  it('never restores over a later edit', async () => {
    const rootId = await grant();
    writeFileSync(join(root, 'note.txt'), 'old');
    const p = await preview(rootId);
    await post(`/runs/${p.body.id}/approve`);
    writeFileSync(join(root, 'note.txt'), 'keep');
    expect((await post(`/runs/${p.body.id}/restore`)).status).toBe(409);
    expect(readFileSync(join(root, 'note.txt'), 'utf8')).toBe('keep');
  });
  it('expires approvals on restart and retains history without enabling permissions', async () => {
    const rootId = await grant();
    const p = await preview(rootId);
    server.close();
    server = createApp({ dataDir: join(dir, 'data'), port: 4317 });
    token = (await request(server.app).get('/api/bootstrap').set('Host', host)).body.token;
    const state = (await get('')).body;
    expect(state.roots).toEqual([]);
    expect(state.runs[0].status).toBe('expired');
    expect((await post(`/runs/${p.body.id}/approve`)).status).toBe(409);
  });
  it('rejects expired approvals before side effects', async () => {
    const rootId = await grant();
    const p = await preview(rootId);
    server.store.db
      .prepare('UPDATE tool_runs SET expiresAt=? WHERE id=?')
      .run('2000-01-01T00:00:00.000Z', p.body.id);
    expect((await post(`/runs/${p.body.id}/approve`)).status).toBe(409);
    expect(existsSync(join(root, 'note.txt'))).toBe(false);
  });
  it('creates and grants the suggested workspace even under a hidden app data folder', async () => {
    server.close();
    server = createApp({ dataDir: join(dir, '.hidden-data'), port: 4317 });
    token = (await request(server.app).get('/api/bootstrap').set('Host', host)).body.token;
    const suggestedPath = (await get('')).body.suggestedPath;
    const granted = await post('/roots', { path: suggestedPath, write: true });
    expect(granted.status).toBe(201);
    expect((await post('/read', { rootId: granted.body.id, path: '' })).body.entries).toEqual([]);
  });
});
