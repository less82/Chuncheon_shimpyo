"""Task A7 — B2C "앉아서 기다리는 길" 추천의 실제 커버리지 측정.

목적지 길찾기(app/src/features/trip)에서 "확인된 시설 우선"(comfort) 정렬이
얼마나 실효성이 있는지를 stops.json 전수로 검증한다. 각 정류장을 "출발 지점"
삼아 반경 내 후보 정류장들을 nearest(최단 도보) / comfort(확인된 시설 우선)
두 기준으로 비교한다. 프론트 comfortSort.ts(A7)의 상수(도보속도 80m/분,
PENALTY_PER_MIN=0.15, 반경 500m — planTrip 기본값과 동일)를 그대로 재현한다.

이 리포트는 docs/데이터_검증.md에 "## 커버리지" 절로 append된다.
낮은 지표는 낮은 대로 정직하게 기록한다 — 커버리지가 낮다면 조사(A5)가
그만큼 커버리지를 늘릴 여지가 있다는 뜻이다.
"""
from __future__ import annotations

import json
import os
from statistics import mean, median

from geo import haversine

_HERE = os.path.dirname(os.path.abspath(__file__))
_STOPS_JSON = os.path.abspath(os.path.join(_HERE, "..", "app", "public", "data", "stops.json"))
_DEFAULT_REPORT = os.path.abspath(os.path.join(_HERE, "..", "docs", "데이터_검증.md"))

# comfortSort.ts(A7) 상수와 동일.
WALK_RADIUS_M = 500
WALK_SPEED_M_PER_MIN = 80
# app/src/features/trip/comfortSort.ts의 PENALTY_PER_MIN과 반드시 일치
PENALTY_PER_MIN = 0.15


def _load_stops() -> list[dict]:
    with open(_STOPS_JSON, encoding="utf-8") as f:
        data = json.load(f)
    return data["stops"]


def _comfort_score(stop: dict) -> float:
    """comfort.ts comfortScore(주간, night=False)와 동일 — seat·shade yes만 가점."""
    f = stop["facilities"]
    seat_yes = 1 if f["seat"]["status"] == "yes" else 0
    shade_yes = 1 if f["shade"]["status"] == "yes" else 0
    return (seat_yes + shade_yes) / 2


def _has_confirmed_comfort_facility(stop: dict) -> bool:
    f = stop["facilities"]
    return f["seat"]["status"] == "yes" or f["shade"]["status"] == "yes"


def _walk_min(dist_m: float) -> int:
    return max(1, round(dist_m / WALK_SPEED_M_PER_MIN))


def compute_coverage(stops: list[dict] | None = None) -> dict:
    """stops.json 전 정류장을 "출발 지점"으로 삼아 반경 내 후보를 비교.

    반환:
      total_origins: 반경 내 후보가 1개 이상인 출발지 개수(분모).
      differ_count / differ_ratio: (a) nearest와 comfort가 다른 후보를 고르는 비율.
      confirmed_ratio: (b) 반경 내 확인된 시설(의자 or 그늘 yes) 후보가 존재하는 비율.
      extra_walk_min: (c) differ한 경우의 추가 도보시간(분) 목록·요약통계.
    """
    if stops is None:
        stops = _load_stops()

    total_origins = 0
    differ_count = 0
    confirmed_count = 0
    extra_walks: list[int] = []

    for origin in stops:
        candidates = []
        for cand in stops:
            if cand["id"] == origin["id"]:
                continue
            dist = haversine(origin["lat"], origin["lng"], cand["lat"], cand["lng"])
            if dist <= WALK_RADIUS_M:
                candidates.append((cand, dist))

        if not candidates:
            continue
        total_origins += 1

        # nearest: 최단 도보.
        nearest_stop, nearest_dist = min(candidates, key=lambda c: c[1])
        nearest_walk = _walk_min(nearest_dist)

        # comfort: (comfortScore - walkMin*PENALTY_PER_MIN) 최대.
        def _rank(c):
            stop, dist = c
            wm = _walk_min(dist)
            return _comfort_score(stop) - wm * PENALTY_PER_MIN

        comfort_stop, comfort_dist = max(candidates, key=_rank)
        comfort_walk = _walk_min(comfort_dist)

        if comfort_stop["id"] != nearest_stop["id"]:
            differ_count += 1
            extra_walks.append(comfort_walk - nearest_walk)

        if any(_has_confirmed_comfort_facility(c) for c, _ in candidates):
            confirmed_count += 1

    differ_ratio = differ_count / total_origins if total_origins else 0.0
    confirmed_ratio = confirmed_count / total_origins if total_origins else 0.0

    extra_walk_summary = {
        "n": len(extra_walks),
        "mean": mean(extra_walks) if extra_walks else 0.0,
        "median": median(extra_walks) if extra_walks else 0.0,
        "max": max(extra_walks) if extra_walks else 0,
        "min": min(extra_walks) if extra_walks else 0,
    }

    return {
        "total_origins": total_origins,
        "differ_count": differ_count,
        "differ_ratio": differ_ratio,
        "confirmed_count": confirmed_count,
        "confirmed_ratio": confirmed_ratio,
        "extra_walk_min": extra_walks,
        "extra_walk_summary": extra_walk_summary,
    }


