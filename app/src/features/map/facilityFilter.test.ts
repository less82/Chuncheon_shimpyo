import { describe, it, expect } from "vitest";
import type { Stop, Facility } from "../../types/stop";
import { filterStopsByFacility, type FacilityFilterState } from "./facilityFilter";

const make = (
  id: string,
  shade: Facility,
  seat: Facility,
  shelter: Facility,
): Stop => ({
  id,
  stopNo: id,
  name: id,
  lat: 37.88,
  lng: 127.73,
  routes: [],
  facilities: {
    shade: { status: shade, source: shade === "yes" ? "roadview" : "none" },
    seat: { status: seat, source: seat === "yes" ? "bench_registry" : "none" },
    shelter: { status: shelter, source: shelter === "yes" ? "roadview" : "none" },
    sign: { status: "unknown", source: "none" },
  },
});

const stops: Stop[] = [
  make("a", "yes", "yes", "yes"), // 전부 있음
  make("b", "yes", "unknown", "no"), // 그늘만 있음
  make("c", "unknown", "yes", "unknown"), // 의자만 있음
  make("d", "no", "no", "no"), // 전부 없음
];

const none: FacilityFilterState = { shade: false, seat: false, shelter: false };

describe("filterStopsByFacility", () => {
  it("아무것도 안 켜면 전체 포함", () => {
    const set = filterStopsByFacility(stops, none);
    expect(set).toEqual(new Set(["a", "b", "c", "d"]));
  });

  it("그늘만 켜면 그늘 있음인 정류장만 (미확인·없음 제외)", () => {
    const set = filterStopsByFacility(stops, { ...none, shade: true });
    expect(set).toEqual(new Set(["a", "b"]));
  });

  it("그늘+의자면 둘 다 있음인 정류장만 (AND)", () => {
    const set = filterStopsByFacility(stops, { ...none, shade: true, seat: true });
    expect(set).toEqual(new Set(["a"]));
  });

  it("쉘터만 켜면 쉘터 있음만, unknown/no 제외", () => {
    const set = filterStopsByFacility(stops, { ...none, shelter: true });
    expect(set).toEqual(new Set(["a"]));
  });
});
