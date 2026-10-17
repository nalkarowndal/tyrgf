# Windows 런타임 검수 — 2026-10-18 KST

M9 설치 후보에 Windows/Linux 공통 검수 도구와 Windows PowerShell 무결성 선검사를 추가했다. 사용자 선택에 따라 전용 `codex/windows-validation` 브랜치에서 GitHub Actions Windows 러너 검수를 실행한다. 실제 실행 결과는 확인 후 이 문서에 기록한다.

## 로컬 근거
- 타입·ESLint·19파일118개 단위/통합 검사·빌드 통과.
- Linux 실제 배포 번들: 한글/공백 경로, 채팅, 재시작 보존, 중복 실행/실행 중 백업 거절, Linux 내장 MCP, 한글 암호 백업/복원, 정상 종료.
- 고의 복원 no-op 주입으로 검사 누락을 재현한 뒤 백업 이후 변경한 데이터/테마의 복원까지 검사하도록 수정했다.
- 고의 중복 실행 잠금 우회가 timeout 실패로 기록되고 테스트 서버가 남지 않음을 검사한다.
- 공식 배포 SHA256을 확인한 PowerShell7/Linux에서 코드 변조·추가 파일·런타임 교체를 실행 전 거절했다. Windows PowerShell5.1 검증과 구분한다.

## 실행 방법
패키지의 `windows/Verify.cmd`는 Windows PowerShell로 전체 파일 해시 및 고정된 Node 런타임 SHA256을 먼저 검사한 후 임시 데이터로 실제 런타임 검수를 실행한다. 결과 JSON은 콘솔에 표시된 TEMP 경로에 저장한다. 기존 대화나 키는 사용하지 않는다. 이 도구의 해시 검증은 코드 서명 또는 게시자 인증을 대신하지 않는다.

CI에서는 Windows PowerShell 선검사, 회귀 결함 주입 검사, 런타임 검수를 통과한 뒤 설치 EXE와 ZIP을 생성한다. 런타임 결과는 별도 evidence artifact로 남기며 실패 시 설치 후보 업로드를 진행하지 않는다.

## 별도 수동 검수
설치 마법사, 표준 사용자 실제 설치/업데이트/제거와 데이터 보존, 기본 브라우저 열기, PowerShell 암호 입력 UI, 로그인 자동 시작, Edge 화면 캡처, 코드 서명/SmartScreen, 실제 초보자 실험은 여전히 별도 검수다. Windows 파일 도구/내장 폴더 MCP 미지원은 유지한다.

근거: [Node child_process](https://github.com/nodejs/node/blob/v24.x/doc/api/child_process.md), [Node 24 API](https://nodejs.org/docs/latest-v24.x/api/child_process.html), [NSIS MessageBox](https://nsis.sourceforge.io/Reference/MessageBox).
