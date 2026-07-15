import { describe, it, expect } from "vitest";
import type { Facility, Stop } from "../../types/stop";
import { suggestAlt } from "./altStop";

// 시설 4종을 간단히 지정해 Stop 픽스처를 만든다.
function stop(
  over: Partial<Stop> & {
    id: string;
    lat: number;
    lng: number;
    routes: string[];
    fac?: Partial<Record<"shade" | "seat" | "light" | "sign", Facility>>;
  },
): Stop {
  const f = over.fac ?? {};
  const info = (s: Facility | undefined) =>
    s === undefined
      ? ({ status: "unknown", source: "none" } as const)
      : s === "yes"
        ? ({ status: "yes", source: "roadview", capturedAt: "2026.03" } as const)
        : ({ status: s, source: "roadview", capturedAt: "2026.03" } as const);
  return {
    id: over.id,
    stopNo: over.stopNo ?? over.id,
    name: over.name ?? `정류장${over.id}`,
    lat: over.lat,
    lng: over.lng,
    routes: over.routes,
    facilities: {
      shade: info(f.shade),
      seat: info(f.seat),
      light: info(f.light),
      sign: info(f.sign),
    },
    headwayMin: over.headwayMin,
  };
}

// 기준 정류장: 의자가 확인상태로 '없음'(우위 근거가 될 수 있음), 배차 20분.
const current = stop({
  id: "C",
  lat: 37.88,
  lng: 127.73,
  routes: ["7", "12"],
  fac: { seat: "no" },
  headwayMin: 20,
});

// 약 145m 떨어진, 같은 7번 노선, 의자 '있음'(우위) 후보.
const nearBetter = stop({
  id: "A",
  name: "그늘쉼터",
  lat: 37.8813,
  lng: 127.73,
  routes: ["7", "99"],
  fac: { seat: "yes", shade: "yes" },
  headwayMin: 20,
});

describe("suggestAlt — 4조건 전부 만족할 때만 제안", () => {
  it("(c) 4조건을 모두 만족하면 후보를 반환한다", () => {
    // arrivalMin(15) ≥ 도보(~1.8분) 이므로 곧도착 숨김에 걸리지 않음.
    const alt = suggestAlt(current, [current, nearBetter], 15);
    expect(alt?.id).toBe("A");
  });

  it("(a) 우위 근거 시설이 미확인이면 null (미확인을 우위로 쓰지 않음)", () => {
    // 후보 의자는 yes지만, 기준 의자를 미확인으로 바꾸면 확인된 우위가 사라진다.
    const curUnknownSeat = stop({
      id: "C",
      lat: 37.88,
      lng: 127.73,
      routes: ["7", "12"],
      // 모든 시설 미확인
      headwayMin: 20,
    });
    const alt = suggestAlt(curUnknownSeat, [curUnknownSeat, nearBetter], 15);
    expect(alt).toBeNull();
  });

  it("(b) 곧 버스가 온다면(arrivalMin < 도보시간) null", () => {
    // 도보 ~1.8분보다 작은 arrivalMin=1 → 숨김.
    const alt = suggestAlt(current, [current, nearBetter], 1);
    expect(alt).toBeNull();
  });

  it("(d) 같은 노선이 없으면 null", () => {
    const otherRoute = stop({
      id: "B",
      lat: 37.8813,
      lng: 127.73,
      routes: ["500", "600"],
      fac: { seat: "yes" },
      headwayMin: 20,
    });
    const alt = suggestAlt(current, [current, otherRoute], 15);
    expect(alt).toBeNull();
  });

  it("(e) 300m를 초과하면 null", () => {
    const far = stop({
      id: "F",
      lat: 37.884, // 약 445m
      lng: 127.73,
      routes: ["7"],
      fac: { seat: "yes" },
      headwayMin: 20,
    });
    const alt = suggestAlt(current, [current, far], 15);
    expect(alt).toBeNull();
  });

  it("도보시간이 배차의 절반을 넘으면 null (④ 위반)", () => {
    // 같은 조건이지만 배차를 2분으로 → 절반 1분 < 도보 1.8분 → null.
    const shortHeadway = { ...current, headwayMin: 2 };
    const alt = suggestAlt(shortHeadway, [shortHeadway, nearBetter], 15);
    expect(alt).toBeNull();
  });
});
