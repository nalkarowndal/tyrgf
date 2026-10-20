# 제거 실패 복구와 백업 CLI 진단 — 2026-10-20 KST

앱 파일 삭제가 실패해도 제거가 성공으로 끝나고 재시도 수단이 사라지는 문제와, 백업 CLI가 내부에 보존된 잠금 원인을 출력하지 않는 문제를 수정했다.

## 변경

- 제거기는 앱 디렉터리 삭제를 먼저 시도하고 오류가 있으면 바로가기·원본 Uninstall.exe·HKCU 제거 등록을 보존한다. 바로가기나 원본 제거기 삭제가 실패한 경우에도 등록과 재시도 가능한 제거기를 남긴다. 실패 안내를 표시하고 exit2로 종료한다.
- 이미 삭제한 파일을 되돌리지는 않는다. 파일을 사용하는 프로그램을 닫은 뒤 Windows 앱 목록에서 제거를 다시 실행한다. 재시도는 앞선 시도에서 이미 없어진 앱/메뉴 디렉터리도 처리한다.
- 설치 루트는 비재귀 삭제를 유지해 사용자가 추가한 파일을 지우지 않는다. 사용자 추가 파일이 남는 경우와 제품 파일 삭제 실패는 구분한다. 대화 DB와 암호화 백업 경로는 제거 대상에 넣지 않았다.
- 백업 CLI는 기존 한국어 오류 안내 뒤에 `진단: EADDRINUSE (127.0.0.1:포트)` 형식의 한 줄을 추가한다. 원래 cause의 listen·localhost·잠금 포트 범위·허용한 OS 오류 코드가 모두 일치해야 출력한다. 원래 cause/stack 전체나 경로·암호는 추가 출력하지 않는다. 일반 사용 오류에는 잠금 진단을 붙이지 않는다.

## 재현 및 검증 방법

