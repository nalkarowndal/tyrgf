# M9 Windows validation implementation plan

> For agentic workers: use superpowers:executing-plans. Native implementation and one independent final review.

**Goal:** Windows에서 실행 가능한 배포 검수 도구와 CI 실행 게이트를 제공한다.
**Architecture:** 기존 번들을 임시 한글/공백 경로에 복사하여 실제 HTTP/CLI를 검사한다. 원본 데이터와 사용자 설정은 사용하지 않는다. JSON은 실제 실행한 OS와 검사 결과를 기록한다.
**Tech Stack:** Node 24 built-ins, existing NSIS/Windows workflow.
**Spec:** M9_RELEASE_REPORT.md의 Windows 검수 목록. 본 단계는 자동화 가능한 런타임/복원 항목이며 GUI 설치·자동 시작·코드 서명 검수는 별도다.

## Global Constraints
- 기존 work 브랜치와 깨끗한 작업 공간을 이어 사용한다. 기존 M9 후보를 갱신한다.
- 실제 키·클라우드 API·사용자 데이터 사용 없음. 사용자가 GitHub Actions Windows 러너 실행을 선택했다. 전용 codex/windows-validation 브랜치를 push하여 실행하되 main 변경·Release 게시·실서비스 배포는 하지 않는다.
- Node 24.19.0 Windows 런타임 고정 해시, 32MiB 백업 제한, 복원 승인 초기화 유지.
- Linux 통과를 Windows 통과로 보고하지 않는다.

## Review Focus
- 실패/시간 초과 시 소유한 테스트 프로세스만 종료하고 사용자 데이터는 보존한다.
- 변조된 패키지나 OS 불일치가 실행 전에 거절된다.
- 복원 종료 코드만 보지 않고 실제 저장된 대화/설정을 확인한다.
- Windows 환경 변수와 프로세스 종료 의미 차이로 테스트가 무한 대기하지 않는다.
- 실패 결과 파일이 성공으로 남거나 CI 검증 실패 뒤 후보를 업로드하지 않는다.

## Task 1 — Portable verification
Files: scripts/smoke-package.mjs, scripts/verify-package.mjs, tests/package-validation.test.ts.
Interface: node scripts/smoke-package.mjs [package-directory] [report-json]; exit 0 only when all checks pass; report contains platform/status/checks.
- [x] 변조 패키지와 OS 불일치의 실행 전 거절을 검사하고 RED 확인.
- [x] Windows/Linux 런타임 선택, bounded process/HTTP waits, manifest 선검사, 보고서 구현.
- [x] 실제 대화·재시작·중복 실행·한글 암호 백업/복원·잘못된 암호 보존·복원 데이터 확인. Linux 실제 번들 GREEN.

## Task 2 — Distribution and Windows gate
Files: scripts/windows/Verify.cmd, scripts/package.mjs, .github/workflows/windows-package.yml, docs/DEPLOYMENT_GUIDE.md.
- [x] 번들에 검수 스크립트와 실행 바로가기를 포함하고 설명한다.
- [x] Windows 후보 업로드 전에 번들 검수 실행, 실패/성공 결과 artifact 분리, ZIP은 검수 통과 뒤 생성.
- [x] npm run check, 번들 검수, 실제 Windows 패키지 생성/manifest/NSIS/ZIP 검증. GUI 설치 검수와 구분.

## Task 3 — Review and handoff
- [x] 한 번의 독립 최종 검토와 필요한 회귀 수정, 결과/근거 문서 및 로컬 커밋.
- [x] GitHub Actions Windows 러너에서 런타임·복원·무결성 선검사·결함 주입 검수 통과를 확인했다.


## Task 4 — Development dependency patch
- [x] 전체 audit에서 개발 의존성3건 확인, Vitest4.1.11로 갱신하여 audit0.
- [x] 타입·lint·118개 테스트·빌드 통과.
- [x] CI에서도 전체 audit0와 Windows/Linux 검수를 확인하고 최신 4932e2d 후보/증거 링크 기록.
