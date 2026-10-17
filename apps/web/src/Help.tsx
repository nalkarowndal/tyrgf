import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ArrowRight } from 'lucide-react';
import type { Bootstrap } from '../../../packages/shared/src/contracts';
import { registry } from '../../../packages/shared/src/contracts';
import { featureGuides, help } from './help-content';
export function HelpPage({ data }: { data: Bootstrap }) {
  const [search, setSearch] = useState('');
  const guides = featureGuides.filter((g) =>
    [g.title, g.description, g.recovery, ...g.steps].join(' ').includes(search.trim()),
  );
  return (
    <div className="settings-page guide-page">
      <header className="page-header">
        <h1>시작 안내와 도움말</h1>
      </header>
      <div className="settings-content">
        <section className="settings-card">
          <span className="eyebrow">처음이라면 여기서 시작하세요</span>
          <h2>연결하고, 물어보고, 필요한 권한만 허용해요</h2>
          <p>
            아래 안내에서 다음 행동을 선택하세요. 실제 동작의 성공 여부는 각 화면의 결과로
            확인합니다.
          </p>
          <p className="guide-current">
            현재 선택: <strong>{registry[data.settings.provider].name}</strong> ·{' '}
            {data.settings.provider === 'mock'
              ? '모의 체험입니다. 실제 AI 응답이 아닙니다.'
              : '설정이 저장되어 있습니다. 연결 테스트에서 실제 응답을 확인하세요.'}
          </p>
          <div className="guide-start-links">
            <Link to="/settings">
              1. AI 연결 설정 <ArrowRight size={16} />
            </Link>
            <Link to="/">
              2. 첫 대화 시작 <ArrowRight size={16} />
            </Link>
            <Link to="/files">
              3. 필요할 때 파일 허용 <ArrowRight size={16} />
            </Link>
          </div>
        </section>
        <label className="field guide-search">
          <span>
            <Search size={16} /> 도움말 검색
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="예: 오류, 기억, 파일"
          />
        </label>
        <p role="status" className="fine-print">
          도움말 {guides.length}개
        </p>
        {!guides.length && (
          <section className="settings-card">
            <p>일치하는 안내가 없습니다. 짧은 기능 이름으로 검색하세요.</p>
            <button className="secondary" onClick={() => setSearch('')}>
              전체 도움말 보기
            </button>
          </section>
        )}
        <div className="guide-grid">
          {guides.map((g) => (
            <section className="settings-card guide-card" key={g.id}>
              <h2>{g.title}</h2>
              <p>{g.description}</p>
              <ol>
                {g.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <Link className="secondary" to={g.path}>
                {g.action}
                <ArrowRight size={16} />
              </Link>
              <details>
                <summary>필요한 권한·결과·오류 해결</summary>
                <h3>필요한 권한</h3>
                <p>{g.permission}</p>
                <h3>예상 결과</h3>
                <p>{g.result}</p>
                <h3>잘되지 않을 때</h3>
                <p>{g.recovery}</p>
              </details>
            </section>
          ))}
        </div>
        <section className="settings-card">
          <h2>알아두면 좋아요</h2>
          {Object.values(help).map((h) => (
            <details key={h.title}>
              <summary>{h.title}</summary>
              <p>{h.detail}</p>
            </details>
          ))}
          <details>
            <summary>키보드로 사용하기</summary>
            <p>
              Tab·Shift+Tab으로 이동하고 Enter로 선택하세요. 대화 입력에서는 Shift+Enter로 줄을
              바꿉니다. 닫기 버튼이 있는 창과 모바일 메뉴는 Esc로 닫을 수 있습니다. 첫 Tab의
              본문으로 건너뛰기로 메뉴를 건너뛸 수 있습니다.
            </p>
          </details>
        </section>
      </div>
    </div>
  );
}
