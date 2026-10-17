import { afterEach, expect, it, vi } from 'vitest';
import { reply } from '../apps/web/src/api';

afterEach(() => vi.unstubAllGlobals());
const signal = () => new AbortController().signal;

it('explains connection failure without automatically resending a chat', async () => {
  const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
  vi.stubGlobal('fetch', fetcher);
  await expect(reply('session', {}, () => {}, signal())).rejects.toThrow('저장된 대화');
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('explains a non-JSON HTTP error without exposing parser output', async () => {
  vi.stubGlobal('fetch', async () => new Response('<html>Bad Gateway</html>', { status: 502 }));
  await expect(reply('session', {}, () => {}, signal())).rejects.toThrow('앱 서버');
});

it('preserves a useful server error', async () => {
  vi.stubGlobal('fetch', async () =>
    Response.json({ error: '무료 한도를 확인하세요.' }, { status: 429 }),
  );
  await expect(reply('session', {}, () => {}, signal())).rejects.toThrow('무료 한도');
});

it('preserves intentional cancellation', async () => {
  const controller = new AbortController();
  controller.abort();
  vi.stubGlobal('fetch', async () => {
    throw controller.signal.reason;
  });
  await expect(reply('session', {}, () => {}, controller.signal)).rejects.toBe(
    controller.signal.reason,
  );
});

it('delivers split UTF-8 and a final event without a newline', async () => {
  const bytes = new TextEncoder().encode(
    '{"type":"delta","text":"한글"}\n{"type":"done","status":"complete"}',
  );
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
            controller.close();
          },
        }),
      ),
  );
  const events: unknown[] = [];
  await reply('session', {}, (event) => events.push(event), signal());
  expect(events).toEqual([
    { type: 'delta', text: '한글' },
    { type: 'done', status: 'complete' },
  ]);
});

it('reports interrupted streams after preserving delivered text', async () => {
  let reads = 0;
  vi.stubGlobal(
    'fetch',
    async () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            if (reads++ === 0)
              controller.enqueue(new TextEncoder().encode('{"type":"delta","text":"부분 답변"}\n'));
            else controller.error(new TypeError('network terminated'));
          },
        }),
      ),
  );
  const events: unknown[] = [];
  await expect(reply('session', {}, (event) => events.push(event), signal())).rejects.toThrow(
    '저장된 부분 답변',
  );
  expect(events).toEqual([{ type: 'delta', text: '부분 답변' }]);
});

it.each([
  'not json',
  '{"type":"delta","text":{}}',
  '{"type":"unknown"}',
  '{"type":["delta"],"text":"unexpected"}',
])('rejects malformed stream events with a recovery message: %s', async (line) => {
  vi.stubGlobal(
    'fetch',
    async () => new Response(line + '\n{"type":"done","status":"complete"}\n'),
  );
  const events: unknown[] = [];
  await expect(reply('session', {}, (event) => events.push(event), signal())).rejects.toThrow(
    '응답 형식',
  );
  expect(events).toEqual([]);
});
