# Claude Code 안내

## 협업 규칙

[`AGENTS.md`](AGENTS.md)를 따른다. 브랜치·커밋·푸시 규칙을 이 파일에 복사하지 않는다.

## 현재 문서

작업 전 [`docs/기획_INDEX.md`](docs/기획_INDEX.md)를 읽는다. 현재 기준은 `docs/현재/`의 네 문서다. `specs/`, `superpowers/plans/`, `OPUS_핸드오프.md`, `QA_체크리스트.md`, `보안점검.md`는 과거 기록이다.

## 핵심 경로

- 프론트엔드: `app/`
- 데이터 파이프라인: `pipeline/`
- 원본 데이터: `data/`
- 정류장 스키마: `app/src/types/stop.ts`

시설은 `있음/없음/미확인` 3상태로 관리한다. 근거 없는 `없음`을 만들지 않는다. 비밀키는 커밋·채팅·PR에 넣지 않는다.
