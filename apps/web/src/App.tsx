import { useEffect, useRef, useState } from 'react';
import {
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Plus,
  Search,
  MessageSquare,
  ListTodo,
  Folder,
  Globe,
  Code2,
  Brain,
  Sparkles,
  Plug,
  Settings,
  HelpCircle,
  ChevronRight,
  Menu,
  X,
  ShieldCheck,
  ArrowUpRight,
} from 'lucide-react';
import type { Bootstrap, Session } from '../../../packages/shared/src/contracts';
import { api, setToken } from './api';
import { HelpPage } from './Help';
import { Chat } from './Chat';
import { McpPage } from './Mcp';
import { ToolsPage } from './Tools';
import { TasksPage } from './Tasks';
import { MemoryPage, SkillsPage } from './Knowledge';
import { SettingsPage } from './Settings';
import { FirstRunTour } from './Onboarding';
import { EmptyStateGuide, ErrorRecoveryPanel, Logo, help } from './components';
const menus = [
  {
    name: '작업 관리',
    path: 'tasks',
    icon: ListTodo,
    description: '계획과 실행 결과를 확인합니다.',
  },
  {
    name: '파일 작업',
    path: 'files',
    icon: Folder,
    description: '허용한 폴더 안의 파일을 읽고 정리합니다.',
  },
  {
    name: '브라우저 자동화',
    path: 'browser',
    icon: Globe,
    description: '브라우저에서 반복 작업을 도와줍니다.',
  },
  {
    name: '코딩 및 프로젝트',
    path: 'coding',
    icon: Code2,
    description: '프로젝트 분석과 코드 작업을 도와줍니다.',
  },
  { name: '기억 관리', path: 'memory', icon: Brain, description: help.memory.short },
  {
    name: '스킬 관리',
    path: 'skills',
    icon: Sparkles,
    description: '검토한 작업 절차를 저장하고 재사용합니다.',
  },
  {
    name: '외부 도구 연결',
    path: 'mcp',
    icon: Plug,
    description: 'MCP 도구를 검토하고 연결합니다.',
  },
];
function ComingSoon() {
  const { pathname } = useLocation();
  const feature = menus.find((m) => pathname === `/${m.path}`);
  return (
    <div className="settings-page">
      <header className="page-header">
        <h1>{feature?.name ?? '페이지를 찾을 수 없습니다'}</h1>
        <span className="badge">준비 중</span>
      </header>
      <EmptyStateGuide title="차근차근 준비하고 있어요">
        {feature?.description}
        <br />이 기능은 아직 실행되지 않습니다. 지금은 AI와 대화하고 텍스트를 첨부할 수 있어요.
      </EmptyStateGuide>
      <div className="coming-action">
        <Link to="/" className="primary">
          대화 시작하기
          <ChevronRight size={16} />
        </Link>
      </div>
    </div>
  );
}
function ConversationRoute(props: { data: Bootstrap; refresh: () => Promise<unknown> }) {
  const { id } = useParams();
  return <Chat key={id ?? 'new'} {...props} />;
}
export function App() {
  const boot = useQuery({
    queryKey: ['bootstrap'],
    queryFn: async () => {
      const b = await api<Bootstrap>('/bootstrap');
      setToken(b.token);
      return b;
    },
    retry: false,
  });
  const [search, setSearch] = useState(''),
    [mobileOpen, setMobileOpen] = useState(false),
    [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const location = useLocation(),
    navigate = useNavigate();
  useEffect(() => {
    const media = window.matchMedia('(max-width: 768px)');
    const update = () => {
      setMobile(media.matches);
      if (!media.matches) setMobileOpen(false);
    };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!mobileOpen) return;
    const panel = sidebarRef.current;
    panel?.querySelector<HTMLButtonElement>('.mobile-close')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMobileOpen(false);
      }
      if (e.key !== 'Tab') return;
      const nodes = [
        ...(panel?.querySelectorAll<HTMLElement>('a, button, input, summary') ?? []),
      ].filter((el) => el.getClientRects().length && !el.hasAttribute('disabled'));
      const first = nodes[0],
        last = nodes.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    panel?.addEventListener('keydown', key);
    return () => {
      panel?.removeEventListener('keydown', key);
      menuButtonRef.current?.focus();
    };
  }, [mobileOpen]);
  useEffect(() => {
    if (!boot.data?.settings.onboarded) return;
    const frame = requestAnimationFrame(() => document.getElementById('main')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [location.pathname, boot.data?.settings.onboarded]);
  const sessions = useQuery({
    queryKey: ['sessions', search],
    queryFn: () => api<Session[]>(`/sessions?q=${encodeURIComponent(search)}`),
    enabled: !!boot.data,
  });
  const refresh = async () => {
    const result = await boot.refetch();
    if (result.error) throw result.error;
    return result.data;
  };
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    const s = boot.data?.settings;
    if (!s) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => {
      document.documentElement.dataset.theme =
        s.theme === 'system' ? (media.matches ? 'dark' : 'light') : s.theme;
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [boot.data?.settings.theme]);
  if (boot.error)
    return (
      <div className="boot-state">
        <Logo />
        <ErrorRecoveryPanel message={(boot.error as Error).message} />
        <button className="primary" onClick={() => boot.refetch()}>
          다시 연결
        </button>
      </div>
    );
  if (!boot.data)
    return (
      <div className="boot-state">
        <Logo />
        <p>나의 작업 공간을 준비하고 있어요…</p>
      </div>
    );
  const data = boot.data;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        본문으로 건너뛰기
      </a>
      <div className="mobile-top" inert={mobileOpen}>
        <Link to="/" className="brand">
          <Logo small />
          AURA
        </Link>
        <button
          ref={menuButtonRef}
          className="icon-button"
          aria-label="메뉴 열기"
          aria-expanded={mobileOpen}
          aria-controls="sidebar"
          onClick={() => setMobileOpen(true)}
        >
          <Menu size={22} />
        </button>
      </div>
      {mobileOpen && (
        <button
          className="sidebar-scrim"
          aria-label="메뉴 닫기"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        id="sidebar"
        ref={sidebarRef}
        inert={mobile && !mobileOpen}
        role={mobileOpen ? 'dialog' : undefined}
        aria-modal={mobileOpen ? true : undefined}
        aria-label={mobileOpen ? '주 메뉴' : undefined}
        className={`sidebar ${mobileOpen ? 'open' : ''}`}
      >
        <Link to="/" className="brand">
          <Logo small />
          <span>
            AURA<span className="brand-caption">나의 AI 도우미</span>
          </span>
        </Link>
        <button
          className="icon-button mobile-close"
          aria-label="메뉴 닫기"
          onClick={() => setMobileOpen(false)}
        >
          <X size={18} />
        </button>
        <button
          className="new-chat"
          onClick={() => {
            navigate('/');
            setMobileOpen(false);
          }}
        >
          <Plus size={18} />새 대화<span>+</span>
        </button>
        <label className="sidebar-search">
          <Search size={16} />
          <input
            aria-label="대화 검색"
            placeholder="대화 검색"
            maxLength={200}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <nav className="main-nav" aria-label="주 메뉴">
          <NavLink to="/" end>
            <MessageSquare size={18} />
            <span>대화</span>
            <span className="nav-dot" />
          </NavLink>
          <div className="nav-section-label">
            나의 도구 <span>차근차근 확장해요</span>
          </div>
          <NavLink to="/help">
            <HelpCircle size={18} />
            <span>처음 사용 가이드</span>
          </NavLink>
          {menus
            .filter(
              (m) =>
                !data.settings.hiddenMenus.includes(m.name) &&
                (data.settings.advanced || ['tasks', 'files', 'memory'].includes(m.path)),
            )
            .map((m) => (
              <NavLink key={m.path} to={`/${m.path}`} title={m.description}>
                <m.icon size={17} />
                <span>{m.name}</span>
                {m.path === 'coding' && <span className="soon-dot" title="준비 중" />}
              </NavLink>
            ))}
          {!data.settings.advanced && (
            <details className="extra-menus">
              <summary>더 많은 도구</summary>
              {menus
                .filter(
                  (m) =>
                    !data.settings.hiddenMenus.includes(m.name) &&
                    !['tasks', 'files', 'memory'].includes(m.path),
                )
                .map((m) => (
                  <NavLink key={m.path} to={`/${m.path}`} title={m.description}>
                    <m.icon size={17} />
                    <span>{m.name}</span>
                    {m.path === 'coding' && <span className="soon-dot" title="준비 중" />}
                  </NavLink>
                ))}
            </details>
          )}
        </nav>
        <div className="recent-conversations">
          <div className="nav-section-label">
            대화 기록 <span>{sessions.data?.length ?? 0}</span>
          </div>
          {sessions.error ? (
            <p className="fine-print">대화 기록을 불러오지 못했어요.</p>
          ) : sessions.data?.length ? (
            <div className="conversation-list">
              {sessions.data.map((s) => (
                <NavLink title={s.title} key={s.id} to={`/chat/${s.id}`}>
                  <MessageSquare size={14} />
                  <span>{s.title}</span>
                </NavLink>
              ))}
            </div>
          ) : (
            <p className="empty-history">
              {search ? '찾는 대화가 없어요.' : '첫 대화를 시작해 보세요.'}
            </p>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="safe-card">
            <ShieldCheck size={19} />
            <div>
              <strong>내가 결정하는 AI</strong>
              <span>도구 접근은 기본으로 꺼져 있어요</span>
            </div>
          </div>
          <NavLink to="/settings">
            <Settings size={17} />
            설정
          </NavLink>
          <NavLink to="/help">
            <HelpCircle size={17} />
            도움말
            <ArrowUpRight size={14} />
          </NavLink>
          <div className="profile">
            <span className="profile-avatar">나</span>
            <div>
              <strong>나의 작업 공간</strong>
              <span>로컬 · {data.settings.advanced ? '고급' : '초보자'} 모드</span>
            </div>
            <span className="status-dot" />
          </div>
        </div>
      </aside>
      <main id="main" tabIndex={-1} inert={mobileOpen} className="main-view">
        <Routes>
          <Route path="/" element={<ConversationRoute data={data} refresh={refresh} />} />
          <Route path="/chat/:id" element={<ConversationRoute data={data} refresh={refresh} />} />
          <Route path="/settings" element={<SettingsPage data={data} refresh={refresh} />} />
          <Route path="/help" element={<HelpPage data={data} />} />
          <Route path="/tasks" element={<TasksPage data={data} />} />
          <Route path="/memory" element={<MemoryPage />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/files" element={<ToolsPage key="files" mode="files" />} />
          <Route path="/browser" element={<ToolsPage key="browser" mode="browser" />} />
          <Route path="/mcp" element={<McpPage />} />
          <Route path="/tools" element={<ToolsPage key="tools" mode="tools" />} />
          <Route path="*" element={<ComingSoon />} />
        </Routes>
      </main>
      {!data.settings.onboarded && <FirstRunTour data={data} refresh={refresh} />}
    </div>
  );
}
