# M9 Implementation Plan

> For agentic workers: use superpowers:executing-plans. Native implementation in this session, one independent final review.

**Goal:** 런타임 포함 Windows 설치 패키지와 암호화 백업/복원.
**Architecture:** 기존 React/Express/SQLite 유지, 오프라인 백업 도구와 esbuild 배포 번들, NSIS per-user 설치.
**Tech Stack:** Node24, TypeScript, Zod, AES-GCM/scrypt, esbuild, NSIS, PowerShell.
**Spec:** M9_DESIGN.md

## Global Constraints
- 실제 사용자 키/실 API 호출 없음. 외부 MCP 자동 설치 없음.
- 데이터 경로와 앱 설치 경로 분리, localhost만 사용.
- 백업은 32MiB 이하, 암호는 12~256자, GCM 태그16바이트, salt16/iv12바이트.
- 실제 Windows 실행/서명 미검증은 그대로 보고.

## Review Focus
- 복원 입력에 임의 SQL/경로/승인/외부 전송 상태를 넣어도 실행되지 않아야 한다.
- 잘못된 암호/변조/참조 오류에서 기존 DB가 보존되어야 한다.
- 앱 두 개/복원 동시 실행은 DB 교체 전에 차단해야 한다.
- 한글·공백 설치 경로와 개발 도구 없는 번들 실행을 검증한다.
- 업데이트/제거가 사용자 데이터에 손대지 않아야 한다.

## Task 1 — Backup and runtime lock
Files: apps/server/src/{backup,backup-cli,runtime-lock}.ts, tests/backup.test.ts.
Interfaces: acquireDataLock(dir): Promise<release>; seal/openBackup; exportBackup/restoreBackup.
- [x] 암호화/검증/비밀 제외/원본 보존/잠금 테스트 RED.
- [x] 백업과 임시 DB 교체, 안전 사본, CLI stdin 암호 구현.
- [x] 해당 테스트 GREEN 및 전체 검사.

## Task 2 — Standalone distribution
Files: apps/server/src/index.ts, mcp-runtime.ts, scripts/{package,launcher}.mjs, scripts/windows/*, scripts/{smoke-package,verify-package}.mjs.
- [x] source 디렉터리 없이 실제 배포 번들 시작·대화·MCP·종료 검사.
- [x] Windows Node ZIP 공식 checksum 검증 후 package 생성, per-user NSIS/옵션 자동 시작/제거/수동 업데이트 안내.
- [x] Windows 산출물 생성 및 Linux 번들 smoke 검증.

## Task 3 — Handoff
Files: README, docs/DEPLOYMENT_GUIDE.md, USER_GUIDE, IMPLEMENTATION_LOG, CI.
- [x] 사용자 백업/복원 안내와 패키지 사용 제한 반영.
- [x] check/E2E/audit, 독립 리뷰 중요 수정, 로컬 커밋. 게시/업로드 없음.

Windows 실기기 설치·실행·업데이트·제거·Edge 및 코드 서명은 이 구현 계획과 별도 출시 게이트이며 미완료다. M9_RELEASE_REPORT.md 참조.
