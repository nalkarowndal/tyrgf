import { useId } from 'react';
const labels: Record<string, string> = {
  project_list: '폴더 목록 보기',
  project_read: '텍스트 파일 읽기',
  project_search: '파일 안에서 검색',
};
export const mcpToolLabel = (kind: string, name: string) =>
  kind === 'aura' ? (labels[name] ?? name) : name;
export function McpInput({
  tool,
  value,
  onChange,
}: {
  tool: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const hint = useId();
  let args: { path?: string; query?: string } = {};
  try {
    args = JSON.parse(value);
  } catch {
    /* Initial draft only; server validates all submitted input. */
  }
  const set = (key: string, text: string) =>
    onChange(
      JSON.stringify({
        path: args.path ?? '',
        ...(tool === 'project_search' ? { query: args.query ?? '' } : {}),
        [key]: text,
      }),
    );
  return (
    <>
      <label className="field">
        {tool === 'project_list' ? '폴더 안 경로 (선택)' : '읽을 파일 경로'}
        <input
          value={args.path ?? ''}
          onChange={(e) => set('path', e.target.value)}
          maxLength={500}
          aria-describedby={hint}
          placeholder={
            tool === 'project_list'
              ? '비우면 허용한 폴더 목록'
              : '예: hello.txt 또는 notes/meeting.md'
          }
        />
      </label>
      <p id={hint} className="fine-print">
        허용한 폴더를 기준으로 입력하세요.{' '}
        {tool === 'project_list'
          ? '비워 두면 최상위 목록을 보여줍니다.'
          : '파일 내용은 읽기만 하며 변경하지 않습니다.'}
      </p>
      {tool === 'project_search' && (
        <label className="field">
          찾을 문자열
          <input
            value={args.query ?? ''}
            onChange={(e) => set('query', e.target.value)}
            maxLength={200}
            placeholder="예: 회의"
          />
        </label>
      )}
      <details>
        <summary>전송할 입력 자세히 보기</summary>
        <pre className="mcp-code">{value}</pre>
      </details>
    </>
  );
}
