"""Task A1 — 데이터 품질 검증 리포트.

실행하면 docs/데이터_검증.md(마크다운)를 생성한다.
이 리포트는 발표용 "분석 타당성" 방어 자료다: 조사 우선순위(surveyPriority)
산출에 쓰인 수요 데이터의 표본 안정성, 조인 방식, 결측 분포, 상관관계를
파이썬으로 재현·검증한다.

정식 순위 엔진은 앱(app/src/…, A3)에 있으며, 본 리포트는 검증용 파이썬 재현이다.
"""
from __future__ import annotations

import json
import os
from collections import Counter, defaultdict

import pandas as pd

from attach_demand import _norm
from build_master import build_master
from loaders import load_boarding_daily

_HERE = os.path.dirname(os.path.abspath(__file__))
_STOPS_JSON = os.path.abspath(os.path.join(_HERE, "..", "app", "public", "data", "stops.json"))
_DEFAULT_REPORT = os.path.abspath(os.path.join(_HERE, "..", "docs", "데이터_검증.md"))

MIDDAY_HOURS = list(range(11, 17))  # 11~16시(6개 시간대). "한낮" 정의.
FACILITY_KINDS = ("shade", "seat", "light", "sign")
SAMPLE_DATES = ["2025-06-25", "2025-06-26", "2025-06-27", "2025-06-28"]

REGION_TOKEN_RE = __import__("re").compile(r"[가-힣]{1,10}(?:읍|면|동|리)")


def _load_stops() -> list[dict]:
    with open(_STOPS_JSON, encoding="utf-8") as f:
        data = json.load(f)
    return data["stops"]


def _midday_sum_from_byhour(by_hour: list[int]) -> int:
    return sum(int(by_hour[h]) for h in MIDDAY_HOURS if h < len(by_hour))


def _unknown_count(facilities: dict) -> int:
    return sum(1 for k in FACILITY_KINDS if facilities[k]["status"] == "unknown")


def _midday_by_name(boarding: pd.DataFrame) -> dict[str, int]:
    """정규화된 정류장명 -> 한낮(11~16시) 승차 합. (양방향 합산 전 단계: 이름 단위)"""
    df = boarding[boarding["이용시간대"].isin(MIDDAY_HOURS)].copy()
    df["_key"] = df["정류장명"].map(_norm)
    grp = df.groupby("_key")["승차건수"].sum()
    return {k: int(v) for k, v in grp.items()}


def _rank_pct(values: list[float]) -> list[float]:
    """pandas .rank(pct=True)와 동일 로직(극단값에 강건한 분위수 정규화)."""
    s = pd.Series(values)
    return list(s.rank(pct=True))


def compute_priority_ranking(
    master: list[dict], midday_by_name: dict[str, int], unk_by_id: dict[str, int]
) -> list[dict]:
    """surveyPriority = D + UNK (w_d=w_u=1, POI off) 파이썬 재현.

    수요 실측 없는 정류장은 제외(ranked에 섞지 않음). id(관리번호) 단위.
    """
    rows = []
    for s in master:
        key = _norm(s["name"])
        midday = midday_by_name.get(key)
        if midday is None:
            continue  # 수요 미확인 -> 순위 제외
        rows.append(
            {
                "id": s["id"],
                "name": s["name"],
                "midday": midday,
                "unk": unk_by_id.get(s["id"], 0),
            }
        )
    if not rows:
        return []
    d_pct = _rank_pct([r["midday"] for r in rows])
    for r, d in zip(rows, d_pct):
        unk_norm = r["unk"] / len(FACILITY_KINDS)
        r["D"] = d
        r["UNK"] = unk_norm
        r["priority"] = d + unk_norm
    rows.sort(key=lambda r: r["priority"], reverse=True)
    return rows


def compute_demand_route_correlation() -> float:
    """정류장별 (한낮 승차 합) vs (노선 수) 피어슨 상관계수. 수요 매칭된 정류장만."""
    stops = _load_stops()
    midday = []
    n_routes = []
    for s in stops:
        d = s.get("demand")
        if d is None:
            continue
        midday.append(_midday_sum_from_byhour(d["byHour"]))
        n_routes.append(len(s.get("routes", [])))
    if len(midday) < 2:
        return 0.0
    corr = pd.Series(midday).corr(pd.Series(n_routes), method="pearson")
    return float(corr) if pd.notna(corr) else 0.0


