// 시설 3상태 표시 문구 — 순수 함수 (전 화면 공통 계약).
// 절대 규칙: 출처는 로드뷰(촬영시점) 또는 각 대장뿐. 금지 문구는 절대 만들지 않는다.

import type { Facility, FacilityInfo, Stop } from "../types/stop";

export type FacilityKind = "shade" | "seat" | "light" | "sign";

/** 시설 종류별 한글 라벨 (아이콘과 항상 병기). */
export const KIND_LABEL: Record<FacilityKind, string> = {
  shade: "그늘",
  seat: "의자",
  light: "조명",
  sign: "도착안내기",
};

/** 3상태 한글 라벨. */
export function facilityLabel(info: FacilityInfo): string {
  switch (info.status) {
    case "yes":
      return "있음";
    case "no":
      return "없음";
    default:
      return "미확인";
  }
}

/** 상태 → 색 이름(있음=green / 없음=red / 미확인=gray). 색만으로 구분 금지. */
export function statusColor(status: Facility): "green" | "red" | "gray" {
  switch (status) {
    case "yes":
      return "green";
    case "no":
      return "red";
    default:
      return "gray";
  }
}

// 각 대장 출처의 한글 명칭.
const REGISTRY_LABEL: Record<string, string> = {
  bench_registry: "벤치",
  shade_registry: "그늘막",
  light_registry: "가로등",
};

/**
 * 출처 배지 문구.
 * - roadview → "로드뷰 확인 (촬영 YYYY.MM)"
 * - *_registry → "○○대장 기준"
 * - none → "" (근거 없음 = 미확인)
 * 금지 문구는 절대 반환하지 않는다.
 */
export function sourceBadge(info: FacilityInfo): string {
  if (info.source === "roadview") {
    const when = info.capturedAt ?? "";
    return when ? `로드뷰 확인 (촬영 ${when})` : "로드뷰 확인";
  }
  if (info.source === "sign_registry") return "버스정보단말기(BIT) 기준";
  const registry = REGISTRY_LABEL[info.source];
  if (registry) return `${registry}대장 기준`;
  return "";
}

/** 한 줄 시설 요약 — 예: "그늘 있음, 의자 있음, 조명 미확인, 도착안내기 미확인". */
export function facilitySummary(stop: Stop): string {
  const f = stop.facilities;
  return (
    `${KIND_LABEL.shade} ${facilityLabel(f.shade)}, ` +
    `${KIND_LABEL.seat} ${facilityLabel(f.seat)}, ` +
    `${KIND_LABEL.light} ${facilityLabel(f.light)}, ` +
    `${KIND_LABEL.sign} ${facilityLabel(f.sign)}`
  );
}
