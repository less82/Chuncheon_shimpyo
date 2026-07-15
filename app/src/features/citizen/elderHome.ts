import type { Stop } from "../../types/stop";
import { haversine, type LatLng } from "../../lib/geo";

/**
 * 어른용 첫 화면의 "내 정류장" 결정.
 * 1) 즐겨찾기 중 stops 로 해석되는 첫 정류장
 * 2) 없으면 pos(현위치, 호출부가 거부 시 시청 좌표 전달) 최근접
 * 3) stops 가 비면 null
 */
export function resolvePrimaryStop(
  favIds: string[],
  stops: Stop[],
  pos: LatLng,
): Stop | null {
  if (stops.length === 0) return null;
  for (const id of favIds) {
    const fav = stops.find((s) => s.id === id);
    if (fav) return fav;
  }
  return nearbyStops(stops, pos, 1)[0] ?? null;
}

/** pos 기준 가까운 순 정렬 후 상위 n개. excludeId 는 제외. */
export function nearbyStops(
  stops: Stop[],
  pos: LatLng,
  n: number,
  excludeId?: string,
): Stop[] {
  return stops
    .filter((s) => s.id !== excludeId)
    .map((s) => ({ s, d: haversine(pos, { lat: s.lat, lng: s.lng }) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map((x) => x.s);
}
