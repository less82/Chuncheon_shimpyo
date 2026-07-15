"""쉼표 정류장 — 데이터 파이프라인 엔트리.

재실행 가능한 단일 스크립트. 6개 원본 CSV를 결합해
app/public/data/stops.json (StopsFile) 과 로드뷰 조사 양식 CSV를 생성한다.

단계적 결합(중요): master -> demand -> seats -> lights -> shade -> roadview.
뒤 단계가 실패해도 앞 단계 결과로 유효한 stops.json이 나온다(각 단계 try/except).
네트워크(지오코딩)는 빌드 시점만, 실패해도 해당 그늘만 unknown으로 남는다.
"""
import datetime as _dt
import json
import os

from attach_demand import attach_demand
from attach_facilities import attach_lights, attach_seats, attach_shade
from build_master import build_master
from loaders import (
    load_bench,
    load_boarding,
    load_lights,
    load_locations,  # noqa: F401  (마스터 내부에서 사용)
    load_shade,
)
from roadview import ROADVIEW_HEADER, apply_roadview, write_survey_template

_HERE = os.path.dirname(os.path.abspath(__file__))
_OUT_DIR = os.path.abspath(os.path.join(_HERE, "..", "app", "public", "data"))
_STOPS_JSON = os.path.join(_OUT_DIR, "stops.json")
_SURVEY_CSV = os.path.join(_OUT_DIR, "roadview_survey_template.csv")
_ROADVIEW_INPUT = os.path.join(_OUT_DIR, "roadview_survey_filled.csv")  # 있으면 반영

CITY_CENTER = {"lat": 37.8813, "lng": 127.73}


def _estimate_headway(routes: list[str]) -> int:
    """임시 배차간격(분) 추정. 노선 많은 요지는 짧게, 없으면 기본 15.
    TAGO 도착정보 폴백용 캐시일 뿐 실측이 아님."""
    if not routes:
        return 20
    n = len(routes)
    if n >= 8:
        return 8
    if n >= 4:
        return 12
    return 15


def build() -> dict:
    # --- Stage 1: 마스터(실패 불가) ---
    master = build_master()
    print(f"[1] 마스터: {len(master)}개 정류장")

    # --- Stage 2: 수요 브리지 ---
    try:
        boarding = load_boarding()
        attach_demand(master, boarding)
        matched = sum(1 for s in master if "demand" in s)
        print(f"[2] 수요 매칭: {matched}/{len(master)} ({matched/len(master)*100:.1f}%)")
    except Exception as e:  # 앞 단계 결과 보존
        print(f"[2] 수요 단계 건너뜀(비치명적): {e}")

    # --- Stage 3: 의자(벤치 30m) ---
    try:
        attach_seats(master, load_bench(), radius=30)
        n = sum(1 for s in master if s["facilities"]["seat"]["status"] == "yes")
        print(f"[3] 의자 yes(벤치 30m): {n}")
    except Exception as e:
        print(f"[3] 의자 단계 건너뜀(비치명적): {e}")

    # --- Stage 4: 조명(가로등 50m) ---
    try:
        lights = load_lights()
        attach_lights(master, lights, radius=50)
        n = sum(1 for s in master if s["facilities"]["light"]["status"] == "yes")
        note = "" if len(lights) else " (가로등 원본 부재 → 전부 unknown)"
        print(f"[4] 조명 yes(가로등 50m): {n}{note}")
    except Exception as e:
        print(f"[4] 조명 단계 건너뜀(비치명적): {e}")

    # --- Stage 5: 그늘(그늘막 주소 지오코딩 30m) ---
    try:
        from geocode import load_cache

        cache = load_cache()
        attach_shade(master, load_shade(), cache, radius=30)
        n = sum(1 for s in master if s["facilities"]["shade"]["status"] == "yes")
        print(f"[5] 그늘 yes(지오코딩 30m): {n} (지오코딩 캐시 {len(cache)}건)")
    except Exception as e:
        print(f"[5] 그늘 단계 건너뜀(비치명적): {e}")

    # --- Stage 6: 로드뷰 오버레이(조사 파일 있을 때만) ---
    if os.path.exists(_ROADVIEW_INPUT):
        try:
            import pandas as pd

            survey = pd.read_csv(_ROADVIEW_INPUT, encoding="utf-8-sig", dtype=str)
            apply_roadview(master, survey)
            print(f"[6] 로드뷰 오버레이 적용: {_ROADVIEW_INPUT}")
        except Exception as e:
            print(f"[6] 로드뷰 단계 건너뜀(비치명적): {e}")
    else:
        print("[6] 로드뷰 조사 파일 없음 → 오버레이 생략(정상)")

    # --- 배차 캐시 ---
    for s in master:
        s["headwayMin"] = _estimate_headway(s["routes"])

    return {
        "generatedAt": _dt.datetime.now(_dt.timezone.utc).isoformat(),
        "cityCenter": CITY_CENTER,
        "stops": master,
    }


def _facility_distribution(stops):
    dist = {}
    for kind in ("shade", "seat", "light", "sign"):
        c = {"yes": 0, "no": 0, "unknown": 0}
        for s in stops:
            c[s["facilities"][kind]["status"]] += 1
        dist[kind] = c
    return dist


def main():
    os.makedirs(_OUT_DIR, exist_ok=True)
    data = build()

    with open(_STOPS_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    write_survey_template(data["stops"], _SURVEY_CSV)

    print(f"\n생성: {_STOPS_JSON} ({len(data['stops'])} stops)")
    print(f"생성: {_SURVEY_CSV} (헤더 {ROADVIEW_HEADER})")
    print("시설 분포 (yes/no/unknown):")
    for kind, c in _facility_distribution(data["stops"]).items():
        print(f"  {kind}: yes={c['yes']}  no={c['no']}  unknown={c['unknown']}")


if __name__ == "__main__":
    main()
