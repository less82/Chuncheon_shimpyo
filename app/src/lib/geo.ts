// 지구 반지름(m). WGS84 위경도 두 점 사이 거리 계산(Haversine).
const EARTH_RADIUS_M = 6371000;

export interface LatLng {
  lat: number;
  lng: number;
}

/** 두 위경도 좌표 사이의 대권거리(미터). */
export function haversine(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
