import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
vi.mock('../apps/server/src/web-reader', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../apps/server/src/web-reader')>()),
  readBrowser: vi.fn(),
}));
import { readBrowser } from '../apps/server/src/web-reader';
import { createApp } from '../apps/server/src/app';
let dir: string, token: string, server: ReturnType<typeof createApp>;
const post = (path: string, body = {}) =>
  request(server.app)
    .post('/api/tools' + path)
    .set('Host', '127.0.0.1:4317')
    .set('X-Aura-Token', token)
    .send(body);
const get = (path = '') =>
  request(server.app)
    .get('/api/tools' + path)
    .set('Host', '127.0.0.1:4317');
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'aura-browser-tools-'));
  server = createApp({ dataDir: dir, port: 4317 });
  token = (await request(server.app).get('/api/bootstrap').set('Host', '127.0.0.1:4317')).body
    .token;
  vi.mocked(readBrowser).mockReset();
});
afterEach(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});
it('only executes the approved URL once and keeps screenshots out of polling responses', async () => {
  const input = { tool: 'browser.read', url: 'https://example.com/report?q=hello' };
  expect((await post('/preview', input)).status).toBe(403);
  await post('/permissions', { browserEnabled: true });
  const p = (await post('/preview', input)).body;
  expect(readBrowser).not.toHaveBeenCalled();
  vi.mocked(readBrowser).mockResolvedValue({
    title: 'Report',
    text: 'Content',
    url: input.url,
    screenshot: 'data:image/png;base64,large-image',
  });
  expect((await post(`/runs/${p.id}/approve`)).body.status).toBe('succeeded');
  expect(vi.mocked(readBrowser).mock.calls[0][0]).toBe(input.url);
  expect((await post(`/runs/${p.id}/approve`)).status).toBe(409);
  expect(readBrowser).toHaveBeenCalledTimes(1);
  expect(JSON.stringify((await get()).body)).not.toContain('large-image');
  expect((await get(`/runs/${p.id}`)).body.result.screenshot).toContain('large-image');
});
it('revoking permission aborts active work and prevents pending work and replay', async () => {
  await post('/permissions', { browserEnabled: true });
  const p = (await post('/preview', { tool: 'browser.read', url: 'https://example.com/' })).body;
  const p2 = (await post('/preview', { tool: 'browser.read', url: 'https://example.org/' })).body;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  vi.mocked(readBrowser).mockImplementation(
    (_url, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        started();
      }),
  );
  const running = post(`/runs/${p.id}/approve`).then((r) => r);
  await ready;
  expect((await post(`/runs/${p.id}/approve`)).status).toBe(409);
  await post('/permissions', { browserEnabled: false });
  expect((await running).body.status).toBe('interrupted');
  expect((await post(`/runs/${p2.id}/approve`)).status).toBe(409);
  expect(readBrowser).toHaveBeenCalledTimes(1);
});
