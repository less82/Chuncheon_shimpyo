// B2C "앉아서 기다리는 길" 정렬 코어 — 순수 함수. B2G 산식은 이 파일을 절대 import하지 않는다.
// 확인된 시설 존재를 우선한다: yes만 가점, no·unknown은 동일 0(감점 아님).

import type { Stop } from "../types/stop";
import { KIND_LABEL, facilityLabel, sourceBadge } from "./facilityText";

/**
 * 확인된 편의시설 존재를 우선하는 정렬 코어. [0,1].
 *   shelter.status==="yes" → 1 (쉘터가 확인되면 그늘·의자를 모두 갖춘 것으로 본다)
 *   그 밖에는 comfortScore = (seatYes + shadeYes) / 2
 * - seatYes = seat.status==="yes" ? 1 : 0 (shade 동일). yes만 가점 — no·unknown 모두 0(감점 아님).
 * - 쉘터는 미확인이 대다수라 감점 근거로 쓰지 않는다. 확인된 "있음"일 때만 만점으로 올린다.
 */
export function comfortScore(stop: Stop): number {
  const { seat, shade, shelter } = stop.facilities;
  if (shelter.status === "yes") return 1;

  const seatYes = seat.status === "yes" ? 1 : 0;
  const shadeYes = shade.status === "yes" ? 1 : 0;

  return (seatYes + shadeYes) / 2;
}

/**
 * 이유 문구 "재료"(확인된 시설의 근거 문자열 배열). facilityText 재사용.
 * comfort 대상 시설은 seat·shade 2종 + 확인된 쉘터 — sign(도착안내기)은 comfort와 무관.
 * 미확인 시설은 "○○ 미확인"으로 표기하되, 쉘터는 "있음"으로 확인된 경우에만 덧붙인다
 * (쉘터는 미확인이 대다수라 매번 "미확인"을 늘어놓으면 화면만 어지럽다).
 */
export function comfortReasons(stop: Stop): string[] {
  const { seat, shade, shelter } = stop.facilities;

  const kinds: Array<{ key: "seat" | "shade" | "shelter"; info: (typeof stop.facilities)["seat"] }> = [
    { key: "seat", info: seat },
    { key: "shade", info: shade },
    ...(shelter.status === "yes" ? [{ key: "shelter" as const, info: shelter }] : []),
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
