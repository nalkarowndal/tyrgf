# AURA Agent 시스템 설계

2026-10-16. 사용자가 제공한 마스터 프롬프트를 제품 기준으로 삼는다. 현재 M0–M3와 M4 영속 작업 에이전트, M5 기억·스킬을 구현했다. 이후 단계는 독립된 검증 게이트를 갖는다.

## 구조와 선택
React + TypeScript + Vite 화면 → 같은 출처의 Express API → SQLite 및 ProviderAdapter.
Node 24 내장 node:sqlite를 사용해 네이티브 SQLite 모듈 설치 부담을 줄인다. 단일 로컬 사용자, 단일 서버 프로세스만 지원한다.
모노레포에 준하는 apps/web, apps/server, packages/shared 구조를 사용한다.

대안: (1) Hermes/OpenClaw 전체 포크는 설치·권한 표면이 커서 채택하지 않음. (2) React/Express 독립 구현을 선택, 필요한 패턴만 참고. (3) 초기 Tauri 도입은 배포와 자격증명 설계 확정 뒤 M9에서 검토.

## 경계
- packages/shared/src/contracts.ts: Zod 설정, 공급자 레지스트리, 공유 DTO.
- apps/server/src/store.ts: SQLite 대화·설정·사용량. 순번으로 메시지 정렬, 재시작 시 진행 중 응답을 interrupted로 바꾼다.
- apps/server/src/providers.ts: 고정 출처 Gemini/Groq와 로컬 Ollama, 모의 공급자, 스트리밍 파서, 취소, 429 처리.
- apps/server/src/app.ts: Host/Origin/CSRF 검증, CRUD, 생성 응답 스트림. 키는 메모리에만 저장하고 응답/DB/로그에 포함하지 않는다.
- apps/server/src/index.ts: 127.0.0.1 바인딩. 개발 Vite 미들웨어 또는 빌드된 정적 화면.
- apps/server/src/agent-service.ts: 작업 상태, 승인 영수증 조정, LangGraph 실행, 파일 결과 검증.
- apps/server/src/agent-checkpoints.ts: SQLite에 네이티브 MemorySaver 상태 저장.
- apps/server/src/agent-planner.ts: 엄격한 다음 동작 JSON, 모의 복합 작업.
- apps/web/src: 공통 설명, 설정 마법사, 채팅, 작업 관리, 파일/웹 도구, 설정.

## 데이터 흐름
사용자 전송 → 설정·동의·모델 검증 → user/assistant 레코드 생성 → 공급자 스트림 → NDJSON 이벤트 → React 업데이트.
부분 응답은 SQLite에 체크포인트 저장. 중단/연결 종료/시간 제한 시 상위 HTTP 요청도 AbortSignal로 중단.
동일 대화의 동시 생성·수정·삭제는 409. 사용자 수정은 해당 시점 이후 메시지를 지우는 동작임을 화면에서 명시하고 실행한다.

## 제한
일반 대화에는 도구 호출이 없다. 작업 관리에서는 AgentService가 모델의 구조화된 다음 동작을 검증해 ToolService로 실행한다. /api/tasks는 목록·생성·조회·재개·중단·승인·거절을 제공한다.
무료 계정은 사용자 확인이며 과금 방지를 API로 증명할 수 없다. 클라우드 통신은 계정 확인 및 외부 전송 동의 없이는 금지한다. 유료 모델/다른 공급자로 자동 전환하지 않는다.
Linux 파일 변경과 공개 웹 읽기는 도구 권한과 1회 승인을 요구한다. 명령 실행·MCP·동적 웹 제어는 비활성. tool_runs 테이블은 승인 입력/상태/전후/복구 위치를 보관하며 agent_tasks/agent_checkpoints를 추가한 schema user_version=4.

M5 KnowledgeStore는 요청별 승인 기억과 대화 범위 경계를 제공한다. SummaryService는 명시적 원문 요약의 동시성·출처를 검증한다. SkillsStore는 완료 절차와 승인 버전을 저장하고 AgentService가 매 실행 시 확인한다. 기억의 컨텍스트는 대화 전용, 스킬은 작업 계획 전용이다.
