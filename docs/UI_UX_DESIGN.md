# UI/UX 설계

기본 한국어·초보자 모드. 보라색 핵심 동작, 중립색 표면, 연두색 연결/권한 상태. 주요 영역은 사이드바, 중앙 대화, 접이식 작업 안내 패널. 실제 준비되지 않은 자동화는 실행 버튼을 비활성화하고 준비 중 문구를 표시한다.

apps/web/src/components.tsx의 공통 컴포넌트: HelpTooltip, FeatureExplanation, PermissionExplanation, GuidedStep, ActionPreview, ErrorRecoveryPanel, EmptyStateGuide, TechnicalDetailsDisclosure. FirstRunTour는 Onboarding.tsx에 있다. help-content.ts에서 개인정보·무료·권한·기억 설명과 기능별 행동·권한·결과·오류 안내를 중앙 관리한다.

버튼은 실제 동작이나 안내 화면으로 연결한다. 채팅창은 Enter 전송, Shift+Enter 줄바꿈, IME 조합 중 전송 금지. 삭제에는 결과 안내와 명시적 삭제 버튼이 있다. 질문 편집은 후속 분기가 바뀐다는 안내를 표시한다. 모의 응답은 공급자명·상단 안내·실제 응답 본문 모두에 표시한다.

접근성: 한국어 lang, semantic label/button/nav/main, skip link, focus-visible, native dialog의 focus trap/Escape 제어, reduced motion, system theme 반영. Markdown에서 raw HTML·외부 이미지 실행을 금지한다.

화면 폭 768 이하에서 사이드바는 별도 열림 메뉴로 바뀐다. 480 이하에서 추천 카드는 세로로, 설정 필드는 한 열로 배치한다. 긴 파일명·모델명·한국어 문장은 overflow-wrap을 적용한다. docs/qa 스크린샷과 TEST_QA_PLAN.md의 실제 검수 결과를 참조한다. 초보자 대상 실제 사용자 실험은 아직 수행하지 않았다.

Tailwind Vite 플러그인과 Lucide를 사용하며, 현재 필요한 소형 컴포넌트는 native HTML로 구현했다. shadcn/ui 패키지를 사용했다고 주장하지 않는다.


## M7 동작
처음 사용 가이드(/help)는 검색과 실제 화면 링크를 제공한다. 초보자 메뉴는 작업·파일·기억을 우선 표시하고 추가 기능은 펼친다. 고급 모드와 사용자 메뉴 숨김은 기존 설정에 저장한다. MCP 내장 도구는 파일 경로/검색어로 입력하며 외부 도구 JSON은 고급 연결 흐름에 남긴다.

모바일 닫힌 사이드바는 키보드·접근성 트리에서 제외하고 열린 메뉴는 배경을 inert로 만든다. Tab/Shift+Tab 순환, Esc 닫기, 호출 버튼 포커스 복원, 경로 전환 시 본문 포커스를 지원한다. 기본 HTML dialog에 명시적 호출 요소 복원을 보완했다. 구조화된 기능 설명은 div를 사용해 중첩 p를 만들지 않는다.

설정 다시 보기는 권한을 초기화하지 않는다. 연결 설정을 실제 저장한 경우에만 기존 연결 폼을 최신 저장값으로 재생성한다. 읽기 조회 오류는 명시적 재조회, 연결 오류는 입력 보존·포커스 이동·공급자 도움말을 제공한다. 상세 검수와 실제 사용자 실험 한계는 M7_UX_REVIEW.md 참조.
