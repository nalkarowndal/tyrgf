# AURA Agent

한국어로 편하게 대화하는 로컬 AI 도우미. **M0–M2 초기 구현 버전**입니다. 실제 공급자 어댑터와 명시적 모의 공급자를 제공하며, 자율 에이전트와 Windows 설치 패키지는 준비 중입니다.

![AURA 대화 화면](docs/qa/desktop-home.png)

## 실행

Node.js **24 이상**에서:

```sh
npm ci
npm run build
npm start
```

[http://127.0.0.1:4317](http://127.0.0.1:4317)을 엽니다. 개발 모드는 `npm run dev`입니다. 서버는 localhost에만 바인딩합니다. `AURA_PORT`, `AURA_DATA_DIR`로 포트와 데이터 경로를 지정할 수 있습니다.

## 지금 사용할 수 있는 기능

- 5단계 한국어 초기 설정, 라이트/다크/시스템 테마, 반응형 화면
- Gemini / Groq / 로컬 Ollama 어댑터, 실제 연결 테스트, 모델 목록 확인
- 오프라인 체험용 **모의 AI**: 실제 AI 응답과 명확히 구분
- 스트리밍, 중단, 대화 저장/검색/이름변경/삭제/편집/재생성/JSON 내보내기
- 텍스트 파일 첨부, Markdown과 코드 복사, 사용량 추정
- 외부 전송 기본 차단, 동의 확인, 모델 자동 유료 전환 없음

API 키는 서버 메모리에만 저장합니다. 서버를 재시작하면 다시 입력해야 합니다. **무료 계정 여부는 공급자 콘솔에서 직접 확인해야 하며, 앱이 유료 계정의 실제 과금을 차단하지는 못합니다.**

실제 API 키와 Ollama 인스턴스가 제공되지 않아 개발 검증은 모의 공급자 및 프로토콜 fixture로 진행했습니다. 실제 서비스 연결 성공을 주장하지 않습니다.

## 검증

```sh
npm run check
npx playwright install chromium
npm run test:e2e
```

E2E는 시스템 Chromium이 있으면 사용하고, 없으면 Playwright 브라우저를 사용합니다. `CHROMIUM_PATH`로 실행 경로를 지정할 수 있습니다. 테스트는 임시 SQLite 디렉터리를 사용합니다.

## 문서

- [사용 설명서](docs/USER_GUIDE.md)
- [처음 설정](docs/ONBOARDING_GUIDE.md)
- [구현 단계와 후속 조건](docs/CODEX_PHASES.md)
- [조사 근거·라이선스](docs/RESEARCH_REFERENCES.md)
- [시스템 구조](docs/SYSTEM_ARCHITECTURE.md) · [보안 및 한계](docs/SECURITY_DESIGN.md)
- [테스트와 시각 QA](docs/TEST_QA_PLAN.md) · [구현 기록](docs/IMPLEMENTATION_LOG.md)

현재 파일 시스템 도구, 브라우저 제어, 터미널, MCP, 장기 기억, 스킬 실행은 비활성입니다. 다음 단계에서 실행 승인·경로 제한·격리·재개 검증을 갖춘 후 활성화합니다.
