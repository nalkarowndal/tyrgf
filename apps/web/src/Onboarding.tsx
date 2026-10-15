import { useState } from 'react';
import { ArrowRight, MessageSquare, Languages, ShieldCheck, Check } from 'lucide-react';
import type { Bootstrap } from '../../../packages/shared/src/contracts';
import { registry } from '../../../packages/shared/src/contracts';
import { api } from './api';
import { Modal, GuidedStep, PermissionExplanation, Logo, ErrorRecoveryPanel } from './components';
import { ProviderForm } from './ProviderForm';
export function FirstRunTour({
  data,
  refresh,
}: {
  data: Bootstrap;
  refresh: () => Promise<unknown>;
}) {
  const [step, setStep] = useState(1),
    [tested, setTested] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function finish() {
    setBusy(true);
    try {
      await api('/settings', { onboarded: true });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="처음 설정">
      <div className="step-progress" aria-label={`5단계 중 ${step}단계`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={i <= step ? 'active' : ''} />
        ))}
      </div>
      {step === 1 && (
        <GuidedStep step={1} title="안녕하세요! AURA와 시작해 볼까요?">
          <Logo />
          <p className="lead">
            복잡한 일은 가볍게, 궁금한 것은 편하게.
            <br />
            나에게 맞는 AI 도우미를 준비해 보세요.
          </p>
          <div className="welcome-examples">
            <span>
              <MessageSquare size={19} />
              궁금한 내용을 쉽게 설명받기
            </span>
            <span>
              <Languages size={19} />
              외국어 문장을 자연스럽게 번역하기
            </span>
            <span>
              <ShieldCheck size={19} />
              내가 선택한 AI와 대화 기록 관리하기
            </span>
          </div>
          <p className="fine-print">API 키가 없어도 모의 AI로 먼저 체험할 수 있어요.</p>
        </GuidedStep>
      )}
      {step === 2 && (
        <GuidedStep step={2} title="어떤 AI와 함께할까요?">
          <p className="muted">연결 테스트까지 마치면 다음 단계로 갈 수 있어요.</p>
          <ProviderForm
            initial={data.settings}
            keyStatus={data.keyStatus}
            onSaved={refresh}
            onTested={setTested}
          />
        </GuidedStep>
      )}
      {step === 3 && (
        <GuidedStep step={3} title="내가 허용한 일만 하도록">
          <PermissionExplanation />
          <div className="permission-list">
            {['웹 검색', '브라우저 조작', '폴더 읽기', '폴더 수정', '명령 실행', 'GitHub 접근'].map(
              (t) => (
                <div key={t}>
                  <span>{t}</span>
                  <span className="badge">꺼짐 · 준비 중</span>
                </div>
              ),
            )}
          </div>
        </GuidedStep>
      )}
      {step === 4 && (
        <GuidedStep step={4} title="첫 대화, 이렇게 시작해 보세요">
          <div className="prompt-preview">“안녕하세요. 어떤 일을 할 수 있나요?”</div>
          <div className="prompt-preview">“이 일본어 문장을 자연스러운 한국어로 번역해 줘.”</div>
          <p className="fine-print">
            모의 AI는 정해진 체험 안내만 응답합니다. 번역·분석 결과를 받으려면 실제 AI를 연결하세요.
          </p>
          <div className="disabled-example">
            폴더 파일 정리 <span className="badge">준비 중</span>
          </div>
        </GuidedStep>
      )}
      {step === 5 && (
        <GuidedStep step={5} title="준비가 끝났어요">
          <div className="ready-icon">
            <Check size={30} />
          </div>
          <div className="summary-list">
            <p>
              <span>선택한 AI</span>
              <strong>{registry[data.settings.provider].name}</strong>
            </p>
            <p>
              <span>도구 접근</span>
              <strong>모두 꺼짐</strong>
            </p>
            <p>
              <span>대화 저장</span>
              <strong>이 컴퓨터 · SQLite</strong>
            </p>
          </div>
          <p className="muted">모든 설정은 왼쪽 아래 ‘설정’에서 언제든 바꿀 수 있어요.</p>
        </GuidedStep>
      )}
      {error && <ErrorRecoveryPanel message={error} />}
      <footer className="wizard-footer">
        {step > 1 ? (
          <button className="text-button" onClick={() => setStep(step - 1)}>
            이전
          </button>
        ) : (
          <span>약 2분이면 충분해요</span>
        )}
        <button
          className="primary"
          disabled={busy || (step === 2 && !tested)}
          onClick={() => (step === 5 ? finish() : setStep(step + 1))}
        >
          {step === 1 ? '설정 시작' : step === 5 ? 'AURA 시작하기' : '다음'}
          <ArrowRight size={16} />
        </button>
      </footer>
    </Modal>
  );
}
