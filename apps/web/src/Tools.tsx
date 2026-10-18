import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Folder,
  ShieldCheck,
  Globe,
  History,
  FileText,
  ArrowRight,
  RotateCcw,
  Plug,
} from 'lucide-react';
import type { FileView, ToolRun, ToolState } from '../../../packages/shared/src/tools';
import { api } from './api';
import { ErrorRecoveryPanel, FeatureExplanation, Modal } from './components';
const labels: Record<ToolRun['status'], string> = {
  pending: '승인 대기',
  running: '실행 중',
  succeeded: '완료',
  failed: '실패',
  denied: '거절됨',
  expired: '만료됨',
  interrupted: '중단됨',
};
function Approval({
  run,
  busy,
  onApprove,
  onDeny,
  onClose,
  onStop,
}: {
  run: ToolRun;
  busy: boolean;
  onApprove: () => void;
  onDeny: () => void;
  onClose: () => void;
  onStop: () => void;
}) {
  const [checked, setChecked] = useState(false);
  return (
    <Modal title="실행 전 확인" onClose={busy ? undefined : onClose}>
      <div className="tool-approval">
        <span className="eyebrow">내가 확인하고, 한 번만 실행</span>
        <h2>
          {run.status !== 'pending'
            ? '실행 기록 확인'
            : run.restoreOf
              ? '이전 내용으로 복구할까요?'
              : run.tool === 'browser.read'
                ? '이 페이지를 읽을까요?'
                : run.after === null
                  ? '이 파일을 삭제할까요?'
                  : '이 내용으로 저장할까요?'}
        </h2>
        <p className="tool-target">{run.target}</p>
        <FeatureExplanation
          title={run.tool === 'browser.read' ? '외부로 전달되는 정보' : '변경 범위'}
        >
          {run.message}
        </FeatureExplanation>
        {run.tool !== 'browser.read' && (
          <div className="tool-diff">
            <section>
              <h3>변경 전</h3>
              <pre>{run.before === null ? '파일 없음' : run.before || '(빈 파일)'}</pre>
            </section>
            <section>
              <h3>변경 후</h3>
              <pre>{run.after === null ? '파일 삭제' : run.after || '(빈 파일)'}</pre>
            </section>
          </div>
        )}
        <p className="fine-print">
          10분 안에 한 번만 승인할 수 있어요. 파일 변경 전 내용은 이 컴퓨터의 실행 기록에
          저장됩니다.
        </p>
        {busy ? (
          <div className="button-row">
            <p role="status">실행 중입니다…</p>
            <button className="secondary" onClick={onStop}>
              실행 중단
            </button>
          </div>
        ) : run.status === 'pending' ? (
          <>
            <label className="check-field">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
              />
              대상과 변경 내용을 확인했습니다
            </label>
            <div className="button-row">
              <button className="secondary" onClick={onDeny}>
                거절하고 닫기
              </button>
              <button className="primary" disabled={!checked} onClick={onApprove}>
                이번 한 번 승인
                <ArrowRight size={16} />
              </button>
            </div>
          </>
        ) : (
          <button className="secondary" onClick={onClose}>
            기록 닫기
          </button>
        )}
      </div>
    </Modal>
  );
}
export function ToolsPage({ mode }: { mode: 'files' | 'browser' | 'tools' }) {
  const query = useQuery({
    queryKey: ['tools'],
    queryFn: () => api<ToolState>('/tools'),
    refetchInterval: 3000,
  });
  const [folder, setFolder] = useState(''),
    [write, setWrite] = useState(false),
    [rootId, setRootId] = useState(''),
    [path, setPath] = useState(''),
    [content, setContent] = useState('');
  const [url, setUrl] = useState('https://example.com/'),
    [view, setView] = useState<FileView>(),
    [preview, setPreview] = useState<ToolRun>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [snapshot, setSnapshot] = useState<ToolRun['result']>();
  const state = query.data,
    selectedRoot = state?.roots.find((r) => r.id === rootId) ?? state?.roots[0];
  const selectedPreview = state?.runs.find((r) => r.id === preview?.id) ?? preview;
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
      await query.refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function makePreview(tool: 'file.write' | 'file.delete' | 'browser.read') {
    await act(async () => {
      setPreview(
        await api<ToolRun>(
          '/tools/preview',
          tool === 'browser.read'
            ? { tool, url }
            : {
                tool,
                rootId: selectedRoot?.id,
                path,
                ...(tool === 'file.write' ? { content } : {}),
              },
        ),
      );
    });
  }
  async function decide(approve: boolean) {
    if (!preview) return;
    await act(async () => {
      const r = await api<ToolRun>(`/tools/runs/${preview.id}/${approve ? 'approve' : 'deny'}`, {});
      setPreview(undefined);
      if (r.status === 'failed' || r.status === 'interrupted') setError(r.message);
      else setNotice(r.message);
      if (r.result) setSnapshot(r.result);
    });
  }
  async function read(filePath = path) {
    await act(async () => {
      const r = await api<FileView>('/tools/read', { rootId: selectedRoot?.id, path: filePath });
      setPath(filePath);
      setView(r);
      if (r.content !== undefined) setContent(r.content);
      setNotice('이 화면에서 읽었습니다. AI로 전송하지 않았습니다.');
    });
  }
  if (!state)
    return (
      <div className="settings-page">
        <div className="settings-content">
          {query.error ? (
            <ErrorRecoveryPanel
              message={(query.error as Error).message}
              action={
                <button
                  className="secondary"
                  disabled={query.isFetching}
                  onClick={() => void query.refetch()}
                >
                  다시 불러오기
                </button>
              }
            />
          ) : (
            <p>도구 상태를 불러오고 있어요…</p>
          )}
        </div>
      </div>
    );
  const title =
    mode === 'files' ? '파일 작업' : mode === 'browser' ? '공개 웹페이지 읽기' : '도구와 실행 기록';
  const Icon = mode === 'files' ? Folder : mode === 'browser' ? Globe : Plug;
  return (
    <div className="settings-page tools-page">
      <header className="page-header">
        <div>
          <span className="breadcrumb">나의 도구 · 내가 허용한 범위에서</span>
          <h1>{title}</h1>
        </div>
        <Icon size={24} className="muted" />
      </header>
      <div className="settings-content">
        <div className="section-intro">
          <h2>
            {mode === 'files'
              ? '작은 파일 작업부터, 안심하고'
              : mode === 'browser'
                ? '웹페이지를 읽고, 결과를 확인하세요'
                : '무엇을 할 수 있는지 한눈에'}
          </h2>
          <p>
            이 화면에서는 도구를 직접 실행합니다. 여러 도구를 이어 쓰려면 작업 관리에서 목표를
            입력하세요.
          </p>
        </div>
        {(error || query.error) && (
          <ErrorRecoveryPanel
            message={error || (query.error as Error).message}
            onDismiss={() => setError('')}
            action={<Link to="/help">권한·오류 해결 안내</Link>}
          />
        )}
        {notice && (
          <div role="status" className="success-panel">
            {notice}
          </div>
        )}
        {mode === 'files' && (
          <>
            <section className="settings-card">
              <div className="section-heading">
                <ShieldCheck size={21} />
                <div>
                  <h2>1. 작업할 폴더 허용</h2>
                  <p>권한은 앱을 종료하면 해제됩니다. 처음에는 전용 작업 폴더를 권장해요.</p>
                </div>
              </div>
              {!state.filesSupported && (
                <ErrorRecoveryPanel message="파일 도구는 현재 Linux에서 지원합니다. Windows의 안전한 파일 접근은 준비 중입니다." />
              )}
              <label className="field">
                허용할 폴더의 전체 경로
                <input
                  disabled={busy}
                  value={folder || state.suggestedPath}
                  onChange={(e) => setFolder(e.target.value)}
                  spellCheck={false}
                />
                <span className="field-note">
                  기본 경로는 허용할 때 생성합니다. 다른 경로는 이미 있는 폴더의 전체 경로를
                  입력하세요.
                </span>
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={write}
                  onChange={(e) => setWrite(e.target.checked)}
                />
                파일 생성·수정·삭제도 허용
              </label>
              <button
                className="primary"
                disabled={busy || !state.filesSupported}
                onClick={() =>
                  act(async () => {
                    const r = await api<{ id: string }>('/tools/roots', {
                      path: folder || state.suggestedPath,
                      write,
                    });
                    setRootId(r.id);
                    setView(undefined);
                    setPath('');
                    setContent('');
                    setNotice('폴더 권한을 허용했습니다. 파일 변경은 매번 따로 승인합니다.');
                  })
                }
              >
                이 폴더 허용
              </button>
              <div className="granted-folders">
                {state.roots.length ? (
                  state.roots.map((r) => (
                    <div className="grant-row" key={r.id}>
                      <Folder size={18} />
                      <div>
                        <strong>{r.path}</strong>
                        <span>{r.write ? '읽기 · 변경 가능 (변경 전 승인)' : '읽기만 가능'}</span>
                      </div>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          act(async () => {
                            await api('/tools/roots/revoke', { rootId: r.id });
                            setView(undefined);
                            setContent('');
                            setPath('');
                          })
                        }
                      >
                        권한 해제
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="fine-print">아직 허용한 폴더가 없어요</p>
                )}
              </div>
            </section>
            <section className="settings-card">
              <div className="section-heading">
                <FileText size={21} />
                <div>
                  <h2>2. 읽거나 변경할 파일 선택</h2>
                  <p>UTF-8 텍스트 24KB까지 지원합니다. 숨김 파일·링크·프로그램은 제외해요.</p>
                </div>
              </div>
              <div className="form-grid">
                <label className="field">
                  허용한 폴더
                  <select
                    disabled={busy}
                    value={selectedRoot?.id ?? ''}
                    onChange={(e) => {
                      setRootId(e.target.value);
                      setPath('');
                      setContent('');
                      setView(undefined);
                    }}
                  >
                    <option value="" disabled>
                      먼저 폴더를 허용하세요
                    </option>
                    {state.roots.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.path}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  폴더 안의 경로
                  <input
                    disabled={busy}
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                    placeholder="예: meeting.txt · 비우면 폴더 목록"
                    spellCheck={false}
                  />
                </label>
              </div>
              <button className="secondary" disabled={busy || !selectedRoot} onClick={() => read()}>
                읽기 · 목록 보기
              </button>
              {view?.entries && (
                <div className="file-list">
                  {path && (
                    <button
                      onClick={() => read(path.split('/').slice(0, -1).join('/'))}
                      disabled={busy}
                    >
                      ← 상위 폴더
                    </button>
                  )}
                  {view.entries.length ? (
                    view.entries.map((entry) => (
                      <button
                        disabled={busy}
                        key={entry.name}
                        onClick={() => read([path, entry.name].filter(Boolean).join('/'))}
                      >
                        {entry.directory ? <Folder size={16} /> : <FileText size={16} />}
                        <span>{entry.name}</span>
                        {entry.directory && <ArrowRight size={14} />}
                      </button>
                    ))
                  ) : (
                    <p className="fine-print">
                      표시할 텍스트 파일이 없어요. 아래에 새 내용을 작성할 수 있습니다.
                    </p>
                  )}
                  {view.truncated && (
                    <p className="fine-print">
                      처음 500개 항목만 확인했습니다. 하위 폴더를 선택해 주세요.
                    </p>
                  )}
                </div>
              )}
              <label className="field tool-editor">
                파일 내용
                <textarea
                  disabled={busy}
                  rows={8}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  maxLength={24000}
                  placeholder="새 파일의 내용을 적거나, 읽은 내용을 수정하세요."
                />
              </label>
              <div className="button-row">
                <button
                  className="primary"
                  disabled={busy || !selectedRoot?.write || !path}
                  onClick={() => makePreview('file.write')}
                >
                  저장 미리보기
                </button>
                <button
                  className="secondary"
                  disabled={busy || !selectedRoot?.write || !path}
                  onClick={() => makePreview('file.delete')}
                >
                  삭제 미리보기
                </button>
              </div>
              <p className="fine-print">
                미리보기만으로 파일은 바뀌지 않습니다. 다음 화면에서 대상과 전후 내용을 확인하세요.
              </p>
            </section>
          </>
        )}
        {mode === 'browser' && (
          <section className="settings-card">
            <div className="section-heading">
              <Globe size={21} />
              <div>
                <h2>공개 페이지 한 개 읽기</h2>
                <p>로그인하지 않은 상태로 본문을 읽고 읽기 화면을 캡처합니다.</p>
              </div>
            </div>
            <FeatureExplanation title="내가 승인한 주소에만 연결해요">
              URL 전체가 해당 사이트로 전송됩니다. 개인정보가 담긴 주소는 피하세요. 로그인·폼
              입력·클릭·다운로드·자동 이동은 준비 중입니다. 이미지와 동적 콘텐츠를 제외한 본문을
              표시합니다.
            </FeatureExplanation>
            <div className="tool-permission">
              <span className="badge">웹 읽기 {state.browserEnabled ? '켜짐' : '꺼짐'}</span>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    await api('/tools/permissions', { browserEnabled: !state.browserEnabled });
                  })
                }
              >
                {state.browserEnabled ? '웹 읽기 권한 끄기' : '웹 읽기 권한 켜기'}
              </button>
            </div>
            <label className="field">
              읽을 HTTPS 주소
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                maxLength={2000}
                spellCheck={false}
              />
            </label>
            <button
              className="primary"
              disabled={busy || !state.browserEnabled}
              onClick={() => makePreview('browser.read')}
            >
              웹 읽기 미리보기
            </button>
            <p className="fine-print">
              사이트의 안내 문구는 참고 자료입니다. 페이지에 쓰인 명령은 실행하지 않습니다.
            </p>
          </section>
        )}
        {mode === 'tools' && (
          <section className="settings-card">
            <h2>사용할 수 있는 도구</h2>
            <div className="tool-catalog">
              {state.registry.map((t) => (
                <div key={t.id}>
                  <h3>{t.name}</h3>
                  <p>{t.description}</p>
                  <span className="badge">{t.permission}</span>
                </div>
              ))}
            </div>
            <FeatureExplanation title="외부 도구는 연결 관리에서 확인하세요">
              <Link to="/mcp">MCP 서버 연결과 도구 권한 관리</Link>에서 설치 조건을 확인하고 직접
              실행할 수 있습니다. 개발에 사용한 플러그인 연결은 이 앱의 권한과 별개입니다.
            </FeatureExplanation>
          </section>
        )}
        {snapshot && (
          <section className="settings-card browser-result">
            <h2>{snapshot.title}</h2>
            <p className="tool-target">{snapshot.url}</p>
            <p>{snapshot.text}</p>
            <details>
              <summary>읽기 화면 캡처 보기</summary>
              <img src={snapshot.screenshot} alt="추출한 웹페이지 본문으로 만든 읽기 화면" />
            </details>
          </section>
        )}
        <section className="settings-card">
          <div className="section-heading">
            <History size={21} />
            <div>
              <h2>실행 기록</h2>
              <p>최근 50건 · 파일 변경 전후 내용과 읽은 웹 본문은 이 컴퓨터에 저장됩니다.</p>
            </div>
          </div>
          <div className="tool-history">
            {state.runs.length ? (
              state.runs
                .filter(
                  (r) =>
                    mode === 'tools' ||
                    (mode === 'browser' ? r.tool === 'browser.read' : r.tool.startsWith('file.')),
                )
                .map((r) => (
                  <article key={r.id} className="tool-run">
                    <div className="run-heading">
                      <strong>{state.registry.find((t) => t.id === r.tool)?.name ?? r.tool}</strong>
                      <span className={`run-status ${r.status}`}>{labels[r.status]}</span>
                    </div>
                    <p className="tool-target">{r.target}</p>
                    <p>{r.message}</p>
                    {r.recoveryPath && (
                      <p className="tool-target">원본 복구 위치: {r.recoveryPath}</p>
                    )}
                    <time>{new Date(r.createdAt).toLocaleString('ko-KR')}</time>
                    <div className="button-row">
                      {r.status === 'pending' && (
                        <button className="secondary" disabled={busy} onClick={() => setPreview(r)}>
                          승인 내용 보기
                        </button>
                      )}
                      {r.status === 'running' && (
                        <button
                          className="secondary"
                          onClick={() => {
                            void api(`/tools/runs/${r.id}/stop`, {})
                              .then(() => query.refetch())
                              .catch((e) => setError(e.message));
                          }}
                        >
                          실행 중단
                        </button>
                      )}
                      {r.status === 'succeeded' &&
                        ['file.write', 'file.delete'].includes(r.tool) && (
                          <button
                            className="secondary"
                            disabled={
                              busy ||
                              !state.roots.some((root) => root.id === r.rootId && root.write)
                            }
                            onClick={() =>
                              act(async () => {
                                setPreview(await api<ToolRun>(`/tools/runs/${r.id}/restore`, {}));
                              })
                            }
                          >
                            <RotateCcw size={14} />
                            복구 미리보기
                          </button>
                        )}
                      {r.status !== 'pending' &&
                        r.tool !== 'file.read' &&
                        r.tool !== 'browser.read' && (
                          <button className="secondary" onClick={() => setPreview(r)}>
                            전후 내용 보기
                          </button>
                        )}
                      {r.result && (
                        <button
                          className="secondary"
                          onClick={() =>
                            act(async () => {
                              const detail = await api<ToolRun>(`/tools/runs/${r.id}`);
                              setSnapshot(detail.result);
                            })
                          }
                        >
                          읽은 결과 보기
                        </button>
                      )}
                    </div>
                  </article>
                ))
            ) : (
              <p className="fine-print">
                아직 실행한 도구가 없어요. 권한을 허용한 뒤 작은 작업부터 시작해 보세요.
              </p>
            )}
          </div>
          <p className="fine-print">
            복구는 같은 실행 세션에서 파일이 다시 바뀌지 않았을 때 가능합니다. 앱 재시작 후 대기
            요청은 만료되고 권한은 해제됩니다.
          </p>
        </section>
      </div>
      {selectedPreview && (
        <Approval
          key={selectedPreview.id}
          run={selectedPreview}
          busy={busy}
          onApprove={() => decide(true)}
          onDeny={() => decide(false)}
          onClose={() => setPreview(undefined)}
          onStop={() => {
            void api(`/tools/runs/${selectedPreview.id}/stop`, {}).catch((e) =>
              setError(e.message),
            );
          }}
        />
      )}
    </div>
  );
}
