"""Task 6.2 검증: TAGO nodeid 좌표근접 매핑 + 키 없으면 안전 skip."""
from tago_map import build_tago_mapping, nearest_tago


def test_nearest_tago_matches_within_radius():
    stops = [{"id": "250000001", "lat": 37.8813, "lng": 127.7300}]
    # 약 20m 인접(위도 0.00018 ≈ 20m)
    tago = [{"nodeid": "GWB111", "lat": 37.88148, "lng": 127.7300}]
    m = nearest_tago(stops, tago, radius=50)
    assert m["250000001"] == "GWB111"


def test_nearest_tago_excludes_beyond_radius():
    stops = [{"id": "250000001", "lat": 37.8813, "lng": 127.7300}]
    # 약 100m 떨어짐(위도 0.0009 ≈ 100m)
    tago = [{"nodeid": "GWB222", "lat": 37.8822, "lng": 127.7300}]
    m = nearest_tago(stops, tago, radius=50)
    assert "250000001" not in m


def test_nearest_tago_picks_closest():
    stops = [{"id": "250000001", "lat": 37.8813, "lng": 127.7300}]
    tago = [
        {"nodeid": "FAR", "lat": 37.88160, "lng": 127.7300},   # ~30m
        {"nodeid": "NEAR", "lat": 37.88135, "lng": 127.7300},  # ~5m
    ]
    m = nearest_tago(stops, tago, radius=50)
    assert m["250000001"] == "NEAR"


def test_build_tago_mapping_returns_empty_without_key(monkeypatch, capsys):
    monkeypatch.delenv("TAGO_KEY", raising=False)
    stops = [{"id": "250000001", "lat": 37.8813, "lng": 127.7300}]
    m = build_tago_mapping(stops)
    assert m == {}
    out = capsys.readouterr().out
    assert "TAGO" in out and "skip" in out
