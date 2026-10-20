# Windows 데이터 잠금 진단 — 2026-10-19 KST

이 문서는deb4d4b 단계의 기록이다. 후속7522c3f의 CLI 진단 출력, 최신 후보 및 OS 제외 범위 안의 EACCES3건 관측은 [제거 실패 복구 보고서](M9_UNINSTALL_RECOVERY_REPORT.md)를 참고한다.

이전 Windows 백업 검사에서 발생한 잠금 포트 실패를 조사했다. **원래 OS 오류를 보존하도록 수정하고 실제 중복 잠금 회귀를 추가했다. 이번 Windows/Linux 표본에서는 과거 간헐 실패가 재현되지 않았으며, 근본 원인이 해결됐다고 주장하지 않는다.**

## 변경과 보호 범위

- `acquireDataLock`의 사용자 안내를 유지하면서 원래 bind 오류를 `Error.cause`에 보존한다. Node의 오류 코드·syscall·주소·포트를 진단에서 확인할 수 있다.
- 실제 동일 데이터 경로의 두 번째/세 번째 잠금 요청이 거절되고, 원래 소유자가 해제한 뒤에만 다시 확보되는지 검사한다. 기존 코드에서는 cause가 사라지는 RED를 확인했고 수정 뒤 GREEN을 확인했다.
- 포트 계산·localhost 바인딩·배타적 잠금 및 실패 시 접근 거절을 유지한다. 포트 변경, 자동 우회, OS 제외 포트 설정 변경은 없다. 이전 버전과 같은 잠금을 사용한다.
- `scripts/probe-data-lock.mjs`는 새 임시 경로512개에서 잠금을 확보하고 해제 후3회씩 재확보한다. Windows에서는 읽기 전용 `netsh interface ipv4 show excludedportrange protocol=tcp` 결과도 JSON에 보관한다. 사용자 데이터 경로를 검사하거나 내용을 기록하지 않는다.
- 이 스크립트는 관측 도구다. 확보 실패를 JSON에 기록하고 계속 표본을 수집하므로, 스크립트 종료0만으로 모든 잠금이 성공했다고 판단하지 않는다. 테스트·런타임·설치 검수는 별도 필수 단계로 유지한다.

## 실제 결과

검증 소스: `deb4d4bfc2a6a4d4b358658e1758a06da7a280f0`. Git CLI 인증이 없는 현재 환경에서 연결된 GitHub 앱으로 게시했다. 로컬405d238과 원격deb4d4b의 tree SHA는 `63385c7dea431d83260fffc269a68a9a3417a5bf`로 같다.

- Windows:512개 최초 확보 및1536회 재확보 성공, 실패0. [실제 진단 JSON](qa/windows-lock-probe-deb4d4b.json), [원격 증거 artifact](https://github.com/nalkarowndal/tyrgf/actions/runs/39258655867/artifacts/12188208215).
- 해당 러너의 제외 포트:80,5985,5986,47001. 잠금 범위20000~49999 안에47001이 있으나 이번 표본에서는 실패가 없었다. 이것만으로 이전 실패가 제외 포트 때문이었다고 결론내릴 수 없다.
- Linux: 같은512개 최초 확보 및1536회 재확보 성공. 새 잠금/기존 백업7개와 타입·lint·빌드 통과.
- 로컬 전체 첫 시도122/123: 기존 `mcp-shutdown.test.ts`의6초 앱 시작 대기 중 ECONNREFUSED. 단독 검사와 전체 재실행123/123은 통과했다. 이 테스트나 제한 시간은 변경하지 않았다.
- [품질 CI](https://github.com/nalkarowndal/tyrgf/actions/runs/39258655890) 첫 시도 성공: Linux21파일123개, Windows16파일83개(5파일40개 Linux 전용 제외), E2E16개·Edge4개·번들 검수·전체 audit0.

## 이전 설치 후보 — deb4d4b

[Windows 후보 CI39258655867](https://github.com/nalkarowndal/tyrgf/actions/runs/39258655867)는 첫 시도에 성공했다. API/백업/판정27개, 바로가기·제거 잔여10개, 런타임7항목, PowerShell5.1 선검사 및 실제 설치 수명주기8항목/버튼18회가 통과했다. 고의 데이터 삭제는 제거 자체가 성공한 뒤 정확한 `INSTALLER_DATA_LOSS`로 거절됐다.

- [최신 Windows 설치 후보 다운로드](https://github.com/nalkarowndal/tyrgf/actions/runs/39258655867/artifacts/12190255331): `AURA-Setup.exe`, `AURA-Windows-x64.zip`, `SHA256.txt`. GitHub 로그인 필요. 서명되지 않은 검수 후보이며 Release 게시 전이다.
- [설치 검수 증거](https://github.com/nalkarowndal/tyrgf/actions/runs/39258655867/artifacts/12190095415), [런타임 증거](https://github.com/nalkarowndal/tyrgf/actions/runs/39258655867/artifacts/12189785249), [전체 artifact 메타데이터](qa/windows-artifacts-deb4d4b.json).
- [바로가기·제거 회귀 JSON](qa/windows-installer-layout-deb4d4b.json), [설치 JSON](qa/windows-installer-deb4d4b.json), [데이터 손실 결함 JSON](qa/windows-installer-data-loss-deb4d4b.json), [런타임 JSON](qa/windows-runtime-deb4d4b.json).
- 후보 보관 만료: **2026-11-02 22:21 KST**. 실제 설치 EXE SHA256: `e5064445657b22284e91277cf59a2edaa2036b93e7def4f0cd6d844dc2d73764`.
- GitHub 후보 artifact ZIP SHA256: `698852fdb3c1df633a693c483747784e9bd5354dacbbb12bf5f998816e585467`. portable ZIP의 지문은 포함된 `SHA256.txt`를 확인한다.

## 판단과 후속

과거 실패 로그는 OS 원인을 버렸기 때문에 해당 실패의 정확한 원인은 소급 확정할 수 없다. 향후 실패에서는 보존된 cause와 같은 실행의 진단 artifact를 함께 확인한다. 현재 개선은 진단 누락 수정이며 간헐 포트 확보 실패 자체의 수정은 아니다.

Microsoft 문서상 WSAEACCES는 포트 접근 제한뿐 아니라 다른 프로세스의 독점 바인딩에서도 발생한다. 따라서 EACCES를 받았다고 임의의 다른 포트로 이동하면 같은 데이터에 두 프로세스가 접근할 수 있다. 안전한 호환성 설계 없이 이 동작을 바꾸지 않았다. 과거 Windows Server의 제외 포트 관련 KB는 가능한 원리를 설명하는 참고이며 현재 러너에서 같은 버그가 재현됐다는 증거가 아니다.

근거: [Microsoft Winsock 오류 코드](https://learn.microsoft.com/en-us/windows/win32/winsock/windows-sockets-error-codes-2), [SO_EXCLUSIVEADDRUSE](https://learn.microsoft.com/en-us/windows/win32/winsock/so-exclusiveaddruse), [제외 포트와 WSAEACCES KB](https://learn.microsoft.com/en-us/troubleshoot/windows-server/networking/error-10013-wsaeacces-is-returned), [Node24 net](https://nodejs.org/docs/latest-v24.x/api/net.html). Exa로 공식 문서를 찾고 Context7으로 Node24의 listen/error 동작을 확인했다.

표준 사용자 실환경·실제 로그인 자동 시작·코드 서명·다른 버전 DB 마이그레이션 등의 남은 출시 조건은 [설치 검수 보고서](M9_INSTALLER_VALIDATION_REPORT.md)를 따른다.
