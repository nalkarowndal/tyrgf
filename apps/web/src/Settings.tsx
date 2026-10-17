import { useRef, useState } from 'react';
import {
  Settings2,
  ShieldCheck,
  Palette,
  SlidersHorizontal,
  Download,
  KeyRound,
} from 'lucide-react';
import type { Bootstrap } from '../../../packages/shared/src/contracts';
import { registry } from '../../../packages/shared/src/contracts';
import { api } from './api';
import { FirstRunTour } from './Onboarding';
import { ProviderForm } from './ProviderForm';
import {
  PermissionExplanation,
  ErrorRecoveryPanel,
  FeatureExplanation,
  TechnicalDetailsDisclosure,
  help,
  Modal,
} from './components';
export function SettingsPage({
  data,
  refresh,
}: {
  data: Bootstrap;
  refresh: () => Promise<unknown>;
}) {
  const [s, setS] = useState(data.settings),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [tour, setTour] = useState(false),
    [saving, setSaving] = useState(false),
    [formRevision, setFormRevision] = useState(0);
  const [exitOpen, setExitOpen] = useState(false);
  async function exitApp() {
    try {
      await api('/app/exit', {});
      setExitOpen(false);
      setNotice('앱을 종료했습니다. 이 브라우저 창을 닫아도 됩니다.');
    } catch (e) {
      setError((e as Error).message);
      setExitOpen(false);
    }
  }
  const replaySaved = useRef(false);
  const replayOpen = useRef(false);
  function closeTour() {
    replayOpen.current = false;
    setTour(false);
    if (replaySaved.current) setFormRevision((v) => v + 1);
  }
  async function save() {
    setSaving(true);
    setNotice('');
    try {
      await api('/settings', {
        theme: s.theme,
        advanced: s.advanced,
        contextBudget: s.contextBudget,
        hiddenMenus: s.hiddenMenus,
      });
      await refresh();
      setNotice('일반 설정을 저장했습니다.');
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function removeKey(provider: string) {
    try {
      await api('/keys/remove', { provider });
      await refresh();
      setNotice('이 실행 세션의 API 키를 지웠습니다.');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="settings-page">
      <header className="page-header">
        <div>
          <span className="breadcrumb">나에게 맞게</span>
          <h1>설정</h1>
        </div>
        <Settings2 size={22} className="muted" />
      </header>
      <div className="settings-content">
        <div className="section-intro">
          <h2>편안하게, 안전하게 사용하세요</h2>
          <p>AI 연결부터 화면까지, 필요한 설정을 한곳에서 관리해요.</p>
          <button
            className="secondary"
            onClick={() => {
              replaySaved.current = false;
              replayOpen.current = true;
              setTour(true);
            }}
          >
            처음 설정 다시 보기
          </button>
        </div>
        {error && <ErrorRecoveryPanel message={error} />}
        {notice && (
          <div role="status" className="success-panel">
            {notice}
          </div>
        )}
        <section className="settings-card">
          <h2>설치 · 백업 · 종료</h2>
          <p>
            Windows 설치본은 시작 메뉴의 ‘암호화 백업’과 ‘데이터 복원’을 사용하세요. 먼저 앱을
            종료해야 합니다.
          </p>
          <p>
            백업에는 대화·기억·스킬·화면 설정이 포함됩니다. 백업에는 API 키와 실행 권한이 포함되지
            않습니다. 실제 파일·진행 작업·실행 기록·사용량·MCP 설정도 제외됩니다.
          </p>
          <p>
            복원은 현재 데이터를 교체하며 암호화 안전 사본을 남깁니다. 기억·스킬을 다시 검토하고
            키와 권한을 다시 설정하세요. 백업 암호를 잃으면 복구할 수 없습니다.
          </p>
          <p className="fine-print">
            로그인 자동 시작은 설치 시 선택하며 기본 꺼짐입니다. 업데이트는 백업·앱 종료 후 수동
            설치합니다. 브라우저만 닫으면 서버는 계속 실행됩니다.
          </p>
          <button className="secondary" onClick={() => setExitOpen(true)}>
            앱 종료
          </button>
        </section>
        <section className="settings-card">
          <div className="section-heading">
            <KeyRound size={20} />
            <div>
              <h2>AI 연결</h2>
              <p>대화할 AI와 모델을 선택합니다.</p>
            </div>
          </div>
          <ProviderForm
            key={formRevision}
            initial={data.settings}
            keyStatus={data.keyStatus}
            onSaved={refresh}
          />
        </section>
        <section className="settings-card">
          <div className="section-heading">
            <Palette size={20} />
            <div>
              <h2>일반 · 화면 설정</h2>
              <p>익숙한 방식으로 AURA를 사용해요.</p>
            </div>
          </div>
          <div className="form-grid">
            <label className="field">
              화면 테마
              <select
                value={s.theme}
                onChange={(e) => setS({ ...s, theme: e.target.value as typeof s.theme })}
              >
                <option value="light">밝은 화면</option>
                <option value="dark">어두운 화면</option>
                <option value="system">컴퓨터 설정 따르기</option>
              </select>
            </label>
            <label className="field">
              사용자 모드
              <select
                value={s.advanced ? 'advanced' : 'beginner'}
                onChange={(e) => setS({ ...s, advanced: e.target.value === 'advanced' })}
              >
                <option value="beginner">초보자 · 쉬운 설명</option>
                <option value="advanced">고급 · 세부 설정</option>
              </select>
            </label>
          </div>
          {s.advanced && (
            <label className="field">
              대화 길이 예산 (글자 수)
              <input
                type="number"
                min={2000}
                max={32000}
                value={s.contextBudget}
                onChange={(e) => setS({ ...s, contextBudget: Number(e.target.value) })}
              />
              <span className="field-note">
                이번 요청에 포함할 최근 대화 길이입니다. 초과하면 오래된 대화부터 제외하고 알립니다.
                자동 요약은 준비 중입니다.
              </span>
            </label>
          )}
          <TechnicalDetailsDisclosure title="사용하지 않는 메뉴 숨기기">
            {[
              '작업 관리',
              '파일 작업',
              '브라우저 자동화',
              '코딩 및 프로젝트',
              '기억 관리',
              '스킬 관리',
              '외부 도구 연결',
            ].map((name) => (
              <label className="check-field" key={name}>
                <input
                  type="checkbox"
                  checked={s.hiddenMenus.includes(name)}
                  onChange={(e) =>
                    setS({
                      ...s,
                      hiddenMenus: e.target.checked
                        ? [...s.hiddenMenus, name]
                        : s.hiddenMenus.filter((n) => n !== name),
                    })
                  }
                />
                {name} 숨기기
              </label>
            ))}
          </TechnicalDetailsDisclosure>
          <button className="primary" disabled={saving} onClick={save}>
            일반 설정 저장
          </button>
        </section>
        <section className="settings-card">
          <div className="section-heading">
            <ShieldCheck size={20} />
            <div>
              <h2>개인정보 · 보안</h2>
              <p>접근 권한과 데이터 보관 상태를 확인하세요.</p>
            </div>
          </div>
          <PermissionExplanation />
          <FeatureExplanation title={help.privacy.title}>{help.privacy.detail}</FeatureExplanation>
          <div className="button-row">
            <a className="secondary" href="/api/export" download>
              <Download size={16} />
              대화 전체 내보내기
            </a>
            {Object.entries(data.keyStatus)
              .filter(([, v]) => v)
              .map(([p]) => (
                <button key={p} className="secondary" onClick={() => removeKey(p)}>
                  {p} 키 지우기
                </button>
              ))}
          </div>
          <p className="fine-print">
            내보낸 파일에는 대화 내용이 포함됩니다. API 키는 포함되지 않습니다. 개별 대화 삭제는
            대화 화면 위의 휴지통을 이용하세요.
          </p>
        </section>
        <section className="settings-card">
          <div className="section-heading">
            <SlidersHorizontal size={20} />
            <div>
              <h2>무료 사용량</h2>
              <p>이 앱에서 기록한 누적 요청입니다. 공급자의 정확한 잔여 한도가 아닙니다.</p>
            </div>
          </div>
          <div className="usage-grid">
            {data.usage.length ? (
              data.usage.map((u) => (
                <div className="usage-item" key={u.provider}>
                  <span>{registry[u.provider].name}</span>
                  <strong>
                    {u.requests}
                    <small>회 요청</small>
                  </strong>
                  <p>
                    {u.estimated ? '예상·실측 합산' : '공급자 보고'} {u.tokens.toLocaleString()}{' '}
                    토큰
                  </p>
                </div>
              ))
            ) : (
              <p className="muted">아직 사용 내역이 없어요. 첫 대화를 시작해 보세요.</p>
            )}
          </div>
          <p className="fine-print">{help.free.detail}</p>
        </section>
      </div>
      {tour && (
        <FirstRunTour
          data={data}
          refresh={async () => {
            const result = await refresh();
            replaySaved.current = true;
            if (!replayOpen.current) setFormRevision((v) => v + 1);
            return result;
          }}
          onClose={closeTour}
        />
      )}
      {exitOpen && (
        <Modal title="AURA를 종료할까요?" onClose={() => setExitOpen(false)}>
          <p>
            진행 중인 응답과 작업을 중단하고 메모리의 API 키를 지웁니다. 저장된 대화는 유지됩니다.
          </p>
          <div className="button-row">
            <button className="secondary" onClick={() => setExitOpen(false)}>
              계속 사용
            </button>
            <button className="primary" onClick={exitApp}>
              확인하고 종료
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
