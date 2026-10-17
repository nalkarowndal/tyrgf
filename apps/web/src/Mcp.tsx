import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plug, ShieldCheck } from 'lucide-react';
import {
  mcpCatalog,
  type McpKind,
  type McpRun,
  type McpServer,
  type McpState,
} from '../../../packages/shared/src/mcp';
import type { ToolState } from '../../../packages/shared/src/tools';
import { McpInput, mcpToolLabel } from './McpInput';
import { api } from './api';
import { ErrorRecoveryPanel, FeatureExplanation, Modal } from './components';
const statusLabels: Record<McpRun['status'], string> = {
  pending: '승인 대기',
  running: '실행 중',
  succeeded: '완료',
  failed: '실패',
  expired: '만료됨',
  interrupted: '중단됨',
  denied: '거절됨',
};
function ServerCard({
  server,
  busy,
  act,
  onConnect,
  onPreview,
}: {
  server: McpServer;
  busy: boolean;
  act: (path: string, body: object) => Promise<unknown>;
  onConnect: () => void;
  onPreview: (r: McpRun) => void;
}) {
  const [selected, setSelected] = useState(server.allowedTools),
    [tool, setTool] = useState(''),
    [input, setInput] = useState('{"path":""}'),
    [error, setError] = useState('');
  const catalog = mcpCatalog[server.kind],
    current = server.tools.find((t) => t.name === tool);
  return (
    <section className="settings-card mcp-server">
      <div className="mcp-heading">
        <h2>{catalog.name}</h2>
        <span className="badge">
          {server.status === 'connected'
            ? '연결됨'
            : server.status === 'connecting'
              ? '연결 중'
              : '연결 안 됨'}
        </span>
      </div>
      <p>{server.message}</p>
      <p className="tool-target">
        {server.rootPath ?? 'GitHub 계정 범위'}
        {server.version && ` · ${server.version}`}
      </p>
      <div className="button-row">
        {server.status === 'disconnected' ? (
          <button className="primary" disabled={busy} onClick={onConnect}>
            연결 검토
          </button>
        ) : (
          <button
            className="secondary"
            onClick={() => void act(`/mcp/servers/${server.id}/disconnect`, {})}
          >
            연결 해제
          </button>
        )}
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void act(`/mcp/servers/${server.id}/delete`, {})}
        >
          등록 삭제
        </button>
      </div>
      {server.status === 'connected' && (
        <>
          <h3>1. 사용할 조회 도구 선택</h3>
          <p className="fine-print">
            체크 후 저장하세요. 서버가 표시한 읽기 전용 힌트만으로 권한을 부여하지 않습니다.
          </p>
          <div className="mcp-tools">
            {server.tools.map((t) => (
              <label key={t.name} className="check-field">
                <input
                  aria-label={`${mcpToolLabel(server.kind, t.name)} 허용`}
                  type="checkbox"
                  disabled={!t.eligible || busy}
                  checked={selected.includes(t.name)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, t.name]
                        : selected.filter((n) => n !== t.name),
                    )
                  }
                />
                <span>
                  <strong>{mcpToolLabel(server.kind, t.name)}</strong>{' '}
                  {!t.eligible && <em>지원 범위 밖</em>}
                  <small>{t.description}</small>
                </span>
              </label>
            ))}
          </div>
          {!server.tools.length && <p>이 서버에서 발견한 도구가 없습니다.</p>}
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              void act(`/mcp/servers/${server.id}/permissions`, {
                generation: server.generation,
                tools: selected,
              })
            }
          >
            도구 권한 저장
          </button>
          <p role="status" className="fine-print">
            현재 허용한 도구 {server.allowedTools.length}개. 권한을 저장한 도구만 아래에서 선택할 수
            있습니다.
          </p>
          <h3>2. 입력 확인 후 실행</h3>
          <label className="field">
            실행할 도구
            <select
              value={tool}
              onChange={(e) => {
                setTool(e.target.value);
                if (server.kind === 'aura')
                  setInput(
                    JSON.stringify({
                      path: '',
                      ...(e.target.value === 'project_search' ? { query: '' } : {}),
                    }),
                  );
              }}
            >
              <option value="">허용한 도구를 선택하세요</option>
              {server.tools
                .filter((t) => server.allowedTools.includes(t.name))
                .map((t) => (
                  <option key={t.name} value={t.name}>
                    {mcpToolLabel(server.kind, t.name)}
                  </option>
                ))}
            </select>
          </label>
          {current && (
            <details>
              <summary>입력 형식 보기 (JSON Schema)</summary>
              <pre className="mcp-code">{JSON.stringify(current.inputSchema, null, 2)}</pre>
            </details>
          )}
          {server.kind === 'aura' ? (
            tool ? (
              <McpInput tool={tool} value={input} onChange={setInput} />
            ) : (
              <p className="fine-print">허용한 도구를 선택하면 입력할 항목이 표시됩니다.</p>
            )
          ) : (
            <label className="field">
              도구 입력 JSON
              <textarea
                rows={5}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                spellCheck={false}
              />
            </label>
          )}
          {error && <ErrorRecoveryPanel message={error} />}
          <button
            className="primary"
            disabled={busy || !server.allowedTools.includes(tool)}
            onClick={async () => {
              setError('');
              try {
                const args: unknown = JSON.parse(input);
                const r = await act('/mcp/preview', { serverId: server.id, tool, arguments: args });
                if (r) onPreview(r as McpRun);
              } catch {
                setError('JSON 문법을 확인하세요. 예: {"path":"hello.txt"}');
              }
            }}
          >
            실행 미리보기
          </button>
        </>
      )}
      <details>
        <summary>설치 조건과 연결 정보</summary>
        <p>{catalog.prerequisite}</p>
        <p className="tool-target">{server.executable}</p>
        <p className="tool-target">
          {server.fingerprint && `등록한 실행 파일 SHA256: ${server.fingerprint}`}
        </p>
        {catalog.url && (
          <a href={catalog.url} target="_blank" rel="noreferrer">
            공식 설치 안내
          </a>
        )}
      </details>
    </section>
  );
}
export function McpPage() {
  const query = useQuery({
    queryKey: ['mcp'],
    queryFn: () => api<McpState>('/mcp'),
    refetchInterval: 2000,
  });
  const roots = useQuery({
    queryKey: ['mcp-roots'],
    queryFn: () => api<ToolState>('/tools'),
    refetchInterval: 3000,
  });
  const [kind, setKind] = useState<McpKind>('aura'),
    [rootId, setRootId] = useState(''),
    [path, setPath] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [connecting, setConnecting] = useState<McpServer>(),
    [confirmed, setConfirmed] = useState(false),
    [token, setToken] = useState(''),
    [preview, setPreview] = useState<McpRun>();
  const act = async (endpoint: string, body: object): Promise<unknown> => {
    setBusy(true);
    setError('');
    try {
      return await api(endpoint, body);
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    } finally {
      setBusy(false);
      await query.refetch();
    }
  };
  const selectedCatalog = mcpCatalog[kind];
  const activePreview = preview && (query.data?.runs.find((r) => r.id === preview.id) ?? preview);
  return (
    <div className="settings-page mcp-page">
      <header className="page-header">
        <h1>외부 도구 연결</h1>
        <span className="badge">MCP · 직접 실행</span>
      </header>
      <div className="settings-content">
        <FeatureExplanation title="도구를 연결하고, 내가 허용한 입력만 실행해요">
          <p>
            ① 서버 등록 → ② 연결 테스트 → ③ 도구 권한 선택 → ④ 입력 승인 순서로 진행합니다. 지금은
            이 화면에서 직접 실행하며 AI 작업 계획·스킬에는 자동 연결되지 않습니다.
          </p>
          <p>
            내장 서버는 허용 폴더를 실제로 읽습니다. 외부 서버는 별도 설치·인증이 필요하며 연결
            전에는 검증되지 않은 상태입니다.
          </p>
          <Link to="/files">폴더 접근 허용하기</Link> · <Link to="/tools">파일·웹 실행 기록</Link>
        </FeatureExplanation>
        {(error || query.error || roots.error) && (
          <ErrorRecoveryPanel
            message={error || (query.error as Error)?.message || (roots.error as Error)?.message}
          />
        )}
        <section className="settings-card">
          <div className="section-heading">
            <Plug size={21} />
            <h2>서버 등록</h2>
          </div>
          <label className="field">
            서버 종류
            <select value={kind} onChange={(e) => setKind(e.target.value as McpKind)}>
              {Object.entries(mcpCatalog).map(([id, c]) => (
                <option key={id} value={id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <p>{selectedCatalog.description}</p>
          <p className="fine-print">{selectedCatalog.prerequisite}</p>
          {kind !== 'github' && (
            <label className="field">
              연결할 폴더
              <select value={rootId} onChange={(e) => setRootId(e.target.value)}>
                <option value="">먼저 파일 작업에서 폴더를 허용하세요</option>
                {roots.data?.roots.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.path}
                  </option>
                ))}
              </select>
            </label>
          )}
          {kind !== 'aura' && (
            <>
              <label className="field">
                설치된 실행 파일 절대 경로
                <input
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder={`/설치/경로/${selectedCatalog.executable}`}
                />
              </label>
              <a href={selectedCatalog.url} target="_blank" rel="noreferrer">
                공식 설치 안내
              </a>
              <p className="fine-print">
                자동 설치하지 않습니다. npx·uvx 명령 대신 이미 설치된 CLI 실행 파일을 등록하세요.
              </p>
            </>
          )}
          <button
            className="primary"
            disabled={busy || (kind !== 'github' && !rootId) || (kind !== 'aura' && !path)}
            onClick={() =>
              void act('/mcp/servers', {
                kind,
                ...(kind !== 'github' ? { rootId } : {}),
                ...(kind !== 'aura' ? { executable: path } : {}),
              })
            }
          >
            서버 등록
          </button>
        </section>
        {query.data?.servers.map((s) => (
          <ServerCard
            key={`${s.id}:${s.generation}:${s.allowedTools.join(',')}`}
            server={s}
            busy={busy}
            act={act}
            onPreview={setPreview}
            onConnect={() => {
              setConfirmed(false);
              setToken('');
              setConnecting(s);
            }}
          />
        ))}
        <section className="settings-card">
          <h2>실행 기록</h2>
          {!query.data?.runs.length ? (
            <p>승인한 도구의 결과가 여기에 표시됩니다.</p>
          ) : (
            query.data.runs.map((r) => (
              <article className="mcp-receipt" key={r.id}>
                <div className="mcp-heading">
                  <strong>
                    {r.serverName} · {r.tool}
                  </strong>
                  <span className="badge">{statusLabels[r.status]}</span>
                </div>
                <p className="fine-print">{new Date(r.createdAt).toLocaleString('ko-KR')}</p>
                {r.status === 'pending' && (
                  <button className="secondary" disabled={busy} onClick={() => setPreview(r)}>
                    승인 검토
                  </button>
                )}
                {r.result && <pre className="mcp-code">{r.result}</pre>}
                <details>
                  <summary>승인 입력</summary>
                  <pre className="mcp-code">{JSON.stringify(r.arguments, null, 2)}</pre>
                </details>
              </article>
            ))
          )}
        </section>
        <section className="settings-card">
          <h2>선택형 REA 안내</h2>
          <p>REA는 선택형 추가 도구입니다. 이번 버전은 설치·연결·실행을 지원하지 않습니다.</p>
          <a href="https://github.com/morluto/rea" target="_blank" rel="noreferrer">
            REA 공식 저장소
          </a>
          <p className="fine-print">
            개발 대화의 GitHub·Exa·Context7·Canva 플러그인과 이 앱의 MCP 연결 권한은 별개입니다.
          </p>
        </section>
      </div>
      {connecting && (
        <Modal
          title="MCP 서버 실행 확인"
          onClose={() => {
            setConnecting(undefined);
            setToken('');
          }}
        >
          <ShieldCheck size={28} />
          <h2>{mcpCatalog[connecting.kind].name}</h2>
          <p>
            {connecting.kind === 'aura'
              ? '내장 읽기 서버를 별도 프로세스로 시작합니다. 허용한 폴더만 읽습니다.'
              : '등록한 외부 프로그램을 OS 사용자 권한으로 실행합니다. 시작 과정에서도 파일·캐시·네트워크에 접근할 수 있습니다. 도구 권한 선택은 OS 격리 기능이 아닙니다. 출처를 신뢰할 때만 실행하세요.'}
          </p>
          <p className="tool-target">{connecting.executable ?? connecting.rootPath}</p>
          {connecting.rootPath && (
            <label className="field">
              다시 허용한 폴더
              <select value={rootId} onChange={(e) => setRootId(e.target.value)}>
                <option value="">현재 등록한 권한 사용</option>
                {roots.data?.roots
                  .filter((r) => r.path === connecting.rootPath)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.path}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {connecting.kind === 'github' && (
            <label className="field">
              GitHub 읽기 권한 PAT
              <input
                type="password"
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <small>이번 연결의 메모리에만 보관합니다. Groq API 키와 다릅니다.</small>
            </label>
          )}
          <label className="check-field">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            프로그램 실행을 확인했습니다
          </label>
          <button
            className="primary"
            disabled={busy || !confirmed}
            onClick={async () => {
              const p = connecting;
              const key = token;
              setConnecting(undefined);
              setToken('');
              await act(`/mcp/servers/${p.id}/connect`, {
                confirmed: true,
                ...(p.kind === 'github' ? { token: key } : {}),
                ...(rootId &&
                roots.data?.roots.some((r) => r.id === rootId && r.path === p.rootPath)
                  ? { rootId }
                  : {}),
              });
            }}
          >
            확인하고 연결 테스트
          </button>
        </Modal>
      )}
      {activePreview && (
        <Modal title="MCP 도구 실행 승인" onClose={() => setPreview(undefined)}>
          <h2>
            {activePreview.serverName} · {activePreview.tool}
          </h2>
          <p>
            아래 입력을 고정하여 한 번만 실행합니다. 승인은 10분 후 만료됩니다. 외부 도구는 해당
            서비스로 입력을 전송할 수 있습니다.
          </p>
          <pre className="mcp-code">{JSON.stringify(activePreview.arguments, null, 2)}</pre>
          <p>{statusLabels[activePreview.status]}</p>
          <div className="button-row">
            <button
              className="primary"
              disabled={busy || activePreview.status !== 'pending'}
              onClick={async () => {
                const id = activePreview.id;
                setPreview(undefined);
                await act(`/mcp/runs/${id}/approve`, {});
              }}
            >
              이 입력으로 한 번 실행
            </button>
            <button
              className="secondary"
              disabled={busy || activePreview.status !== 'pending'}
              onClick={async () => {
                const id = activePreview.id;
                setPreview(undefined);
                await act(`/mcp/runs/${id}/deny`, {});
              }}
            >
              거절
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
