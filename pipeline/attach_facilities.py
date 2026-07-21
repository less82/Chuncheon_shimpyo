"""Task 1.4 — 시설 공간/주소 매칭.

의자 = 벤치 대장 좌표 30m 공간매칭 (source bench_registry)
조명 = 가로등 대장 좌표 50m 공간매칭 (source light_registry)
그늘 = 그늘막 주소 지오코딩 -> 30m 공간매칭 (source shade_registry)

절대 규칙(코드 계약): 이 모듈은 어떤 경로에서도 status='no'를 만들지 않는다.
근접 소스가 있으면 'yes', 없으면 기존 상태(unknown)를 그대로 둔다.
'no'는 오직 Task 1.5의 로드뷰 조사에서 '없음'으로 확인된 경우에만 만들어진다.
"""
from geo import haversine


def _grid_index(points: list[tuple[float, float]], cell_deg: float):
    """근접 탐색 가속용 격자 인덱스. (lat,lng) 리스트 -> {(gi,gj):[idx...]}."""
    grid: dict[tuple[int, int], list[int]] = {}
    for i, (la, ln) in enumerate(points):
        key = (int(la / cell_deg), int(ln / cell_deg))
        grid.setdefault(key, []).append(i)
    return grid


def _has_point_within(lat, lng, points, grid, cell_deg, radius) -> bool:
    """(lat,lng) 반경 radius(m) 안에 points가 하나라도 있는가."""
    gi, gj = int(lat / cell_deg), int(lng / cell_deg)
    for di in (-1, 0, 1):
        for dj in (-1, 0, 1):
            for idx in grid.get((gi + di, gj + dj), ()):  # 인접 격자만 검사
                pla, pln = points[idx]
                if haversine(lat, lng, pla, pln) <= radius:
                    return True
    return False


def _attach_points(master, points, radius, kind, source):
    """points 중 radius 이내가 있으면 해당 시설을 yes/source로. 없으면 손대지 않음."""
    if not points:
        return master  # 소스 부재 -> 전부 unknown 유지 (절대 no 아님)
    # 격자 셀 크기: radius를 여유있게 덮도록 위도 0.001도(~111m) 기준으로 설정
    cell_deg = max(radius, 60) / 111000.0 * 1.5
    grid = _grid_index(points, cell_deg)
    for stop in master:
        if _has_point_within(stop["lat"], stop["lng"], points, grid, cell_deg, radius):
            stop["facilities"][kind] = {"status": "yes", "source": source}
        # else: 기존 unknown 유지. 'no'를 만들지 않는다.
    return master


def attach_seats(master, bench, radius=30):
    """벤치 30m 이내면 seat=yes/bench_registry."""
    pts = [
        (float(la), float(ln))
        for la, ln in zip(bench["lat"], bench["lng"])
        if la == la and ln == ln  # NaN 제외
    ]
    return _attach_points(master, pts, radius, "seat", "bench_registry")


def attach_lights(master, lights, radius=50):
    """가로등 50m 이내면 light=yes/light_registry. 원본 부재 시 전부 unknown."""
    pts = [
        (float(la), float(ln))
        for la, ln in zip(lights["lat"], lights["lng"])
        if la == la and ln == ln
    ]
    return _attach_points(master, pts, radius, "light", "light_registry")


def attach_sign(master, bit):
    """BIT 정류장번호와 stopNo 정확 매칭 시 sign=yes/sign_registry.

    공간매칭이 아니라 4자리 정류장번호 정확 일치(양방향 정류장은 같은 번호를
    공유하므로 set으로 처리). 원본 부재/미매칭이면 기존 상태(unknown) 유지 —
    다른 시설과 동일하게 어떤 경로에서도 'no'를 만들지 않는다.
    """
    nos = {str(n).strip() for n in bit["정류장번호"] if str(n).strip()}
    if not nos:
        return master  # 소스 부재 -> 전부 unknown 유지 (절대 no 아님)
    for stop in master:
        if str(stop.get("stopNo", "")).strip() in nos:
            stop["facilities"]["sign"] = {"status": "yes", "source": "sign_registry"}
        # else: 기존 unknown 유지. 'no'를 만들지 않는다.
    return master


def attach_shade(master, shade, geocode_cache: dict, radius=30):
    """그늘막 주소를 geocode_cache에서 좌표로 조회 -> 30m 이내면 shade=yes.

    캐시에 없는 주소는 skip(unknown 유지). 네트워크는 여기서 호출하지 않는다
    (빌드 스크립트가 미리 캐시를 채운다). 어떤 경로에서도 'no'를 만들지 않는다.
    """
    pts = []
    for addr in shade["주소"]:
        entry = geocode_cache.get(str(addr).strip()) if addr == addr else None
        if entry and entry.get("lat") is not None and entry.get("lng") is not None:
            pts.append((float(entry["lat"]), float(entry["lng"])))
    return _attach_points(master, pts, radius, "shade", "shade_registry")
