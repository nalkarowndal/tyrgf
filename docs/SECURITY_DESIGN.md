# 보안 설계와 한계

## 현재 경계
단일 로컬 사용자용이다. Express는 127.0.0.1에만 바인딩하고 정확한 localhost/127.0.0.1 + port Host, 동일 출처 Origin, Sec-Fetch-Site를 검사한다. 쓰기 API에는 서버 재시작마다 바뀌는 랜덤 CSRF 토큰이 필요하다. CORS를 개방하지 않는다. 다른 로컬 프로세스·같은 OS 계정 사용자를 적대적 다중 사용자로 격리하는 인증 시스템은 아니다.

정적 배포에 CSP(default/script/connect self, object none, frame-ancestors none), nosniff, no-referrer, no-store, frame deny를 적용한다. Markdown raw HTML을 실행하지 않으며 외부 이미지를 로드하지 않는다. 외부 링크는 사용자가 클릭하고 새 탭 noreferrer로 연다.

## 비밀·저장소
API 키는 비밀번호 입력을 거쳐 같은 출처 서버 메모리 Map에 저장한다. 설정/SQLite/로그/오류/응답/export에 키를 포함하지 않는다. 재시작 시 재입력한다. 브라우저 입력 시점에는 키가 메모리에 존재하므로 악성 브라우저 확장까지 보호한다고 주장하지 않는다. OS vault는 M9 검토 대상이며 아직 구현하지 않았다.
데이터 디렉터리는 생성 시 0700, SQLite는 0600으로 설정한다. SQLite는 WAL, foreign_keys, secure_delete 사용. 디스크 암호화는 OS에 의존한다. 삭제는 논리 삭제이며 기존 백업·WAL·SSD 흔적의 포렌식 완전 삭제를 보장하지 않는다.

## 외부 호출
Gemini/Groq 고정 HTTPS 주소, Ollama loopback 11434만 사용한다. API 키·짧은 테스트 질문·선택 대화 내용의 전송은 사용자가 서비스 선택/동의 후 요청할 때만 수행한다. 기본 공급자는 오프라인 mock. provider redirect 금지, Ollama remote 모델 사전 차단. 네트워크 정책 자체를 OS 방화벽 수준으로 설정하는 기능은 없다.

## 현재 위험 도구 없음
파일 경로 접근, shell, 설치, 브라우저 입력, GitHub push, 외부 메시지 발송, MCP 실행 엔드포인트는 없다. 에이전트 모드는 비활성이다. 따라서 도구 실행 샌드박스가 구현되었다고 주장하지 않는다. M3는 경로 realpath/심볼릭 링크/경쟁 상태 방어, 변경 미리보기·한 번 승인·해시 바인딩·감사 기록이 먼저 필요하다.

## 복구와 한계
동일 대화의 생성 중 수정·삭제 금지. 응답 중단은 AbortSignal로 공급자 요청까지 전파. UI 중단은 이미 공급자가 소비한 사용량을 취소하지 않는다. 프롬프트 인젝션에 대한 system 안내는 보조 수단이며 강한 격리를 대체하지 않는다. M2는 실행 도구가 없지만 악성 문서가 답변 내용에 영향을 줄 가능성은 있다.
