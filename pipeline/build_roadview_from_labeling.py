"""시설이미지 라벨링 병합본 → 로드뷰 조사 양식(roadview_survey_filled.csv).

병합본은 `정류장 번호`(물리 표지판 번호) 기준인데 파이프라인의 로드뷰 오버레이
단계(`build_stops.apply_roadview`)는 `관리번호` 기준이라 그대로 못 읽는다.
이 스크립트가 그 사이를 잇는다.

입력: data/춘천시_버스정류장_시설이미지_라벨링_병합.csv  (그늘·의자·도착안내기·쉘터형)
      ※ `쉘터형` 열이 조사양식의 `쉘터` 열로 그대로 나간다.
      data/춘천시_버스정류장_현황조사_해커톤_최종.csv      (정류장번호↔관리번호 브리지)
      app/public/data/stops.json                          (관리번호 실재 확인)
출력: app/public/data/roadview_survey_filled.csv          (ROADVIEW_HEADER 고정)

규칙:
- 값은 `있음`/`없음`만 내보낸다. `미확인`·빈칸은 빈칸으로 두어 기존 상태를 유지시킨다
  (roadview.apply_roadview가 빈칸/미확인을 건드리지 않는다).
- `쉘터형`은 조사양식의 `쉘터` 열로 내보낸다. 쉘터는 대장이 없어 이 로드뷰
  조사가 유일한 근거다.
- 관리번호를 못 찾은 행은 버리고 이유를 출력한다. 조용히 넘어가지 않는다.

사용:
    python build_roadview_from_labeling.py
    python build_roadview_from_labeling.py --check   # 쓰지 않고 결과만 보고
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parent))
from roadview import ROADVIEW_HEADER  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
LABELING = REPO / "data" / "춘천시_버스정류장_시설이미지_라벨링_병합.csv"
BRIDGE = REPO / "data" / "춘천시_버스정류장_현황조사_해커톤_최종.csv"
STOPS_JSON = REPO / "app" / "public" / "data" / "stops.json"
OUT = REPO / "app" / "public" / "data" / "roadview_survey_filled.csv"

ENC = "utf-8-sig"
SURVEYOR = "시설이미지 라벨링(병합본)"

# 라벨링 컬럼 -> 조사양식 컬럼 (조사양식 열 순서와 동일하게 유지)
COL_MAP = {"그늘": "그늘", "의자": "의자", "도착안내기": "도착안내기", "쉘터형": "쉘터"}
EMITTED = {"있음", "없음"}  # 그 외(미확인·빈칸)는 빈칸으로 내보낸다


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding=ENC, newline="") as fh:
        return [{k: (v or "").strip() for k, v in row.items()} for row in csv.DictReader(fh)]


def main() -> None:
    ap = argparse.ArgumentParser(description="라벨링 병합본 → 로드뷰 조사 양식")
    ap.add_argument("--check", action="store_true", help="파일을 쓰지 않고 결과만 보고")
    args = ap.parse_args()

    labeling = read_csv(LABELING)
    bridge_rows = read_csv(BRIDGE)
    stops = json.loads(STOPS_JSON.read_text(encoding="utf-8"))["stops"]

    # 정류장번호 -> 관리번호. 브리지 CSV를 먼저 쓰고, 없으면 stops.json의 stopNo로 폴백한다.
    by_stop_no = {r["정류장 번호"]: r["관리번호"] for r in bridge_rows if r.get("정류장 번호")}
    name_by_id = {str(s["id"]): s["name"] for s in stops}
    fallback = {}
    for s in stops:
        fallback.setdefault(str(s["stopNo"]).strip(), []).append(str(s["id"]))

    out_rows: list[list[str]] = []
    dropped: list[tuple[str, str]] = []
    emitted = {col: 0 for col in COL_MAP}

    for row in labeling:
        stop_no = row.get("정류장 번호", "")
        sid = by_stop_no.get(stop_no, "")
        if sid not in name_by_id:
            candidates = fallback.get(stop_no, [])
            if len(candidates) == 1:
                sid = candidates[0]
            else:
                reason = "관리번호 미상" if not candidates else f"stopNo 중복 {candidates}"
                dropped.append((stop_no, reason))
                continue

        values = []
        for src_col, _ in COL_MAP.items():
            raw = row.get(src_col, "")
            value = raw if raw in EMITTED else ""
            if value:
                emitted[src_col] += 1
            values.append(value)
        그늘, 의자, 도착안내기, 쉘터 = values

        notes = [n for n in (row.get("비고", ""),) if n]

        out_rows.append(
            [
                sid,
                name_by_id[sid],
                그늘,
                의자,
                도착안내기,
                쉘터,
                "",  # 촬영시점 — 병합본에 없음
                SURVEYOR,
                " / ".join(notes),
            ]
        )

    print(f"라벨링 {len(labeling)}행 → 조사양식 {len(out_rows)}행")
    for col, n in emitted.items():
        print(f"  {col:6s} 반영값(있음/없음) {n:3d}  (나머지는 빈칸=기존 유지)")

    if dropped:
        print(f"\n⚠️ 관리번호를 못 찾아 버린 행 {len(dropped)}건")
        for stop_no, reason in dropped[:20]:
            print(f"   정류장번호 {stop_no}: {reason}")
    else:
        print("\n관리번호 매핑 실패 없음 — 163행 전부 연결됨")

    if args.check:
        print("\n(--check: 파일을 쓰지 않았습니다)")
        return

    with OUT.open("w", encoding=ENC, newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(ROADVIEW_HEADER)
        writer.writerows(out_rows)
    print(f"\n생성: {OUT}")
    print("다음: python build_stops.py  (로드뷰 오버레이 단계가 이 파일을 읽는다)")


if __name__ == "__main__":
    main()
