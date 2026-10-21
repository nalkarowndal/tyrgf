# Windows 데이터 잠금 수정 — 2026-10-21 KST

Windows 예약 TCP 포트 때문에 앱·백업이 실행되지 않는 문제를 재현하고 Windows 잠금을 이름 있는 파이프로 전환했다. Linux/macOS의 TCP 잠금 규약, DB와 백업 형식은 유지한다. 설계·공식 근거는 [전환 계획](WINDOWS_DATA_LOCK_PLAN.md)에 기록했다.

## 구현과 업데이트 조건

정규화한 데이터 폴더의 SHA256 전체로 파이프 이름을 정한다. 동일 폴더의 앱·백업·복원은 같은 이름을 독점하며, 실패 후 다른 이름이나 포트로 우회하지 않는다. 정상 종료와 프로세스 강제 종료 후 OS 핸들이 해제되면 다시 실행할 수 있다. CLI는 허용한 오류 코드와 `Windows 데이터 잠금` 유형만 표시하며 파이프 이름·데이터 경로·암호를 진단에 출력하지 않는다.

**구버전 TCP 후보와 새 파이프 후보는 서로의 실행을 차단하지 못한다.** 업데이트 전 모든 기존 앱 서버·백업·복원을 종료하고, 이후 설치본/portable 모두 새 후보의 도구만 사용해야 한다. 브라우저를 닫는 것만으로 서버가 종료되지는 않는다. 혼합 실행은 데이터 손상 위험이 있으며 지원하지 않는다. 이 조건은 설치 확인창·README·배포 안내에도 표시했다. 구버전과의 혼합 실행 보호를 구현했다고 주장하지 않는다.

## 실제 실패 재현과 수정 검증

- 최초 검수 도구는 수동으로 추가한 제외 범위가 바인딩을 차단할 것으로 가정했다. [855c852 실행](https://github.com/nalkarowndal/tyrgf/actions/runs/39394254584)에서 실제 바인딩이 성공하여 사전 조건에서 실패했다. 이는 제품 오류 재현으로 계산하지 않는다. [실패 JSON](qa/windows-data-lock-855c852-fixture-failed.json).
- 검수 도구를 OS 설정 변경 없이 기존 제외 범위 중 실제 `EACCES`를 반환하는 포트에 대응하는 경로를 찾도록 수정했다. [797432d 실행](https://github.com/nalkarowndal/tyrgf/actions/runs/39394582203)에서 포트49766의 TCP 거부와 기존 `acquireDataLock`의 `EACCES` 실패를 확인했다. [RED JSON](qa/windows-data-lock-797432d-red.json).
- 수정본의 [Windows CI](https://github.com/nalkarowndal/tyrgf/actions/runs/39520254205)는 포트49866에서 같은 TCP 거부를 확인한 뒤 새 잠금 획득·중복 거절·해제 후 재획득을 통과했다. 러너별 제외 범위는 다르며, 검사 자체가 실제 거부를 먼저 확인한다. [GREEN JSON](qa/windows-data-lock-c036383.json).
- 별도 프로세스4개 경쟁에서1개만 성공, 정상 종료/강제 종료 후 재획득, junction/심볼릭 링크·Windows 대소문자 별칭 차단, 별도 데이터 폴더 실행을 회귀에 추가했다.
- Windows 표본512개 획득과1536회 재획득에서 실패0을 관측했다. [진단 JSON](qa/windows-lock-probe-c036383.json). 이제 관측 실패가 하나라도 있으면 샘플 스크립트도 실패로 종료한다. 표본 성공은 모든 Windows 환경의 가용성 보장이 아니다.

## 품질 결과

검증 소스는 원격 `c03638307f52ba0c17b10d73473ead495603a8cc`, 로컬 `764ccb5`이며 tree `8c644a3fdf70d5281093879b43a5b1fed40fb401`이 동일하다.

[품질 CI39520254192](https://github.com/nalkarowndal/tyrgf/actions/runs/39520254192)는 첫 시도에 성공했다. Linux23파일129개, Windows18파일89개(5파일40개 Linux 전용 제외), E2E16개, 타입·lint·빌드·Linux 배포 번들 검수와 전체 audit0. 로컬 `npm run check`129개, Linux 배포 번들8항목도 통과했다. 기존 Zod 주석 및656.36KB 프런트엔드 번들 경고는 남아 있다.

독립 코드 리뷰에서 추가 수정이 필요한 결함은 발견되지 않았다. Windows 실증이 필요하다는 리뷰 조건은 위의 예약 포트 회귀 및 별도 프로세스 테스트로 확인했다. [Windows 런타임 JSON](qa/windows-runtime-c036383.json)은 실행·대화·중복/백업 차단·재시작·백업/복원·종료7항목을 통과했고 내장 파일 MCP는 미지원으로 기록한다.

## 최종 Windows 설치 후보

[Windows 후보 CI39520254205](https://github.com/nalkarowndal/tyrgf/actions/runs/39520254205)는 최종 소스의 첫 시도에 성공했다. API/백업/잠금/판정34개, 바로가기·제거 잔여 회귀10개, PowerShell5.1 선검사, 런타임7항목, 실제 설치·업데이트·삭제 실패·재시도·재설치·데이터 보존10항목/버튼24회가 통과했다. 고의 데이터 삭제 설치 파일은 제거 자체가 성공한 뒤 정확한 `INSTALLER_DATA_LOSS`로 거절됐다. [설치 JSON](qa/windows-installer-c036383.json), [잔여 회귀 JSON](qa/windows-installer-layout-c036383.json), [결함 JSON](qa/windows-installer-data-loss-c036383.json).

- [새 Windows 설치 후보 다운로드](https://github.com/nalkarowndal/tyrgf/actions/runs/39520254205/artifacts/12310004197): AURA-Setup.exe, AURA-Windows-x64.zip, SHA256.txt. GitHub 로그인 필요. 코드 서명 전 검수 후보이며 정식 Release는 게시하지 않았다.
- 후보 만료: **2026-11-04 09:21 KST**. 실제 설치 EXE SHA256: `16eed0e157a197202b6d5bd6155b7a01e5680def98879da6630e65b857843c16`.
- GitHub 후보 artifact ZIP SHA256: `c954aa313be999a2462cab8a9e190e7bb965c184b99841089b564cef9332fae1`. portable ZIP 지문은 포함된 SHA256.txt를 확인한다.
- [예약 포트 회귀 증거](https://github.com/nalkarowndal/tyrgf/actions/runs/39520254205/artifacts/12310812707), [512개 표본 증거](https://github.com/nalkarowndal/tyrgf/actions/runs/39520254205/artifacts/12310757617), [설치 증거](https://github.com/nalkarowndal/tyrgf/actions/runs/39520254205/artifacts/12310224065), [런타임 증거](https://github.com/nalkarowndal/tyrgf/actions/runs/39520254205/artifacts/12309843934), [artifact 메타데이터](qa/windows-artifacts-c036383.json).

## 남은 범위

이 변경은 Windows 데이터 잠금의 예약 TCP 포트 의존성을 제거한다. 일반 사용자 권한의 실환경, 다른 Windows 버전/보안 정책, 로그인 자동 시작, PowerShell 암호 입력 UI, 타 버전 DB 마이그레이션, 코드 서명/SmartScreen은 추가 검수가 필요하다. 앱의 HTTP 서비스 포트는 계속 사용한다. Windows 파일 도구·실 AI 공급자 인증과 계획 품질·외부 MCP 연결은 이번 수정 범위에 포함되지 않는다.
