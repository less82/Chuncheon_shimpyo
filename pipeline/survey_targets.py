"""Task A5 — 로드뷰 조사 대상 목록 생성기.

A1(`quality_report.compute_priority_ranking`)이 산출한 조사 우선순위를
재사용해 상위 n곳을 뽑고, 순위 계산에서 제외된 "수요 미확인(noDemand)"
정류장도 일부 섞어 사람이 열어볼 조사 후보 CSV를 만든다.

이 모듈은 stops.json을 읽기만 하며 stops.json/build_stops.py를 건드리지
않는다. 산출되는 survey_targets.csv는 재생성 가능한 워크리스트일 뿐이라
저장소에 커밋하지 않는다(스크립트/테스트만 커밋 대상).
"""
from __future__ import annotations

import csv
import os

import pandas as pd

from attach_demand import _norm
from quality_report import _midday_sum_from_byhour, _unknown_count, compute_priority_ranking

_HERE = os.path.dirname(os.path.abspath(__file__))
_DEFAULT_OUT = os.path.abspath(os.path.join(_HERE, "..", "data", "survey_targets.csv"))

COLUMNS = ["관리번호", "정류장명", "lat", "lng", "한낮승차", "미확인시설목록", "로드뷰URL"]

_KIND_TO_KOR = {
    "shade": "그늘",
    "seat": "의자",
    "light": "조명",
    "sign": "도착안내기",
}
# facilities dict 순서(그늘,의자,조명,도착안내기)로 고정해 표기 순서를 안정화한다.
_KIND_ORDER = ("shade", "seat", "light", "sign")


def _roadview_url(lat: float, lng: float) -> str:
    return f"https://map.kakao.com/link/roadview/{lat},{lng}"


def _unknown_facility_list(facilities: dict) -> str:
    names = [_KIND_TO_KOR[k] for k in _KIND_ORDER if facilities[k]["status"] == "unknown"]
    return ",".join(names)


def _to_row(stop: dict, midday) -> dict:
    return {
        "관리번호": stop["id"],
        "정류장명": stop["name"],
        "lat": stop["lat"],
        "lng": stop["lng"],
        "한낮승차": midday if midday is not None else "",
        "미확인시설목록": _unknown_facility_list(stop["facilities"]),
        "로드뷰URL": _roadview_url(stop["lat"], stop["lng"]),
    }


def survey_targets(stops: list[dict], n: int = 150, nodemand_n: int | None = None) -> pd.DataFrame:
    """조사 후보 목록.

    상위 n곳(A1 우선순위 재사용, 수요 매칭된 정류장 대상)에
    수요 미확인(noDemand) 정류장 중 미확인 시설이 많은 순으로 일부(nodemand_n)를 더한다.
    n/nodemand_n이 대상보다 크면 있는 만큼만 반환한다.
    """
    if nodemand_n is None:
        nodemand_n = max(1, n // 10)

    master_like = [{"id": s["id"], "name": s["name"]} for s in stops]

    midday_by_name: dict[str, int] = {}
    unk_by_id: dict[str, int] = {}
    for s in stops:
        unk_by_id[s["id"]] = _unknown_count(s["facilities"])
        d = s.get("demand")
        if d is None:
            continue
        midday_by_name[_norm(s["name"])] = _midday_sum_from_byhour(d["byHour"])

    ranked = compute_priority_ranking(master_like, midday_by_name, unk_by_id)
    top_ranked = ranked[:n]

    by_id = {s["id"]: s for s in stops}
    rows = [_to_row(by_id[r["id"]], r["midday"]) for r in top_ranked]

    nodemand_stops = [s for s in stops if s.get("demand") is None]
    nodemand_stops.sort(key=lambda s: _unknown_count(s["facilities"]), reverse=True)
    for s in nodemand_stops[:nodemand_n]:
        rows.append(_to_row(s, None))

    return pd.DataFrame(rows, columns=COLUMNS)


def write_survey_targets_csv(df: pd.DataFrame, path: str = _DEFAULT_OUT) -> str:
    """조사 후보 목록을 CSV로 저장한다(utf-8-sig, 한글 안깨짐).

    재생성 가능한 워크리스트일 뿐이며 저장소 커밋 대상이 아니다.
    """
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    df.to_csv(path, index=False, encoding="utf-8-sig", quoting=csv.QUOTE_MINIMAL)
    return path


if __name__ == "__main__":
    import json

    stops_json = os.path.abspath(os.path.join(_HERE, "..", "app", "public", "data", "stops.json"))
    with open(stops_json, encoding="utf-8") as f:
        stops = json.load(f)["stops"]
    df = survey_targets(stops)
    out = write_survey_targets_csv(df)
    print(f"조사 대상 {len(df)}곳 -> {out}")