def _extra_walk_histogram(extra_walks: list[int]) -> list[tuple[str, int]]:
    buckets = [
        ("0분(같은 도보시간)", lambda m: m == 0),
        ("1분", lambda m: m == 1),
        ("2분", lambda m: m == 2),
        ("3~5분", lambda m: 3 <= m <= 5),
        ("6분 이상", lambda m: m >= 6),
    ]
    rows = []
    for label, pred in buckets:
        count = sum(1 for m in extra_walks if pred(m))
        rows.append((label, count))
    return rows


def _fmt_table(headers: list[str], rows: list[list]) -> str:
    lines = ["| " + " | ".join(headers) + " |", "|" + "|".join(["---"] * len(headers)) + "|"]
    for r in rows:
        lines.append("| " + " | ".join(str(c) for c in r) + " |")
    return "\n".join(lines)


def generate_coverage_section(out_path: str = _DEFAULT_REPORT) -> str:
    result = compute_coverage()
    extra_walks = result["extra_walk_min"]
    summary = result["extra_walk_summary"]

    lines: list[str] = []
    lines.append("## 커버리지")
    lines.append("")
    lines.append(
        "B2C 목적지 길찾기(`/go`)의 \"시설 확인된 곳 우선\"(comfort) 정렬이 "
        "실제로 얼마나 다른 추천을 만들고, 얼마나 유효한지를 stops.json 전 정류장 "
        f"({len(_load_stops())}개)에 대해 측정한다. 방법: 각 정류장을 \"출발 지점\"으로 삼아 "
        f"반경 {WALK_RADIUS_M}m(도보속도 {WALK_SPEED_M_PER_MIN}m/분 — planTrip 기본값과 동일) 내 "
        "후보 정류장들을 nearest(최단 도보) 기준과 comfort(확인된 시설 우선, "
        f"comfortScore − walkMin×{PENALTY_PER_MIN}) 기준으로 각각 1곳씩 골라 비교한다. "
        "haversine 거리 계산은 pipeline/geo.py를 재사용한다."
    )
    lines.append("")

    lines.append(
        f"반경 내 후보가 1곳 이상 있는 출발 지점은 {result['total_origins']}곳이다(전체 정류장 기준 분모)."
    )
    lines.append("")

    lines.append("### (a) 정렬 기준에 따라 다른 후보를 고르는 비율")
    lines.append("")
    lines.append(
        f"nearest와 comfort 기준이 서로 다른 후보를 1위로 고르는 출발 지점은 "
        f"{result['differ_count']}/{result['total_origins']}곳, **{result['differ_ratio']*100:.1f}%**다. "
        "즉 이 비율만큼 \"시설 확인된 곳 우선\" 토글이 실제로 순서를 바꾼다."
    )
    lines.append("")

    lines.append("### (b) 확인된 편의시설(의자 또는 그늘 확인) 후보가 존재하는 비율")
    lines.append("")
    lines.append(
        f"반경 내 후보 중 의자 또는 그늘이 \"확인됨(yes)\"인 정류장이 하나라도 있는 출발 지점은 "
        f"{result['confirmed_count']}/{result['total_origins']}곳, **{result['confirmed_ratio']*100:.1f}%**다."
    )
    lines.append("")

    lines.append("### (c) comfort 선택 시 추가 도보시간 분포")
    lines.append("")
    if extra_walks:
        lines.append(
            f"(a)에서 comfort가 nearest와 다른 후보를 고른 {summary['n']}건 기준, "
            f"nearest 대비 추가 도보시간(분)의 평균은 **{summary['mean']:.1f}분**, "
            f"중앙값 **{summary['median']:.1f}분**, 최대 **{summary['max']}분**, 최소 **{summary['min']}분**이다."
        )
        lines.append("")
        hist = _extra_walk_histogram(extra_walks)
        lines.append(_fmt_table(["추가 도보시간", "건수"], [[label, count] for label, count in hist]))
    else:
        lines.append(
            "comfort와 nearest가 항상 같은 후보를 골라 추가 도보시간 표본이 없다."
        )
    lines.append("")

    lines.append(
        "이 지표(특히 (a)·(b))가 낮다면, 그만큼 아직 로드뷰·대장 조사(A5)가 커버하지 못한 "
        "정류장이 많다는 뜻이며 조사가 진행될수록 이 커버리지는 늘어난다."
    )
    lines.append("")

    text = "\n".join(lines) + "\n"
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "a", encoding="utf-8") as f:
        f.write("\n" + text)
    return out_path


if __name__ == "__main__":
    path = generate_coverage_section()
    print(f"추가: {path}")
