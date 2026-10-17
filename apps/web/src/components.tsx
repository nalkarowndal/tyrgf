import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { CircleHelp, AlertCircle, ShieldCheck, ChevronDown, Sparkles, X } from 'lucide-react';
import { help } from './help-content';
export { help } from './help-content';
export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={`logo-mark ${small ? 'small' : ''}`} aria-hidden="true">
      <Sparkles size={small ? 18 : 25} />
    </span>
  );
}
export function HelpTooltip({ text }: { text: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="help-tip">
      <button
        type="button"
        className="icon-button"
        aria-label="도움말 보기"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen(!open)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <CircleHelp size={15} />
      </button>
      {open && (
        <span id={id} role="tooltip">
          {text}
        </span>
      )}
    </span>
  );
}
export function FeatureExplanation({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="feature-explanation">
      <strong>{title}</strong>
      <div className="explanation-body">{children}</div>
    </div>
  );
}
export function PermissionExplanation() {
  return (
    <div className="permission-box">
      <ShieldCheck size={22} />
      <div>
        <strong>처음에는 모든 도구 권한이 꺼져 있어요</strong>
        <p>{help.tools.detail}</p>
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
      <div className="explanation-body">{children}</div>
    </div>
  );
}
export function ErrorRecoveryPanel({
  message,
  onDismiss,
  action,
}: {
  message: string;
  action?: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div role="alert" className="error-panel">
      <AlertCircle size={19} />
      <div>
        <strong>잠시 확인이 필요해요</strong>
        <p>{message}</p>
        {action && <div className="recovery-actions">{action}</div>}
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
      <div className="explanation-body">{children}</div>
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
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (opener?.isConnected && !opener.closest('[inert]')) opener.focus();
      else document.getElementById('main')?.focus();
    };
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
