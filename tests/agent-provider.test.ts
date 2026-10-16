import { afterEach, expect, it, vi } from 'vitest';
import { planNext } from '../apps/server/src/agent-planner';
import { streamReply, type ProviderConfig } from '../apps/server/src/providers';
import type { AgentTask } from '../packages/shared/src/agent';
import type { Store } from '../apps/server/src/store';
afterEach(() => vi.unstubAllGlobals());
it('sends an agent-specific system policy through the real transport and keeps chat policy separate', async () => {
  const requests: { messages: { content: string }[] }[] = [];
  const action = { tool: 'file.list', path: '', reason: '목록 확인' };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return new Response(
        'data: ' +
          JSON.stringify({
            choices: [{ delta: { content: JSON.stringify(action) }, finish_reason: 'stop' }],
            usage: { total_tokens: 25 },
          }) +
          '\n\ndata: [DONE]\n\n',
      );
    }),
  );
  const config: ProviderConfig = {
    provider: 'groq',
    model: 'openai/gpt-oss-20b',
    key: 'fixture-key',
    externalConsent: true,
    freeConfirmed: true,
    ollamaUrl: 'http://127.0.0.1:11434',
  };
  const task = {
    simulated: false,
    goal: '목록 확인',
    steps: [],
    maxSteps: 8,
  } as unknown as AgentTask;
  const recordUsage = vi.fn();
  expect(
    await planNext(task, config, AbortSignal.timeout(2000), { recordUsage } as unknown as Store),
  ).toEqual(action);
  expect(requests[0].messages[0].content).toContain('작업 계획자');
  expect(requests[0].messages[0].content).toContain('JSON');
  expect(requests[0].messages[0].content).not.toContain('현재 도구 실행 권한은 없습니다');
  expect(recordUsage).toHaveBeenCalledWith('groq', 25, false);
  for await (const _event of streamReply(
    config,
    [{ role: 'user', content: '안녕' }],
    AbortSignal.timeout(2000),
  )) {
    /* drain */
  }
  expect(requests[1].messages[0].content).toContain('현재 도구 실행 권한은 없습니다');
});
