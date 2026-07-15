"""지리 계산 유틸. WGS84 위경도, Haversine 거리(m)."""
import math

_EARTH_R = 6371000.0  # 지구 반경(m)


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """두 위경도 사이 대권 거리(미터)."""
    if lat1 == lat2 and lng1 == lng2:
        return 0.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * _EARTH_R * math.asin(math.sqrt(a))
