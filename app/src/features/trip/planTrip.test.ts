import { describe, it, expect } from "vitest";
import { planTrip } from "./planTrip";
import type { Stop } from "../../types/stop";
import type { RouteInfo } from "../../types/route";
import { makeUnknown } from "../../types/stop";

// 좌표 헬퍼 — 서로 충분히 떨어져 도보권 판정이 분리되게 배치.
function mkStop(id: string, lat: number, lng: number): Stop {
  return {
    id,
    stopNo: id,
    name: `정류장${id}`,
    lat,
    lng,
    routes: [],
    facilities: {
      shade: makeUnknown(),
      seat: makeUnknown(),
      light: makeUnknown(),
      sign: makeUnknown(),
    },
  };
}

// 춘천시청 부근. 0.001도 ≈ 90~110m.
const A = mkStop("A", 37.8800, 127.7300); // 출발 도보권
const B = mkStop("B", 37.8850, 127.7350); // 환승역
const C = mkStop("C", 37.8900, 127.7400); // 목적지
const D = mkStop("D", 37.8830, 127.7280); // 또다른 출발 도보권
const FAR = mkStop("FAR", 38.5000, 128.5000); // 도보권 밖

const stops = [A, B, C, D, FAR];
const fromPos = { lat: 37.8801, lng: 127.7301 }; // A 바로 옆

describe("planTrip", () => {
  it("같은 노선에 출발<목적지 순서면 directBus:true 옵션을 만든다", () => {
    const routes: RouteInfo[] = [
      { routeId: "r1", routeNo: "7", stops: ["A", "B", "C"] },
    ];
    const opts = planTrip(fromPos, C, stops, routes);
    expect(opts.length).toBeGreaterThan(0);
    const direct = opts.find((o) => o.directBus);
    expect(direct).toBeDefined();
    expect(direct!.legs).toHaveLength(1);
    expect(direct!.legs[0].routeNos).toContain("7");
    expect(direct!.legs[0].boardStopId).toBe("A");
    expect(direct!.legs[0].alightStopId).toBe("C");
    expect(direct!.transferStopId).toBeUndefined();
  });

  it("직행이 없고 환승역을 공유하면 legs 2개와 transferStopId 를 만든다", () => {
    const routes: RouteInfo[] = [
      { routeId: "r1", routeNo: "7", stops: ["A", "B"] }, // A→B
      { routeId: "r2", routeNo: "9", stops: ["B", "C"] }, // B→C
    ];
    const opts = planTrip(fromPos, C, stops, routes);
    expect(opts.length).toBeGreaterThan(0);
    const transfer = opts.find((o) => !o.directBus);
    expect(transfer).toBeDefined();
    expect(transfer!.legs).toHaveLength(2);
    expect(transfer!.transferStopId).toBe("B");
    expect(transfer!.legs[0].routeNos).toContain("7");
    expect(transfer!.legs[1].routeNos).toContain("9");
  });

  it("완전히 미도달이면 빈 배열을 반환한다", () => {
    const routes: RouteInfo[] = [
      { routeId: "r1", routeNo: "7", stops: ["C", "B", "A"] }, // 목적지가 상류 → 역방향 불가
    ];
    const opts = planTrip(fromPos, C, stops, routes);
    // A 에서 C 로 가는 순방향 경로 없음(A 는 C 하류)
    expect(opts).toEqual([]);
  });

  it("directBus 옵션이 환승 옵션보다 앞에 정렬된다", () => {
    const routes: RouteInfo[] = [
      { routeId: "r1", routeNo: "100", stops: ["A", "B", "C"] }, // A 직행
      { routeId: "r2", routeNo: "7", stops: ["D", "B"] }, // D→B
      { routeId: "r3", routeNo: "9", stops: ["B", "C"] }, // B→C (D 환승)
    ];
    const opts = planTrip(fromPos, C, stops, routes);
    expect(opts.length).toBeGreaterThan(1);
    expect(opts[0].directBus).toBe(true);
    const firstTransferIdx = opts.findIndex((o) => !o.directBus);
    const lastDirectIdx = opts
      .map((o) => o.directBus)
      .lastIndexOf(true);
    if (firstTransferIdx !== -1) {
      expect(lastDirectIdx).toBeLessThan(firstTransferIdx);
    }
  });
});
