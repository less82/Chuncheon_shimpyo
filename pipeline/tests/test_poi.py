"""Task A6 — 생활지원시설 인접도(POI) 검증.

핵심 규칙: 원본 CSV(data/poi/) 부재/빈 폴더 시 예외 없이 빈 dict + poi.json
미생성(설계: P 항 자동 비활성). "취약" 표현은 코드 어디에도 없어야 한다
(사람 취약성 측정이 아니라 "생활지원시설 인접도"라는 명칭만 사용).
"""
from __future__ import annotations

import json
import os

import pandas as pd
import pytest


def _stop(sid, lat, lng):
    return {"id": sid, "name": f"stop{sid}", "lat": lat, "lng": lng}


def _write_csv(dir_path, filename, rows):
    os.makedirs(dir_path, exist_ok=True)
    df = pd.DataFrame(rows)
    df.to_csv(os.path.join(dir_path, filename), index=False, encoding="cp949")


# --- (a) 반경 300m 내 종류 수 / 3 ---


def test_build_poi_one_kind_within_radius_gives_one_third(tmp_path):
    from build_poi import build_poi

    poi_dir = str(tmp_path / "poi")
    # 병원 1개만, 정류장에서 약 11m
    _write_csv(poi_dir, "병원.csv", {"위도": [37.8801], "경도": [127.7300]})

    stops = [_stop("250001", 37.8800, 127.7300)]
    result = build_poi(stops, poi_dir=poi_dir, radius_m=300)

    assert result["250001"] == pytest.approx(1 / 3)


def test_build_poi_three_kinds_within_radius_gives_one(tmp_path):
    from build_poi import build_poi

    poi_dir = str(tmp_path / "poi")
    _write_csv(poi_dir, "병원.csv", {"위도": [37.8801], "경도": [127.7300]})
    _write_csv(poi_dir, "경로당.csv", {"위도": [37.8802], "경도": [127.7300]})
    _write_csv(poi_dir, "시장.csv", {"위도": [37.8799], "경도": [127.7300]})

    stops = [_stop("250001", 37.8800, 127.7300)]
    result = build_poi(stops, poi_dir=poi_dir, radius_m=300)

    assert result["250001"] == pytest.approx(1.0)


def test_build_poi_no_nearby_facility_gives_zero_but_key_included(tmp_path):
    from build_poi import build_poi

    poi_dir = str(tmp_path / "poi")
    # 병원 하나, 정류장에서 아주 멀리(약 11km)
    _write_csv(poi_dir, "병원.csv", {"위도": [37.98], "경도": [127.7300]})

    stops = [_stop("250001", 37.8800, 127.7300)]
    result = build_poi(stops, poi_dir=poi_dir, radius_m=300)

    assert "250001" in result
    assert result["250001"] == 0.0


# --- (b) 원본 부재/빈 폴더 -> 빈 dict, poi.json 미생성, 예외 없음 ---


def test_build_poi_missing_dir_returns_empty_dict_no_exception(tmp_path):
    from build_poi import build_poi

    poi_dir = str(tmp_path / "does_not_exist")
    stops = [_stop("250001", 37.8800, 127.7300)]

    result = build_poi(stops, poi_dir=poi_dir, radius_m=300)

    assert result == {}


def test_build_poi_empty_dir_returns_empty_dict(tmp_path):
    from build_poi import build_poi

    poi_dir = str(tmp_path / "poi")
    os.makedirs(poi_dir, exist_ok=True)  # CSV 0개
    stops = [_stop("250001", 37.8800, 127.7300)]

    result = build_poi(stops, poi_dir=poi_dir, radius_m=300)

    assert result == {}


def test_write_poi_json_skips_when_empty(tmp_path):
    from build_poi import write_poi_json

    out = tmp_path / "poi.json"
    write_poi_json({}, str(out))

    assert not out.exists()


def test_write_poi_json_writes_when_nonempty(tmp_path):
    from build_poi import write_poi_json

    out = tmp_path / "poi.json"
    write_poi_json({"250001": 0.5}, str(out))

    assert out.exists()
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data == {"250001": 0.5}


# --- (c) 명칭 검증: "취약" 금지, "생활지원시설" 사용 ---


def test_no_forbidden_vulnerability_wording_in_source():
    here = os.path.dirname(os.path.abspath(__file__))
    src_path = os.path.abspath(os.path.join(here, "..", "build_poi.py"))
    text = open(src_path, encoding="utf-8").read()

    assert "취약" not in text
    assert "vulnerable" not in text.lower()
    assert "생활지원시설" in text
