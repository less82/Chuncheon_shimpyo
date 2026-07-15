import { describe, it, expect } from "vitest";
import { resolvePrimaryStop, nearbyStops } from "./elderHome";
import type { Stop } from "../../types/stop";

const mk = (id: string, lat: number, lng: number): Stop => ({
  id,
  stopNo: id,
  name: id,
  lat,
  lng,
  routes: [],
  facilities: {
    shade: { status: "unknown", source: "none" },
    seat: { status: "unknown", source: "none" },
    light: { status: "unknown", source: "none" },
    sign: { status: "unknown", source: "none" },
  },
});

const stops = [
  mk("A", 37.88, 127.73),
  mk("B", 37.95, 127.8),
  mk("C", 37.881, 127.731),
];
const here = { lat: 37.88, lng: 127.73 };

describe("resolvePrimaryStop", () => {
  it("즐겨찾기가 있으면 그 정류장을 고른다", () => {
    expect(resolvePrimaryStop(["B"], stops, here)?.id).toBe("B");
  });
  it("즐겨찾기가 없으면 최근접을 고른다", () => {
    expect(resolvePrimaryStop([], stops, here)?.id).toBe("A");
  });
  it("stops 가 비면 null 이다", () => {
    expect(resolvePrimaryStop(["B"], [], here)).toBeNull();
  });
});

describe("nearbyStops", () => {
  it("가까운 순 n개를 주고 excludeId 는 뺀다", () => {
    const near = nearbyStops(stops, here, 2, "A");
    expect(near.map((s) => s.id)).toEqual(["C", "B"]);
  });
});
