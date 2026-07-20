// B2C "앉아서 기다리는 길" 정렬 코어 — 순수 함수. B2G 산식은 이 파일을 절대 import하지 않는다.
// 확인된 시설 존재를 우선한다: yes만 가점, no·unknown은 동일 0(감점 아님).

import type { Stop } from "../types/stop";
import { KIND_LABEL, facilityLabel, sourceBadge } from "./facilityText";

/**
 * 확인된 편의시설 존재를 우선하는 정렬 코어. [0,1].
 * 분자 전체를 활성 가중치 합으로 나눈다(괄호 그대로).
 *   comfortScore = (seatYes + shadeYes + (night ? lightYes : 0)) / activeWeightSum
 * - seat·shade는 상시 활성(가중치 각 1). light는 night=true일 때만 활성(가중치 1).
 * - seatYes = seat.status==="yes" ? 1 : 0  (shade·light 동일). yes만 가점 — no·unknown 모두 0(감점 아님).
 * - activeWeightSum = 주간 2(seat+shade), 야간 3(seat+shade+light).
 */
export function comfortScore(stop: Stop, opts?: { night?: boolean }): number {
  const night = opts?.night ?? false;
  const { seat, shade, light } = stop.facilities;
  const seatYes = seat.status === "yes" ? 1 : 0;
  const shadeYes = shade.status === "yes" ? 1 : 0;
  const lightYes = light.status === "yes" ? 1 : 0;

  const numerator = seatYes + shadeYes + (night ? lightYes : 0);
  const activeWeightSum = night ? 3 : 2;

  return numerator / activeWeightSum;
}

/**
 * 이유 문구 "재료"(확인된 시설의 근거 문자열 배열). facilityText 재사용.
 * comfort 대상 시설은 seat·shade·light 3종뿐 — sign(도착안내기)은 comfort와 무관.
 * 미확인 시설은 "○○ 미확인"으로 표기.
 */
export function comfortReasons(stop: Stop, opts?: { night?: boolean }): string[] {
  const night = opts?.night ?? false;
  const { seat, shade, light } = stop.facilities;

  const kinds: Array<{ key: "seat" | "shade" | "light"; info: (typeof stop.facilities)["seat"] }> = [
    { key: "seat", info: seat },
    { key: "shade", info: shade },
    ...(night ? [{ key: "light" as const, info: light }] : []),
  ];

  return kinds.map(({ key, info }) => {
    const label = KIND_LABEL[key];
    const status = facilityLabel(info);
    if (info.status === "unknown") {
      return `${label} ${status}`;
    }
    const badge = sourceBadge(info);
    return badge ? `${label} ${status} (${badge})` : `${label} ${status}`;
  });
}
