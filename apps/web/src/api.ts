import type { StreamEvent } from '../../../packages/shared/src/contracts';
let token = '';
export function setToken(value: string) {
  token = value;
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers:
      body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Aura-Token': token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? '요청을 처리하지 못했습니다. 다시 시도해 주세요.');
  return data as T;
}
export async function reply(
  id: string,
  body: object,
  onEvent: (event: StreamEvent) => void,
  signal: AbortSignal,
) {
  const response = await fetch(`/api/sessions/${id}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Aura-Token': token },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error ?? '답변을 시작하지 못했습니다.');
  }
  if (!response.body) throw new Error('응답 연결이 끊어졌습니다. 다시 시도해 주세요.');
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = '',
    doneEvent = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let i;
      while ((i = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 1);
        if (line) {
          const event = JSON.parse(line) as StreamEvent;
          if (event.type === 'done') doneEvent = true;
          onEvent(event);
        }
      }
      if (done) break;
    }
    if (!doneEvent)
      throw new Error('연결이 끊어졌습니다. 저장된 부분 답변을 확인하고 다시 생성해 주세요.');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
