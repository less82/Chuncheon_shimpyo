import type { Stop } from "../../types/stop";

/**
 * 지도 마커 색: 그늘이 "있음"으로 확정된 정류장만 초록, 그 외(미확인/없음)는 회색.
 * 근거 없는 곳을 초록으로 칠하지 않는다.
 */
export function markerColor(stop: Stop): "green" | "gray" {
  return stop.facilities.shade.status === "yes" ? "green" : "gray";
}

/** 마커 색 이름 → 실제 색상 값. */
export const MARKER_HEX: Record<"green" | "gray", string> = {
  green: "#15803d",
  gray: "#8a8178",
};

/** 시설 필터 비매칭 정류장을 흐리게 표시할 때의 채우기 불투명도. */
export const DIM_OPACITY = 0.25;
