import { haversine } from "./geo";

export interface WalkRoute {
  minutes: number;
  polyline: [number, number][]; // [lat, lng] 좌표열
  real: boolean; // true=OSRM 실경로, false=직선 폴백
}

export interface Point {
  lat: number;
  lng: number;
}

const TIMEOUT_MS = 2500;
const WALK_SPEED_M_PER_MIN = 80; // 도보 약 4.8km/h

/** 직선(haversine) 기반 도보 폴백. 오프라인/실패 시 항상 이 값. */
export function straightWalk(from: Point, to: Point): WalkRoute {
  const meters = haversine(from, to);
  return {
    minutes: Math.max(1, Math.round(meters / WALK_SPEED_M_PER_MIN)),
    polyline: [
      [from.lat, from.lng],
      [to.lat, to.lng],
    ],
    real: false,
  };
}

/**
 * 도보 경로. OSRM foot 서비스를 2.5초 타임아웃으로 시도하고, 성공하면
 * 실제 경로 좌표(real:true)를, 실패/오프라인/타임아웃이면 직선 haversine
 * 폴백(real:false)을 반환한다. 어떤 경우에도 무한 대기하지 않는다.
 */
export async function getWalkRoute(
  from: Point,
  to: Point,
): Promise<WalkRoute> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url =
      "https://router.project-osrm.org/route/v1/foot/" +
      `${from.lng},${from.lat};${to.lng},${to.lat}` +
      "?overview=full&geometries=geojson";
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return straightWalk(from, to);
    const data = (await res.json()) as {
      code?: string;
      routes?: {
        duration: number;
        geometry: { coordinates: [number, number][] };
      }[];
    };
    const route = data.routes?.[0];
    const coords = route?.geometry?.coordinates;
    if (!route || !coords || coords.length === 0) {
      return straightWalk(from, to);
    }
    return {
      minutes: Math.max(1, Math.round(route.duration / 60)),
      polyline: coords.map(([lng, lat]) => [lat, lng] as [number, number]),
      real: true,
    };
  } catch {
    return straightWalk(from, to);
  } finally {
    clearTimeout(timer);
  }
}
