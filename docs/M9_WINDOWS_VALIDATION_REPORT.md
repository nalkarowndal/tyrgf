# Windows 런타임 검수 — 2026-10-18 KST

M9 설치 후보에 Windows/Linux 공통 검수 도구와 Windows PowerShell 무결성 선검사를 추가했다. 사용자 선택에 따라 전용 `codex/windows-validation` 브랜치에서 GitHub Actions Windows 러너 검수를 실행한다. 실제 Windows 런타임 검수와 설치 후보 생성이 통과했다. 최신 소스 `4932e2d`의 일반 품질 검사도 Linux/Windows에서 통과했다. 최신 후보는 아래 **최종 실행과 다운로드**를 기준으로 한다.

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


## 확인한 GitHub 실행
- [Windows 후보 생성](https://github.com/nalkarowndal/tyrgf/actions/runs/39052399853), 소스 `b3365d0`: 성공. Windows 런타임7항목 통과, 내장 파일 MCP1항목은 미지원으로 명시. PowerShell5.1 전체 해시 선검증·변조 거절 및 복원 no-op/중복 잠금 우회 결함 주입 검사도 통과했다.
- [Linux/Windows 품질 검사](https://github.com/nalkarowndal/tyrgf/actions/runs/39052399861), 소스 `b3365d0`: 성공. Linux118개/19파일, Windows78개/14파일 통과. Windows의 Linux 전용40개/5파일은 기존 지원 범위에 따라 제외했다. Linux E2E16개 및 번들 검수 통과.
- 최초 원격 Linux 검사는 /usr/bin/chromium 선택 후 시작 시간 초과1개(117/118)로 실패했다. CI가 설치한 브라우저 경로를 명시하여 전체 검사 통과를 확인했다.
- Windows Chromium 설치 지연은 최종적으로 완료되어 위 품질 검사가 통과했다. 이후 CI는 제품 Windows 기본 브라우저와 같은 사전 설치 Edge로 검증하도록 개선했고, 그 결과는 아래 최종 실행에 기록한다.

기존 실행의 증거: [Windows JSON](qa/windows-runtime-aeaeef6.json). 플랫폼/시간/manifest 지문과 항목별 결과를 원격 로그에서 그대로 추출해 보관했다. 이 기록은 GUI 설치 성공이나 서명 완료를 뜻하지 않는다.


## 개발 의존성 보안 보완
기존 운영 의존성 audit0과 별도로 개발용 테스트 도구에서 moderate1/critical2가 확인됐다. Vitest4.1.11 및 해당 lockfile로 갱신하여 취약 tinypool을 제거했고 전체 audit0을 확인했다. 기존 테스트/설정 변경 없이 로컬118개 검사·타입·lint·빌드를 통과했다. CI도 운영/개발 의존성 전체를 검사한다. 관련 권고: [Vitest 경로 접근](https://github.com/advisories/GHSA-82fw-gwwq-j7x9), [Tinypool 옵션 처리](https://github.com/advisories/GHSA-85c8-ppgw-ccpr).


## 보안 패치 이후 검수와 후속 수정
- 소스 `b5504ca`: [Windows 후보 생성](https://github.com/nalkarowndal/tyrgf/actions/runs/39094417278) 성공. [런타임 JSON](qa/windows-runtime-b5504ca.json)을 원격 로그에서 추출했다. Windows 품질78개·Linux 단위118개 및 전체 audit0은 통과했다.
- 같은 소스의 [Linux 브라우저 검사](https://github.com/nalkarowndal/tyrgf/actions/runs/39094417290)는14/16으로 실패했다. 파일 허용 중 입력 초기화 경합을 발견하여 요청 중 관련 입력을 잠갔다. 대화 취소 시나리오는 실제 요청 시작/취소를 기다리고 게이트를 finally에서 해제하도록 보완했다.
- 후속 소스 `4932e2d`는 지연된 폴더 허용 회귀 RED→GREEN, 두 시나리오 각3회 반복6/6, 전체 로컬 E2E16/16 및 타입·lint를 통과했다. 최신 원격 결과와 배포 후보는 아래 최종 실행을 기준으로 한다.
- 작업 공간의 기존 `dist/release/AURA-Setup.exe`와 ZIP은 M9 초기 후보다. 임시 Windows 빌드 도구가 현재 작업 공간에 없어 로컬 Windows 재생성은 수행하지 못했으며, 최신 후보는 실제 Windows CI가 생성한 아래 artifact를 사용한다.


## 최종 실행과 다운로드
검증 소스: `4932e2d7b57aaf89899371c5ea9f74366fb2daa2` (2026-10-18 KST). 이후 문서 커밋은 검증 결과를 기록하며 설치 후보의 소스는 이 커밋으로 고정한다.

| 검증 | 결과 | 근거 |
| --- | --- | --- |
| Linux 품질 | 타입·lint·118개 테스트·빌드, 전체 audit0, E2E16/16, 번들8항목 통과 | [Quality checks](https://github.com/nalkarowndal/tyrgf/actions/runs/39094902146), [Linux JSON](qa/linux-runtime-4932e2d.json) |
| Windows 품질 | 타입·lint·78개 테스트·빌드, 전체 audit0. Linux 전용40개 제외. 실제 Edge web-reader4개 통과 | 같은 품질 실행의 Windows job |
| Windows 배포 검수 | API/백업23개, manifest, PowerShell5.1 선검사, 결함 주입2개, 실제 런타임7항목 통과. 내장 파일 MCP1항목 미지원 | [Windows candidate](https://github.com/nalkarowndal/tyrgf/actions/runs/39094902135), [Windows JSON](qa/windows-runtime-4932e2d.json) |
| Windows 설치 후보 생성 | NSIS3.11 EXE·portable ZIP·SHA256.txt 생성 및 업로드 성공 | 아래 후보 artifact |

- [최신 Windows 설치 후보 다운로드](https://github.com/nalkarowndal/tyrgf/actions/runs/39094902135/artifacts/12124640216): `AURA-Setup.exe`, `AURA-Windows-x64.zip`, `SHA256.txt` 포함. GitHub 로그인 필요. 서명되지 않은 검수 후보이며 Release로 게시하지 않았다.
- [Windows 런타임 증거 다운로드](https://github.com/nalkarowndal/tyrgf/actions/runs/39094902135/artifacts/12124432157).
- 보관 만료: 2026-11-01 12:51 KST(후보), 12:50 KST(증거). 만료 뒤에는 같은 소스로 workflow를 재실행한다.
- GitHub가 보고한 후보 artifact ZIP SHA256: `36c2e9c4966aa3e84402e81d4cb0c62242ef4594ded68ea45bb38cc1797c7db7`. 이는 바깥 artifact의 지문이며 개별 EXE/portable ZIP의 해시는 포함된 `SHA256.txt`에서 확인한다. [원격 artifact 메타데이터](qa/windows-artifacts-4932e2d.json).

자동 검수는 완료했다. 설치 마법사·표준 사용자 설치/업데이트/제거·자동 시작·암호 입력 UI·코드 서명과 실제 사용자 검수는 별도 출시 조건으로 남긴다.
