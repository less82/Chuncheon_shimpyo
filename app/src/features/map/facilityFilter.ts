import type { Stop } from "../../types/stop";

/** 시설 필터 상태 — 켜진(true) 시설만 요구 조건에 포함된다. */
export interface FacilityFilterState {
  shade: boolean;
  seat: boolean;
  light: boolean;
}

type FilterKey = keyof FacilityFilterState;

/**
 * 켜진 시설이 "전부 있음(status==='yes')"인 정류장 id 집합(AND).
 * "미확인(unknown)"·"없음(no)"은 제외 — 근거 있는 "있음"만 강조한다.
 * 아무 시설도 켜지 않으면 전체 정류장 id 를 반환한다.
 */
export function filterStopsByFacility(
  stops: Stop[],
  active: FacilityFilterState,
): Set<string> {
  const required = (Object.keys(active) as FilterKey[]).filter((k) => active[k]);
  if (required.length === 0) {
    return new Set(stops.map((s) => s.id));
  }
  const result = new Set<string>();
  for (const stop of stops) {
    const ok = required.every((k) => stop.facilities[k].status === "yes");
    if (ok) result.add(stop.id);
  }
  return result;
}