- CLI: 실제 데이터를 잠근 프로세스와 별도 CLI 프로세스를 사용한다. 기존 코드에서 진단 출력 누락1개 RED, 일반 사용 오류1개 통과를 확인했다. 수정 후 진단 코드/포트, 암호·경로 비노출, 백업 파일 무생성, 원래 잠금 유지가 통과했다.
- Windows RED: [39345388448](https://github.com/nalkarowndal/tyrgf/actions/runs/39345388448), 소스b27e070. 설치된 server.mjs를 삭제 공유 없는 FileStream으로 잠갔지만 기존 제거기가 exit0으로 종료했다. [실패 JSON](qa/windows-installer-b27e070-failed.json)을 남겼고 후보 업로드는 차단됐다.
- 수정 후 실제 NSIS 마법사에서 앱 파일 잠금과 원본 제거기 잠금을 각각 검사한다. 두 경우 모두 exit2·제거기/HKCU 등록·데이터 보존을 확인하고, 핸들을 닫은 뒤 같은 원본 제거기로 재시도한다. 앱 파일 잠금에서는 바탕화면 바로가기 보존도 확인한다.
- 최종 원격 검증 소스7522c3f와 로컬060e1c0의 tree는 `404be2b338762a8bc08ece66aa046ab62bbce425`로 동일하다. GitHub 앱으로 기존 승인된 브랜치에 게시했다.
- 최초 수정본은 오류 안내에서 검수기가 멈췄다([85bc996 기록](qa/windows-installer-85bc996-timeout.json)). 창 컨트롤을 수집한 [d1e3271 기록](qa/windows-installer-d1e3271-controls.json)에서 활성 OK 버튼의 ID가2임을 확인했다. 기존 검수기는 ID1만 찾았다. 예상 실패 단계에서 정확한 오류 안내 문구와 OK/확인 텍스트가 함께 일치할 때만 ID2를 누르도록 보완했다. 비활성 부모 창의 취소 버튼은 누르지 않는다. 실패 기준과120초 제한은 유지했다.

## 품질 결과

최종7522c3f의 [품질 CI39347271398](https://github.com/nalkarowndal/tyrgf/actions/runs/39347271398)는 첫 시도에 성공했다. Linux22파일125개, Windows17파일85개(5파일40개 Linux 전용 제외), E2E16개·Edge4개·배포 번들·전체 audit0. 로컬 npm run check도125개·타입·lint·빌드 통과했다. 기존 Vite 번들 크기 및 Zod 주석 경고는 남아 있다.

## 최신 설치 후보와 실제 Windows 결과

검증 소스 `7522c3f788de7ee91a6635fee0016a399b31ea2c`의 [Windows 후보 CI39347271385](https://github.com/nalkarowndal/tyrgf/actions/runs/39347271385)는 첫 시도에 성공했다. 위에 기록한 이전 소스의 실패를 재실행으로 숨기지 않았으며 오류 창 처리 수정 후의 새 소스를 검증했다.

- 실제 설치/업데이트/두 가지 삭제 실패/재시도/재설치/데이터 보존10항목, 마법사 버튼24회 통과: [설치 JSON](qa/windows-installer-7522c3f.json).
- 고의 데이터 삭제는 제거 자체가 성공한 뒤 정확한 INSTALLER_DATA_LOSS로 거절: [결함 JSON](qa/windows-installer-data-loss-7522c3f.json).
- 바로가기·제거 잔여 회귀10개, API/백업/판정27개, PowerShell5.1 무결성 선검사 및 Windows 런타임7항목 통과: [회귀 JSON](qa/windows-installer-layout-7522c3f.json), [런타임 JSON](qa/windows-runtime-7522c3f.json).
- [최신 Windows 설치 후보 다운로드](https://github.com/nalkarowndal/tyrgf/actions/runs/39347271385/artifacts/12231184872): AURA-Setup.exe, AURA-Windows-x64.zip, SHA256.txt. GitHub 로그인 필요. 서명되지 않은 검수 후보이며 Release 게시 전이다.
- [설치 증거](https://github.com/nalkarowndal/tyrgf/actions/runs/39347271385/artifacts/12231687096), [런타임 증거](https://github.com/nalkarowndal/tyrgf/actions/runs/39347271385/artifacts/12231109473), [잠금 진단 증거](https://github.com/nalkarowndal/tyrgf/actions/runs/39347271385/artifacts/12231417702), [artifact 메타데이터](qa/windows-artifacts-7522c3f.json).
- 후보 만료: **2026-11-03 09:27 KST**. 실제 설치 EXE SHA256: `8b74041bf21806a02fa1c479cba0e2acf01c5f8865ff73d72a2ed278dc5d698e`.
- GitHub 후보 artifact ZIP SHA256: `adcc7525213e691171e6e3e3abfd5900f690e6ab27c213d6a1f7e06de5f15f58`. portable ZIP 지문은 포함된 SHA256.txt를 확인한다.

## 함께 확보한 잠금 진단

이번 [실제 진단 JSON](qa/windows-lock-probe-7522c3f.json)은512개 중509개 최초 확보, 성공 경로의 재확보 실패0, 최초 확보 실패3개를 기록했다. 실패 코드는 모두 EACCES이고 포트49745/49779/49874는 같은 실행에서 수집한 Windows 제외 범위49696~49795 및49796~49895 안에 있다. 현재 러너에서의 잠금 접근 거부와 제외 범위가 일치하는 새 증거이며, 원인 정보가 없던 과거 백업 실패까지 소급 확정하는 것은 아니다. 진단 스크립트는 표본 수집 도구여서 종료0이512개 전부 성공을 뜻하지 않는다.

잠금 방식이나 OS 제외 설정은 바꾸지 않았다. 이 가용성 문제는 별도 후속 항목이며, 오류만 보고 다른 포트로 우회하는 방식은 중복 실행 보호를 깨뜨릴 수 있다.

## 한계

FileStream의 삭제 공유 제한으로 실제 Windows 파일 삭제 실패를 재현한다. 실행 중인 전체 앱을 자동 종료하는 기능이나 부분 삭제의 롤백을 추가한 것은 아니다. OS 권한 정책에 의해 레지스트리 자체가 쓰기 금지된 경우까지 검수한 것은 아니다. 기존 간헐 잠금 포트 오류의 원인 확정·해결과도 별개다.

표준 사용자 실환경, 실제 로그인 자동 시작, 기본 브라우저 열기, PowerShell 암호 입력 UI, 코드 서명/SmartScreen 및 다른 버전 간 DB 마이그레이션 검수는 남아 있다.

근거: [NSIS IfErrors](https://nsis.sourceforge.io/Reference/IfErrors), [SetErrorLevel](https://nsis.sourceforge.io/Reference/SetErrorLevel), [Quit](https://nsis.sourceforge.io/Reference/Quit), [RMDir](https://nsis.sourceforge.io/Reference/RMDir), [Node24 Errors](https://nodejs.org/docs/latest-v24.x/api/errors.html). Exa와 Context7으로 공식 동작을 확인했다.
