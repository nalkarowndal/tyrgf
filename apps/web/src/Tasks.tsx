import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ListTodo, Play, Pause, CheckCircle2, ShieldCheck, Folder, ArrowRight } from 'lucide-react';
import type { Bootstrap } from '../../../packages/shared/src/contracts';
import type { AgentTask } from '../../../packages/shared/src/agent';
import type { ToolRun, ToolState } from '../../../packages/shared/src/tools';
import { api } from './api';
import { ErrorRecoveryPanel, FeatureExplanation } from './components';
const labels: Record<AgentTask['status'], string> = {
  running: '진행 중',
  awaiting_approval: '승인 대기',
  paused: '일시중지',
  recoverable_error: '재개 가능',
  needs_review: '결과 확인 필요',
  completed: '완료',
  cancelled: '취소됨',
  failed: '중단됨',
};
function TaskApproval({
  run,
  busy,
  onApprove,
  onDeny,
}: {
  run: ToolRun;
  busy: boolean;
  onApprove: () => void;
  onDeny: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <section className="settings-card agent-approval">
      <div className="section-heading">
        <ShieldCheck size={22} />
        <div>
          <h2>실행 전 확인</h2>
          <p>AI는 이 단계를 스스로 승인할 수 없어요.</p>
        </div>
      </div>
      <p className="tool-target">{run.target}</p>
      <p>{run.message}</p>
      {run.tool === 'file.write' && (
        <div className="tool-diff">
          <section>
            <h3>변경 전</h3>
            <pre>{run.before ?? '파일 없음'}</pre>
          </section>
          <section>
            <h3>변경 후</h3>
            <pre>{run.after}</pre>
          </section>
        </div>
      )}
      <label className="check-field">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        대상과 내용을 확인하고 이번 실행을 승인합니다
      </label>
      <div className="button-row">
        <button
          className="primary"
          disabled={busy || !confirmed || run.status !== 'pending'}
          onClick={onApprove}
        >
          이번 한 번 승인
          <ArrowRight size={16} />
        </button>
        <button className="secondary" disabled={busy} onClick={onDeny}>
          거절하고 작업 취소
        </button>
      </div>
      <p className="fine-print">
        승인은 10분 동안 유효해요. 파일이 바뀌면 새 승인이 필요합니다. 원본과 변경 기록은 이
        컴퓨터에 남습니다.
      </p>
    </section>
  );
}
export function TasksPage({ data }: { data: Bootstrap }) {
  const tasks = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api<AgentTask[]>('/tasks'),
    refetchInterval: 700,
  });
  const tools = useQuery({
    queryKey: ['tools'],
    queryFn: () => api<ToolState>('/tools'),
    refetchInterval: 2000,
  });
  const [goal, setGoal] = useState(''),
    [rootId, setRootId] = useState(''),
    [allow, setAllow] = useState(false),
    [maxSteps, setMaxSteps] = useState(8),
    [selected, setSelected] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const task = tasks.data?.find((t) => t.id === selected) ?? tasks.data?.[0];
  const roots = tools.data?.roots ?? [];
  const root =
    roots.find((r) => r.id === rootId) ?? roots.find((r) => r.path === task?.rootPath) ?? roots[0];
  const preview = useQuery({
    queryKey: ['task-preview', task?.pendingRun, task?.status],
    queryFn: () => api<ToolRun>(`/tools/runs/${task!.pendingRun}`),
    enabled: !!task?.pendingRun && task.status === 'awaiting_approval',
    refetchInterval: 2000,
  });
  const cloud = ['gemini', 'groq'].includes(data.settings.provider);
  async function perform(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await tasks.refetch();
      await tools.refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function control(action: string, body: object = {}) {
    if (task)
      void perform(async () => {
        await api(`/tasks/${task.id}/${action}`, body);
      });
  }
  return (
    <div className="settings-page tasks-page">
      <header className="page-header">
        <div>
          <span className="breadcrumb">나의 에이전트 · 계획부터 결과 확인까지</span>
          <h1>작업 관리</h1>
        </div>
        <ListTodo size={24} />
      </header>
      <div className="settings-content">
        <div className="section-intro">
          <h2>목표를 알려주면, 한 단계씩 진행해요</h2>
          <p>
            허용한 폴더를 읽고 다음 도구를 선택합니다. 파일 변경과 웹 연결은 실행 전에 확인해
            주세요.
          </p>
        </div>
        {(error || tasks.error || tools.error || preview.error) && (
          <ErrorRecoveryPanel
            message={
              error ||
              (tasks.error as Error)?.message ||
              (tools.error as Error)?.message ||
              (preview.error as Error)?.message
            }
          />
        )}
        <section className="settings-card">
          <div className="section-heading">
            <Play size={21} />
            <div>
              <h2>새 작업</h2>
              <p>
                {data.settings.provider === 'mock'
                  ? '모의 복합 작업: 목록 → 첫 텍스트 읽기 → 보고서 저장 → 검증'
                  : '선택한 AI가 목표와 도구 결과를 바탕으로 다음 단계를 선택합니다.'}
              </p>
            </div>
          </div>
          {data.settings.provider === 'mock' && (
            <FeatureExplanation title="실제 AI가 아닌 고정 데모입니다">
              폴더 바로 아래 .txt 또는 .md 파일 하나를 준비하세요. 입력한 목표와 관계없이 첫
              텍스트를 읽고 aura-report.md에 발췌 보고서를 작성합니다. 파일 도구와 승인은 실제로
              동작합니다.
            </FeatureExplanation>
          )}
          <label className="field">
            작업 목표
            <textarea
              rows={3}
              maxLength={2000}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="예: 회의 메모를 읽고 다음 할 일을 보고서로 정리해 주세요."
            />
          </label>
          <div className="form-grid">
            <label className="field">
              작업 폴더
              <select value={root?.id ?? ''} onChange={(e) => setRootId(e.target.value)}>
                <option value="" disabled>
                  허용한 폴더를 선택하세요
                </option>
                {roots.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.path} · {r.write ? '읽기/쓰기' : '읽기만'}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              최대 도구 실행 횟수
              <select value={maxSteps} onChange={(e) => setMaxSteps(Number(e.target.value))}>
                {[2, 4, 6, 8].map((n) => (
                  <option key={n} value={n}>
                    {n}회
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!roots.length && (
            <p className="fine-print">
              <Link to="/files" className="text-link">
                파일 작업에서 폴더 허용하기 →
              </Link>
            </p>
          )}
          {cloud && (
            <label className="check-field">
              <input type="checkbox" checked={allow} onChange={(e) => setAllow(e.target.checked)} />
              작업 목표와 선택한 폴더에서 읽은 내용·웹 읽기 결과를 현재 AI에 전송하는 데 동의합니다
            </label>
          )}
          <div className="button-row">
            <button
              className="primary"
              disabled={
                busy ||
                !goal.trim() ||
                !root ||
                (cloud && !allow) ||
                tasks.data?.some((t) => t.status === 'running')
              }
              onClick={() =>
                perform(async () => {
                  const created = await api<AgentTask>('/tasks', {
                    goal,
                    rootId: root!.id,
                    allowModelData: allow,
                    maxSteps,
                  });
                  setSelected(created.id);
                  setGoal('');
                })
              }
            >
              작업 시작
              <ArrowRight size={16} />
            </button>
            <Link to="/settings" className="secondary">
              AI 연결: {data.settings.provider === 'mock' ? '모의 AI' : data.settings.model}
            </Link>
          </div>
          <p className="fine-print">
            한 번에 한 작업, 모델 호출 최대 12회, 한 번의 실행은 최대 2분입니다. 자동 유료 전환은
            없습니다. 서버 재시작 후에는 폴더를 다시 허용하고 직접 재개하세요.
          </p>
        </section>
        {!!tasks.data?.length && (
          <label className="field">
            작업 기록
            <select value={task?.id} onChange={(e) => setSelected(e.target.value)}>
              {tasks.data.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.goal} · {labels[t.status]}
                </option>
              ))}
            </select>
          </label>
        )}
        {task && (
          <>
            <section className="settings-card">
              <div className="run-heading">
                <h2>{task.goal}</h2>
                <span
                  className={`run-status ${task.status === 'completed' ? 'succeeded' : task.status}`}
                >
                  {labels[task.status]}
                </span>
              </div>
              <div className="agent-meta">
                <span className="badge">{task.simulated ? '모의 복합 작업' : task.model}</span>
                <span>
                  {task.steps.length} / {task.maxSteps} 도구
                </span>
                <span>{task.modelCalls} / 12 모델 호출</span>
              </div>
              <p className="tool-target">
                <Folder size={14} /> {task.rootPath}
              </p>
              <p role="status">{task.message}</p>
              <div className="button-row">
                {['running', 'awaiting_approval'].includes(task.status) && (
                  <button className="secondary" disabled={busy} onClick={() => control('pause')}>
                    <Pause size={15} />
                    일시중지
                  </button>
                )}
                {['paused', 'recoverable_error', 'awaiting_approval'].includes(task.status) && (
                  <button
                    className="secondary"
                    disabled={busy || !root}
                    onClick={() => control('resume', { rootId: root!.id })}
                  >
                    작업 재개
                  </button>
                )}
                {!['completed', 'cancelled', 'failed', 'needs_review'].includes(task.status) && (
                  <button className="secondary" disabled={busy} onClick={() => control('cancel')}>
                    작업 취소
                  </button>
                )}
              </div>
              <p className="fine-print">
                재개는 위에서 선택한 작업 폴더를 사용합니다. 원래 폴더의 정체성이 달라지면 이어서
                실행하지 않습니다.
              </p>
            </section>
            {task.status === 'awaiting_approval' && preview.data && (
              <TaskApproval
                key={preview.data.id}
                run={preview.data}
                busy={busy}
                onApprove={() => control('approve', { runId: preview.data!.id })}
                onDeny={() => control('deny', { runId: preview.data!.id })}
              />
            )}
            <section className="settings-card">
              <h2>진행한 단계와 근거</h2>
              {task.steps.length ? (
                <ol className="agent-timeline">
                  {task.steps.map((step, i) => (
                    <li key={step.id}>
                      <span className="step-number">{i + 1}</span>
                      <div>
                        <div className="run-heading">
                          <strong>{step.reason}</strong>
                          <span className="badge">
                            {step.status === 'succeeded' ? '확인됨' : '실패'}
                          </span>
                        </div>
                        <p className="tool-target">
                          {step.tool} · {step.target}
                        </p>
                        <details>
                          <summary>도구가 반환한 근거 보기</summary>
                          <pre>{step.observation}</pre>
                        </details>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="fine-print">
                  아직 실행한 도구가 없습니다. 계획이 끝나면 단계별 결과가 표시됩니다.
                </p>
              )}
            </section>
            {task.status === 'completed' && (
              <section className="settings-card agent-result">
                <div className="section-heading">
                  <CheckCircle2 size={24} />
                  <h2>검증한 작업 결과</h2>
                </div>
                <p className="agent-answer">{task.answer}</p>
                <FeatureExplanation title="검증 근거">{task.verification}</FeatureExplanation>
              </section>
            )}
            <p className="fine-print">
              도구 결과와 계획은 이 컴퓨터에 저장됩니다. 파일의 의미적 정확성은 직접 검토하세요.
              복구는{' '}
              <Link to="/tools" className="text-link">
                도구 실행 기록
              </Link>
              에서 확인할 수 있습니다.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
