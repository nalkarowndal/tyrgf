import { useEffect, useRef, type ReactNode } from 'react';
import { CircleHelp, AlertCircle, ShieldCheck, ChevronDown, Sparkles, X } from 'lucide-react';
export const help = {
  privacy: {
    title: '내 데이터는 어디에 저장되나요?',
    short: '대화는 이 컴퓨터에 저장됩니다.',
    detail:
      'Gemini나 Groq를 선택하면 대화 내용이 해당 서비스로 전송됩니다. API 키는 서버 메모리에만 보관하며 서버를 종료하면 지워집니다. 다른 사람과 공유하는 컴퓨터에서는 OS 계정을 분리해 주세요.',
  },
  free: {
    title: '무료 우선 모드',
    short: '다른 유료 모델로 자동 전환하지 않습니다.',
    detail:
      '무료 사용 가능 모델만 제공하지만 계정의 실제 요금제는 공급자 콘솔에서 확인해야 합니다. 유료 계정의 과금을 앱에서 차단할 수는 없습니다. 정확한 남은 한도는 공급자에서 확인하세요.',
  },
  tools: {
    title: '실행 권한',
    short: '허용한 폴더와 승인한 웹주소에서만 도구를 실행해요.',
    detail:
      '파일 작업과 공개 웹페이지 읽기는 각 도구 메뉴에서 권한을 켜고 사용할 수 있습니다. 파일 변경과 외부 연결은 매번 미리보기를 승인해야 합니다. 명령 실행과 외부 MCP 연결은 준비 중입니다.',
  },
  memory: {
    title: '장기 기억',
    short: '다음 대화에서도 참고할 중요한 정보를 저장합니다.',
    detail: '기억 관리 기능은 준비 중입니다. 현재는 같은 대화의 최근 메시지만 참고합니다.',
  },
};
export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={`logo-mark ${small ? 'small' : ''}`} aria-hidden="true">
      <Sparkles size={small ? 18 : 25} />
    </span>
  );
}
export function HelpTooltip({ text }: { text: string }) {
  return (
    <span className="help-tip">
      <button type="button" className="icon-button" aria-label={text}>
        <CircleHelp size={15} />
      </button>
      <span role="tooltip">{text}</span>
    </span>
  );
}
export function FeatureExplanation({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="feature-explanation">
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}
export function PermissionExplanation() {
  return (
    <div className="permission-box">
      <ShieldCheck size={22} />
      <div>
        <strong>처음에는 모든 도구 권한이 꺼져 있어요</strong>
        <p>
          파일 작업·공개 웹 읽기는 도구 메뉴에서 허용할 수 있어요. 파일 변경과 웹 연결은 매번
          승인하며 앱을 종료하면 권한이 해제됩니다. 명령 실행·GitHub 접근은 준비 중입니다.
        </p>
      </div>
    </div>
  );
}
export function GuidedStep({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="guided-step">
      <span className="eyebrow">시작하기 · {step} / 5</span>
      <h2>{title}</h2>
      {children}
    </section>
  );
}
export function ActionPreview({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="action-preview">
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}
export function ErrorRecoveryPanel({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss?: () => void;
}) {
  return (
    <div role="alert" className="error-panel">
      <AlertCircle size={19} />
      <div>
        <strong>잠시 확인이 필요해요</strong>
        <p>{message}</p>
      </div>
      {onDismiss && (
        <button className="icon-button" aria-label="오류 닫기" onClick={onDismiss}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}
export function EmptyStateGuide({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="empty-guide">
      <Logo />
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  );
}
export function TechnicalDetailsDisclosure({
  children,
  title = '자세히 알아보기',
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <details className="disclosure">
      <summary>
        {title}
        <ChevronDown size={14} />
      </summary>
      <div>{children}</div>
    </details>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose?.();
      }}
    >
      <div className="modal-heading">
        <span>
          AURA <span className="muted">/ {title}</span>
        </span>
        {onClose && (
          <button onClick={onClose} className="icon-button" aria-label="닫기">
            <X size={20} />
          </button>
        )}
      </div>
      {children}
    </dialog>
  );
}
