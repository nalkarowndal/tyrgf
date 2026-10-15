# M3 — 수동 도구 실행과 승인

명세: USER_MASTER_PROMPT.md, TOOL_MCP_DESIGN.md. 기준 커밋 f4de6b4.

1. 서버 Tool Registry와 SQLite 실행 기록. 권한은 시작할 때 꺼짐, 변경 요청은 10분 유효한 1회 승인. 거절/취소/권한 철회/재시작 시 재사용 금지.
2. 명시적으로 허용한 폴더의 UTF-8 텍스트 목록·읽기·생성·수정·삭제·복구. 전후 내용과 대상 표시, 해시/파일 정체성 변경 시 실패. Linux 디렉터리 fd 기반 접근으로 symlink/경로 교체 차단. 미지원 OS는 파일 도구 실행 차단, Windows 네이티브 안전 접근은 M9.
3. 브라우저는 승인된 공개 HTTPS URL 한 개를 읽는 스냅샷 도구. DNS 주소 검증 후 연결 IP 고정, 리다이렉트 차단, 1 MiB 제한, 20초 제한. 별도 오프라인 Chromium 컨텍스트에서 JS/네트워크/폼 없이 정적 본문·스크린샷 추출. 로그인·입력·클릭·다운로드·명령은 미지원.
4. 한국어 파일/브라우저/도구 기록 화면, 권한과 1회 승인 분리, 전후 비교·복구 안내. 실제 AI 자동 도구 선택은 M4.
5. 검증: API 권한·경로·심볼릭/하드링크·만료·중복 승인·파일변경·재시작·복구, SSRF 주소와 차단된 리다이렉트, 격리 렌더러, UI E2E. 전체 check 및 시각 QA 후 독립 검토.

인터페이스: /api/tools (권한/레지스트리/최근 기록), POST roots/permissions/read/preview, POST runs/:id/{approve,deny,restore}. Preview는 입력 복사본/전후 내용/대상 fingerprint를 서버에 저장; approve는 ID만 받음.

검토 집중: path/approval TOCTOU, DB와 파일 작업 사이 크래시, 실행 중 권한 철회, 브라우저 간접 네트워크 및 DNS 재바인딩, 사용자가 현재 승인하는 대상과 실제 실행 대상 일치.

연구: Exa OWASP SSRF Cheat Sheet(검증된 DNS 주소에 연결 고정), GitHub microsoft/playwright-mcp README(보안 경계로 간주 불가), Context7 /microsoft/playwright(offline/javaScriptEnabled/serviceWorkers/route.abort). Canva AURA 디자인 검색은 결과 없음, 기존 UI 디자인을 확장.
