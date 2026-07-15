"""빌드 시점 지오코딩 (Nominatim/OSM, 키 불필요, 1req/sec 준수).

정직성/견고성 규칙:
- 네트워크가 실패해도 파이프라인이 죽지 않는다. 실패한 주소는 캐시에 남기지
  않고 skip -> 해당 그늘은 unknown으로 남는다.
- 결과는 geocode_cache.json에 캐시. 재실행 시 캐시된 주소는 다시 조회하지 않는다.
- 시간이 오래 걸리면 일부만 지오코딩하고 나머지는 unknown으로 둔다.
"""
import json
import os
import time
import urllib.parse
import urllib.request

_HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_PATH = os.path.join(_HERE, "geocode_cache.json")

_NOMINATIM = "https://nominatim.openstreetmap.org/search"
_UA = "swimpyo-jeongryujang/1.0 (chuncheon hackathon data pipeline)"


def load_cache(path: str = CACHE_PATH) -> dict:
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def save_cache(cache: dict, path: str = CACHE_PATH) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=1)


def _geocode_once(addr: str, timeout: float = 8.0):
    """단일 주소 지오코딩. 성공 시 {lat,lng}, 실패/무결과 시 None."""
    params = urllib.parse.urlencode(
        {"q": addr, "format": "json", "limit": 1, "countrycodes": "kr"}
    )
    req = urllib.request.Request(f"{_NOMINATIM}?{params}", headers={"User-Agent": _UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.load(resp)
    except Exception:
        return None  # 네트워크/파싱 실패 -> skip, 파이프라인 계속
    if not data:
        return None
    try:
        return {"lat": float(data[0]["lat"]), "lng": float(data[0]["lon"])}
    except (KeyError, ValueError, IndexError):
        return None


def geocode_addresses(
    addresses, cache: dict | None = None, max_new: int | None = None, path: str = CACHE_PATH
) -> dict:
    """주소 목록을 지오코딩해 캐시에 채운다. 1req/sec 준수.

    - 이미 캐시에 있는 주소는 건너뛴다.
    - max_new: 이번 실행에서 새로 조회할 최대 건수(시간 제한용). None이면 전부.
    - 어떤 실패도 예외를 전파하지 않는다.
    반환: 갱신된 캐시.
    """
    cache = load_cache(path) if cache is None else cache
    todo = []
    seen = set()
    for a in addresses:
        key = str(a).strip()
        if not key or key in cache or key in seen:
            continue
        seen.add(key)
        todo.append(key)
    if max_new is not None:
        todo = todo[:max_new]

    for i, addr in enumerate(todo):
        result = _geocode_once(addr)
        if result is not None:
            cache[addr] = result
        # 실패는 캐시에 넣지 않음 -> 다음 실행 때 재시도 가능, 지금은 unknown
        if i < len(todo) - 1:
            time.sleep(1.05)  # Nominatim 1req/sec 예의
        # 중간 저장(중단되어도 진행분 보존)
        if (i + 1) % 20 == 0:
            save_cache(cache, path)
    save_cache(cache, path)
    return cache
