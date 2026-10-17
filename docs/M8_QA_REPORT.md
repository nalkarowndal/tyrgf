# M8 통합 QA — 2026-10-17

## 범위와 판정

Linux / Node 24.19.0 / Chromium에서 로컬 앱의 주요 사용자 흐름, 보안 경계, 실제 프로세스 재시작과 회귀를 검증한다. 주요 구현 범위의 최종 전체 검사를 통과했다. 이 검증은 Windows 설치 준비 완료나 실제 클라우드 AI 품질 인증을 의미하지 않는다.

## 발견하고 수정한 문제

| 재현 | 원인 | 수정·회귀 증거 |
|---|---|---|
| 기억 E2E만 실행하면 30초 후 실패 | 앞선 테스트의 온보딩 상태와 대화를 사용 | 테스트마다 실제 앱 프로세스·임시 SQLite·동적 포트 생성. 기억 테스트가 자신의 원문 생성. 단독 실행 통과 |
| 채팅 연결 오류/비 JSON 오류에서 영문 내부 메시지 노출 | 일반 API와 별개인 reply 경로의 예외 처리 누락 | 한국어 복구 안내, 자동 재전송 없음. 서버 오류·사용자 취소는 보존 |
| UTF-8 분할 응답의 마지막 done 줄에 개행이 없으면 불완전 응답으로 판단 | 남은 NDJSON 버퍼 미처리 | EOF의 남은 줄 처리, 바이트별 한글 청크 회귀 |
| 잘못된 스트림 이벤트가 통과 | JSON 결과를 타입으로 단언 | 이벤트 종류·필드 문자열 검증. 독립 리뷰의 배열 type 사례도 RED→GREEN |
| 첫 전송 실패 후 질문과 오류가 사라져 재시도 불가 | finally의 자동 경로 이동으로 Chat이 다시 생성됨 | 실패 시 화면 유지, 생성한 대화 ID 재사용. 실제 320px 브라우저에서 입력 유지→명시적 재전송→대화 1개 확인. 사용자가 새 대화를 누르면 초안을 버리고 별개 대화로 시작하는 회귀도 포함 |

처음 reply 검사 9개 중 7개가 해당 결함으로 실패했다. 독립 리뷰의 잘못된 type 사례는 별도 1개 실패를 확인했다. 기존 정상 공급자 오류·의도적 취소 경로도 함께 검사한다. 외부 공급자를 대신하는 fetch fixture는 네트워크 실패와 프로토콜만 검증한다.

## 새 통합 검증

- **실제 재시작:** 별도 앱 프로세스를 SIGTERM으로 종료하고 같은 DB로 시작. 대화·승인한 기억 보존, 토큰 변경, 이전 토큰 403, 메모리 API 키 제거, 파일·웹 권한 해제, 파일/MCP 대기 승인 409, 미승인 파일 무생성, MCP 연결/허용 도구 초기화. SQLite/WAL 및 내보내기에 테스트용 키 문자열 없음. 내장 MCP 실제 stdio 사용.
- **브라우저 CSP:** 배포 빌드 응답의 CSP뿐 아니라 `securitypolicyviolation` 이벤트로 인라인 스크립트와 외부 fetch 차단 확인. 주입 표식이 DOM에 생기지 않음.
- **저장된 Markdown:** 실제 채팅·저장·새로고침 후 HTML 이벤트 핸들러, javascript 링크, 원격 이미지가 실행 요소로 생성되지 않음. 페이지 오류 없음.
- **작은 화면 복구:** 320×640에서 연결 오류 안내·초안·전송 버튼 접근과 가로 넘침 검사. `qa/mobile-chat-recovery-320.png` 직접 검수. 상단 환영 영역은 스크롤되며 복구 안내와 입력창을 유지한다.
- 기존 온보딩·대화·설정·파일 승인/복구·작업/스킬·기억/요약·MCP·도움말·키보드 E2E를 새 격리 fixture에서 다시 실행해 통과했다.

## 재실행 방법

```sh
npm run check
npm run test:e2e
npm audit --omit=dev --audit-level=high
# 앞선 테스트 없이도 실행 가능
npm run test:e2e -- tests/e2e/knowledge.spec.ts
```

Playwright 명령은 순차 실행한다(동시 실행은 공용 dist/report 경로를 덮어쓴다). Playwright는 배포 빌드를 한 번 만들고 각 테스트에 별도 서버·데이터를 제공한다. 앱 기본 `.data`는 사용하지 않는다. 종료 시 서버를 정리하고 임시 DB를 삭제한다. 재시작 테스트만 같은 DB를 의도적으로 재사용한다. 외부 MCP 프로그램을 설치하거나 실제 API 키를 주입하지 않는다.

`playwright-report/index.html`과 `test-results/results.json`에 결과, 실패 시 trace와 서버 로그를 남긴다. CI에는 운영 의존성 high 이상 audit 차단과 보고서 업로드를 추가했다. 원격 GitHub CI는 아직 실행하지 않았다.

## 최종 실행 기록

- `npm run check`: 타입·ESLint·Vitest 17개 파일 110개·배포 빌드 통과.
- `npm run test:e2e`: 최종 순차 실행 15/15 통과(약 1.3분), 건너뜀/재시도 없음. HTML 보고서와 JSON 결과 생성 확인.
- 기억 E2E 단독 실행 통과. 320px 채팅 복구, 데스크톱 안내/기억, 모바일 다크 안내/MCP 캡처를 직접 열어 검수했다.
- 운영 의존성 audit: 알려진 취약점 0건.
- 독립 코드 리뷰: Critical/Important 없음, Minor 이벤트 type 검증 1건 수정. 이후 브라우저가 발견한 첫 전송 실패 문제도 별도 재현·수정·재검증.
- 빌드 경고: 약 655KB JS(압축 약 200KB), 500KB 권고 초과 및 Zod PURE 주석 경고. 성능 최적화 후속 항목이며 빌드 실패는 아니다.

## 남은 검증과 M9 진입 조건

실 Groq/Gemini 인증·계정 무료 한도·답변 품질, 실제 Ollama 추론, 외부 GitHub/Serena/Repomix 설치·인증, 공개 웹 라이브 성공, Windows/macOS·다중 브라우저·스크린리더·실제 초보자 실험은 미검증이다. 실제 사용자가 제공한 키를 테스트나 파일에 넣지 않았다. 테스트의 synthetic key는 인증용이 아니다.

M9는 Windows 설치/실행, 파일 경계의 OS 지원, 백업·복원, 시작·업데이트 정책과 credential 보관을 다룬다. Linux 통합 QA 결과로 Windows 안전성을 추정하지 않는다. 강제 전원 차단/프로세스 트리 전체 격리도 이번 정상 종료·재시작 시험 범위에 포함하지 않는다.

## 근거

- Context7: [Playwright API 테스트](https://playwright.dev/docs/api-testing), [서버 상태를 변경하는 테스트의 격리](https://playwright.dev/docs/auth#moderate-one-account-per-parallel-worker). AURA는 계정 대신 앱 프로세스와 DB를 테스트별로 분리했다.
- GitHub: [react-markdown Security](https://github.com/remarkjs/react-markdown#security). 기본 URL 변환을 유지하고 사용자 정의 렌더러의 실제 DOM을 검사했다.
- Exa: [OWASP CSP Testing](https://wstg.owasp.org/latest/4-Web_Application_Security_Testing/02-Configuration_and_Deployment_Management/12-Content_Security_Policy/), [CSP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html). 헤더 존재 외 실제 브라우저 강제를 확인했다. 모든 우회 가능성을 입증하는 침투 테스트는 아니다.
