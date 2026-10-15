# 테스트 및 시각 QA

## 실행 결과 (2026-10-15)
검증 환경: Linux, Node 24.19.0, 시스템 Chromium. `npm run check` (타입 검사, ESLint, Vitest, Vite 빌드) 통과. Vitest 3개 파일 **32개 테스트 통과**. `npm run test:e2e` **3개 사용자 시나리오 통과**. 운영 의존성 `npm audit --omit=dev` 알려진 취약점 **0건**. Windows CI workflow는 작성했지만 원격 실행하지 않았다.

## 기능·보안 검사
- API 기본값 mock/외부 전송 차단, Host/Origin/토큰 검사, 대소문자 경로 우회 차단.
- 설정 검증, 키 DB/응답/export 비노출, 유료 모델·임의 Ollama 출처 거절.
- 대화 스트리밍/재시작 영속성, 생성·검색·제목 변경·편집·재생성·삭제·내보내기.
- 진행 중 중단→부분 응답 보존, 동일 대화 동시 변경 409, 재시작 interrupted 복구.
- 분할 UTF-8 SSE, CRLF, 마지막 줄 개행 없는 NDJSON, 잘못된 이벤트, 불완전 스트림.
- Gemini systemInstruction/생성 프로토콜/사고 텍스트 제외, Groq delta/usage, Ollama show/chat 및 remote 모델 차단.
- 429 단기 제한 1회 재시도, 긴 제한 즉시 안내, 취소 전파.
- React Testing Library: 클라우드 동의 기본 비선택, 키 password 입력, 실패 시 복구 안내 및 성공 표시 금지.

## E2E 시나리오
1. 첫 실행 5단계 → 명시된 모의 연결 테스트 → 채팅 → 새로고침 후 기록 → 제목 변경 → 재생성 → 테마 저장 → 연결 설정 저장 뒤 테마 보존 → 모바일 메뉴.
2. 대화 A 편집 중 B 이동 → 초안/편집 상태 분리. A 응답 지연 중 B 이동 → A 내용이 B 화면에 나타나지 않음.
3. 동의 없는 Groq 연결 오류 → 모의 공급자로 복구 → 텍스트 첨부 → 질문 편집 → 본문 검색 → 삭제 확인.

첫 구현 전에 테스트 실패를 확인했다. 이후 Zod partial 기본값 덮어쓰기, 별도 폼의 오래된 설정 저장, mixed-case 토큰 우회는 회귀 테스트 실패 후 수정했다. 대화 상태 문제는 독립 브라우저 재현과 라우트 전환 E2E로 검증했다. fixture 초기화는 응답 헤더뿐 아니라 스트림 본문 종료까지 기다려야 함을 수정했다.

## 실제 시각 검수
스크린샷을 모델이 열어 직접 검수했다. 1280×800 데스크톱(초기 환영 캡처는 1280×720), 768×1024 태블릿, 390×844 모바일에서 한글 줄바꿈·카드·버튼·모달·다크 대비·메뉴를 확인했다. 주요 캡처:
- qa/desktop-home.png, desktop-chat.png
- qa/desktop-onboarding.png, desktop-provider-setup.png
- qa/mobile-onboarding.png, mobile-home-dark.png
- qa/desktop-settings-dark.png, tablet-settings.png, mobile-settings.png
- qa/connection-error.png

처음 캡처에서 설정 저장 후 온보딩 재등장과 짧은 높이에서 사이드바 overflow를 발견해 수정했다. 모바일 메뉴의 닫힘 전환 중 캡처를 막기 위해 screenshot animations=disabled로 안정된 상태를 다시 확보한다. 모바일 가로 overflow는 자동 검사도 포함한다. 시각 검수는 자동 기능 테스트 통과와 별도로 진행했다.

## 미검증·후속 조건
실 API 키 없음: Gemini/Groq 인증 응답·계정 요금제·실 사용 한도는 미검증. Ollama 실 인스턴스 없음: 설치 모델 실제 추론 미검증. fetch fixture를 실 API 연결 증거로 취급하지 않는다. M3 도구 승인, M4 두 도구 복합 작업, M5 기억 삭제, M6 MCP 설치는 구현 전이므로 테스트 통과로 기록하지 않는다. Windows/macOS·다중 브라우저·실제 초보자 사용성 실험·OS credential vault는 후속 검증이다.

빌드 경고: 현재 단일 프론트엔드 bundle이 약 588KB(압축 약 182KB)로 Vite 권고 기준을 넘는다. Zod 내부 PURE annotation 경고도 발생하지만 빌드 실패는 아니다. 코드 분할은 후속 성능 개선 항목이다.
