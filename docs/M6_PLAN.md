# M6 MCP Implementation Plan

> Use superpowers:executing-plans inline; one independent final review.

Goal: MCP 연결 관리에서 실제 도구 발견·권한 설정·승인 호출·결과/오류·철회를 제공한다.
Spec: USER_MASTER_PROMPT.md §8.5/M6, TOOL_MCP_DESIGN.md. Base 5c2a09c.
Architecture: 공식 TypeScript SDK 1.32.1의 stdio Client + 독립 서버 프로세스. SQLite profile/run 기록, 권한과 세대는 메모리. 기존 SafeFiles 기반 내장 프로젝트 MCP로 실제 프로토콜 호출을 검증한다.

## Scope and decisions
- AURA 프로젝트 MCP: 별도 Node 프로세스, 허용 폴더 목록/텍스트 읽기/문자열 검색. 기존 Linux 경로 경계 사용. shell/network/write 도구 없음.
- GitHub/Serena/Repomix: 공식 출처·설치 조건·고정 시작 인수·검토된 조회 도구 allowlist. 이미 설치된 실행 파일만 명시적 신뢰 확인 후 실행. 등록 시 canonical path/SHA256을 보관하고 연결 시 재검사. 외부 서버를 자동 설치하거나 npx/uvx로 다운로드하지 않는다. REA는 선택형 안내만 제공.
- 외부 서버 프로세스는 OS 사용자 권한을 갖고 시작 중에도 캐시/네트워크 접근 가능. 도구 allowlist는 OS sandbox가 아님을 UI에 명시. 설치 승인 없는 외부 설치는 하지 않는다.
- GitHub PAT는 연결 요청 메모리와 자식 환경에만 전달. DB/로그/응답에 저장하지 않음, stderr 버림, 알려진 키가 결과에 포함되면 가림. Groq와 MCP 키는 별개.
- 프로필 최대8, 동시 연결3, 연결/호출 20초, 한 서버당 도구 호출1, 수신1MiB, 목록50, 스키마16KB/도구, arguments16KB, 결과24,000자.
- 도구 발견 후 기본권한 없음. 서버 annotations는 신뢰하지 않고 catalog allowlist와 사용자 선택 둘 다 필요. 입력 JSON Schema 검증, 승인 입력/도구 스키마/세대를 고정. 10분 일회 승인, 승인 전 도구 스키마 재조회, 변경 시 재검토 요구.
- 연결 해제·폴더 철회·프로세스 종료·재시작은 대기 승인 만료, 실행 중 호출 중단. 늦은 응답을 성공 처리하지 않음. 재시작 자동 연결 없음. 실행 파일 변경은 다시 등록하여 검토.
- MCP는 이 단계에서 수동 호출. 자동 Agent/Skill 동작에는 추가하지 않으며 일반 파일/웹 실행 기록은 유지한다. 외부 공급자 실연결은 설치/인증/네트워크 조건 없이는 미검증 표시.

## Tasks
1. [x] shared/mcp.ts catalog/contracts, server/mcp-project.ts 실제 읽기 서버, mcp-runtime.ts SDK 연결/발견/검증. 실제 stdio 통합 테스트 RED→GREEN.
2. [x] mcp-service.ts 권한/불변 미리보기/실행 영수증/API, root revoke lifecycle, app close. 등록·권한·재승인·스키마 변경·중단·재시작·실행 파일 변경·비밀 비노출 테스트.
3. [x] web/Mcp.tsx: 서버 카드·등록·실행 승인·도구 목록/권한·JSON 입력 스키마·결과/오류. /mcp 메뉴와 /tools 기존 기록 링크. E2E 연결→권한→읽기 승인→결과→해제, 반응형 캡처.
4. [x] full check/E2E/audit, 독립 검토 1회와 중요 수정, 문서·로컬 커밋.

## Review focus
- 연결/권한 철회 중 비동기 초기화·호출이 늦게 끝나도 권한 복원이나 성공 표시 금지.
- 스키마/실행 파일 교체 또는 재연결 뒤 오래된 승인 사용 금지.
- 외부 서버 annotations를 이용한 write 도구 노출 및 부모 비밀 환경 전파 금지.
- 서버 오류/결과/metadata에 인증키가 반사돼도 DB·UI로 유출 금지.
- 자체 UI 경로와 MCP 서버 경로 제한이 같고 폴더 교체·철회로 범위 확대 불가.

## Final evidence
- `npm run check`: typecheck/lint/Vitest **93 tests in15 files**/production build passed.
- `npm run test:e2e`: **8/8 passed** after shutdown fix. Production localhost:4317 MCP API200, screen heading, pageerror0.
- Production dependency audit:0 known vulnerabilities. Existing bundle size/Zod annotation warnings remain.
- Independent review:1 Important shutdown bug fixed with real parent/stubborn-child regression RED→GREEN; no repeated review. External provider connections remain unverified.
