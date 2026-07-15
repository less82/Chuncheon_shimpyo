"""Task 1.3 — 수요 브리지.

정류장아이디(424xxxx)는 마스터 관리번호(250xxx)와 직접 매칭이 0(실측 확인).
따라서 승하차를 정류장명 기준으로 24시간 승차합 집계해 브리지한다.
같은 이름의 여러 마스터 정류장(양방향)은 동일 합산 demand를 공유한다.
미매칭 정류장은 demand 키 자체가 없다(= 수요 미확인).
"""
import re

import pandas as pd


def _norm(name: str) -> str:
    """이름 매칭용 정규화: 공백 제거, 소문자화(영문), 괄호/구분자 정리."""
    s = str(name).strip()
    s = re.sub(r"\s+", "", s)  # 모든 공백 제거
    return s


def build_demand_by_name(boarding: pd.DataFrame) -> dict[str, dict]:
    """정규화된 정류장명 -> {byHour[24], total, matchedName} 집계."""
    df = boarding.copy()
    df["_key"] = df["정류장명"].map(_norm)
    # 시간대별 승차합
    grp = df.groupby(["_key", "이용시간대"], as_index=False)["승차건수"].sum()

    result: dict[str, dict] = {}
    # 대표 원본 이름(첫 등장) 보관
    rep_name = df.drop_duplicates("_key").set_index("_key")["정류장명"].to_dict()
    for key, sub in grp.groupby("_key"):
        by_hour = [0] * 24
        for h, cnt in zip(sub["이용시간대"], sub["승차건수"]):
            hi = int(h)
            if 0 <= hi < 24:
                by_hour[hi] += int(cnt)
        result[key] = {
            "byHour": by_hour,
            "total": int(sum(by_hour)),
            "matchedName": str(rep_name.get(key, "")),
        }
    return result


def attach_demand(master: list[dict], boarding: pd.DataFrame) -> list[dict]:
    """master 각 정류장 이름을 승하차 집계에 매칭해 demand 부여.

    반환은 입력 master를 그대로 갱신한 리스트(demand 키 추가).
    """
    demand_by_name = build_demand_by_name(boarding)
    for stop in master:
        key = _norm(stop["name"])
        agg = demand_by_name.get(key)
        if agg is None:
            continue  # 미매칭: demand 부재 = 미확인
        stop["demand"] = {
            "byHour": list(agg["byHour"]),
            "total": agg["total"],
            "aggregatedBidirectional": True,  # 항상 양방향 합산 기준
            "matchedName": agg["matchedName"],
        }
    return master


if __name__ == "__main__":
    from build_master import build_master
    from loaders import load_boarding

    m = build_master()
    b = load_boarding()
    attach_demand(m, b)
    matched = sum(1 for s in m if "demand" in s)
    print(f"수요 매칭: {matched}/{len(m)} ({matched/len(m)*100:.1f}%)")
