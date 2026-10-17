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
  let response: Response;
  try {
    response = await fetch(`/api/sessions/${id}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Aura-Token': token },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error('앱 서버에 연결하지 못했습니다. 저장된 대화를 먼저 확인한 뒤 다시 시도하세요.');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : '앱 서버가 답변을 시작하지 못했습니다. 저장된 대화를 확인한 뒤 다시 시도하세요.',
    );
  }
  const interrupted = '연결이 끊어졌습니다. 저장된 부분 답변을 확인하고 다시 생성해 주세요.';
  if (!response.body) throw new Error(interrupted);
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = '',
    doneEvent = false;
  function deliver(line: string) {
    if (!line.trim()) return;
    let event: StreamEvent;
    try {
      const value = JSON.parse(line);
      if (!value || typeof value !== 'object' || typeof value.type !== 'string') throw new Error();
      const fields = {
        delta: 'text',
        start: 'id',
        done: 'status',
        error: 'message',
        notice: 'message',
      };
      if (!Object.hasOwn(fields, value.type)) throw new Error();
      const field = fields[value.type as StreamEvent['type']];
      if (!field || typeof value[field] !== 'string') throw new Error();
      event = value;
    } catch {
      throw new Error(
        '앱 서버의 응답 형식을 읽지 못했습니다. 저장된 대화를 확인한 뒤 다시 시도하세요.',
      );
    }
    if (event.type === 'done') doneEvent = true;
    onEvent(event);
  }
  try {
    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (error) {
        if (signal.aborted) throw error;
        throw new Error(interrupted);
      }
      const { done, value } = chunk;
      buffer += decoder.decode(value, { stream: !done });
      let i;
      while ((i = buffer.indexOf('\n')) >= 0) {
        deliver(buffer.slice(0, i));
        buffer = buffer.slice(i + 1);
      }
      if (done) {
        deliver(buffer);
        break;
      }
    }
    if (!doneEvent) throw new Error(interrupted);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
