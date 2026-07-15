"""Task 6.1 — routes.json (노선별 정류장 순서 그래프) 생성.

노선정보를 노선(id)로 groupby하여 정류장순서 오름차순 관리번호 리스트를 만든다.
routeNo는 route_number_fix(엑셀 날짜 오염 복원)가 이미 적용된 load_routes 컬럼을 쓴다.
목적지 길찾기(BFS)와 실시간 도착 매칭의 정적 기반이 된다. 네트워크 의존 없음.
"""
import datetime as _dt

from loaders import load_routes


def build_routes() -> dict:
    """{"generatedAt", "routes":[{"routeId","routeNo","stops":[관리번호 순서]}]}."""
    df = load_routes()
    routes: list[dict] = []
    for rid, sub in df.groupby("노선"):
        sub = sub.sort_values("순서", kind="stable")
        stops = [str(s) for s in sub["관리번호"].tolist()]
        # routeNo는 그룹 내 상수(노선 id 1:1). 복원값을 그대로 사용.
        route_no = str(sub["노선번호"].iloc[0])
        routes.append(
            {
                "routeId": str(rid),
                "routeNo": route_no,
                "stops": stops,
            }
        )
    routes.sort(key=lambda r: r["routeId"])
    return {
        "generatedAt": _dt.datetime.now(_dt.timezone.utc).isoformat(),
        "routes": routes,
    }


if __name__ == "__main__":
    data = build_routes()
    n = len(data["routes"])
    avg = sum(len(r["stops"]) for r in data["routes"]) / n if n else 0
    print(f"노선: {n}개, 평균 정류장수: {avg:.1f}")
