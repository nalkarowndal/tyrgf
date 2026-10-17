# AURA 설치와 데이터 관리

Windows x64 패키지는 개발 도구/Node.js 설치 없이 실행하도록 런타임을 포함합니다. 현재 Windows 실제 실행과 코드 서명은 미검증입니다. 서명되지 않은 설치 파일이며 정식 배포 승인이 된 제품이 아닙니다.

## 설치와 실행
AURA-Setup.exe를 실행해 현재 사용자에게 설치합니다. 관리자 권한은 필요하지 않습니다. 시작 메뉴의 AURA Agent로 실행하면 로컬 서버와 기본 브라우저가 열립니다. 앱 콘솔을 닫지 않고 사용하세요. 같은 앱을 여러 번 시작하면 두 번째 실행은 차단됩니다. 처음에는 모의 AI이며 실제 AI 연결 성공을 뜻하지 않습니다.

Portable ZIP은 원하는 폴더에 전체 압축을 풀고 windows/Start.cmd를 실행합니다. 한글/공백 경로를 지원하도록 경로를 인용합니다. 데이터는 설치 위치와 별도로 %LOCALAPPDATA%/AURA Agent/data에 저장됩니다. 설치/portable은 같은 사용자 데이터와 기본 포트4317을 사용합니다.

설정의 앱 종료 버튼 또는 콘솔 Ctrl+C로 종료합니다. 브라우저만 닫으면 서버는 계속 실행됩니다. 앱 재시작 시 API 키를 다시 입력합니다. 키는 파일이나 백업에 저장하지 않습니다.

## 백업
앱을 종료한 뒤 시작 메뉴 ‘암호화 백업’ 또는 windows/Backup.cmd를 실행합니다. 새 파일명을 선택하고 12자 이상 암호를 두 번 입력하세요. 기존 파일을 덮어쓰지 않습니다. 암호를 잃으면 복구할 수 없습니다. 안전한 장소에 백업과 암호를 따로 보관하세요.

포함: 대화, 기억 텍스트, 스킬 절차, 화면 설정, 오래된 문맥 제외 경계.
제외: API 키, 실제 작업 파일, 작업/실행 기록과 진행 상태, 사용량, MCP 서버/프로그램, 모든 실행 권한. 설정의 ‘대화 전체 내보내기’는 암호화 백업이 아닌 읽기용 평문 JSON입니다.

## 복원
앱을 종료한 뒤 ‘데이터 복원’ 또는 windows/Restore.cmd를 실행합니다. 현재 데이터 교체 확인 → 백업 파일 선택 → 암호 입력. 기존 데이터는 data/before-restore-UUID.aura-backup에 같은 암호로 보존됩니다. 되돌릴 때 그 파일을 선택해 복원합니다. 암호/파일/버전 오류에서는 기존 DB를 교체하지 않습니다.

복원 후 공급자는 모의 AI로 돌아가고 외부 전송 동의는 꺼집니다. 기억과 스킬은 검토 대기입니다. 원문 요약은 검토용 사용자 기억 초안으로 복원됩니다. 다시 확인·승인하고 키와 도구 권한을 설정하세요. 이 백업은 운영 기록이나 원본 작업 파일의 복구 도구가 아닙니다.

## 자동 시작·업데이트·제거
로그인 자동 시작은 설치 옵션이며 기본 꺼짐입니다. 끄려면 Windows 시작 앱에서 AURA를 해제하거나 시작프로그램 폴더의 AURA 바로가기를 삭제합니다. 자동 업데이트/다운로드는 하지 않습니다. 업데이트 전 백업 → 앱 종료 → 새 설치 파일 실행. 새 버전 출처와 SHA256을 확인하세요. 제거는 앱/바로가기만 삭제하며 data 폴더는 보존합니다.

## 현재 제한
Windows 파일 도구는 미지원이며 안전 경로 검증을 우회하지 않습니다. 복합 파일 작업/내장 폴더 MCP도 사용할 수 없습니다. 공개 웹 스냅샷은 설치된 Microsoft Edge를 사용하며 없으면 오류로 안내합니다. 실 클라우드 인증/요금제, 외부 MCP, Windows 설치·복원·Edge 동작은 실제 Windows에서 별도 검증해야 합니다. 패키지 생성과 Linux 테스트를 Windows 성공으로 해석하지 마세요.

## 빌드 담당자

`npm ci --ignore-scripts` 뒤 `npm run test:package`로 Linux 배포 번들을 별도 한글/공백 경로에서 검사합니다. 배포 번들은 소스/tsx/npm 설치 없이 Node로 실행되며 내장 MCP도 별도 번들로 실행합니다.

Windows용 공식 Node 24.19.0 x64 ZIP과 SHASUMS256.txt를 nodejs.org에서 내려받아 ZIP SHA256 `57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73`을 확인하고 압축을 풉니다. `AURA_WINDOWS_NODE`를 그 node.exe로 지정한 뒤 `npm run package:windows`를 실행합니다. 패키저가 exe 자체 SHA256도 고정값으로 검사합니다. `node scripts/verify-package.mjs dist/release/win-x64`로 모든 파일 해시를 검사합니다. 매번 새 임시 폴더에 패키지를 생성하며 이전 출력에 사용자 `.data`가 있으면 교체를 거절합니다. Node LICENSE, 번들 라이브러리 고지, 파일별 manifest.json이 포함됩니다.

NSIS 3.11에서 `scripts/windows/installer.nsi`를 PACKAGE=dist/release/win-x64 전체 경로, OUTPUT=AURA-Setup.exe 전체 경로로 컴파일합니다. Windows에서는 `/D`, Linux에서는 `-D`로 define을 전달합니다. 해당 디렉터리 내용으로 portable ZIP을 만듭니다. 설치/portable SHA256을 함께 배포하고, 출시 전 Windows 표준 사용자 환경에서 설치→실행→복원→업데이트→제거 및 Edge 실행을 확인해야 합니다.

`.github/workflows/windows-package.yml`은 수동 실행 시 설치 후보와 ZIP을 CI artifact로만 만듭니다. Release 게시·자동 설치는 하지 않습니다. 이 개발 세션에서는 원격 workflow를 실행하지 않았습니다. 코드서명 인증서/Windows 검증이 없으므로 공개 출시 완료로 표시하지 않습니다.