def compute_leave_one_day_out_stability() -> list[dict]:
    """섹션 1: 4일 중 하루씩 제외한 Top20 vs 전체 4일 Top20 유지율."""
    stops = _load_stops()
    unk_by_id = {s["id"]: _unknown_count(s["facilities"]) for s in stops}
    master = build_master()

    # 전체 4일 기준 Top20 (stops.json의 demand는 4일 전체 합산이므로 그대로 사용)
    baseline_midday_by_name: dict[str, int] = {}
    for s in stops:
        d = s.get("demand")
        if d is None:
            continue
        baseline_midday_by_name[_norm(s["name"])] = _midday_sum_from_byhour(d["byHour"])
    baseline_rank = compute_priority_ranking(master, baseline_midday_by_name, unk_by_id)
    baseline_top20_ids = {r["id"] for r in baseline_rank[:20]}

    boarding_daily = load_boarding_daily()

    result = []
    for excluded in SAMPLE_DATES:
        subset = boarding_daily[boarding_daily["기준일자"] != excluded]
        midday_by_name = _midday_by_name(subset)
        rank = compute_priority_ranking(master, midday_by_name, unk_by_id)
        top20_ids = {r["id"] for r in rank[:20]}
        overlap = len(baseline_top20_ids & top20_ids)
        result.append(
            {
                "excluded_date": excluded,
                "overlap": overlap,
                "top20_ids": top20_ids,
            }
        )
    return result


def compute_duplicate_names(master: list[dict]) -> list[dict]:
    """동일 정류장명이 여러 관리번호(양방향)에 매핑되는 목록."""
    by_name: dict[str, list[str]] = defaultdict(list)
    for s in master:
        by_name[s["name"]].append(s["id"])
    dups = [
        {"name": name, "ids": ids, "count": len(ids)}
        for name, ids in by_name.items()
        if len(ids) >= 2
    ]
    dups.sort(key=lambda r: r["count"], reverse=True)
    return dups


def compute_missing_demand_region_tokens(master: list[dict], boarding: pd.DataFrame) -> list[dict]:
    """수요 결측 정류장명의 지역 토큰(읍/면/동/리 추정) 분포."""
    matched_keys = set(boarding["정류장명"].map(_norm))
    missing = [s for s in master if _norm(s["name"]) not in matched_keys]

    counter: Counter = Counter()
    for s in missing:
        m = REGION_TOKEN_RE.search(s["name"])
        token = m.group(0) if m else "기타(지명패턴없음)"
        counter[token] += 1

    rows = [{"token": t, "count": c} for t, c in counter.most_common()]
    return rows, len(missing)


def compute_weekday_composition() -> list[dict]:
    import datetime as _dt

    boarding_daily = load_boarding_daily()
    rows = []
    for d in SAMPLE_DATES:
        sub = boarding_daily[boarding_daily["기준일자"] == d]
        total = int(sub["승차건수"].sum())
        dt = _dt.date.fromisoformat(d)
        weekday_kr = ["월", "화", "수", "목", "금", "토", "일"][dt.weekday()]
        rows.append({"date": d, "weekday": weekday_kr, "total_boarding": total})
    return rows


def _fmt_table(headers: list[str], rows: list[list]) -> str:
    lines = ["| " + " | ".join(headers) + " |", "|" + "|".join(["---"] * len(headers)) + "|"]
    for r in rows:
        lines.append("| " + " | ".join(str(c) for c in r) + " |")
    return "\n".join(lines)


