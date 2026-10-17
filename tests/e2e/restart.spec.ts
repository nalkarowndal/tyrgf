import { test, expect } from './fixtures';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('real process restart retains records but invalidates credentials, grants and approvals', async ({
  aura,
  request,
  page,
}) => {
  const folder = mkdtempSync(join(tmpdir(), 'aura-restart-project-'));
  writeFileSync(join(folder, 'note.txt'), '보존할 원문');
  let token = (await (await request.get('/api/bootstrap')).json()).token;
  const post = async (path: string, data: object = {}) => {
    const response = await request.post('/api' + path, {
      headers: { 'X-Aura-Token': token },
      data,
    });
    expect(response.ok(), path + ': ' + (await response.text())).toBe(true);
    return response.json();
  };
  try {
    const session = await post('/sessions');
    const chat = await request.post(`/api/sessions/${session.id}/reply`, {
      headers: { 'X-Aura-Token': token },
      data: { text: '재시작 후에도 남을 대화' },
    });
    expect(chat.ok()).toBe(true);
    const memory = await post('/memories', {
      title: '재시작 기억',
      category: '선호',
      content: '한국어로 답해주세요',
    });
    await post(`/memories/${memory.id}/approve`, { version: memory.version });
    await post('/keys', { provider: 'groq', key: 'qa-fixture-memory-only-secret' });
    await post('/tools/permissions', { browserEnabled: true });
    const root = await post('/tools/roots', { path: folder, write: true });
    const fileRun = await post('/tools/preview', {
      tool: 'file.write',
      rootId: root.id,
      path: 'never.txt',
      content: 'must not write',
    });
    const profile = await post('/mcp/servers', { kind: 'aura', rootId: root.id });
    const connection = await post(`/mcp/servers/${profile.id}/connect`, { confirmed: true });
    await post(`/mcp/servers/${profile.id}/permissions`, {
      generation: connection.generation,
      tools: ['project_read'],
    });
    const mcpRun = await post('/mcp/preview', {
      serverId: profile.id,
      tool: 'project_read',
      arguments: { path: 'note.txt' },
    });
    expect((await (await request.get('/api/bootstrap')).json()).keyStatus.groq).toBe(true);
    await page.goto(`/chat/${session.id}`);
    await expect(page.locator('.message.user')).toContainText('재시작 후에도 남을 대화');
    const oldToken = token;
    await aura.restart();
    const state = await (await request.get('/api/bootstrap')).json();
    token = state.token;
    expect(token).not.toBe(oldToken);
    expect(state.keyStatus.groq).toBeFalsy();
    expect(
      (
        await request.post('/api/sessions', { headers: { 'X-Aura-Token': oldToken }, data: {} })
      ).status(),
    ).toBe(403);
    const tools = await (await request.get('/api/tools')).json();
    expect(tools.roots).toEqual([]);
    expect(tools.browserEnabled).toBe(false);
    expect(
      (
        await request.post(`/api/tools/runs/${fileRun.id}/approve`, {
          headers: { 'X-Aura-Token': token },
          data: {},
        })
      ).status(),
    ).toBe(409);
    expect(existsSync(join(folder, 'never.txt'))).toBe(false);
    const mcp = await (await request.get('/api/mcp')).json();
    expect(mcp.servers[0].status).toBe('disconnected');
    expect(mcp.servers[0].allowedTools).toEqual([]);
    expect(
      (
        await request.post(`/api/mcp/runs/${mcpRun.id}/approve`, {
          headers: { 'X-Aura-Token': token },
          data: {},
        })
      ).status(),
    ).toBe(409);
    const memories = await (await request.get('/api/memories')).json();
    expect(memories[0]).toMatchObject({ id: memory.id, active: true });
    await page.reload();
    await expect(page.locator('.message.user')).toContainText('재시작 후에도 남을 대화');
    await expect(page.getByRole('button', { name: '답변 다시 생성' })).toBeEnabled();
    const exported = await request.get('/api/export');
    expect(await exported.text()).not.toContain('qa-fixture-memory-only-secret');
    for (const file of readdirSync(aura.dataDir).filter((name) => name.startsWith('aura.sqlite')))
      expect(
        readFileSync(join(aura.dataDir, file)).includes(
          Buffer.from('qa-fixture-memory-only-secret'),
        ),
      ).toBe(false);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
