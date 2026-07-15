// 행정 대시보드 — 쉘터 설치 후보 필터 엔진.
//
// 절대 규칙: 합성 점수(가중치 점수) 없음. 조건 필터와 실측 수치만 다룬다.
//   "상위 N%" 는 demand(양방향 합산 승차)가 있는 정류장 모집단의 실측 분위수로
//   계산한다. demand 없는 정류장은 승차 미확인이므로 상위% 조건에서 제외한다.
//   SEASON_PRESETS 는 저장된 criteria 조합일 뿐, 별도 로직이 아니다.

import type { Stop } from "../../types/stop";

/** 한낮 시간대 = 11,12,13,14,15,16시. 실측 승차합의 기준 구간. */
export const MIDDAY_HOURS = [11, 12, 13, 14, 15, 16] as const;

export interface FilterCriteria {
  /** 한낮 승차 상위 N%(실측 분위수). 예: 25 → 상위 25%. */
  middayTopPercent?: number;
  /** 그늘 미확인 정류장만. */
  shadeUnknown?: boolean;
  /** 의자 미확인 정류장만. */
  seatUnknown?: boolean;
  /** 쉘터(그늘+의자 모두 있음)가 아닌 곳만. */
  notShelter?: boolean;
  /** 지정 시 SEASON_PRESETS[season] 를 기준 조건으로 사용(편의). */
  season?: SeasonKey;
}

/**
 * 한낮(11~16시) 승차합 — 양방향 합산 기준. demand 없으면 null(승차 미확인).
 */
export function middayBoarding(stop: Stop): number | null {
  if (!stop.demand) return null;
  const { byHour } = stop.demand;
  let sum = 0;
  for (const h of MIDDAY_HOURS) sum += byHour[h] ?? 0;
  return sum;
}

/** 쉘터 = 그늘·의자 모두 "있음"으로 확인된 정류장. */
function isShelter(stop: Stop): boolean {
  return (
    stop.facilities.shade.status === "yes" &&
    stop.facilities.seat.status === "yes"
  );
}

/**
 * 한낮 승차 상위 N% 의 실측 컷오프(경계값)를 계산한다.
 * 모집단 = demand 있는 정류장. 반환값 이상이면 상위 N% 에 든다.
 * demand 있는 정류장이 없으면 null.
 */
function middayCutoff(stops: Stop[], topPercent: number): number | null {
  const sums = stops
    .map(middayBoarding)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b); // 오름차순
  if (sums.length === 0) return null;
  const pct = Math.min(100, Math.max(0, topPercent));
  // 뽑을 개수 k = ceil(모집단 * N%). k번째로 큰 값이 컷오프.
  const k = Math.max(1, Math.ceil((sums.length * pct) / 100));
  return sums[sums.length - k];
}

/** criteria.season 이 있으면 프리셋을 기준으로, 명시 필드로 덮어써 해석한다. */
function resolve(criteria: FilterCriteria): FilterCriteria {
  if (!criteria.season) return criteria;
  return { ...SEASON_PRESETS[criteria.season], ...criteria };
}

/**
 * 조건 필터를 AND 로 적용해 후보 정류장을 반환한다. 점수 합성 없음.
 */
export function applyFilters(stops: Stop[], criteria: FilterCriteria): Stop[] {
  const c = resolve(criteria);

  // 상위% 컷오프는 전체 모집단에서 한 번만 계산.
  const cutoff =
    c.middayTopPercent !== undefined
      ? middayCutoff(stops, c.middayTopPercent)
      : null;

  return stops.filter((s) => {
    if (c.middayTopPercent !== undefined) {
      const m = middayBoarding(s);
      // demand 없으면 승차 미확인 → 상위% 조건에서 제외.
      if (m === null) return false;
      if (cutoff === null || m < cutoff) return false;
    }
    if (c.shadeUnknown && s.facilities.shade.status !== "unknown") return false;
    if (c.seatUnknown && s.facilities.seat.status !== "unknown") return false;
    if (c.notShelter && isShelter(s)) return false;
    return true;
  });
}

// ---- 계절 프리셋 (저장된 criteria 조합, 별도 로직 아님) ----

export type SeasonKey = "summer" | "winter" | "spring" | "fall";

export const SEASON_LABELS: Record<SeasonKey, string> = {
  summer: "여름 (폭염·그늘)",
  winter: "겨울 (한파·의자)",
  spring: "봄 (완화 · 그늘)",
  fall: "가을 (완화 · 쉘터)",
};

/** 한 줄 설명 — 각 프리셋이 곧 조건임을 화면에 그대로 노출한다(점수 아님). */
export const SEASON_DESC: Record<SeasonKey, string> = {
  summer: "한낮 승차 상위 25% · 그늘 미확인",
  winter: "한낮 승차 상위 25% · 의자 미확인 · 쉘터 아님",
  spring: "한낮 승차 상위 40% · 그늘 미확인",
  fall: "한낮 승차 상위 40% · 쉘터 아님",
};

export const SEASON_PRESETS: Record<SeasonKey, FilterCriteria> = {
  // 여름: 폭염 — 승차 많은데 그늘이 확인되지 않은 곳.
  summer: { middayTopPercent: 25, shadeUnknown: true },
  // 겨울: 한파 — 승차 많고 앉을 곳(의자) 미확인이며 완비 쉘터가 아닌 곳.
  winter: { middayTopPercent: 25, seatUnknown: true, notShelter: true },
  // 봄: 후보를 넓혀(상위 40%) 그늘 미확인 우선.
  spring: { middayTopPercent: 40, shadeUnknown: true },
  // 가을: 후보를 넓혀(상위 40%) 완비 쉘터가 아닌 곳.
  fall: { middayTopPercent: 40, notShelter: true },
};
