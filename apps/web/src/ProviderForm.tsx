import { useRef, useState } from 'react';
import { CheckCircle2, ExternalLink, KeyRound, RefreshCw } from 'lucide-react';
import { registry, type ProviderId, type Settings } from '../../../packages/shared/src/contracts';
import { api } from './api';
import { ErrorRecoveryPanel, TechnicalDetailsDisclosure, help } from './components';
export function ProviderForm({
  initial,
  keyStatus,
  onSaved,
  onTested,
}: {
  initial: Settings;
  keyStatus: Record<string, boolean>;
  onSaved: () => Promise<unknown>;
  onTested?: (ok: boolean) => void;
}) {
  const [s, setS] = useState(initial),
    [key, setKey] = useState(''),
    [models, setModels] = useState<string[]>(registry[initial.provider].models),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const formRef = useRef<HTMLDivElement>(null);
  const info = registry[s.provider];
  function change(patch: Partial<Settings>) {
    setS((prev) => ({ ...prev, ...patch }));
    setNotice('');
    onTested?.(false);
  }
  function choose(provider: ProviderId) {
    change({
      provider,
      model: registry[provider].models[0] ?? 'llama3.2',
      externalConsent: false,
      freeConfirmed: false,
    });
    setModels(registry[provider].models);
    setKey('');
    setError('');
  }
  async function save() {
    const { provider, model, externalConsent, freeConfirmed, ollamaUrl } = s;
    await api('/settings', { provider, model, externalConsent, freeConfirmed, ollamaUrl });
    if (key.trim()) {
      await api('/keys', { provider: s.provider, key });
      setKey('');
    }
    await onSaved();
  }
  async function action(kind: 'save' | 'test' | 'models') {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await save();
      if (kind === 'save') setNotice('AI 연결 설정을 저장했습니다.');
      if (kind === 'models') {
        const result = await api<{ models: string[] }>('/providers/models', {});
        setModels(result.models);
        if (result.models.length && !result.models.includes(s.model))
          change({ model: result.models[0] });
        setNotice(
          result.models.length
            ? '사용 가능한 모델 목록을 확인했습니다. 선택을 바꿨다면 다시 저장해 주세요.'
            : '사용 가능한 모델이 없습니다. 공급자 권한 또는 Ollama 설치 모델을 확인해 주세요.',
        );
      }
      if (kind === 'test') {
        const result = await api<{ message: string }>('/providers/test', {});
        setNotice(result.message);
        onTested?.(true);
        await onSaved();
      }
    } catch (e) {
      setError((e as Error).message);
      onTested?.(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div ref={formRef} className="provider-form" aria-busy={busy}>
      <p className="fine-print">① AI 선택 → ② 모델·연결 정보 입력 → ③ 연결 테스트 결과 확인</p>
      <div className="provider-grid">
        {(Object.keys(registry) as ProviderId[]).map((id) => (
          <button
            key={id}
            type="button"
            disabled={busy}
            className={`provider-option ${s.provider === id ? 'selected' : ''}`}
            onClick={() => choose(id)}
            aria-pressed={s.provider === id}
          >
            <span className={`provider-dot ${id}`}>
              {id === 'mock' ? 'A' : id === 'gemini' ? '✦' : id === 'groq' ? 'g' : 'O'}
            </span>
            <span>
              {registry[id].name}
              <small>
                {id === 'mock' ? '키 없이 체험' : id === 'ollama' ? '로컬 실행' : '무료 등급 제공'}
              </small>
            </span>
            {s.provider === id && <CheckCircle2 size={17} />}
          </button>
        ))}
      </div>
      <p className="muted">{info.description}</p>
      <label className="field">
        사용할 모델
        {s.provider === 'ollama' && models.length === 0 ? (
          <input
            value={s.model}
            onChange={(e) => change({ model: e.target.value })}
            placeholder="설치한 모델 이름"
          />
        ) : (
          <select value={s.model} onChange={(e) => change({ model: e.target.value })}>
            {models.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        )}
      </label>
      {info.cloud && (
        <>
          <label className="field">
            API 키{' '}
            <span className="field-note">
              {keyStatus[s.provider]
                ? '이 실행 세션에 키가 등록되어 있습니다.'
                : '서비스에서 발급받은 연결용 비밀번호입니다.'}
            </span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                onTested?.(false);
              }}
              placeholder="API 키를 붙여넣으세요"
            />
          </label>
          <div className="inline-links">
            <a href={info.keyUrl} target="_blank" rel="noreferrer">
              <KeyRound size={14} /> API 키 발급하기 <ExternalLink size={12} />
            </a>
            <a href={info.docs} target="_blank" rel="noreferrer">
              요금·한도 확인 <ExternalLink size={12} />
            </a>
          </div>
          <p className="fine-print">
            키는 서버 메모리에만 보관합니다. 앱 서버를 종료하면 다시 입력해야 합니다.
          </p>
          <label className="check-field">
            <input
              type="checkbox"
              checked={s.externalConsent}
              onChange={(e) => change({ externalConsent: e.target.checked })}
            />
            <span>대화와 첨부 텍스트를 {info.name}에 전송하는 데 동의합니다.</span>
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={s.freeConfirmed}
              onChange={(e) => change({ freeConfirmed: e.target.checked })}
            />
            <span>
              공급자 콘솔에서 무료 계정임을 확인했습니다. 유료 계정의 과금은 앱이 차단할 수 없음을
              이해합니다.
            </span>
          </label>
        </>
      )}
      {s.provider === 'ollama' && (
        <p className="fine-print">
          Ollama를 먼저 설치하고 로컬 모델을 내려받으세요. 주소는 내 컴퓨터의 11434 포트로
          제한됩니다. 클라우드 모델은 차단합니다.{' '}
          <a href={info.docs} target="_blank" rel="noreferrer">
            설치 안내
          </a>
        </p>
      )}
      <TechnicalDetailsDisclosure title="무료 사용과 개인정보 안내">
        {help.free.detail}
        <p>{help.privacy.detail}</p>
      </TechnicalDetailsDisclosure>
      {error && (
        <ErrorRecoveryPanel
          message={error}
          action={
            <>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  formRef.current
                    ?.querySelector<HTMLElement>(
                      info.cloud ? 'input[type=password]' : 'select, input',
                    )
                    ?.focus()
                }
              >
                연결 정보 다시 확인
              </button>
              <a href={info.docs} target="_blank" rel="noreferrer">
                공급자 도움말
              </a>
            </>
          }
        />
      )}
      {notice && (
        <div role="status" className="success-panel">
          <CheckCircle2 size={17} />
          {notice}
        </div>
      )}
      <div className="button-row">
        <button className="primary" disabled={busy} onClick={() => action('test')}>
          {busy ? <RefreshCw size={15} className="spin" /> : <CheckCircle2 size={16} />}연결 테스트
        </button>
        <button className="secondary" disabled={busy} onClick={() => action('save')}>
          연결 설정 저장
        </button>
        {s.provider !== 'mock' && (
          <button className="text-button" disabled={busy} onClick={() => action('models')}>
            모델 목록 확인
          </button>
        )}
      </div>
      <p className="fine-print">
        연결 테스트는 선택한 모델에 짧은 인사를 전송하며 사용량에 포함됩니다.
      </p>
    </div>
  );
}
