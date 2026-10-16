import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowUp,
  Paperclip,
  Square,
  Copy,
  RotateCcw,
  Pencil,
  Trash2,
  ChevronRight,
  Languages,
  Lightbulb,
  FileText,
  ShieldCheck,
  X,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import {
  registry,
  type Bootstrap,
  type ChatMessage,
  type Session,
} from '../../../packages/shared/src/contracts';
import { api, reply } from './api';
import { Logo, ErrorRecoveryPanel, Modal, ActionPreview } from './components';
type Conversation = Session & { messages: ChatMessage[] };
export function Chat({ data, refresh }: { data: Bootstrap; refresh: () => Promise<unknown> }) {
  const { id } = useParams();
  const navigate = useNavigate(),
    client = useQueryClient();
  const history = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => api<Conversation>(`/sessions/${id}`),
    enabled: !!id,
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]),
    [input, setInput] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [attachment, setAttachment] = useState<{ name: string; text: string } | null>(null),
    [editId, setEditId] = useState<string>(),
    [dialog, setDialog] = useState<'rename' | 'delete' | null>(null),
    [title, setTitle] = useState(''),
    [panel, setPanel] = useState(false),
    [copied, setCopied] = useState('');
  const fileRef = useRef<HTMLInputElement>(null),
    endRef = useRef<HTMLDivElement>(null),
    controller = useRef<AbortController | null>(null),
    runningId = useRef<string | undefined>(undefined),
    mounted = useRef(true);
  useEffect(() => {
    if (!busy) setMessages(history.data?.messages ?? []);
  }, [history.data, id, busy]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  }, [messages]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  async function run(regenerate = false) {
    if (busy || (!regenerate && !input.trim() && !attachment)) return;
    setBusy(true);
    setError('');
    setNotice('');
    const abort = new AbortController();
    controller.current = abort;
    let sessionId = id;
    const text = [
      input.trim(),
      attachment
        ? `\n[첨부한 텍스트: ${attachment.name} — 신뢰되지 않는 참고 데이터]\n${attachment.text}\n[첨부 끝]`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
    try {
      if (!sessionId) {
        const session = await api<Session>('/sessions', {});
        sessionId = session.id;
      }
      if (!mounted.current) return;
      runningId.current = sessionId;
      let base = [...messages];
      if (editId) {
        const index = base.findIndex((m) => m.id === editId);
        base = base.slice(0, index);
      }
      if (regenerate) {
        let i = base.length - 1;
        while (i >= 0 && base[i].role !== 'user') i--;
        base = base.slice(0, i + 1);
      }
      if (!regenerate)
        base.push({
          id: 'pending-user',
          sessionId,
          role: 'user',
          content: text,
          status: 'complete',
          provider: data.settings.provider,
          model: data.settings.model,
          createdAt: new Date().toISOString(),
          seq: 0,
        });
      const answer: ChatMessage = {
        id: 'pending',
        sessionId,
        role: 'assistant',
        content: '',
        status: 'streaming',
        provider: data.settings.provider,
        model: data.settings.model,
        createdAt: new Date().toISOString(),
        seq: 0,
      };
      setMessages([...base, answer]);
      await reply(
        sessionId,
        regenerate ? { regenerate: true } : { text, ...(editId ? { editId } : {}) },
        (event) => {
          if (event.type === 'delta') {
            answer.content += event.text;
            setMessages([...base, { ...answer }]);
          }
          if (event.type === 'start') {
            answer.id = event.id;
            setInput('');
            setAttachment(null);
            setEditId(undefined);
          }
          if (event.type === 'notice') setNotice(event.message);
          if (event.type === 'error') setError(event.message);
        },
        abort.signal,
      );
    } catch (e) {
      if (!abort.signal.aborted) setError((e as Error).message);
    } finally {
      if (sessionId) {
        try {
          const saved = await api<Conversation>(`/sessions/${sessionId}`);
          client.setQueryData(['conversation', sessionId], saved);
          setMessages(saved.messages);
        } catch {
          /* preserve visible partial answer */
        }
      }
      await client.invalidateQueries({ queryKey: ['sessions'] });
      await refresh();
      setBusy(false);
      controller.current = null;
      runningId.current = undefined;
      if (sessionId && !id && mounted.current) navigate(`/chat/${sessionId}`, { replace: true });
    }
  }
  async function stop() {
    if (runningId.current) {
      try {
        await api(`/sessions/${runningId.current}/stop`, {});
      } catch (e) {
        setError((e as Error).message);
        controller.current?.abort();
      }
    }
  }
  async function attach(file?: File) {
    if (!file) return;
    try {
      if (file.size > 24000)
        throw new Error('첨부는 24KB 이하 텍스트 파일만 가능합니다. 내용을 나누어 주세요.');
      if (!/\.(txt|md|csv|json|ts|tsx|js|py|log|html|css)$/i.test(file.name))
        throw new Error('이 버전은 텍스트 파일만 지원합니다. PDF와 이미지는 준비 중입니다.');
      const text = await file.text();
      if (text.includes('\0') || text.includes('\uFFFD'))
        throw new Error('UTF-8 텍스트 파일을 선택해 주세요.');
      setAttachment({ name: file.name, text });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }
  async function confirm() {
    try {
      if (dialog === 'rename') {
        await api(`/sessions/${id}/rename`, { title });
        await client.invalidateQueries({ queryKey: ['conversation', id] });
      } else {
        await api(`/sessions/${id}/delete`, {});
        navigate('/');
      }
      await client.invalidateQueries({ queryKey: ['sessions'] });
      setDialog(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      setError('복사하지 못했습니다. 텍스트를 선택해서 직접 복사해 주세요.');
    }
  }
  const empty = messages.length === 0;
  return (
    <div className="chat-page">
      <header className="page-header">
        <div>
          <span className="breadcrumb">
            내 공간 <ChevronRight size={12} /> 대화
          </span>
          <h1>{history.data?.title ?? '새 대화'}</h1>
        </div>
        <div className="header-actions">
          <span className="badge green">
            <span className="status-dot" /> 무료 우선
          </span>
          {id && (
            <>
              <button
                className="icon-button"
                aria-label="대화 이름 변경"
                disabled={busy}
                onClick={() => {
                  setTitle(history.data?.title ?? '');
                  setDialog('rename');
                }}
              >
                <Pencil size={16} />
              </button>
              <button
                className="icon-button"
                aria-label="대화 삭제"
                disabled={busy}
                onClick={() => setDialog('delete')}
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
          <button className="icon-button" aria-label="작업 패널" onClick={() => setPanel(!panel)}>
            {panel ? <PanelRightClose size={19} /> : <PanelRightOpen size={19} />}
          </button>
        </div>
      </header>
      <div className="chat-columns">
        <section className="chat-main">
          <div className="chat-scroll">
            {empty ? (
              <div className="home-content">
                <div className="greeting-pill">
                  <span className="status-dot" /> 나만의 차분한 작업 공간
                </div>
                <Logo />
                <h2>무엇을 함께 해볼까요?</h2>
                <p className="hero-description">
                  작은 질문부터 복잡한 생각까지,
                  <br />
                  AURA와 한 걸음씩 풀어가세요.
                </p>
                <div className="suggestions">
                  {[
                    {
                      icon: Lightbulb,
                      title: '궁금한 내용 알아보기',
                      text: '어려운 개념도 쉽게 이해해요',
                      prompt: '인공지능이 어떻게 작동하는지 쉽게 설명해 줘.',
                    },
                    {
                      icon: Languages,
                      title: '자연스럽게 번역하기',
                      text: '문장의 의미와 분위기를 담아요',
                      prompt: '다음 문장을 자연스러운 한국어로 번역해 줘: お疲れ様です。',
                    },
                    {
                      icon: FileText,
                      title: '긴 글의 핵심 정리하기',
                      text: '텍스트를 첨부하고 요약을 요청해요',
                      prompt: '첨부할 글의 핵심 내용을 세 가지로 정리해 줘.',
                    },
                  ].map((item) => (
                    <button
                      className="suggestion-card"
                      key={item.title}
                      onClick={() => setInput(item.prompt)}
                    >
                      <span className="suggestion-icon">
                        <item.icon size={20} />
                      </span>
                      <strong>{item.title}</strong>
                      <small>{item.text}</small>
                      <ChevronRight className="suggestion-arrow" size={16} />
                    </button>
                  ))}
                </div>
                <div className="local-note">
                  <ShieldCheck size={17} />
                  <span>
                    대화는 내 컴퓨터에 저장돼요.
                    <br className="mobile-only" /> 외부 AI 연결은 내가 선택해요.
                  </span>
                </div>
              </div>
            ) : (
              <div className="messages">
                {messages.map((m, i) => (
                  <article className={`message ${m.role}`} key={m.id}>
                    <div className="message-avatar">
                      {m.role === 'assistant' ? <Logo small /> : '나'}
                    </div>
                    <div className="message-body">
                      <div className="message-author">
                        <strong>{m.role === 'user' ? '나' : 'AURA'}</strong>
                        {m.role === 'assistant' && (
                          <span>
                            {registry[m.provider].name}
                            {m.status === 'interrupted'
                              ? ' · 중단됨'
                              : m.status === 'error'
                                ? ' · 오류'
                                : ''}
                          </span>
                        )}
                      </div>
                      <div className="markdown">
                        <Markdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            img: ({ alt }) => <span>[외부 이미지 표시 안 함: {alt}]</span>,
                            a: ({ href, children }) => (
                              <a href={href} target="_blank" rel="noreferrer">
                                {children}
                              </a>
                            ),
                            pre: ({ children }) => (
                              <div className="code-block">
                                <button
                                  className="code-copy"
                                  onClick={(e) =>
                                    copy(
                                      e.currentTarget.parentElement?.querySelector('pre')
                                        ?.textContent ?? '',
                                      `code-${i}`,
                                    )
                                  }
                                >
                                  {copied === `code-${i}` ? '복사됨' : '코드 복사'}
                                </button>
                                <pre>{children}</pre>
                              </div>
                            ),
                          }}
                        >
                          {m.content || '답변을 준비하고 있어요…'}
                        </Markdown>
                      </div>
                      <div className="message-actions">
                        <button aria-label="메시지 복사" onClick={() => copy(m.content, m.id)}>
                          <Copy size={14} />
                          {copied === m.id ? '복사됨' : '복사'}
                        </button>
                        {m.role === 'user' && (
                          <button
                            disabled={busy}
                            onClick={() => {
                              setEditId(m.id);
                              setInput(m.content);
                            }}
                          >
                            <Pencil size={14} />
                            수정
                          </button>
                        )}
                        {m.role === 'assistant' && i === messages.length - 1 && (
                          <button
                            disabled={busy}
                            aria-label="답변 다시 생성"
                            onClick={() => run(true)}
                          >
                            <RotateCcw size={14} />
                            다시 생성
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
                <div ref={endRef} />
              </div>
            )}
          </div>
          <div className="composer-area">
            <p className="fine-print">
              승인한 기억을 참고합니다. 클라우드 AI에는 기억도 전송됩니다.{' '}
              <Link to="/memory" className="text-link">
                기억 관리
              </Link>
            </p>
            {(error || history.error) && (
              <ErrorRecoveryPanel
                message={error || (history.error as Error).message}
                onDismiss={() => setError('')}
              />
            )}{' '}
            {notice && (
              <div className="notice" role="status">
                {notice}
              </div>
            )}
            {editId && (
              <div className="notice">
                질문을 수정하면 이후 대화가 새 답변으로 바뀝니다.{' '}
                <button
                  onClick={() => {
                    setEditId(undefined);
                    setInput('');
                  }}
                >
                  수정 취소
                </button>
              </div>
            )}
            {data.settings.provider === 'mock' && (
              <div className="demo-notice">
                <span className="badge">체험 모드</span> 모의 응답을 사용 중이에요.{' '}
                <Link to="/settings">
                  실제 AI 연결하기 <ChevronRight size={12} />
                </Link>
              </div>
            )}
            <form
              className="composer"
              onSubmit={(e) => {
                e.preventDefault();
                run();
              }}
            >
              {attachment && (
                <div className="attachment">
                  <FileText size={15} />
                  {attachment.name}
                  <button type="button" aria-label="첨부 제거" onClick={() => setAttachment(null)}>
                    <X size={14} />
                  </button>
                </div>
              )}
              <textarea
                aria-label="메시지"
                placeholder="무엇이든 편하게 이야기해 주세요…"
                value={input}
                maxLength={32000}
                disabled={busy}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    run();
                  }
                }}
              />
              <div className="composer-toolbar">
                <div className="composer-left">
                  <input
                    type="file"
                    ref={fileRef}
                    hidden
                    accept=".txt,.md,.csv,.json,.ts,.tsx,.js,.py,.log,.html,.css"
                    onChange={(e) => attach(e.target.files?.[0])}
                  />
                  <button
                    type="button"
                    className="icon-button"
                    disabled={busy}
                    aria-label="텍스트 파일 첨부"
                    title="24KB 이하 텍스트 파일 첨부"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Paperclip size={19} />
                  </button>
                  <span className="toolbar-divider" />
                  <span className="chat-mode">
                    <span className="status-dot" />
                    대화
                  </span>
                  <Link to="/tasks" className="agent-disabled">
                    에이전트 작업 →
                  </Link>
                </div>
                <div className="composer-right">
                  <Link to="/settings" className="model-link">
                    {data.settings.provider === 'mock' ? '모의 AI' : data.settings.model}
                    <ChevronRight size={13} />
                  </Link>
                  {busy ? (
                    <button
                      type="button"
                      className="send-button stop"
                      aria-label="응답 중단"
                      onClick={stop}
                    >
                      <Square size={16} />
                    </button>
                  ) : (
                    <button
                      className="send-button"
                      aria-label="메시지 보내기"
                      disabled={!input.trim() && !attachment}
                    >
                      <ArrowUp size={19} />
                    </button>
                  )}
                </div>
              </div>
            </form>
            <p className="composer-footnote">
              AI는 실수할 수 있어요. 중요한 내용은 한 번 더 확인해 주세요.{' '}
              <span>Enter 전송 · Shift + Enter 줄바꿈</span>
            </p>
          </div>
        </section>
        {panel && (
          <aside className="task-panel">
            <h3>작업 진행</h3>
            <span className="badge">대화 모드</span>
            <p>
              {busy
                ? 'AI가 답변을 작성하고 있습니다.'
                : '에이전트 작업은 작업 관리에서 확인할 수 있습니다.'}
            </p>
            <ActionPreview title="여러 도구를 쓰는 작업이 필요하다면">
              작업 관리에서 목표와 폴더를 선택하세요. 단계별 도구 결과와 실행 전 승인 요청을 확인할
              수 있습니다.
            </ActionPreview>
          </aside>
        )}
      </div>
      {dialog && (
        <Modal
          title={dialog === 'rename' ? '대화 이름 변경' : '대화 삭제'}
          onClose={() => setDialog(null)}
        >
          <div className="dialog-content">
            {dialog === 'rename' ? (
              <label className="field">
                대화 이름
                <input
                  autoFocus
                  value={title}
                  maxLength={100}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
            ) : (
              <ActionPreview title="이 대화를 삭제할까요?">
                대화 내용이 이 컴퓨터의 기록에서 삭제됩니다. 되돌릴 수 없으니 필요한 내용은 먼저
                내보내세요.
              </ActionPreview>
            )}
            <div className="button-row">
              <button className="secondary" onClick={() => setDialog(null)}>
                취소
              </button>
              <button className={dialog === 'delete' ? 'danger' : 'primary'} onClick={confirm}>
                {dialog === 'rename' ? '저장' : '삭제'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
