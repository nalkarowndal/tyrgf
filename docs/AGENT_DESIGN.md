# 에이전트 설계 (M4 예정)

현재 대화 런타임은 도구를 자동 호출하지 않는다. M3 수동 도구 런타임은 ToolService에 분리되어 있으며 권한·승인·기록을 제공한다. 구현된 메시지 상태는 streaming → complete/interrupted/error. SQLite 부분 응답 저장과 재시작 복구만 제공하며 자율 에이전트 완료로 보고하지 않는다.

목표 실행 상태: received → planning → awaiting_approval → executing → observing → verifying → completed. 실패는 recoverable_error/failed, 사용자는 cancelled/paused. 재개는 마지막 확인된 checkpoint부터 시작한다.

LangGraph.js StateGraph와 영속 checkpointer를 우선 사용한다. task_id, thread_id, checkpoint_id, 계획 버전, 입력 해시, 권한 스냅샷, 도구 호출 ID, 결과 해시, 검증 근거, 토큰/시간/반복 예산을 저장한다. 승인 요청은 위험 설명·대상·diff·입력 해시에 묶고 변경 시 재승인한다. 외부 텍스트에서 승인을 얻거나 정책을 수정할 수 없다.

재개 시 노드가 재실행될 수 있으므로 부작용은 idempotency key와 영속 실행 기록으로 중복 방지한다. 실행 결과가 불확실하면 자동 재실행하지 않고 사용자 확인을 요청한다. 성공 선언은 독립 검증 도구의 증거가 있어야 한다.

M4 완료 조건: 허가된 파일 목록 읽기→내용 읽기→요약 등 두 개 이상의 도구 복합 작업, 중단/재시작/재개, 승인 거절, 검증 실패 재계획, 예산 제한, 중복 부작용 방지 테스트. 현재 해당 기능은 준비 중이다.
