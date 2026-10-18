# Windows 설치 수명주기 검수 — 2026-10-18 KST

기존 M9 런타임 검수에 실제 NSIS 설치 마법사 검수를 추가했다. GitHub-hosted Windows 러너의 임시 한글/공백 경로에서 실행하며 기존 AURA 데이터·바로가기·레지스트리가 있으면 중단한다. **검증 소스163eda3의 실제 설치 수명주기8항목 및 데이터 손실 결함 검출이 통과했다.** 최신 후보와 원격 증거는 아래에서 확인할 수 있다.

## 검사 범위

- 설치 파일의 실제 Next/Install/OK/Finish 버튼을 조작한다. 창은 검사에서 시작한 PID로 한정하고 제한 시간을 둔다.
- 설치된 패키지 manifest와 고정 Node SHA256, 바탕화면/시작 메뉴 바로가기, HKCU 제거 등록, 로그인 자동 시작의 기본 꺼짐을 확인한다.
- 설치된 런타임을 실행해 기본 Windows 데이터 경로에 모의 대화와 다크 테마를 저장하고 암호화 백업을 생성한다. 실제 키나 외부 공급자를 사용하지 않는다.
- 설치된 서버 파일에 검수용 변경을 넣고 같은 버전 설치 파일로 덮어써 manifest 복구와 DB/백업 바이트 보존을 확인한다.
- 앱을 종료한 상태에서 제거 마법사를 실행하고 앱 디렉터리·바로가기·등록 제거 및 DB/백업 보존을 각각 확인한다.
- 재설치 후 기존 대화/테마를 실제 HTTP API로 확인하고, 마지막 제거에서도 데이터를 보존한다.
- 별도 결함 주입 설치 파일은 제거 시 검수용 데이터까지 지우도록 빌드한다. 제거 자체의 정상 완료 이후 정확한 데이터 손실 실패가 확인돼야 회귀 검사 성공이다. 이 설치 파일은 배포 artifact에 포함하지 않는다.

## 발견·수정과 근거

- 독립 검토에서 결함 주입 검사가 다른 실패를 데이터 손실로 잘못 판정할 수 있음을 발견했다. 기존 판정으로 부적합 사례3개가 통과하는 RED를 재현했고, 제거 완료/데이터 손실 코드/보존 실패를 모두 요구하여4개 회귀 GREEN을 확인했다.
- 첫 실제 Windows 설치는 마법사4단계를 완료했으나 WScript.Shell이 한글 대상 경로를 ??로 읽었다. Unicode를 지원하는 Shell.Application의 링크 조회로 바꿨다. NSIS의 입력 ACP 로그에 따라 빌드에도 UTF-8을 명시했다. 최초 실패 실행: [39122014202](https://github.com/nalkarowndal/tyrgf/actions/runs/39122014202), [실패 JSON](qa/windows-installer-2315869-failed.json).
- 로컬 타입·lint·빌드 및20파일122개 검사가 통과했다. Linux에서 Windows 설치 성공을 주장하지 않는다.

참고: [NSIS 명령행 /D와 _?=](https://nsis.sourceforge.io/Docs/Chapter3.html), [Microsoft IShellLinkW.GetPath](https://learn.microsoft.com/en-us/windows/win32/api/shobjidl_core/nf-shobjidl_core-ishelllinkw-getpath).

## 품질 CI

소스 `163eda3`의 [Windows/Linux 품질 검사](https://github.com/nalkarowndal/tyrgf/actions/runs/39122345842)는 성공했다. Linux20파일122개, Windows15파일82개 통과(Windows에서 Linux 전용5파일40개 제외), Linux E2E16개 및 번들 검사 통과. 실제 Edge web-reader4개와 전체 의존성 audit0도 확인했다.

Windows 설치 후보 첫 시도는 설치 검사 전에 기존 백업 테스트의 잠금 포트 확보 실패로26/27에서 중단됐다. 같은 소스의 일반 Windows 검사는 통과했다. 잠금 우회나 테스트 재시도 설정을 추가하지 않고 실패 job만 한 번 재실행했으며, 정확한 OS 포트 오류 원인은 최초 로그만으로 확정하지 않았다.

## 최종 Windows 결과와 다운로드

검증 소스: `163eda3a0b6c7c684c7eae2ffa530099da71c265`. [Windows 후보 CI](https://github.com/nalkarowndal/tyrgf/actions/runs/39122345799)는 실패 job만 재실행한 두 번째 시도에서 성공했다. 이후 문서 커밋은 증거를 기록하며 아래 후보의 소스는 변경하지 않는다.

- 실제 설치 마법사 버튼18회, 설치 수명주기8항목 통과. 설치된 앱의 대화·백업 생성 및 업데이트/재설치 뒤 대화 재확인 통과: [설치 JSON](qa/windows-installer-163eda3.json).
- 데이터 손실 결함 주입은 제거 자체가 성공한 뒤 `INSTALLER_DATA_LOSS`로 실패했다. 이것이 의도한 회귀 성공이며 일반 오류와 구분된다: [결함 주입 JSON](qa/windows-installer-data-loss-163eda3.json).
- Windows 런타임7항목과 PowerShell5.1 무결성 선검사, 복원 no-op/중복 잠금 우회 결함 검출, API/백업/증거 판정27개 테스트 통과: [런타임 JSON](qa/windows-runtime-163eda3.json).
- [최신 Windows 설치 후보 다운로드](https://github.com/nalkarowndal/tyrgf/actions/runs/39122345799/artifacts/12134293619): `AURA-Setup.exe`, `AURA-Windows-x64.zip`, `SHA256.txt`. GitHub 로그인 필요. 서명되지 않은 검수 후보이며 Release 게시는 하지 않았다.
- [설치 검수 증거 artifact](https://github.com/nalkarowndal/tyrgf/actions/runs/39122345799/artifacts/12134353032), [런타임 증거 artifact](https://github.com/nalkarowndal/tyrgf/actions/runs/39122345799/artifacts/12134349432), [원격 메타데이터](qa/windows-artifacts-163eda3.json).
- 후보/설치 증거 보관 만료: **2026-11-01 20:20 KST**. 이후 같은 소스로 workflow를 다시 실행한다.
- 실제 검사한 설치 EXE SHA256: `f1eb9ec119b13377002a6fafe43f3fbbb5b7c7a210efd2b28587b5473da4a732`.
- GitHub 후보 artifact ZIP SHA256: `7dcf5503ef39a66f6a810eaf8c90a49e574ceb50890633aecbab3f9f7eb97a91`. 바깥 artifact 지문이며 portable ZIP의 지문은 포함된 `SHA256.txt`를 확인한다.

## 남은 조건

이 검수는 GitHub 러너에서 자동 조작한 설치 경로다. 개발 도구 없는 표준 사용자 계정, 실제 사람의 설치 UX/SmartScreen, 코드 서명, 선택한 자동 시작의 실제 로그인 실행, 기본 브라우저 자동 열기, PowerShell 암호 입력 UI, 다른 버전 간 DB 마이그레이션은 별도 검수다. 설치된 앱은 `--no-open`으로 검수한다. Windows 파일 도구/내장 파일 MCP 미지원도 유지한다.

독립 검토의 보류 Minor: 바로가기는 앱 내부에 존재하는 대상인지까지 확인하며 각각 Start/Backup/Restore와 정확히 대응하는지는 검사하지 않는다. 제거 후 앱 하위 폴더·등록·바로가기를 확인하지만 설치 루트와 원본 Uninstall.exe가 남지 않았다는 별도 단언은 없다. 이는 이번 자동 검수 범위의 제한이다.
