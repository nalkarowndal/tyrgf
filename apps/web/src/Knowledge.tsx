import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Brain, Sparkles, Download, Search } from 'lucide-react';
import type { MemoryEntry, SavedSkill } from '../../../packages/shared/src/knowledge';
import type { Session } from '../../../packages/shared/src/contracts';
import { api } from './api';
import { ErrorRecoveryPanel, FeatureExplanation, Modal } from './components';
const date = (s: string) => new Date(s).toLocaleString('ko-KR');
function useOperation() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return {
    busy,
    error,
    run: async (fn: () => Promise<void>) => {
      setBusy(true);
      setError('');
      try {
        await fn();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
  };
}
export function MemoryPage() {
  const memories = useQuery({
    queryKey: ['memories'],
    queryFn: () => api<MemoryEntry[]>('/memories'),
  });
  const sessions = useQuery({
    queryKey: ['summary-sessions'],
    queryFn: () => api<Session[]>('/sessions'),
  });
  const [q, setQ] = useState(''),
    [category, setCategory] = useState(''),
    [title, setTitle] = useState(''),
    [group, setGroup] = useState('선호'),
    [content, setContent] = useState(''),
    [edit, setEdit] = useState<MemoryEntry | null>(null),
    [sessionId, setSessionId] = useState(''),
    [remove, setRemove] = useState<MemoryEntry | 'all' | null>(null);
  const op = useOperation();
  const rows = (memories.data ?? []).filter(
    (m) =>
      (!category || m.category === category) &&
      (!q || (m.title + ' ' + m.content).toLowerCase().includes(q.toLowerCase())),
  );
  const refresh = async () => {
    await memories.refetch();
  };
  function reset() {
    setEdit(null);
    setTitle('');
    setContent('');
  }
  return (
    <div className="settings-page">
      <header className="page-header">
        <div>
          <span className="breadcrumb">내가 정하는 대화의 맥락</span>
          <h1>기억 관리</h1>
        </div>
        <Brain size={24} />
      </header>
      <div className="settings-content">
        <FeatureExplanation title="기억할 내용도, 잊을 내용도 직접 정해요">
          승인한 기억만 다음 대화에서 참고합니다. 클라우드 AI를 사용하면 기억도 함께 전송됩니다.
          자동으로 개인정보를 추출하지 않으며 API 키나 비밀번호는 여기에 저장하지 마세요. 기억은
          작업 관리의 도구 권한을 바꾸지 않습니다.
        </FeatureExplanation>
        {(op.error || memories.error) && (
          <ErrorRecoveryPanel message={op.error || (memories.error as Error).message} />
        )}
        <section className="settings-card">
          <h2>{edit ? '기억 수정' : '새 기억'}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void op.run(async () => {
                await api(edit ? `/memories/${edit.id}/update` : '/memories', {
                  title,
                  category: group,
                  content,
                  ...(edit ? { version: edit.version } : {}),
                });
                reset();
                await refresh();
              });
            }}
          >
            <div className="form-grid">
              <label className="field">
                기억 제목
                <input
                  maxLength={100}
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label className="field">
                기억 분류
                <input
                  maxLength={40}
                  required
                  value={group}
                  onChange={(e) => setGroup(e.target.value)}
                />
              </label>
            </div>
            <label className="field">
              기억 내용
              <textarea
                required
                maxLength={2000}
                rows={3}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="예: 답변은 한국어로 짧게, 예시를 하나 포함해 주세요."
              />
            </label>
            <div className="button-row">
              <button className="primary" disabled={op.busy}>
                {edit ? '수정한 초안 저장' : '기억 초안 저장'}
              </button>
              {edit && (
                <button type="button" className="secondary" onClick={reset}>
                  수정 취소
                </button>
              )}
            </div>
            <p className="fine-print">
              저장 후 목록에서 내용을 검토하고 사용을 승인하세요. 수정하면 승인이 해제되고 기존 대화
              맥락과 요약을 다음 요청에서 제외합니다.
            </p>
          </form>
        </section>
        <section className="settings-card">
          <h2>대화에서 요약 만들기</h2>
          <p>
            완료된 원문을 AI에 보내 요약 초안을 만듭니다. 모의 AI는 발췌만 제공합니다. 실패해도
            원문은 그대로 남습니다.
          </p>
          <label className="field">
            요약할 대화
            <select value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
              <option value="">대화를 선택하세요</option>
              {sessions.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary"
            disabled={op.busy || !sessionId}
            onClick={() =>
              op.run(async () => {
                await api('/memories/summarize', { sessionId });
                await refresh();
              })
            }
          >
            {op.busy ? '처리 중…' : '요약 초안 만들기'}
          </button>
          <p className="fine-print">
            최대 24,000자 원문 · 승인 전에는 다음 대화에 사용하지 않아요. 원문을 수정하거나 삭제하면
            이전 요약은 사용하지 않습니다.
          </p>
        </section>
        <section className="settings-card">
          <div className="run-heading">
            <h2>
              저장된 기억 <span className="muted">{memories.data?.length ?? 0}</span>
            </h2>
            <div className="button-row">
              <button
                className="secondary"
                disabled={op.busy}
                onClick={() =>
                  op.run(async () => {
                    const data = await api('/memories/export');
                    const url = URL.createObjectURL(
                      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
                    );
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'aura-memories.json';
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  })
                }
              >
                <Download size={15} />
                전체 내보내기
              </button>
              <button
                className="secondary"
                disabled={op.busy || !memories.data?.length}
                onClick={() => setRemove('all')}
              >
                기억 전체 삭제
              </button>
            </div>
          </div>
          <div className="form-grid">
            <label className="field">
              기억 검색
              <div className="knowledge-search">
                <Search size={16} />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="제목이나 내용으로 검색"
                />
              </div>
            </label>
            <label className="field">
              분류 필터
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">모든 분류</option>
                {[...new Set(memories.data?.map((m) => m.category))].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          {!rows.length && (
            <p className="empty-history">
              표시할 기억이 없어요. 위에서 필요한 정보만 저장해 보세요.
            </p>
          )}
          <div className="knowledge-list">
            {rows.map((m) => (
              <article className="memory-entry" key={m.id}>
                <div className="run-heading">
                  <h3>{m.title}</h3>
                  <span className="badge">{m.active ? '다음 대화에 사용' : '검토 대기'}</span>
                </div>
                <p className="knowledge-content">{m.content}</p>
                <p className="fine-print">
                  {m.category} · v{m.version} · 수정 {date(m.updatedAt)}
                </p>
                <p className="fine-print">
                  출처:{' '}
                  {m.source.kind === 'summary'
                    ? m.source.simulated
                      ? '모의 발췌'
                      : 'AI 요약'
                    : '사용자 작성·수정'}
                  {m.source.sessionId && (
                    <>
                      {' '}
                      ·{' '}
                      <Link className="text-link" to={'/chat/' + m.source.sessionId}>
                        원문 대화
                      </Link>
                    </>
                  )}{' '}
                  · 생성 {date(m.createdAt)}
                </p>
                <div className="button-row">
                  {!m.active && (
                    <button
                      className="secondary"
                      disabled={op.busy}
                      onClick={() =>
                        op.run(async () => {
                          await api(`/memories/${m.id}/approve`, { version: m.version });
                          await refresh();
                        })
                      }
                    >
                      이 버전 사용 승인
                    </button>
                  )}
                  <button
                    className="secondary"
                    disabled={op.busy}
                    onClick={() => {
                      setEdit(m);
                      setTitle(m.title);
                      setGroup(m.category);
                      setContent(m.content);
                      document.querySelector('.main-view')?.scrollTo({ top: 0 });
                    }}
                  >
                    수정
                  </button>
                  <button className="secondary" disabled={op.busy} onClick={() => setRemove(m)}>
                    삭제
                  </button>
                </div>
              </article>
            ))}
          </div>
          <p className="fine-print">
            삭제·수정하면 진행 중 답변을 중단하고 기존 대화 맥락과 요약을 다음 요청에서 제외합니다.
            화면의 과거 대화와 이미 외부에 전송한 정보는 지워지지 않습니다. 승인된 기억도 길이
            제한에 따라 일부 제외될 수 있습니다.
          </p>
        </section>
        {remove && (
          <Modal title="기억 삭제" onClose={() => !op.busy && setRemove(null)}>
            <h2>{remove === 'all' ? '모든 기억을 삭제할까요?' : '이 기억을 삭제할까요?'}</h2>
            <p>
              다음 대화에 다시 넣지 않습니다. 기존 대화 맥락과 요약도 사용을 중단합니다. 내보낸
              사본은 별도로 관리하세요.
            </p>
            <div className="button-row">
              <button
                className="primary"
                disabled={op.busy}
                onClick={() =>
                  op.run(async () => {
                    await api(
                      remove === 'all' ? '/memories/delete-all' : `/memories/${remove.id}/delete`,
                      remove === 'all' ? { confirm: true } : { version: remove.version },
                    );
                    setRemove(null);
                    reset();
                    await refresh();
                  })
                }
              >
                {remove === 'all' ? '모든 기억 삭제 확인' : '기억 삭제 확인'}
              </button>
              <button className="secondary" disabled={op.busy} onClick={() => setRemove(null)}>
                취소
              </button>
            </div>
          </Modal>
        )}
      </div>
    </div>
  );
}
function SkillEditor({
  skill,
  onSave,
  busy,
}: {
  skill: SavedSkill;
  onSave: (body: object) => void;
  busy: boolean;
}) {
  const [name, setName] = useState(skill.name),
    [purpose, setPurpose] = useState(skill.purpose),
    [steps, setSteps] = useState(skill.steps.join('\n')),
    [verification, setVerification] = useState(skill.verification);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          name,
          purpose,
          steps: steps.split('\n').filter((s) => s.trim()),
          tools: skill.tools,
          verification,
          version: skill.version,
        });
      }}
    >
      <label className="field">
        스킬 이름
        <input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        스킬 목적
        <textarea
          required
          maxLength={2000}
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
        />
      </label>
      <label className="field">
        실행 순서 (한 줄에 한 단계)
        <textarea required rows={5} value={steps} onChange={(e) => setSteps(e.target.value)} />
      </label>
      <label className="field">
        검증 방법
        <textarea
          required
          maxLength={1000}
          value={verification}
          onChange={(e) => setVerification(e.target.value)}
        />
      </label>
      <button className="secondary" disabled={busy}>
        스킬 수정 초안 저장
      </button>
      <p className="fine-print">
        수정 시 버전이 올라가고 승인이 해제됩니다. 이전 버전으로 시작한 작업도 더 실행할 수
        없습니다.
      </p>
    </form>
  );
}
export function SkillsPage() {
  const skills = useQuery({ queryKey: ['skills'], queryFn: () => api<SavedSkill[]>('/skills') });
  const [selected, setSelected] = useState(''),
    [editing, setEditing] = useState(false),
    [removing, setRemoving] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const op = useOperation();
  const skill = skills.data?.find((s) => s.id === selected) ?? skills.data?.[0];
  const refresh = async () => {
    await skills.refetch();
    setConfirmed(false);
    setEditing(false);
  };
  return (
    <div className="settings-page">
      <header className="page-header">
        <div>
          <span className="breadcrumb">잘된 작업을 나만의 절차로</span>
          <h1>스킬 관리</h1>
        </div>
        <Sparkles size={24} />
      </header>
      <div className="settings-content">
        <FeatureExplanation title="검토한 절차를 다시 사용해요">
          작업 관리에서 완료된 작업을 스킬 초안으로 저장할 수 있어요. 내용을 확인하고 현재 버전을
          승인하면 새 작업에서 선택할 수 있습니다. 스킬 승인은 파일 변경이나 웹 연결의 실행 승인을
          대신하지 않습니다.
        </FeatureExplanation>
        {(op.error || skills.error) && (
          <ErrorRecoveryPanel message={op.error || (skills.error as Error).message} />
        )}
        {!skill ? (
          <section className="settings-card">
            <h2>아직 저장한 스킬이 없어요</h2>
            <p>작업을 완료한 뒤 ‘스킬 초안으로 저장’을 눌러 보세요.</p>
            <Link to="/tasks" className="secondary">
              작업 관리 열기
            </Link>
          </section>
        ) : (
          <>
            <section className="settings-card">
              <label className="field">
                저장된 스킬
                <select
                  value={skill.id}
                  onChange={(e) => {
                    setSelected(e.target.value);
                    setEditing(false);
                    setConfirmed(false);
                  }}
                >
                  {skills.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · v{s.version}
                    </option>
                  ))}
                </select>
              </label>
              <div className="run-heading">
                <h2>{skill.name}</h2>
                <span className="badge">
                  {skill.approvedVersion === skill.version ? '승인됨' : '검토 대기'}
                </span>
              </div>
              <p className="knowledge-content">{skill.purpose}</p>
              <ol className="skill-steps">
                {skill.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
              <h3>사용 도구</h3>
              <div className="button-row">
                {skill.tools.map((t) => (
                  <span className="badge" key={t}>
                    {t}
                  </span>
                ))}
              </div>
              <h3>필요한 권한</h3>
              <ul>
                {skill.permissions.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <h3>검증 방법</h3>
              <p>{skill.verification}</p>
              <p className="fine-print">
                v{skill.version} · 수정 {date(skill.updatedAt)} · 원본 작업 {skill.sourceTaskId}
              </p>
              {skill.lastResult && (
                <FeatureExplanation title="마지막 실행 결과">
                  버전 {skill.lastResult.version} · {skill.lastResult.message}
                </FeatureExplanation>
              )}
              {skill.approvedVersion !== skill.version && (
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  절차와 필요한 권한을 확인했습니다
                </label>
              )}
              <div className="button-row">
                {skill.approvedVersion === skill.version ? (
                  <Link className="primary" to={'/tasks?skill=' + encodeURIComponent(skill.id)}>
                    이 스킬로 새 작업
                  </Link>
                ) : (
                  <button
                    className="primary"
                    disabled={op.busy || !confirmed}
                    onClick={() =>
                      op.run(async () => {
                        await api(`/skills/${skill.id}/approve`, { version: skill.version });
                        await refresh();
                      })
                    }
                  >
                    현재 버전 승인
                  </button>
                )}
                <button
                  className="secondary"
                  disabled={op.busy}
                  onClick={() => setEditing(!editing)}
                >
                  {editing ? '수정 닫기' : '스킬 수정'}
                </button>
                <button className="secondary" disabled={op.busy} onClick={() => setRemoving(true)}>
                  스킬 삭제
                </button>
              </div>
            </section>
            {editing && (
              <section className="settings-card">
                <h2>절차 수정</h2>
                <SkillEditor
                  key={skill.id + ':' + skill.version}
                  skill={skill}
                  busy={op.busy}
                  onSave={(body) =>
                    op.run(async () => {
                      await api(`/skills/${skill.id}/update`, body);
                      await refresh();
                    })
                  }
                />
              </section>
            )}
            {removing && (
              <Modal title="스킬 삭제" onClose={() => !op.busy && setRemoving(false)}>
                <h2>이 스킬을 삭제할까요?</h2>
                <p>
                  이 버전을 사용하던 승인 대기 작업도 더 실행할 수 없습니다. 이미 완료한 파일 변경은
                  유지됩니다.
                </p>
                <button
                  className="primary"
                  disabled={op.busy}
                  onClick={() =>
                    op.run(async () => {
                      await api(`/skills/${skill.id}/delete`, { version: skill.version });
                      setRemoving(false);
                      await refresh();
                    })
                  }
                >
                  스킬 삭제 확인
                </button>
              </Modal>
            )}
          </>
        )}
      </div>
    </div>
  );
}
