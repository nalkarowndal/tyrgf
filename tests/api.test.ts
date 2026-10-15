import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../apps/server/src/app';
let dir: string;
let server: ReturnType<typeof createApp>;
let token: string;
const host = '127.0.0.1:4317';
function get(path: string) {
  return request(server.app).get(path).set('Host', host);
}
function post(path: string, body: object) {
  return request(server.app)
    .post(path)
    .set('Host', host)
    .set('Origin', `http://${host}`)
    .set('X-Aura-Token', token)
    .send(body);
}
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'aura-test-'));
  server = createApp({ dataDir: dir, port: 4317 });
  token = (await get('/api/bootstrap')).body.token;
});
afterEach(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});
describe('local API security', () => {
  it('defaults to offline demo and denies dangerous capabilities', async () => {
    const r = await get('/api/bootstrap');
    expect(r.status).toBe(200);
    expect(r.body.settings.provider).toBe('mock');
    expect(r.body.settings.externalConsent).toBe(false);
    expect(r.body.capabilities.tools).toBe(false);
  });
  it('rejects hostile Host and Origin including reads', async () => {
    expect((await request(server.app).get('/api/bootstrap').set('Host', 'evil.com')).status).toBe(
      403,
    );
    expect((await get('/api/bootstrap').set('Origin', 'https://evil.com')).status).toBe(403);
  });
  it('rejects mutations without CSRF token', async () => {
    expect(
      (await request(server.app).post('/api/sessions').set('Host', host).send({})).status,
    ).toBe(403);
  });
  it('validates settings and never persists or returns API keys', async () => {
    expect((await post('/api/settings', { provider: 'invalid' })).status).toBe(400);
    expect(
      (await post('/api/keys', { provider: 'groq', key: 'test-secret-do-not-persist' })).status,
    ).toBe(200);
    expect(JSON.stringify((await get('/api/bootstrap')).body)).not.toContain('test-secret');
    expect(readFileSync(join(dir, 'aura.sqlite')).includes(Buffer.from('test-secret'))).toBe(false);
  });
  it('does not enable cloud calls without explicit consent and free account confirmation', async () => {
    await post('/api/settings', { provider: 'groq', model: 'openai/gpt-oss-20b' });
    expect((await post('/api/providers/test', {})).status).toBe(403);
  });
  it('rejects arbitrary remote Ollama URLs and paid model selection', async () => {
    expect((await post('/api/settings', { ollamaUrl: 'https://evil.com' })).status).toBe(400);
    expect(
      (await post('/api/settings', { provider: 'gemini', model: 'gemini-4-argon' })).status,
    ).toBe(400);
  });
});
describe('durable conversations', () => {
  it('streams labeled mock response and survives database reopening', async () => {
    const id = (await post('/api/sessions', {})).body.id;
    const r = await post(`/api/sessions/${id}/reply`, { text: '안녕하세요' });
    expect(r.status).toBe(200);
    expect(r.text).toContain('delta');
    expect(r.text).toContain('모의');
    server.close();
    server = createApp({ dataDir: dir, port: 4317 });
    const messages = (await get(`/api/sessions/${id}`)).body.messages;
    expect(messages).toHaveLength(2);
    expect(messages[1].status).toBe('complete');
    expect(messages[0].content).toBe('안녕하세요');
  });
  it('renames, searches, regenerates and deletes a conversation', async () => {
    const id = (await post('/api/sessions', {})).body.id;
    await post(`/api/sessions/${id}/reply`, { text: '고양이 이야기' });
    await post(`/api/sessions/${id}/rename`, { title: '나의 대화' });
    expect((await get('/api/sessions?q=고양이')).body[0].title).toBe('나의 대화');
    await post(`/api/sessions/${id}/reply`, { regenerate: true });
    expect((await get(`/api/sessions/${id}`)).body.messages).toHaveLength(2);
    await post(`/api/sessions/${id}/delete`, {});
    expect((await get(`/api/sessions/${id}`)).status).toBe(404);
  });
  it('editing a user message removes its later branch', async () => {
    const id = (await post('/api/sessions', {})).body.id;
    await post(`/api/sessions/${id}/reply`, { text: '원래 질문' });
    const mid = (await get(`/api/sessions/${id}`)).body.messages[0].id;
    await post(`/api/sessions/${id}/reply`, { text: '바꾼 질문', editId: mid });
    const rows = (await get(`/api/sessions/${id}`)).body.messages;
    expect(rows).toHaveLength(2);
    expect(rows[0].content).toBe('바꾼 질문');
  });
  it('rejects empty messages and invalid IDs without crashing', async () => {
    const id = (await post('/api/sessions', {})).body.id;
    expect((await post(`/api/sessions/${id}/reply`, { text: '  ' })).status).toBe(400);
    expect((await get('/api/sessions/missing')).status).toBe(404);
  });
});
it('recovers in-flight message after restart', async () => {
  const { Store } = await import('../apps/server/src/store');
  const isolated = mkdtempSync(join(tmpdir(), 'aura-recovery-'));
  const db = new Store(isolated);
  const s = db.createSession();
  const mid = db.addMessage(s.id, 'assistant', '부분 응답', db.settings());
  db.close();
  const reopened = new Store(isolated);
  expect(reopened.messages(s.id).find((m) => m.id === mid)?.status).toBe('interrupted');
  reopened.close();
  rmSync(isolated, { recursive: true, force: true });
});
it('rejects Unicode CSRF tokens rather than throwing', async () => {
  const r = await request(server.app)
    .post('/api/sessions')
    .set('Host', host)
    .set('X-Aura-Token', 'é'.repeat(64))
    .send({});
  expect(r.status).toBe(403);
});
it('export contains persisted text but no API key', async () => {
  await post('/api/keys', { provider: 'groq', key: 'export-secret' });
  const id = (await post('/api/sessions', {})).body.id;
  await post(`/api/sessions/${id}/reply`, { text: '내보낼 대화' });
  const r = await get('/api/export');
  expect(r.body.sessions[0].messages[0].content).toBe('내보낼 대화');
  expect(r.text).not.toContain('export-secret');
});
it('partial settings updates preserve onboarding, provider and privacy choices', async () => {
  await post('/api/settings', {
    onboarded: true,
    provider: 'groq',
    model: 'openai/gpt-oss-20b',
    externalConsent: true,
    freeConfirmed: true,
  });
  await post('/api/settings', { theme: 'dark' });
  const s = (await get('/api/bootstrap')).body.settings;
  expect(s.onboarded).toBe(true);
  expect(s.provider).toBe('groq');
  expect(s.model).toBe('openai/gpt-oss-20b');
  expect(s.externalConsent).toBe(true);
  expect(s.theme).toBe('dark');
});
it('changing provider clears consent unless explicitly reconfirmed', async () => {
  await post('/api/settings', {
    provider: 'groq',
    model: 'openai/gpt-oss-20b',
    externalConsent: true,
    freeConfirmed: true,
  });
  await post('/api/settings', { provider: 'gemini', model: 'gemini-3.8-flash' });
  const s = (await get('/api/bootstrap')).body.settings;
  expect(s.externalConsent).toBe(false);
  expect(s.freeConfirmed).toBe(false);
});
it('mixed-case API routes cannot bypass CSRF token checks', async () => {
  for (const path of ['/API/sessions', '/Api/settings']) {
    const r = await request(server.app)
      .post(path)
      .set('Host', host)
      .send(path.endsWith('settings') ? { theme: 'dark' } : {});
    expect(r.status).toBe(403);
  }
});
it('stop aborts a running reply, preserves partial content and prevents concurrent mutation', async () => {
  const id = (await post('/api/sessions', {})).body.id;
  let started = false;
  let mutationStatus = 0;
  const response = await request(server.app)
    .post(`/api/sessions/${id}/reply`)
    .set('Host', host)
    .set('X-Aura-Token', token)
    .send({ text: '중단 테스트' })
    .buffer(true)
    .parse((res, callback) => {
      let output = '';
      res.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        if (!started && output.includes('"type":"delta"')) {
          started = true;
          void (async () => {
            mutationStatus = (await post(`/api/sessions/${id}/rename`, { title: '금지' })).status;
            await post(`/api/sessions/${id}/stop`, {});
          })().catch((error: Error) => callback(error, null));
        }
      });
      res.on('end', () => callback(null, { output }));
      res.on('error', callback);
    });
  expect(mutationStatus).toBe(409);
  expect(response.body.output).toContain('interrupted');
  const saved = (await get(`/api/sessions/${id}`)).body.messages;
  expect(saved[1].status).toBe('interrupted');
  expect(saved[1].content.length).toBeGreaterThan(0);
});
