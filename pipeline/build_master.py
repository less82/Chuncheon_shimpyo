"""Task 1.2 — 좌표 마스터 생성. 이 단계 산출만으로 지도 데모가 성립한다.

마스터 키 = 위치정보 관리번호. 노선정보를 관리번호로 조인해 routes 채움.
모든 시설은 근거 없음 -> unknown/none. demand 없음.
뒤 단계(수요/시설/로드뷰)가 실패해도 이 결과로 유효한 stops.json이 나온다.
"""
from loaders import load_locations, load_routes


def _unknown() -> dict:
    """근거 없는 기본 시설 상태. 절대 'no'를 만들지 않는다."""
    return {"status": "unknown", "source": "none"}


def build_master() -> list[dict]:
    """각 정류장을 Stop 형태 dict로 반환(시설은 전부 unknown, demand 없음)."""
    loc = load_locations()
    routes = load_routes()

    # 관리번호별 노선번호 집합(중복 제거·정렬)
    routes_by_stop: dict[str, list[str]] = {}
    for 관리번호, sub in routes.groupby("관리번호"):
        nums = sorted(
            {str(n) for n in sub["노선번호"].dropna() if str(n).strip() != ""}
        )
        routes_by_stop[str(관리번호)] = nums

    master: list[dict] = []
    for row in loc.itertuples(index=False):
        sid = str(row.관리번호)
        master.append(
            {
                "id": sid,
                "stopNo": str(row.정류장번호),
                "name": str(row.정류장명),
                "lat": float(row.lat),
                "lng": float(row.lng),
                "routes": routes_by_stop.get(sid, []),
                "facilities": {
                    "shade": _unknown(),
                    "seat": _unknown(),
                    "light": _unknown(),
                    "sign": _unknown(),
                },
            }
        )
    return master


if __name__ == "__main__":
    m = build_master()
    with_routes = sum(1 for s in m if s["routes"])
    print(f"마스터 정류장: {len(m)}개, 노선 조인된 정류장: {with_routes}개")
