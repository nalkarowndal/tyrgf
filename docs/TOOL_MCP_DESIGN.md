# 도구·MCP 설계

현재 외부 도구 실행은 지원하지 않는다. Tool Registry, Playwright MCP, GitHub MCP, Serena, Repomix, REA는 M3/M6 대상이다. 개발에 사용한 GitHub connector와 제품 내 연동은 서로 다르다.

공통 ToolDefinition: name, 한국어 설명, inputSchema, outputSchema, requiredPermissions, risk, environment, supportStatus, preview, execute, verify. 실행 정책은 서버에서 검증하고 모델 출력이나 UI 상태를 권한으로 신뢰하지 않는다.

파일 도구는 사용자가 고른 루트의 realpath 아래에서만 허용하고 symlink/경로 우회/TOCTOU를 검사한다. 수정·삭제는 diff와 대상 해시를 승인에 결합하고 가능한 복구본을 둔다. 명령 실행은 shell string 대신 검증된 executable/args와 별도 샌드박스를 사용한다.

브라우저는 별도 임시 프로필로 실행한다. 사용자 기존 로그인 프로필을 사용하지 않는다. 내부 IP·metadata URL·리다이렉트·다운로드를 제한하고, 외부 사이트 입력과 개인 데이터 전송은 실제 대상과 내용으로 승인받는다. Playwright의 자동화 성공을 작업 결과 검증으로 대신하지 않는다.

MCP 설정은 서버 출처·버전·설치 조건·제공 도구·요구 권한·신뢰 상태를 저장한다. 설치/시작은 사용자 승인 후 수행한다. 초기에는 읽기 전용 도구만 허용하고 오류를 한국어로 안내한다. Windows에서의 외부 프로세스 격리 방식은 M9 전 검증해야 한다.
