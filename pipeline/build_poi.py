"""Task A6 — 생활지원시설 인접도(POI).

병원·경로당·시장 3종 CSV(data/poi/)가 정류장 반경 300m
(도보 약 4분, 80m/분 가정) 안에 몇 "종류" 있는지를 [0,1]로 환산한다.
개수가 아니라 종류 수다 — 병원이 반경 안에 10개든 1개든 "병원 있음"=1종
(설계 §3.3에서 밝힌 거칠기 한계를 감안한 단순화).

이 지표는 정류장 주변 생활지원시설 밀집도만 나타낸다. 명칭은 항상
"생활지원시설 인접도"를 쓴다.

직선거리(haversine) 기반 근접 매칭이므로 실제 보행 경로의 경사·횡단보도·
우회는 반영하지 못한다(한계는 리포트/주석에 명시).

원본 CSV(data/poi/) 부재 또는 0개면 예외 없이 빈 dict를 반환하고
poi.json을 생성하지 않는다(설계: 쉼표지수 P 항 자동 비활성).
"""
from __future__ import annotations

import glob
import json
import os

import pandas as pd

from geo import haversine

_HERE = os.path.dirname(os.path.abspath(__file__))
_DEFAULT_POI_DIR = os.path.abspath(os.path.join(_HERE, "..", "data", "poi"))
_DEFAULT_OUT = os.path.abspath(os.path.join(_HERE, "..", "app", "public", "data", "poi.json"))

# 생활지원시설 3종. 파일명 glob 패턴(cp949 CSV, 위도/경도 컬럼 보유 가정).
# 좌표가 없는 원본이 들어올 경우 기존 geocode.py 캐시 방식을 재사용할 수 있다
# (attach_facilities.attach_shade 참고). 현재 3종 모두 좌표 보유를 가정한다.
_POI_PATTERNS = {
    "hospital": "*병원*.csv",
    "senior_center": "*경로당*.csv",
    "market": "*시장*.csv",
}

RADIUS_M = 300.0  # 도보 약 4분(80m/분) 반경. 직선거리 기준(경사·횡단보도 미반영).


def _load_poi_points(poi_dir: str, pattern: str) -> list[tuple[float, float]]:
    """poi_dir 안에서 pattern에 맞는 CSV들을 읽어 (lat, lng) 목록으로 합친다."""
    hits = sorted(glob.glob(os.path.join(poi_dir, pattern)))
    points: list[tuple[float, float]] = []
    for path in hits:
        try:
            df = pd.read_csv(path, encoding="cp949", dtype=str)
        except Exception:
            continue  # 읽기 실패한 원본은 skip(치명적이지 않음)
        lat_col = next((c for c in df.columns if "위도" in c or c.lower() == "lat"), None)
        lng_col = next((c for c in df.columns if "경도" in c or c.lower() in ("lng", "lon")), None)
        if lat_col is None or lng_col is None:
            continue
        lats = pd.to_numeric(df[lat_col], errors="coerce")
        lngs = pd.to_numeric(df[lng_col], errors="coerce")
        for la, ln in zip(lats, lngs):
            if la == la and ln == ln:  # NaN 제외
                points.append((float(la), float(ln)))
    return points


def build_poi(
    stops: list[dict], poi_dir: str = _DEFAULT_POI_DIR, radius_m: float = RADIUS_M
) -> dict[str, float]:
    """정류장별 생활지원시설 인접도.

    값 = 반경 radius_m(기본 300m) 내에 존재하는 생활지원시설 "종류 수"(0~3) / 3.
    반환: {관리번호: 0.0~1.0}. 전 정류장 키를 포함한다(매칭 없으면 0.0).

    data/poi/ 디렉터리가 없거나 CSV가 0개면 예외 없이 빈 dict를 반환한다
    (정상 skip — 사람이 나중에 원본을 채워 넣기 전까지 이 지표는 비활성).
    """
    if not os.path.isdir(poi_dir):
        print("POI 없음 — poi.json 미생성")
        return {}

    kind_points = {
        kind: _load_poi_points(poi_dir, pattern) for kind, pattern in _POI_PATTERNS.items()
    }
    if not any(kind_points.values()):
        print("POI 없음 — poi.json 미생성")
        return {}

    n_kinds = len(_POI_PATTERNS)
    result: dict[str, float] = {}
    for stop in stops:
        lat, lng = stop["lat"], stop["lng"]
        present = 0
        for points in kind_points.values():
            if any(haversine(lat, lng, la, ln) <= radius_m for la, ln in points):
                present += 1
        result[stop["id"]] = present / n_kinds
    return result


def write_poi_json(poi: dict[str, float], path: str = _DEFAULT_OUT) -> None:
    """poi.json 저장. 빈 dict면 아무것도 쓰지 않는다(파일 자체를 만들지 않음)."""
    if not poi:
        return
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(poi, f, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    stops_json = os.path.abspath(os.path.join(_HERE, "..", "app", "public", "data", "stops.json"))
    with open(stops_json, encoding="utf-8") as f:
        stops = json.load(f)["stops"]
    poi = build_poi(stops)
    if poi:
        write_poi_json(poi)
        print(f"생성: {_DEFAULT_OUT} ({len(poi)}개 정류장)")
