# AURA 구현 계획 및 완료 기준

> Agentic workers: executing-plans로 현재 세션에서 단계별 구현. 명세: PRODUCT_REQUIREMENTS.md 및 SYSTEM_ARCHITECTURE.md.

Goal: 비전문가용 한국어 로컬 AI 대화 앱을 실제 실행하고 검증한다.
Architecture: React/Express/SQLite, 서버 전용 공급자 어댑터, 외부 연결 기본 차단.
Tech stack: Node 24, TypeScript, React, Vite, Tailwind, Express, Zod, SQLite, Vitest, Playwright.

## 공통 제약
127.0.0.1 기본 바인딩. 비밀정보 반환 금지. 모의 테스트를 실제 API 검증으로 보고하지 않음. 미구현 기능은 준비 중.

## 검토 집중 항목
- 악성 웹 출처가 로컬 서버에 설정 쓰기/대화 읽기를 시도할 때 차단.
- 응답 도중 중단/재시작 시 부분 응답과 상태 보존.
- UTF-8 및 SSE 이벤트가 여러 네트워크 청크로 나뉘어도 한글·텍스트 유실 없음.
- 429·잘못된 키·오프라인에 안전한 한국어 복구 안내, 무한 재시도 없음.
- 대화 수정/삭제/재생성과 동시 요청이 이력을 손상시키지 않음.

## 작업 1: M0 조사와 계약
- [x] 기존 코드 없음 확인, 8개 참고 프로젝트 실제 파일·라이선스·manifest 검토.
- [x] 공식 API 및 Context7 LangGraph 문서 조사.
- [x] 공유 Zod 설정과 공급자 레지스트리 작성.
- [x] 연구 근거 및 14개 문서 작성.

## 작업 2: 저장소와 보안 API (M2 기반)
Files: apps/server/src/store.ts, app.ts, tests/api.test.ts.
Interfaces: createApp({dataDir, port}) -> {app, store, close}; Store는 sessions/messages/settings를 반환.
- [x] 모의 대화 영속성, 외부 출처/Host 차단, 설정 검증 테스트를 먼저 실행하여 실패 확인.
- [x] SQLite CRUD 및 메모리 키 보관 구현.
- [x] npm test 통과.

## 작업 3: 공급자와 스트림
Files: apps/server/src/providers.ts, tests/providers.test.ts.
Interfaces: streamReply(config, messages, signal, fetcher?) -> AsyncGenerator<ProviderEvent>; listModels 및 testConnection.
- [x] 분할 UTF-8/SSE/NDJSON, 429, 취소, 무료 정책 테스트 실패 확인.
- [x] Gemini/Groq/Ollama/mock 구현. 발견된 모델과 승인 레지스트리 교집합만 선택 허용.
- [x] npm test, npm run typecheck 통과.

## 작업 4: M1 UI와 M2 연결
Files: apps/web/src/{App,Chat,Settings,Onboarding,components}.tsx, styles.css, api.ts.
- [x] Playwright로 설정→모의 연결→전송→새로고침→검색/이름변경→설정·테마 시나리오 정의.
- [x] 한국어 UI, 5단계 마법사, 재사용 설명, 반응형, 다크 모드, 에러 복구 구현.
- [x] 채팅 스트리밍·중단·재생성·편집·텍스트 첨부·모델 전환 연결.
- [x] 브라우저 E2E 및 데스크톱/태블릿/모바일 스크린샷 검사.

## M3–M9 후속 게이트
| 단계 | 구현 대상 | 완료 조건 |
|---|---|---|
| M3 | Tool Registry, 경로 제한, 브라우저, 승인 미리보기 | 허가 없는 실행 차단 및 승인 결과 테스트 |
| M4 | LangGraph, 영속 체크포인트, 중단/재개 | 2개 이상 도구 복합 작업과 부작용 중복 방지 |
| M5 | 기억·요약·스킬 검토 | 삭제한 기억 재사용 방지, 요약 실패 복구 |
| M6 | GitHub MCP, Serena, Repomix, 선택 REA | 승인한 서버 실제 호출, 권한/오류 검증 |
| M7 | UX 고도화 | 실제 초보자 사용성 검수 |
| M8 | 통합 QA | 주요 흐름·회귀·보안·시각 테스트 통과 |
| M9 | Windows 설치 패키지·백업/복원 | 개발환경 없는 Windows에서 설치 및 실행 검증 |

진행 결과는 IMPLEMENTATION_LOG.md에 기록한다. 실 API 키·로컬 Ollama가 없는 검증은 미검증으로 남긴다. 사용자의 다음 단계 지시에 따라 M3와 M4를 실 모델 키 없이 개발·검증했다. 제품 도구 권한은 기본 꺼짐이며 모델 키와 독립적인 수동 승인을 거친다.

## 현재 단계 판정
M0 조사·설계 및 M1 UI 구현 완료. M2는 모의 공급자 기반 완료 조건과 프로토콜 계약 검증을 통과했다. 실 공급자 운영 연결은 미검증이다. M3는 Linux 파일 및 공개 웹 읽기 범위의 도구·권한·승인·기록을 구현했다. 세부 범위는 M3_PLAN.md 참조. Windows 파일 접근, 동적 웹 조작, 폴더 일괄 정리는 남아 있다. M4는 영속 작업·승인·재개·파일 결과 검증과 모의 공급자의 실제 복합 도구 실행을 구현했다. 실제 모델 계획 품질은 미검증이다. M5 기억·명시적 요약·버전 승인 스킬 재사용을 구현했다. M6 MCP 수동 연결·권한·승인 호출은 구현했으며 내장 실제 stdio 서버와 로컬 프로토콜 fixture로 검증한다. GitHub/Serena/Repomix 설치·인증을 통한 실제 외부 연결은 미검증이며 REA는 안내만 제공한다. M7 시작 안내·입력·오류 복구·모바일 키보드 접근성을 개선했다. 자동 검증과 실제 초보자 실험은 구분하며 실제 사용자 검수는 남아 있다(M7_UX_REVIEW.md). M8은 테스트별 실제 앱/DB 격리, 재시작·브라우저 보안·채팅 실패 복구 검증을 추가했다. Linux에서 검증하며 실 공급자/사용자/Windows 검증을 대체하지 않는다(M8_QA_REPORT.md). M9 설치 패키지는 후속 단계다. 상세 결과는 TEST_QA_PLAN.md 및 IMPLEMENTATION_LOG.md 참조.
