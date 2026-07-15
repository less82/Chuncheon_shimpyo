import { describe, it, expect } from "vitest";
import type { Stop, Facility } from "../../types/stop";
import { markerColor } from "./markerColor";

const stopWithShade = (status: Facility): Stop => ({
  id: "x",
  stopNo: "1",
  name: "테스트",
  lat: 37.88,
  lng: 127.73,
  routes: [],
  facilities: {
    shade: { status, source: status === "yes" ? "roadview" : "none" },
    seat: { status: "unknown", source: "none" },
    light: { status: "unknown", source: "none" },
    sign: { status: "unknown", source: "none" },
  },
});

describe("markerColor", () => {
  it("그늘 있음 → green", () => {
    expect(markerColor(stopWithShade("yes"))).toBe("green");
  });
  it("그늘 미확인 → gray", () => {
    expect(markerColor(stopWithShade("unknown"))).toBe("gray");
  });
  it("그늘 없음 → gray (초록은 확정된 그늘일 때만)", () => {
    expect(markerColor(stopWithShade("no"))).toBe("gray");
  });
});
