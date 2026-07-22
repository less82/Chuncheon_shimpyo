"""Task 6.2 - 정류장(관리번호) ↔ TAGO nodeid 매핑.

빌드 시점에만 네트워크를 쓴다(런타임 산출물은 정적). env `TAGO_KEY` 또는
앱과 동일한 `VITE_TAGO_KEY`가 있으면
국토부 TAGO 정류소정보(도시코드 32010=춘천)를 수집해 좌표 최근접(≤50m)으로
매핑한다. 키가 없거나 네트워크가 실패하면 절대 죽지 않고 `{}`를 반환한다.

nearest_tago는 순수 좌표 함수라 키 없이 단위 테스트 가능하다.
"""
import json
import os
import urllib.parse
import urllib.request

from geo import haversine

_CITY_CODE = "32010"  # 춘천시
_BASE = "http://apis.data.go.kr/1613000/BusSttnInfoInqireService/getSttnNoList"


def nearest_tago(stops, tago_stops, radius: float = 50.0) -> dict:
    """관리번호 -> nodeid. 각 정류장에서 반경(radius, m) 내 최근접 TAGO 정류소.

    반경 내 후보가 없으면 그 정류장은 결과에 넣지 않는다(미확인, 절대 추측 금지).
    """
    mapping: dict[str, str] = {}
    used_nodeids: set[str] = set()
    for s in stops:
        slat, slng = float(s["lat"]), float(s["lng"])
        best_id = None
        best_d = radius
        stop_id = str(s["id"])
        exact = [t for t in tago_stops if str(t.get("nodeid", "")).endswith(stop_id)]
        candidates = exact or tago_stops
        for t in candidates:
            nodeid = str(t.get("nodeid", ""))
            if not nodeid or nodeid in used_nodeids:
                continue
            try:
                d = haversine(slat, slng, float(t["lat"]), float(t["lng"]))
            except (TypeError, ValueError):
                continue
            if d <= best_d:
                best_d = d
                best_id = nodeid
        if best_id is not None:
            mapping[stop_id] = best_id
            used_nodeids.add(best_id)
    return mapping


def _fetch_tago_stops(key: str) -> list[dict]:
    """TAGO 정류소정보(도시코드 32010) 전 페이지 수집. [{nodeid,lat,lng}]."""
    rows: list[dict] = []
    page = 1
    while True:
        params = {
            "serviceKey": key,
            "cityCode": _CITY_CODE,
            "numOfRows": "1000",
            "pageNo": str(page),
            "_type": "json",
        }
        url = _BASE + "?" + urllib.parse.urlencode(params, safe="%")
        with urllib.request.urlopen(url, timeout=10) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        body = payload["response"]["body"]
        items = body.get("items") or {}
        item = items.get("item") if isinstance(items, dict) else None
        if not item:
            break
        if isinstance(item, dict):
            item = [item]
        for it in item:
            rows.append(
                {
                    "nodeid": it.get("nodeid"),
                    "lat": it.get("gpslati"),
                    "lng": it.get("gpslong"),
                }
            )
        total = int(body.get("totalCount", 0))
        if page * 1000 >= total:
            break
        page += 1
    return rows


def build_tago_mapping(stops) -> dict:
    """env TAGO_KEY/VITE_TAGO_KEY가 있으면 TAGO 수집 후 매핑한다.

    **키가 없어도, 네트워크가 실패해도 예외를 던지지 않는다.**
    """
    key = os.environ.get("TAGO_KEY") or os.environ.get("VITE_TAGO_KEY")
    if not key:
        print("TAGO 키 없음 - 매핑 skip")
        return {}
    try:
        tago_stops = _fetch_tago_stops(key)
    except Exception as e:  # 네트워크/파싱 실패는 비치명적 → 폴백
        print(f"TAGO 수집 실패 - 매핑 skip ({e})")
        return {}
    if not tago_stops:
        print("TAGO 응답 비어 있음 - 매핑 skip")
        return {}
    mapping = nearest_tago(stops, tago_stops, radius=50)
    print(f"TAGO 정류소 {len(tago_stops)}건 수집 → 매핑 {len(mapping)}건")
    return mapping
