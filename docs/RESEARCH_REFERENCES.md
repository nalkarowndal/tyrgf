# 조사 근거와 채택 결정

확인일: 2026-10-15 (Asia/Seoul). GitHub connector로 디렉터리, 실제 관련 소스, manifest, LICENSE를 읽었다. Exa는 공식 문서 추출, Context7은 LangGraph 승인·재개 패턴 확인에 사용했다. 아래 버전은 조회 당시 기본 브랜치의 manifest 값이며 최신 정식 릴리스라는 뜻은 아니다. 실행 설치 검증과 소스 검토를 구분한다. 참고 프로젝트를 설치하거나 코드를 제품에 복사하지 않았다.

| 프로젝트 | 코드에서 확인한 설계 / 버전·조건 | AURA 결정과 제약 |
|---|---|---|
| [Hermes](https://github.com/NousResearch/hermes-agent) | `tools/registry.py` 중앙 schema/handler/가용성 등록. `pyproject.toml` 0.0.0, Python >=3.11,<3.15; 주석은 현재 설치에서 Python 3.14 권장/지원 정책을 별도로 설명. MIT | M3 Tool Registry 개념 참고. 전체 Python 런타임 포크는 설치 부담이 커서 제외. 0.0.0은 릴리스 번호로 사용하지 않음. |
| [OpenClaw](https://github.com/openclaw/openclaw) | `src/infra/exec-approvals.ts` 승인 정책·allowlist·snapshot 로딩 및 socket token redaction. 2026.10.3, Node >=24.16 <25 또는 >=26.1. MIT | 로컬 게이트웨이 및 권한 경계 참고. 공개 네트워크·메시징 기능은 도입하지 않음. |
| [REA](https://github.com/morluto/rea) | `ReverseEngineeringService.ts` typed command port, 취소/시간 제한, 프로세스 감독 인터페이스. 6.5.0, Node ^22.19 / ^24.11 / >=26. MIT, 외부 분석 도구는 별도 조건 | 소스 없는 승인된 프로그램 분석 때만 선택 검토. M0–M2에서는 설치/실행 없음. |
| [Serena](https://github.com/oraios/serena) | `src/serena/agent.py` 프로젝트·언어 서버·ToolRegistry, 명시적 활성 도구 목록. 2.0.1.dev0, Python >=3.11,<3.15 | LICENSE는 **Serena application GPL-3.0-or-later, SolidLSP MIT**. 전체를 MIT로 간주하면 안 됨. M6 선택형 독립 MCP 연결만 검토. 배포 시 해당 버전 라이선스 재검토. |
| [Repomix](https://github.com/yamadashy/repomix) | `src/core/packager.ts` search→collect→process→safety→output/metrics, `confineToBaseDir` 선택 옵션. 1.18.1, Node >=22. MIT | M6 프로젝트 요약 입력 어댑터 후보. 비밀 검색 결과와 경로 경계는 자체 검증 필요. 안전 옵션 기본값을 과신하지 않음. |
| [Playwright MCP](https://github.com/microsoft/playwright-mcp) | `index.js`는 playwright-core tools.createConnection을 재노출. 0.0.83, Node >=18. Apache-2.0 | 진입점에서 브라우저 구현 전체를 검증한 것은 아님. M3 브라우저는 격리 프로필·대상 제한·입력 승인 필요. QA용 Playwright만 현재 설치. |
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
