# M5 Memory and Skills Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline, then one independent final review.

**Goal:** 사용자가 승인한 기억과 완료 작업 절차를 재사용하고 삭제·철회가 다음 요청에 반영되게 한다.
**Architecture:** 기존 SQLite에 KnowledgeStore(기억·스킬), SummaryService(명시적 요약)를 추가한다. 매 요청 현재 기억을 읽고 작업의 스킬 버전은 매 실행 전에 재검사한다. 기존 Provider/ToolService의 권한과 승인을 유지한다.
**Tech Stack:** Node24, SQLite, Zod, React, 기존 공급자/에이전트 런타임. 새 의존성 없음.
**Spec:** USER_MASTER_PROMPT.md §9/M5 및 MEMORY_DESIGN.md; 아래 구체화.

## Global Constraints / 구체화
- 한국어, 로컬 단일 사용자, 유료 전환 없음. 키는 메모리만. 실 Groq는 환경 허용 목록에 api.groq.com이 없어 아직 실행 불가.
- 기억은 사용자 입력 또는 대화 요약 초안. 이름/분류/본문/출처/시점/버전/승인 상태, 최대100개·본문2000자. 승인 전 미사용. 검색·수정·개별/전체 삭제·JSON 내보내기.
- 활성 기억을 요청마다 다시 읽으며 최대6000자. 최신 항목부터, 넘는 항목은 제외하고 개수를 안내한다. 클라우드 대화 전송 동의는 기억 전송도 포함함을 화면에 표시.
- 기억 수정·비활성·삭제는 모든 대화의 과거 컨텍스트 경계를 현재까지로 이동하고 요약을 무효화한다. 기존 대화 기록은 표시·보관하되 다음 요청에 넣지 않는다. 진행 중 요청은 중단하고 늦은 결과 폐기. 이미 외부에 전송된 내용을 회수하는 기능은 아님.
- 요약은 명시적 요청, 원문 최대24000자, 완료 메시지 범위·SHA256 검증, 공급자/모의 여부 보존. 실패/원문 변경 시 저장하지 않음. 사용자 승인 전 적용하지 않음. mock은 발췌임을 표시. 자동 요약은 후속.
- 스킬은 완료한 작업에서만 초안 생성, 이름/목적/단계/도구/파생 권한/검증/버전/최근 실행 표시. 수정하면 승인 해제. sourceTaskId로 추적. 원문 파일 내용·승인 run ID를 복사하지 않음.
- 스킬 재사용은 새 작업에 skillId/version 참조와 명시적 목표·폴더·동의. 매 실행·승인 전에 승인된 동일 버전 확인, 허용 도구 범위 강제. 삭제/수정/승인 해제 뒤 기존 작업은 더 실행하지 않음.

## Review Focus
- 삭제와 진행 중 모델 응답 경쟁: 늦은 결과가 기억/요약으로 복원되지 않아야 함.
- 같은 대화의 이전 답변과 요약이 삭제된 정보를 다시 전달하지 않아야 함.
- 요약 도중 원문 편집/삭제, 클라우드 설정 변경: 오래된 원문으로 저장하면 안 됨.
- 스킬 수정/삭제와 승인 대기 작업: 오래된 권한/동작으로 실행하지 않아야 함.
- 예산과 편집 버전 충돌: 잘라낸 기억을 적용했다고 주장하거나 오래된 승인을 받으면 안 됨.

### Task 1: 기억 CRUD 및 요청별 컨텍스트
Files: packages/shared/src/knowledge.ts; apps/server/src/knowledge-store.ts; app.ts; tests/knowledge.test.ts.
Interfaces: KnowledgeStore.memories/query, saveMemory/updateMemory/approveMemory/deleteMemory, context(sessionId) -> {text,count,omitted}, history(sessionId), epoch.
- [ ] API404 RED: 초안 미적용/승인 버전/검색/수정·삭제 후 재사용 없음/전체 삭제와 export/재시작.
- [ ] 실제 provider fetch fixture로 새 대화의 전송 본문과 같은 대화 삭제 후 과거 제외 검증.
- [ ] 구현, focused tests GREEN, commit.

### Task 2: 요약과 스킬 재사용
Files: summary-service.ts; knowledge-store.ts; agent-service.ts; agent-planner.ts; agent.ts; tests/knowledge.test.ts; tests/skills.test.ts.
Interfaces: POST /api/memories/summarize {sessionId}; POST /api/skills/from-task {taskId}; POST /api/skills/:id/{update,approve,delete}; GET /api/skills. createTaskSchema skillId/skillVersion optional pair.
- [ ] RED: 요약 초안/원문 변경 무효화/실패 시 원문 유지; 스킬 완료 작업만 저장/승인 전 실행 거절/수정 후 승인 해제/대기 중 삭제 후 도구 실행 거부/허용 도구 범위.
- [ ] 구현, GREEN, 전체 테스트, commit.

### Task 3: 관리 UI 및 검증
Files: apps/web/src/Knowledge.tsx; App.tsx; Chat.tsx; Tasks.tsx; styles.css; tests/e2e/knowledge.spec.ts; docs.
- [ ] E2E RED: 기억 작성·승인·검색·수정·내보내기·삭제; 요약 초안 승인; 완료 작업에서 스킬 저장·검토·재사용·승인 철회.
- [ ] 기존 UI 패턴에 관리 화면, 기억 전송 안내, 스킬 선택과 검토 추가.
- [ ] npm run check / E2E, 화면 검수, 독립 리뷰 1회 및 중요 수정, 문서·로컬 커밋.
