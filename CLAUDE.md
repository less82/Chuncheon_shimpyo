# CLAUDE.md — 쉼표 정류장

## 팀 협업 규칙
**[AGENTS.md](./AGENTS.md) 를 반드시 따르세요.** 팀의 브랜치·커밋·PR 규칙이 거기에 있습니다(Codex 팀원과 공용). 요약:

- **사람별 브랜치**에서만 작업 (`kook`/`oh`/`master` 등). `main`·남의 브랜치에 직접 push 금지.
- **작업이 일단락되면 자기 브랜치에 커밋+push.** 응답 종료 시 `Stop` 훅(`scripts/auto-push.sh`)이 자동으로 해줍니다.
  - `main`/`master`에서는 자동 푸시하지 않음(가드). 변경 없으면 커밋 안 함.
- **`main` 병합은 PR 리뷰로만.** 직접 머지 금지.

## 본선 작업 (2026-07-16 v3.1 — 현행 기준 문서)
- **계획(실행 기준):** `docs/superpowers/plans/2026-07-16-본선.md` — 최상단 **🛑 즉시 중단 조건 3가지**를 다른 무엇보다 먼저 읽을 것.
- 설계: `docs/specs/2026-07-16-본선-design.md` · 전략: `docs/본선_전략.md` · 사용자 흐름: `docs/사용자_흐름.md` · 검토 이력: `docs/superpowers/plans/codex_반박의견.md`
- 구 v1/v2 spec·plan(2026-07-15)은 삭제됨(git 이력에만 존재) — 참조 금지.
- 핵심 원칙: **no(확인된 없음)와 unknown(미확인)을 같은 변수·순위 효과로 합치지 않는다.** B2C는 점수 숫자 비표시. 표현 금지어: "현장 확인", "수혜", "일평균", "그늘 4곳뿐", 조건 없는 "오프라인 동작".

## 이 프로젝트 핵심
- **앱:** `app/` — Vite + React 19 + TS, Leaflet + OSM(무키), PWA 오프라인. 고령자용 시민앱 + 관리자 대시보드.
- **데이터 파이프라인:** `pipeline/` — 6개 춘천시 CSV(cp949) → `app/public/data/stops.json`(정류장 1890개).
- **계약(스키마):** `app/src/types/stop.ts` — 바꾸려면 팀 합의.
- **정직성 규칙:** 시설 3상태(있음/없음/미확인), 근거 없는 "없음" 금지, "현장 확인" 문구 금지. 상세: `docs/데이터_현황.md`.
- **비밀키:** TAGO 키는 `app/.env`(gitignore)에만. 커밋·채팅 금지.

## 자주 쓰는 명령
```bash
cd app && npm run dev        # 개발 서버
cd app && npm test           # 프론트 테스트(vitest)
cd app && npm run build      # 정적 빌드(PWA)
cd pipeline && python build_stops.py   # stops.json 재생성
```
