// 도보 경로선 컨트롤러 — 현위치→선택 정류장 사이 Leaflet Polyline 하나를 관리.
// 실경로(real:true)는 파란 실선, 직선 폴백(real:false)은 회색 점선으로 그려
// "실경로 아님"을 시각적으로도 정직하게 구분한다.

import L from "leaflet";

export class WalkLayer {
  private line: L.Polyline | null = null;
  private readonly map: L.Map;

  constructor(map: L.Map) {
    this.map = map;
  }

  /** 경로선을 다시 그린다(기존 선은 제거). */
  draw(polyline: [number, number][], real: boolean): void {
    this.clear();
    if (polyline.length < 2) return;
    this.line = L.polyline(polyline, {
      color: real ? "#26344a" : "#565d66",
      weight: 5,
      opacity: 0.85,
      dashArray: real ? undefined : "6 10",
      lineCap: "round",
    }).addTo(this.map);
  }

  clear(): void {
    if (this.line) {
      this.line.remove();
      this.line = null;
    }
  }
}
