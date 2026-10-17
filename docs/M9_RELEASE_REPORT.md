# M9 Windows 배포 후보 검증

2026-10-17, AURA 0.1.0, Linux 빌드 환경, Node 24.19.0, NSIS 3.11.
**판정: 구현 및 설치 후보 생성 완료. 실제 Windows 검수와 코드 서명 전이므로 정식 출시 완료가 아니다.**

## 산출물
- `dist/release/AURA-Setup.exe`: 현재 사용자 설치, Node 런타임 포함, 서명 없음.
- `dist/release/AURA-Windows-x64.zip`: 전체 압축 해제 후 `windows/Start.cmd` 실행.
- `dist/release/SHA256.txt`: 설치 파일과 ZIP SHA256.
- 패키지 내 `manifest.json`: manifest 자체를 제외한 모든 파일 SHA256.
- `사용 안내.md`, Node LICENSE, 라이브러리 고지를 패키지에 포함한다.

생성 파일은 로컬 작업 공간에 있으며 Git에 커밋하거나 GitHub에 게시하지 않는다. 재생성은 [배포 안내](DEPLOYMENT_GUIDE.md)를 따른다. 해시는 파일 동일성 검사이며 서명된 게시자의 신원 보증이 아니다.

## 통과한 검사
| 검사 | 결과 |
|---|---|
| 타입·ESLint·Vite 빌드 | 통과 |
| Vitest 단위/통합 | 18파일 116개 통과 |
| Chromium E2E | 16개 통과 |
| 운영 의존성 audit | 알려진 취약점 0건 |
| Linux 배포 번들 | 한글/공백 경로, 소스/npm 없이 실제 실행 |
| 번들 주요 흐름 | 모의 대화, 내장 MCP 실제 읽기, 정상 종료, 실행 중 백업 차단, 암호화 백업/복원 |
| 반복 빌드 무결성 | 이전 asset 제거, manifest 전체 파일/해시 일치, 사용자 .data 보존 거절 |
| Windows 런타임 | 공식 ZIP 및 node.exe 고정 SHA256 확인 |
| Windows 설치 후보 | Linux NSIS 컴파일; Windows 실행은 미검증 |

독립 검토에서 발견한 반복 빌드의 manifest 자기 해시와 이전 파일 잔존을 실패 검사로 재현한 뒤 수정했다. 앱/CLI 잠금, 잘못된 암호·변조·참조 오류, 미래 DB 스키마, 복원 전 안전 사본과 권한 초기화도 검사한다. API 키와 실제 작업 파일, 작업/실행 기록, 사용량, MCP 설정은 백업 대상이 아니다.

## Windows 출시 전 남은 검수
개발 도구가 없는 Windows x64 표준 사용자 계정에서 다음 항목을 실행하고 결과를 남겨야 한다.

- [ ] 한글·공백 사용자 경로에 설치하고 바로가기 실행, 브라우저 열기, 초기 설정·모의 대화·재실행 보존.
- [ ] 같은 데이터의 두 번째 실행 거절, 설정 종료 후 서버와 자식 프로세스 종료.
- [ ] PowerShell 5.1에서 한글 암호 백업/복원, 취소·잘못된 암호·변조, 안전 사본 복원.
- [ ] 복원 후 모의 공급자/외부 전송 꺼짐/기억·스킬 재승인, 키·권한 미복원.
- [ ] 자동 시작 기본 꺼짐, 선택 설치 후 로그인 시작 및 사용자의 해제.
- [ ] 백업 후 수동 업데이트, 제거 후 사용자 DB/백업 보존, 재설치 후 기록 확인.
- [ ] Edge 공개 웹 읽기/캡처와 Edge 없는 환경의 오류 안내.
- [ ] 설치 파일 코드 서명 및 배포 출처 검증, Windows 보안 경고 사용자 경험 확인.

Windows 파일 도구와 내장 폴더 MCP는 현재 지원하지 않는다. 실제 클라우드 인증, 외부 MCP 서비스, 실제 초보자 사용자 검수도 별도이며 자동 테스트가 이를 대신하지 않는다.

## 재실행
```sh
npm ci --ignore-scripts
npm run check
npm run test:e2e
npm run test:package
npm audit --omit=dev
```
E2E는 공유 결과 폴더 때문에 순차 실행한다. Windows 후보 생성은 수동 `windows-package.yml` workflow 또는 배포 안내의 로컬 빌드 절차를 사용한다. 원격 CI는 이 세션에서 실행하지 않았다.

참고: [Node 24 crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html), [Node 24 SQLite](https://github.com/nodejs/node/blob/v24.x/doc/api/sqlite.md), [NSIS 사용자 설명서](https://nsis.sourceforge.io/Docs/Chapter4.html).

## 로컬 후보 파일 지문

| 파일 | 바이트 | SHA256 |
|---|---:|---|
| AURA-Setup.exe | 27,022,839 | `236bbefe41e4a6e01f40f5d1874fda9b21572f269f13eb621836b5cc55cdf1a2` |
| AURA-Windows-x64.zip | 40,500,668 | `b72a60b649c687dde8396a1f7338f8fa4174975c135d56285f28dae0b48babe5` |
