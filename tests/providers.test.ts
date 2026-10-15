import { expect, it } from 'vitest';
import { parseEvents, streamReply, selectContext } from '../apps/server/src/providers';
function response(text: string) {
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(c) {
        for (let i = 0; i < bytes.length; i += 2) c.enqueue(bytes.slice(i, i + 2));
        c.close();
      },
    }),
  );
}
it('parses split UTF-8 SSE and preserves all text', async () => {
  const events = [];
  for await (const e of parseEvents(
    response('data: {"text":"안녕하세요"}\r\n\r\ndata: [DONE]\n\n'),
    'sse',
  ))
    events.push(e);
  expect(events).toEqual([{ text: '안녕하세요' }]);
});
it('parses final NDJSON line without newline', async () => {
  const events = [];
  for await (const e of parseEvents(response('{"text":"가"}\n{"done":true}'), 'ndjson'))
    events.push(e);
  expect(events).toEqual([{ text: '가' }, { done: true }]);
});
it('fails closed on malformed event', async () => {
  await expect(async () => {
    for await (const _e of parseEvents(response('data: NOT JSON\n\n'), 'sse')) {
      /* drain */
    }
  }).rejects.toThrow();
});
it('retains newest full turn within context budget and reports omitted messages', () => {
  const messages = [
    { role: 'user' as const, content: 'a'.repeat(100) },
    { role: 'assistant' as const, content: 'b'.repeat(100) },
    { role: 'user' as const, content: '최근 질문' },
  ];
  const r = selectContext(messages, 30);
  expect(r.messages).toEqual([messages[2]]);
  expect(r.omitted).toBe(2);
});
it('cloud calls are blocked before fetch without consent', async () => {
  let called = false;
  await expect(async () => {
    for await (const _e of streamReply(
      {
        provider: 'groq',
        model: 'openai/gpt-oss-20b',
        key: 'key',
        externalConsent: false,
        freeConfirmed: true,
        ollamaUrl: 'http://127.0.0.1:11434',
      },
      [{ role: 'user', content: 'hi' }],
      new AbortController().signal,
      async () => {
        called = true;
        return response('');
      },
    )) {
      /* drain */
    }
  }).rejects.toThrow();
  expect(called).toBe(false);
});
it('429 long Retry-After does not loop or leak provider body', async () => {
  let calls = 0;
  await expect(async () => {
    for await (const _e of streamReply(
      {
        provider: 'groq',
        model: 'openai/gpt-oss-20b',
        key: 'key',
        externalConsent: true,
        freeConfirmed: true,
        ollamaUrl: 'http://127.0.0.1:11434',
      },
      [{ role: 'user', content: 'hi' }],
      new AbortController().signal,
      async () => {
        calls++;
        return new Response('secret-body', { status: 429, headers: { 'retry-after': '120' } });
      },
    )) {
      /* drain */
    }
  }).rejects.toThrow('한도');
  expect(calls).toBe(1);
});
it('Groq adapter extracts deltas and usage', async () => {
  const events = [];
  for await (const e of streamReply(
    {
      provider: 'groq',
      model: 'openai/gpt-oss-20b',
      key: 'key',
      externalConsent: true,
      freeConfirmed: true,
      ollamaUrl: 'http://127.0.0.1:11434',
    },
    [{ role: 'user', content: 'hi' }],
    new AbortController().signal,
    async () =>
      response(
        'data: {"choices":[{"delta":{"content":"hello"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}],"x_groq":{"usage":{"total_tokens":9}}}\n\ndata: [DONE]\n\n',
      ),
  ))
    events.push(e);
  expect(events).toContainEqual({ type: 'delta', text: 'hello' });
  expect(events).toContainEqual({ type: 'usage', tokens: 9, estimated: false });
});
it('Gemini adapter sends system instructions separately and filters thought text', async () => {
  let payload: Record<string, unknown> = {};
  let target = '';
  const out = [];
  for await (const e of streamReply(
    {
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      key: 'key',
      externalConsent: true,
      freeConfirmed: true,
      ollamaUrl: 'http://127.0.0.1:11434',
    },
    [{ role: 'user', content: '질문' }],
    new AbortController().signal,
    async (url, init) => {
      target = String(url);
      payload = JSON.parse(String(init?.body));
      return response(
        'data: {"candidates":[{"content":{"parts":[{"text":"private","thought":true},{"text":"답변"}]},"finishReason":"STOP"}],"usageMetadata":{"totalTokenCount":13}}\n\n',
      );
    },
  ))
    out.push(e);
  expect(target).toContain(':streamGenerateContent?alt=sse');
  expect(payload.systemInstruction).toBeDefined();
  expect(out).toContainEqual({ type: 'delta', text: '답변' });
  expect(out).toContainEqual({ type: 'usage', tokens: 13, estimated: false });
});
it('Ollama blocks remote-backed model before sending conversation', async () => {
  const targets: string[] = [];
  await expect(async () => {
    for await (const _e of streamReply(
      {
        provider: 'ollama',
        model: 'local-alias',
        externalConsent: false,
        freeConfirmed: false,
        ollamaUrl: 'http://127.0.0.1:11434',
      },
      [{ role: 'user', content: 'private message' }],
      new AbortController().signal,
      async (url) => {
        targets.push(String(url));
        return Response.json({ remote_host: 'https://ollama.com' });
      },
    )) {
      /* drain */
    }
  }).rejects.toThrow('클라우드');
  expect(targets).toEqual(['http://127.0.0.1:11434/api/show']);
});
it('Ollama reads actual local chat NDJSON and counts tokens', async () => {
  const events = [];
  for await (const e of streamReply(
    {
      provider: 'ollama',
      model: 'local',
      externalConsent: false,
      freeConfirmed: false,
      ollamaUrl: 'http://127.0.0.1:11434',
    },
    [{ role: 'user', content: '질문' }],
    new AbortController().signal,
    async (url) =>
      String(url).endsWith('/show')
        ? Response.json({ capabilities: ['completion'] })
        : response(
            '{"message":{"content":"로컬 답변"},"done":false}\n{"done":true,"prompt_eval_count":2,"eval_count":3}\n',
          ),
  ))
    events.push(e);
  expect(events).toContainEqual({ type: 'delta', text: '로컬 답변' });
  expect(events).toContainEqual({ type: 'usage', tokens: 5, estimated: false });
});
it('does not mark truncated upstream stream as complete', async () => {
  await expect(async () => {
    for await (const _e of streamReply(
      {
        provider: 'groq',
        model: 'openai/gpt-oss-20b',
        key: 'key',
        externalConsent: true,
        freeConfirmed: true,
        ollamaUrl: 'http://127.0.0.1:11434',
      },
      [{ role: 'user', content: 'hi' }],
      new AbortController().signal,
      async () => response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'),
    )) {
      /* drain */
    }
  }).rejects.toThrow('완성되기');
});
it('retries a short 429 only once, with same provider and model', async () => {
  let calls = 0;
  const events = [];
  for await (const e of streamReply(
    {
      provider: 'groq',
      model: 'openai/gpt-oss-20b',
      key: 'key',
      externalConsent: true,
      freeConfirmed: true,
      ollamaUrl: 'http://127.0.0.1:11434',
    },
    [{ role: 'user', content: 'hi' }],
    new AbortController().signal,
    async () => {
      calls++;
      return calls === 1
        ? new Response('', { status: 429, headers: { 'retry-after': '0' } })
        : response('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\n');
    },
  ))
    events.push(e);
  expect(calls).toBe(2);
  expect(events).toContainEqual({ type: 'delta', text: 'ok' });
});
it('abort prevents mock response completion', async () => {
  const controller = new AbortController();
  const events: unknown[] = [];
  await expect(async () => {
    for await (const e of streamReply(
      {
        provider: 'mock',
        model: 'aura-demo',
        externalConsent: false,
        freeConfirmed: false,
        ollamaUrl: 'http://127.0.0.1:11434',
      },
      [{ role: 'user', content: 'hi' }],
      controller.signal,
    )) {
      events.push(e);
      controller.abort();
    }
  }).rejects.toThrow();
  expect(events).toHaveLength(1);
});