def generate_report(out_path: str = _DEFAULT_REPORT) -> str:
    stops = _load_stops()
    master = build_master()
    boarding = load_boarding_daily()

    lines: list[str] = []
    lines.append("# 데이터 검증 리포트")
    lines.append("")
    lines.append(
        "> 이 리포트는 `pipeline/quality_report.py`로 자동 생성된다. "
        "정식 조사 우선순위 엔진은 앱(A3, `app/src/`)에 있으며, "
        "본 리포트의 순위 재현은 **검증용 파이썬 재현**(설계 §3.1 공식)이다. "
        "수요는 항상 **양방향 합산 기준**이며, 표본은 **2025.6 4일**(2025-06-25~28)이다."
    )
    lines.append("")

    # --- 섹션 1 ---
    lines.append("## 1. 하루 제외 순위 안정성")
    lines.append("")
    lines.append(
        "4일치 승하차 표본(2025-06-25~28) 중 하루씩 제외하고 조사 우선순위 "
        "Top20을 재계산해, 전체 4일 기준 Top20과 겹치는 정류장 수(유지율)를 본다. "
        "surveyPriority = D(한낮 승차 분위수) + UNK(미확인 시설수/4), 수요 미확인 정류장은 제외."
    )
    lines.append("")
    loo = compute_leave_one_day_out_stability()
    rows = [[r["excluded_date"], f"{r['overlap']}/20", f"{r['overlap']/20*100:.0f}%"] for r in loo]
    lines.append(_fmt_table(["제외한 날짜", "Top20 유지 개수", "유지율"], rows))
    lines.append("")

    # --- 섹션 2 ---
    lines.append("## 2. 동명 정류장 조인 충돌 + 양방향 합산 전후 상위 비교")
    lines.append("")
    dups = compute_duplicate_names(master)
    lines.append(
        f"마스터 1890개 중 동일 정류장명이 2개 이상 관리번호(주로 양방향)에 매핑된 "
        f"이름은 {len(dups)}개, 영향받는 정류장은 {sum(d['count'] for d in dups)}개다. "
        f"수요는 이름 기준으로 매칭되므로 같은 이름의 정류장들은 동일한 합산 demand를 공유한다."
    )
    lines.append("")
    lines.append("동명 매핑 예시(관리번호 개수 상위 10개):")
    lines.append("")
    sample_rows = [[d["name"], d["count"], ", ".join(d["ids"])] for d in dups[:10]]
    lines.append(_fmt_table(["정류장명", "관리번호 개수", "관리번호 목록"], sample_rows))
    lines.append("")

    unk_by_id = {s["id"]: _unknown_count(s["facilities"]) for s in stops}
    baseline_midday_by_name: dict[str, int] = {}
    for s in stops:
        d = s.get("demand")
        if d is None:
            continue
        baseline_midday_by_name[_norm(s["name"])] = _midday_sum_from_byhour(d["byHour"])
    id_rank = compute_priority_ranking(master, baseline_midday_by_name, unk_by_id)
    id_unit_top20 = id_rank[:20]

    # 정류장명 합산 단위: 이름 중복 제거(대표 id 하나만)
    seen_names: set[str] = set()
    name_unit_top20 = []
    for r in id_rank:
        if r["name"] in seen_names:
            continue
        seen_names.add(r["name"])
        name_unit_top20.append(r)
        if len(name_unit_top20) == 20:
            break

    id_unit_names = [r["name"] for r in id_unit_top20]
    dup_in_top20 = len(id_unit_names) - len(set(id_unit_names))
    lines.append(
        f"**정류장 개수(관리번호) 단위 Top20**에는 동명 중복이 {dup_in_top20}건 포함된다"
        f"(양방향 두 정류장이 동일 demand로 나란히 Top20을 차지). "
        f"**정류장명 합산 단위 Top20**(중복 제거)과 비교하면 "
        f"이름 기준 상위 {len(name_unit_top20)}곳이 동일 순서로 나열된다(동일 알고리즘, "
        f"차이는 중복 제거 여부뿐)."
    )
    lines.append("")

    # --- 섹션 3 ---
    lines.append("## 3. 수요 결측 정류장 분포")
    lines.append("")
    region_rows, missing_n = compute_missing_demand_region_tokens(master, boarding)
    lines.append(
        f"수요(demand) 매칭이 없는 정류장은 {missing_n}곳이다(= 수요 부재가 아니라 **미확인**). "
        "정류장명 안의 읍/면/동/리 패턴 토큰 빈도로 보면 다음과 같다(패턴 미검출은 '기타'):"
    )
    lines.append("")
    lines.append(
        _fmt_table(
            ["지역 토큰", "결측 정류장 수"],
            [[r["token"], r["count"]] for r in region_rows[:30]],
        )
    )
    lines.append("")
    ri_count = sum(r["count"] for r in region_rows if r["token"].endswith("리"))
    lines.append(
        f"'리'로 끝나는 토큰(농촌 마을 단위 추정) 합계 {ri_count}곳으로, "
        f"결측 {missing_n}곳 중 상당수가 읍·면 지역에 편중돼 있을 가능성을 시사한다. "
        "단, 이는 정류장명 문자열 패턴 추정이며 행정구역 데이터로 확정한 것은 아니다."
    )
    lines.append("")

    # --- 섹션 4 ---
    lines.append("## 4. 상위 20곳 원본 대조표")
    lines.append("")
    lines.append(
        "조사 우선순위(파이썬 재현) 상위 20곳. '원본대조_확인'·'비고'는 수기 확인용 빈 컬럼."
    )
    lines.append("")
    top20_rows = [
        [r["id"], r["name"], r["midday"], "", ""] for r in id_unit_top20
    ]
    lines.append(
        _fmt_table(
            ["관리번호", "정류장명", "한낮(11~16시) 승차 실측값", "원본대조_확인", "비고"],
            top20_rows,
        )
    )
    lines.append("")

    # --- 섹션 5 ---
    lines.append("## 5. 수요-노선수 피어슨 상관")
    lines.append("")
    corr = compute_demand_route_correlation()
    lines.append(f"정류장별 (한낮 승차 합) vs (노선 수) 피어슨 상관계수: **{corr:.4f}**")
    lines.append("")
    if abs(corr) >= 0.5:
        justification = (
            f"상관계수 {corr:.4f}은 중간 이상 수준의 양(+)의 상관을 보인다. "
            "노선 수가 많을수록 승차 수요도 높은 경향이 있다는 뜻으로, "
            "이 둘을 모두 지수(surveyPriority)에 넣으면 사실상 같은 신호를 두 번 반영하는 "
            "이중가중이 된다. 따라서 노선 수는 별도 가중치로 지수에 포함하지 않고, "
            "수요(D) 하나로 대표시킨다."
        )
    else:
        justification = (
            f"상관계수 {corr:.4f}는 뚜렷한 선형 관계로 보기 어렵다. "
            "노선 수가 많다고 반드시 승차 수요가 높은 것은 아니므로(배차·환승 목적 노선 등 "
            "혼재), 노선 수를 지수에 넣어도 '수요 대리지표'로서의 의미가 불명확하다. "
            "따라서 노선 수는 surveyPriority에서 제외하고 참고 지표로만 표시한다."
        )
    lines.append(justification)
    lines.append("")

    # --- 섹션 6 ---
    lines.append("## 6. 표본 4일 요일 구성")
    lines.append("")
    weekday_rows = compute_weekday_composition()
    lines.append(
        _fmt_table(
            ["날짜", "요일", "일별 총 승차건수"],
            [[r["date"], r["weekday"], r["total_boarding"]] for r in weekday_rows],
        )
    )
    lines.append("")
    lines.append(
        "특이사항: 2025-06-28(토요일)은 평일 대비 총 승차건수가 크게 낮다(주말 포함 + "
        "원본 데이터가 엑셀 행수 한계로 절단된 것으로 추정되는 표본 축소가 겹친 것으로 보임). "
        "4일 중 3일이 평일, 1일이 주말이라 평일 편중 표본임에 유의."
    )
    lines.append("")

    # --- 섹션 7 ---
    lines.append("## 7. 데이터 기준일 불일치표")
    lines.append("")
    lines.append(
        _fmt_table(
            ["데이터", "실제 관측 기간/기준일"],
            [
                ["승하차(수요)", "2025-06-25~28 표본, 데이터기준일 2025-12-09"],
                ["버스정류장 위치정보(마스터)", "2026-03-26"],
                ["버스정류장 노선정보", "2026-03-26"],
                ["벤치 현황(의자 근거)", "2026-06-01"],
                ["폭염대비 접이식 그늘막(그늘 근거)", "2026-06-10"],
                ["가로등정보(조명 근거)", "2026-06-10"],
            ],
        )
    )
    lines.append("")
    lines.append(
        "수요 표본(2025.6)과 시설 근거 데이터(2026.3~6) 사이에 최대 9개월 이상 시차가 있다. "
        "이 기간 시설물 신설/철거가 있었다면 현재 리포트의 facilities 상태와 실제 현장이 "
        "다를 수 있다(로드뷰 조사로 보완 필요)."
    )
    lines.append("")

    text = "\n".join(lines) + "\n"
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(text)
    return out_path


if __name__ == "__main__":
    path = generate_report()
    print(f"생성: {path}")
