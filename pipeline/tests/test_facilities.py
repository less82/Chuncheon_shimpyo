"""Task 1.4 검증: 시설 공간 매칭(의자 30m·조명 50m) + 그늘 지오코딩 30m.

핵심 규칙: 어떤 경로에서도 status='no'를 만들지 않는다.
매칭되면 yes, 매칭 안 되면 unknown 그대로.
"""
import copy

import pandas as pd

from attach_facilities import attach_lights, attach_seats, attach_shade
from geo import haversine


def _stop(sid, lat, lng):
    return {
        "id": sid,
        "stopNo": sid,
        "name": f"stop{sid}",
        "lat": lat,
        "lng": lng,
        "routes": [],
        "facilities": {
            "shade": {"status": "unknown", "source": "none"},
            "seat": {"status": "unknown", "source": "none"},
            "light": {"status": "unknown", "source": "none"},
            "sign": {"status": "unknown", "source": "none"},
        },
    }


def test_haversine_known_distance():
    # 서울시청~춘천시청 대략 63km. 여기선 짧은 거리로 정확도 검증.
    # 위도 1도 ≈ 111.19km. 0.001도 위도차 ≈ 111.19m.
    d = haversine(37.8813, 127.73, 37.8813 + 0.001, 127.73)
    assert abs(d - 111.19) / 111.19 < 0.01
    # 동일 지점 = 0
    assert haversine(37.0, 127.0, 37.0, 127.0) == 0.0


def test_attach_seats_within_30m_yes_else_unknown():
    near = _stop("A", 37.8800, 127.7300)
    far = _stop("B", 37.9000, 127.7300)  # 벤치에서 멀리
    master = [near, far]
    # 벤치를 near 정류장 바로 옆(약 11m)에 둔다.
    bench = pd.DataFrame(
        {"명칭": ["b1"], "lat": [37.8800 + 0.0001], "lng": [127.7300]}
    )
    out = attach_seats(master, bench, radius=30)
    assert out[0]["facilities"]["seat"] == {
        "status": "yes",
        "source": "bench_registry",
    }
    # 매칭 안 된 정류장은 여전히 unknown (절대 no 아님)
    assert out[1]["facilities"]["seat"]["status"] == "unknown"
    assert out[1]["facilities"]["seat"]["source"] == "none"


def test_attach_seats_never_produces_no():
    master = [_stop("A", 37.5, 127.5)]
    bench = pd.DataFrame({"명칭": [], "lat": [], "lng": []})
    out = attach_seats(master, bench, radius=30)
    assert out[0]["facilities"]["seat"]["status"] != "no"
    assert out[0]["facilities"]["seat"]["status"] == "unknown"


def test_attach_lights_within_50m_yes():
    s = _stop("A", 37.8800, 127.7300)
    master = [s]
    lights = pd.DataFrame({"lat": [37.8800 + 0.0003], "lng": [127.7300]})  # ~33m
    out = attach_lights(master, lights, radius=50)
    assert out[0]["facilities"]["light"] == {
        "status": "yes",
        "source": "light_registry",
    }


def test_attach_lights_empty_source_all_unknown():
    # 가로등 원본이 없을 때: 전부 unknown(절대 no 아님)
    master = [_stop("A", 37.88, 127.73)]
    lights = pd.DataFrame({"lat": pd.Series(dtype=float), "lng": pd.Series(dtype=float)})
    out = attach_lights(master, lights, radius=50)
    assert out[0]["facilities"]["light"]["status"] == "unknown"
    assert out[0]["facilities"]["light"]["source"] == "none"


def test_attach_shade_uses_geocode_cache_30m():
    s = _stop("A", 37.8800, 127.7300)
    master = [s]
    shade = pd.DataFrame(
        {"설치장소명": ["그늘막1"], "주소": ["춘천시 어딘가로 1"]}
    )
    # 지오코딩 캐시에 주소->좌표(정류장 20m 이내)
    cache = {"춘천시 어딘가로 1": {"lat": 37.8800 + 0.0001, "lng": 127.7300}}
    out = attach_shade(master, shade, cache, radius=30)
    assert out[0]["facilities"]["shade"] == {
        "status": "yes",
        "source": "shade_registry",
    }


def test_attach_shade_missing_geocode_stays_unknown():
    s = _stop("A", 37.8800, 127.7300)
    master = [s]
    shade = pd.DataFrame({"설치장소명": ["그늘막1"], "주소": ["미지오코딩 주소"]})
    cache = {}  # 캐시에 없음 -> skip
    out = attach_shade(master, shade, cache, radius=30)
    assert out[0]["facilities"]["shade"]["status"] == "unknown"
    assert out[0]["facilities"]["shade"]["source"] == "none"
