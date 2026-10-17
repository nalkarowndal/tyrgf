import type { StreamEvent } from '../../../packages/shared/src/contracts';
let token = '';
export function setToken(value: string) {
  token = value;
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers:
        body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Aura-Token': token },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(
      '앱 서버에 연결하지 못했습니다. 앱이 실행 중인지 확인한 뒤 다시 시도하세요. 실행 요청이었다면 기록을 먼저 확인하세요.',
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      '앱 서버의 응답을 읽지 못했습니다. 연결 상태와 실행 기록을 확인한 뒤 다시 시도하세요.',
    );
  }
  if (!response.ok)
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : '요청을 처리하지 못했습니다. 다시 시도해 주세요.',
    );
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
