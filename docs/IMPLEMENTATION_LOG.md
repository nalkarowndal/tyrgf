# 구현 기록

2026-10-15 — 빈 work 브랜치에서 신규 작업 시작. 기존 코드 없음.
M0: GitHub connector로 실제 source/license/manifest, Exa로 공식 모델/가격/아키텍처, Context7로 LangGraph 승인/재개 검토. 증거는 research/evidence.json.
설계 결정: Node 24 내장 SQLite, 현재 work 브랜치 사용. 사용자 지시의 지속 구현을 우선해 반복 설계 승인 단계 생략. 프로덕션 키는 영속 저장 대신 프로세스 메모리(재시작 시 재입력); Windows OS vault는 M9.
선행 검토: shared settings는 UI/API/provider가 동일한 Zod 타입 사용. 대화 ID는 SQLite UUID 문자열. 같은 출처 토큰은 bootstrap→mutation 경로에 공통 사용.
첫 테스트 시도: 의존성 설치가 끝나지 않아 vitest 미존재. 이 실행은 기능 테스트 결과로 집계하지 않음. 환경 네트워크 접근을 허용한 설치 재시도 진행.

## M0–M2 구현 결과
- 앱/서버/공유 계약/테스트/CI/14개 필수 설계·사용자 문서 작성.
- 최초 RED: 빈 API와 공급자 stub에서 17개 기능 기대가 실패함을 확인. localhost socket sandbox 차단 실행은 기능 실패와 구분하고 네트워크 허용 실행에서 다시 확인.
- GREEN: SQLite CRUD, 메모리 키 보관, 공급자 어댑터, NDJSON 스트리밍, 중단, 설정/온보딩/채팅 UI 연결.
- 브라우저 최초 RED: 환영 화면 없음. 구현 후 실제 배포 빌드 E2E로 전환. 개발 Vite 도중 의존성 발견의 Outdated Optimize Dep 문제를 제품 기능 실패와 구분.
- 시각 QA에서 설정 partial 적용이 누락 필드 기본값을 덮어쓰는 문제 발견. 재현 테스트 RED→명시적 키만 merge→GREEN.
- 독립 코드 리뷰: mixed-case API CSRF 우회, 대화 이동 상태 누수, 공급자 폼의 stale 전체 설정 저장 3건. 전부 수정하고 회귀 검증.
- 설정 저장은 provider 필드와 일반 필드를 분리. 대화 컴포넌트는 session ID별 격리하고 unmount 시 요청 취소. 새 대화는 최초 답변 후 URL 이동.
- npm run check 통과: TypeScript, ESLint, 32 Vitest tests, production build.
- Playwright E2E 3개 시나리오 통과; 한국어 화면/오류/첨부/검색/삭제/테마/라우트 전환 확인.
- npm audit --omit=dev: 알려진 운영 의존성 취약점 0건.

## 결정과 비용
- 안전한 키 영속 저장을 가장하지 않고 메모리 보관을 선택했다. 재시작마다 키를 다시 입력해야 한다. OS vault는 M9.
- Node 내장 SQLite를 선택해 네이티브 모듈 설치를 줄였다. Node 24 이상이 필요하며 개발 환경 없는 Windows 설치 패키지를 제공한 것은 아니다.
- LangGraph/MCP/위험 도구는 M3 이후 설계로 남겼다. 현재는 자율 자동화 기능이 없다.
- 컨텍스트는 최근 원문을 예산 내에서 유지하고 제외 사실을 알린다. 요약은 아직 없으므로 긴 대화의 오래된 정보가 빠질 수 있다.
- 기본 work 브랜치에서 개발했고 외부 push/배포/메시지 전송은 하지 않았다.

## 남은 문제와 다음 단계
실제 무료 계정 키 및 로컬 Ollama 환경에서 연결 테스트와 사용자 시나리오를 검증한다. 이후 M3 경로 제한/승인/격리 도구 → M4 영속 에이전트 → M5 기억/스킬 → M6 MCP → M7–M9 순으로 진행한다. API 키·MCP 설치·파일 수정·외부 전송 승인은 제품 UI에서 명시적으로 받는다. 현재 환경에는 실 키와 Windows가 없으며 그 검증을 통과했다고 기록하지 않는다.
후속 경미 항목: 프론트엔드 코드 분할(현재 단일 번들 크기 권고 초과), 외부 패키지 Zod PURE annotation 경고. 기능/보안 실패는 아님.

최종 개발 서버 smoke: npm run dev에서 Chromium 초기 환영 화면 렌더링, pageerror 0건. 환경의 외부 네트워크 허용 목록은 패키지 저장소 중심이므로 이 클라우드에서 실 AI 검증 시 API 도메인 네트워크 설정도 확인해야 한다.
