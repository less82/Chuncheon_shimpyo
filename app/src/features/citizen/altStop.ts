// 대안 정류장 제안 — 보조(P1) 기능. 절대 주인공이 아니다.
// "더운데 누가 옆 정류장까지 가나요?"에 대한 답이 여기 있다:
// 4중 조건을 '전부' 만족할 때만 후보를 반환하고, 하나라도 미확인/미달이면 숨긴다.
// 특히 곧 버스가 오면(도보시간보다 빨리) 절대 제안하지 않는다.

import type { Stop } from "../../types/stop";
import { haversine } from "../../lib/geo";
import { KIND_LABEL, type FacilityKind } from "../../lib/facilityText";

/** 도보 속도(고령자 보행 가정). */
export const WALK_SPEED_M_PER_MIN = 80;
/** 대안 후보 최대 거리(m). */
export const MAX_ALT_DISTANCE_M = 300;
/** 배차간격 캐시가 없을 때 폴백(분). arrivals.headwayFallback 과 동일. */
const DEFAULT_HEADWAY_MIN = 15;

const FACILITY_KINDS: FacilityKind[] = ["shade", "seat", "light", "sign"];

/** 후보까지 도보 소요(분). 거리(m) / 80m·분. */
export function walkMinutes(current: Stop, alt: Stop): number {
  return haversine(current, alt) / WALK_SPEED_M_PER_MIN;
}

/** 두 정류장이 공유하는 노선번호(같은 노선 판정 · 안내 문구용). */
export function sharedRoutes(a: Stop, b: Stop): string[] {
  const set = new Set(a.routes);
  return b.routes.filter((r) => set.has(r));
}

/**
 * '확인된 시설끼리' 비교해 후보가 확실히 우위인 시설 종류.
 * 우위 = 기준 정류장이 확인상태로 '없음'(no)인데 후보는 '있음'(yes).
 * 어느 한쪽이라도 미확인(unknown)이면 근거로 쓰지 않는다 —
 * 미확인을 '없음'으로 취급하거나 우위 근거로 유리하게 쓰지 않기 위함.
 */
export function advantageFacilities(current: Stop, alt: Stop): FacilityKind[] {
  return FACILITY_KINDS.filter(
    (k) =>
      current.facilities[k].status === "no" &&
      alt.facilities[k].status === "yes",
  );
}

/**
 * 대안 정류장 제안. 아래 4조건을 '전부' 만족하는 후보 중 최적 1개, 없으면 null.
 *   ① 같은 노선을 공유한다.
 *   ② 300m 이내(haversine).
 *   ③ 확인된 시설끼리 후보가 우위인 시설이 하나 이상(미확인은 근거 불가).
 *   ④ 도보시간(80m/분) ≤ 배차간격의 절반.
 * 또한 arrivalMin(곧 도착)이 도보시간보다 작으면 — 즉 걸어가는 사이 버스가
 * 와버리면 — 제안하지 않는다.
 */
export function suggestAlt(
  current: Stop,
  allStops: Stop[],
  arrivalMin: number,
): Stop | null {
  const headway = current.headwayMin ?? DEFAULT_HEADWAY_MIN;

  const candidates = allStops.filter((s) => {
    if (s.id === current.id) return false;
    // ① 같은 노선 공유
    if (sharedRoutes(current, s).length === 0) return false;
    // ② 300m 이내
    const meters = haversine(current, s);
    if (meters > MAX_ALT_DISTANCE_M) return false;
    // ③ 확인된 시설 우위 하나 이상
    if (advantageFacilities(current, s).length === 0) return false;
    // ④ 도보시간 ≤ 배차/2
    const walk = meters / WALK_SPEED_M_PER_MIN;
    if (walk > headway / 2) return false;
    // 곧 버스가 온다면(도보보다 빨리) 숨긴다.
    if (arrivalMin < walk) return false;
    return true;
  });

  if (candidates.length === 0) return null;

  // 우위 시설이 많은 순 → 가까운 순.
  candidates.sort((a, b) => {
    const adv =
      advantageFacilities(current, b).length -
      advantageFacilities(current, a).length;
    if (adv !== 0) return adv;
    return haversine(current, a) - haversine(current, b);
  });
  return candidates[0];
}

/** 안내 문구에 필요한 요약(도보분·우위시설 라벨·대표 공유노선). */
export interface AltHint {
  stop: Stop;
  walkMin: number;
  facilities: string[]; // 우위 시설 한글 라벨
  route: string; // 대표 공유 노선번호
}

/** suggestAlt 결과를 은은한 안내 문구용 데이터로 변환. */
export function describeAlt(current: Stop, alt: Stop): AltHint {
  return {
    stop: alt,
    walkMin: Math.max(1, Math.round(walkMinutes(current, alt))),
    facilities: advantageFacilities(current, alt).map((k) => KIND_LABEL[k]),
    route: sharedRoutes(current, alt)[0] ?? "",
  };
}
