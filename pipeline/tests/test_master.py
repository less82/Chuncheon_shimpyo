"""Task 1.2 검증: 마스터 생성(좌표 지도 — 실패 불가 단계)."""
from build_master import build_master


def test_master_length_1890():
    master = build_master()
    assert len(master) == 1890


def test_every_stop_has_required_shape_and_unknown_facilities():
    master = build_master()
    for s in master[:50] + master[-50:]:
        assert set(["id", "stopNo", "name", "lat", "lng", "routes", "facilities"]).issubset(s)
        assert isinstance(s["lat"], float) and isinstance(s["lng"], float)
        assert isinstance(s["routes"], list)
        for kind in ("shade", "seat", "light", "sign"):
            assert s["facilities"][kind] == {"status": "unknown", "source": "none"}
        # 마스터 단계에서는 수요/시설 근거 없음
        assert "demand" not in s


def test_ids_unique():
    master = build_master()
    ids = [s["id"] for s in master]
    assert len(ids) == len(set(ids))


def test_routes_joined_for_most_stops():
    master = build_master()
    with_routes = [s for s in master if len(s["routes"]) > 0]
    assert len(with_routes) > 1000
    # 노선번호는 문자열, 정렬·중복제거됨
    sample = next(s for s in master if len(s["routes"]) > 1)
    assert sample["routes"] == sorted(set(sample["routes"]))
    assert all(isinstance(r, str) for r in sample["routes"])


def test_no_excel_date_pollution_in_routes():
    master = build_master()
    for s in master:
        for r in s["routes"]:
            assert "월" not in r and "일" not in r
