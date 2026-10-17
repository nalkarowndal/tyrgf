# 조사 근거와 채택 결정

확인일: 2026-10-15 (Asia/Seoul). GitHub connector로 디렉터리, 실제 관련 소스, manifest, LICENSE를 읽었다. Exa는 공식 문서 추출, Context7은 LangGraph 승인·재개 패턴 확인에 사용했다. 아래 버전은 조회 당시 기본 브랜치의 manifest 값이며 최신 정식 릴리스라는 뜻은 아니다. 실행 설치 검증과 소스 검토를 구분한다. 참고 프로젝트를 설치하거나 코드를 제품에 복사하지 않았다.

| 프로젝트 | 코드에서 확인한 설계 / 버전·조건 | AURA 결정과 제약 |
|---|---|---|
| [Hermes](https://github.com/NousResearch/hermes-agent) | `tools/registry.py` 중앙 schema/handler/가용성 등록. `pyproject.toml` 0.0.0, Python >=3.11,<3.15; 주석은 현재 설치에서 Python 3.14 권장/지원 정책을 별도로 설명. MIT | M3 Tool Registry 개념 참고. 전체 Python 런타임 포크는 설치 부담이 커서 제외. 0.0.0은 릴리스 번호로 사용하지 않음. |
| [OpenClaw](https://github.com/openclaw/openclaw) | `src/infra/exec-approvals.ts` 승인 정책·allowlist·snapshot 로딩 및 socket token redaction. 2026.10.3, Node >=24.16 <25 또는 >=26.1. MIT | 로컬 게이트웨이 및 권한 경계 참고. 공개 네트워크·메시징 기능은 도입하지 않음. |
| [REA](https://github.com/morluto/rea) | `ReverseEngineeringService.ts` typed command port, 취소/시간 제한, 프로세스 감독 인터페이스. 6.5.0, Node ^22.19 / ^24.11 / >=26. MIT, 외부 분석 도구는 별도 조건 | 소스 없는 승인된 프로그램 분석 때만 선택 검토. M0–M2에서는 설치/실행 없음. |
| [Serena](https://github.com/oraios/serena) | `src/serena/agent.py` 프로젝트·언어 서버·ToolRegistry, 명시적 활성 도구 목록. 2.0.1.dev0, Python >=3.11,<3.15 | LICENSE는 **Serena application GPL-3.0-or-later, SolidLSP MIT**. 전체를 MIT로 간주하면 안 됨. M6 선택형 독립 MCP 연결만 검토. 배포 시 해당 버전 라이선스 재검토. |
| [Repomix](https://github.com/yamadashy/repomix) | `src/core/packager.ts` search→collect→process→safety→output/metrics, `confineToBaseDir` 선택 옵션. 1.18.1, Node >=22. MIT | M6 프로젝트 요약 입력 어댑터 후보. 비밀 검색 결과와 경로 경계는 자체 검증 필요. 안전 옵션 기본값을 과신하지 않음. |
| [Playwright MCP](https://github.com/microsoft/playwright-mcp) | `index.js`는 playwright-core tools.createConnection을 재노출. 0.0.83, Node >=18. Apache-2.0 | 진입점에서 브라우저 구현 전체를 검증한 것은 아님. M3 브라우저는 격리 프로필·대상 제한·입력 승인 필요. M3는 playwright-core 직접 호출로 정적 읽기 화면을 캡처한다. Playwright MCP 서버는 설치하지 않음. |
| [LangGraph.js](https://github.com/langchain-ai/langgraphjs) | libs/langgraph 1.0.47, Node >=20, MIT. `libs/checkpoint-sqlite/src/index.ts` SqliteSaver, 체크포인트/쓰기 저장 및 순서 복원 | M4 우선 후보. 현재 M2는 채팅 생성이므로 도입 보류. 승인 후 재개는 노드 재실행 가능; 부작용은 idempotency와 영속 결과로 보호. |
| [GitHub MCP](https://github.com/github/github-mcp-server) | `pkg/github/tools.go` 도구 등록 및 toolset 처리. go.mod Go 1.26.8, MIT. 조회한 manifest에는 앱 릴리스 번호 없음 | M6 선택형 읽기 도구부터 검토. push/write는 별도 사용자 승인. 현재 GitHub 연동을 활성화하지 않음. |

정확한 조회 경로·소스 revision(가능한 경우)은 [research/evidence.json](research/evidence.json)에 기록했다. Hermes/OpenClaw 재귀 트리는 connector 크기 제한으로 HEAD 전체 SHA를 보존하지 못했다. 파일별 조회는 성공했으며 큰 파일은 관련 발췌를 검토했다. 전체 저장소 보안 감사나 설치 호환성 검증을 수행했다는 의미는 아니다.

## 공식 문서에서 확인한 사항
- [Gemini 모델](https://ai.google.dev/gemini-api/docs/models): gemini-3.8-flash와 gemini-3.5-flash-lite가 목록에 있음. 계정별 models API 조회와 실제 응답 검증은 앱 연결 테스트가 수행한다.
- [Gemini 요금](https://ai.google.dev/gemini-api/docs/pricing): 무료/유료 등급 별도, 무료 입력의 서비스 개선 사용 조건. 무료 사용 가능 여부는 계정/지역/시점에 따라 달라짐. gemini-4-argon은 무료 등급 미제공으로 후보에서 제외.
- [Gemini REST 생성 API](https://ai.google.dev/api/generate-content): 서버는 streamGenerateContent SSE 프로토콜 사용. API 키는 x-goog-api-key 헤더로만 전송.
- [Groq 한도](https://console.groq.com/docs/rate-limits): openai/gpt-oss-120b, openai/gpt-oss-20b 확인. RPM/RPD/TPM/TPD는 조직별, 콘솔이 최종 기준. 429/Retry-After, rate-limit 헤더 제공. UI 잔여 수치를 임의 고정하지 않음.
- [Groq Chat](https://console.groq.com/docs/text-chat): OpenAI 호환 chat/completions SSE.
- [Ollama API](https://docs.ollama.com/api), [chat](https://docs.ollama.com/api/chat): 기본 localhost:11434, NDJSON 스트리밍과 마지막 사용량. 클라우드 API도 있으므로 로컬 출처 고정만으로 충분하다고 가정하지 않고 remote model metadata도 확인.
- [Hermes 구조](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture): 도구/에이전트/게이트웨이/기억 분리.
- [OpenClaw 구조](https://docs.openclaw.ai/architecture), [보안](https://docs.openclaw.ai/gateway/security): 단일 신뢰 경계, loopback·인증·권한·격리 분리.
- Context7 선택 ID `/websites/langchain_oss_javascript_langgraph`: [interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts) 및 [functional API](https://docs.langchain.com/oss/javascript/langgraph/functional-api). interrupt/Command.resume, durable checkpointer, 재개 시 부작용 중복 실행 주의. MemorySaver 예제를 영속성 보장으로 해석하지 않음.

## 검증하지 못한 사항
실 API 키와 Ollama 실행 인스턴스가 제공되지 않아 인증된 모델 목록, 무료 계정 여부, 실제 요금, 실제 응답, Windows 설치를 검증하지 못했다. 테스트의 fetch fixture는 프로토콜 계약 검증이며 실제 연결 성공 증거가 아니다. 외부 MCP 설치는 사용자 승인 후 별도 수행한다.

## M3 추가 조사 (2026-10-15)
- Exa: [OWASP SSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html). DNS 검증 후 실제 연결 주소 고정, 리다이렉트 비활성화 원칙 반영.
- GitHub: [Playwright MCP README](https://github.com/microsoft/playwright-mcp/blob/main/README.md). MCP 자체를 보안 격리 경계로 보지 않고 제한된 직접 런타임을 사용.
- Context7 `/microsoft/playwright`: newContext offline/javaScriptEnabled/serviceWorkers 및 route.abort, screenshot 공식 문서 확인.
- Canva AURA 기존 디자인 검색: 결과 없음. 외부 디자인 생성·게시 없이 기존 앱 UI를 확장.
- 설치 manifest: playwright-core 1.64.1(Apache-2.0), ipaddr.js(주소 분류), parse5(원격 HTML을 실행하지 않는 파싱). 실제 버전은 package-lock.json에 고정.

## M4 추가 조사 (2026-10-16)
- Context7 `/websites/langchain_oss_javascript_langgraph`: [persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence), [interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts). 재개 시 노드 재실행과 checkpointer/thread_id, 부작용 중복 방지 필요성을 확인.
- Exa: [durable execution](https://docs.langchain.com/oss/javascript/langgraph/durable-execution), [graph API](https://docs.langchain.com/oss/javascript/langgraph/graph-api). 영속 상태와 결정적 재진입, 영수증 기반 부작용 분리 반영.
- GitHub: [checkpoint base.ts](https://github.com/langchain-ai/langgraphjs/blob/main/libs/checkpoint/src/base.ts), 설치한 MemorySaver의 put/putWrites/getTuple 구현을 읽고 라이브러리 직렬화·pending writes 순서를 보존.
- 설치 버전 @langchain/langgraph 1.5.0, MIT. 위 초기 조사 표의 버전과 설치 시점이 다르며 실제 의존성은 package-lock.json 참조. 내장 node:sqlite와 per-task MemorySaver 스냅샷으로 네이티브 DB 모듈 추가를 피함. Node/LangGraph 업그레이드 시 저장 형식 호환성 검사 필요.
- Canva 기존 AURA 디자인 검색은 이전 단계에서 결과가 없었으며 이번 작업은 기존 UI를 확장했다. 새 외부 디자인·게시물은 만들지 않음.

## M5 추가 조사 (2026-10-16)
- Exa 공식 문서 검색 3개 결과: [LangGraph memory](https://docs.langchain.com/oss/javascript/langgraph/add-memory). 단기 대화 컨텍스트와 세션 간 사용자 기억, 삭제와 요약을 별개 수명으로 처리한다.
- Context7 `/websites/langchain_oss_javascript_langgraph`: [stores](https://docs.langchain.com/oss/javascript/langgraph/stores), [persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence). 체크포인터와 장기 store의 역할 분리 참고. 본 앱은 사용자 승인·삭제 의미를 기존 SQLite에 구현한다.
- GitHub [Hermes memory_tool.py](https://github.com/NousResearch/hermes-agent/blob/main/tools/memory_tool.py): 세션 시작 frozen snapshot 설계 확인. AURA는 삭제 즉시 후속 요청에 반영해야 하므로 매 요청 현재 저장소를 조회한다. 코드를 복제하지 않았다.
- Canva AURA 검색 결과 0개. 기존 로컬 UI의 카드·검토 패턴으로 확장했다.
- 환경 상태: 제한 네트워크 enforced, api.groq.com 미포함. 제공된 키를 외부 도구·저장소·문서로 전송하지 않고 실연결 검증은 보류했다.


## M6 추가 조사 (2026-10-17)
- Context7 `/modelcontextprotocol/typescript-sdk/__branch__v1.x`: Client/StdioClientTransport, connect/listTools/callTool/close, getDefaultEnvironment, maxBufferSize, JSON Schema validator 확인. 설치된 SDK **1.32.1 MIT**를 package-lock.json에 고정했다.
- GitHub [github-mcp-server README](https://github.com/github/github-mcp-server/blob/main/README.md): 로컬 `stdio`, `--read-only`, 개별 `--tools`와 `GITHUB_PERSONAL_ACCESS_TOKEN` 확인. 도구 전체 그룹 대신 검토한 개별 조회 목록을 사용한다.
- GitHub [Serena CLI](https://github.com/oraios/serena/blob/main/src/serena/cli.py): `start-mcp-server --context ide --project`와 기본 stdio 확인.
- GitHub [Repomix MCP](https://github.com/yamadashy/repomix/blob/main/src/mcp/mcpServer.ts): 파일/디렉터리 조회 등록과 패킹 도구 구분.
- Exa [MCP tools specification](https://modelcontextprotocol.io/specification/draft/server/tools): annotations를 신뢰 경계로 사용하지 않고 사용자가 호출을 확인·거절할 수 있도록 설계.
- Canva AURA 기존 디자인 검색 결과 없음. 기존 화면을 확장했으며 외부 디자인 게시 없음. 외부 MCP 서버는 설치하지 않았다.


## M7 추가 조사 (2026-10-17)
- Exa: [W3C WAI 폼 알림](https://www.w3.org/WAI/tutorials/forms/notifications/) — 간결한 오류·수정 행동·관련 입력 위치 안내.
- GitHub: [W3C ARIA modal dialog pattern](https://github.com/w3c/aria-practices/blob/main/content/patterns/dialog-modal/dialog-modal-pattern.html) — 배경 inert, Tab 순환, Esc와 호출 위치 포커스 복원.
- Context7 `/websites/react_dev`: useId를 통한 입력 설명 연결, effect cleanup/DOM focus 참조 패턴.
- Canva 기존 AURA 디자인 검색 결과 없음. 제품의 기존 시각 체계를 확장했고 외부 디자인 게시·의존성 추가 없음.
