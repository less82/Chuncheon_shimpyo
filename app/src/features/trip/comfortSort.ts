// B2C "앉아서 기다리는 길" — 목적지 길찾기 후보 정렬 + 이유 문구.
// 순수 함수. B2G(admin) 산식은 이 파일도 comfort.ts도 절대 import하지 않는다.
// 점수 숫자는 화면에 절대 노출하지 않는다(정렬·문구만 사용).

import type { TripOption } from "../../types/trip";
import type { Stop } from "../../types/stop";
import { comfortScore } from "../../lib/comfort";
import { sourceBadge } from "../../lib/facilityText";

/** 정렬 모드. 기본 UI 기본값은 "comfort". */
export type SortMode = "nearest" | "comfort";

/**
 * 도보 1분당 comfort 감점.
 * 브리핑 스펙: "+1분이면 확인 정류장이 이기고, +8분이면 최단이 이긴다"를
 * comfortScore=1.0(의자·그늘 둘 다 확인) 후보 기준으로 맞춘다.
 * 교차점(d) = comfortScore / PENALTY_PER_MIN.
 *   comfortScore=1.0(의자·그늘 둘 다 확인): 교차점 ≈ 1/0.15 ≈ 6.7분
 *     → +1분엔 확인 정류장 승, +8분엔 최단 승.
 *   comfortScore=0.5(단일 시설만 확인): 교차점 ≈ 0.5/0.15 ≈ 3.3분.
 */
const PENALTY_PER_MIN = 0.15;

/**
 * options를 mode에 따라 정렬(불변 — 새 배열 반환).
 * - nearest: walkMin 오름차순.
 * - comfort: (comfortScore(boardStop) − walkMin*PENALTY_PER_MIN) 내림차순.
 * boardStop은 stopsById에서 조회. 없으면 comfort 0 취급.
 */
export function sortByComfort(
  options: TripOption[],
  stopsById: Map<string, Stop>,
  mode: SortMode,
): TripOption[] {
  const sorted = [...options];

  if (mode === "nearest") {
    sorted.sort((a, b) => a.walkMin - b.walkMin);
    return sorted;
  }

  const rank = (opt: TripOption): number => {
    const stop = stopsById.get(opt.boardStopId);
    const score = stop ? comfortScore(stop) : 0;
    return score - opt.walkMin * PENALTY_PER_MIN;
  };

  sorted.sort((a, b) => rank(b) - rank(a));
  return sorted;
}

/**
 * 카드용 이유 문구 — 시설별 4종 중 하나. 점수 숫자 절대 미포함.
 * 우선순위: 의자 yes → 그늘 yes → (야간 && 조명 yes) → 미확인.
 */
export function comfortSentence(stop: Stop, opts?: { night?: boolean }): string {
  const night = opts?.night ?? false;
  const { seat, shade, light } = stop.facilities;

  if (seat.status === "yes") {
    const badge = sourceBadge(seat);
    return badge
      ? `앉아서 기다릴 수 있어요 (${badge})`
      : "앉아서 기다릴 수 있어요";
  }

  if (shade.status === "yes") {
    return "그늘이 확인된 정류장이에요";
  }

  if (night && light.status === "yes") {
    return "조명이 확인된 정류장이에요";
  }

  return "시설 정보가 아직 확인되지 않았어요";
}
