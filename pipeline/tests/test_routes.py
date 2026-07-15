"""Task 6.1 검증: routes.json (노선별 정류장 순서 그래프) 생성."""
import re

from build_routes import build_routes

_DATE_POLLUTION = re.compile(r"\d{1,2}\s*월\s*\d{1,2}\s*일")


def test_build_routes_has_routes():
    data = build_routes()
    assert "generatedAt" in data
    assert isinstance(data["routes"], list)
    assert len(data["routes"]) > 0


def test_route_stops_are_kanri_ids_in_order():
    data = build_routes()
    for r in data["routes"]:
        assert set(r.keys()) >= {"routeId", "routeNo", "stops"}
        assert isinstance(r["stops"], list)
        # 관리번호(9자리 숫자) 리스트
        for sid in r["stops"]:
            assert re.fullmatch(r"\d{9}", sid), sid


def test_some_route_has_at_least_two_stops():
    data = build_routes()
    assert any(len(r["stops"]) >= 2 for r in data["routes"])


def test_stops_sorted_by_sequence():
    """임의 노선(250000100)의 정류장 순서가 원본 정류장순서와 일치."""
    import pandas as pd

    from loaders import load_routes

    df = load_routes()
    rid = "250000100"
    sub = df[df["노선"] == rid].sort_values("순서")
    expected = sub["관리번호"].tolist()

    data = build_routes()
    got = next(r["stops"] for r in data["routes"] if r["routeId"] == rid)
    assert got == expected


def test_route_no_excel_pollution_restored():
    data = build_routes()
    for r in data["routes"]:
        assert not _DATE_POLLUTION.search(str(r["routeNo"])), r["routeNo"]
