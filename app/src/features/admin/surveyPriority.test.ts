import { describe, expect, it } from "vitest";
import type { Stop, FacilityInfo } from "../../types/stop";
import { PRESETS } from "../../types/priority";
import { buildSurveyPriority, presetStability, quantileRank } from "./surveyPriority";

function fac(status: FacilityInfo["status"]): FacilityInfo {
  return { status, source: status === "no" ? "bench_registry" : status === "yes" ? "roadview" : "none" };
}

function makeStop(
  id: string,
  opts?: {
    demandTotal?: number; // 한낮(11~16) 구간에 균등 분배해 넣음
    facilities?: Partial<Record<"shade" | "seat" | "light" | "sign", FacilityInfo["status"]>>;
    demand?: boolean; // false면 demand 필드 자체를 생략
  }
): Stop {
  const f = opts?.facilities ?? {};
  const byHour = new Array(24).fill(0);
  const includeDemand = opts?.demand ?? true;
  let total = 0;
  if (includeDemand) {
    const midday = opts?.demandTotal ?? 0;
    // 11~16시(6개 시간대)에 균등 분배
    const per = midday / 6;
    for (let h = 11; h <= 16; h++) byHour[h] = per;
    total = midday;
  }
  return {
    id,
    stopNo: id,
    name: `정류장 ${id}`,
    lat: 37.88,
    lng: 127.73,
    routes: ["1"],
    facilities: {
      shade: fac(f.shade ?? "unknown"),
      seat: fac(f.seat ?? "unknown"),
      light: fac(f.light ?? "unknown"),
      sign: fac(f.sign ?? "unknown"),
    },
    demand: includeDemand
      ? { byHour, total, aggregatedBidirectional: true, matchedName: `정류장 ${id}` }
      : undefined,
  };
}

describe("quantileRank", () => {
  it("최소값은 0에 가깝고 최대값은 1", () => {
    const values = [10, 20, 30, 40, 50];
    expect(quantileRank(values, 10)).toBe(0);
    expect(quantileRank(values, 50)).toBe(1);
  });

  it("중간값은 0과 1 사이", () => {
    const values = [10, 20, 30, 40, 50];
    const mid = quantileRank(values, 30);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});

describe("buildSurveyPriority", () => {
  it("(a) demand 없는 stop은 ranked에 없고 noDemand에 있음", () => {
    const withDemand = makeStop("A", { demandTotal: 100 });
    const noDemand = makeStop("B", { demand: false });
    const { ranked, noDemand: nd } = buildSurveyPriority([withDemand, noDemand], {
      demand: 1,
      unknown: 0,
      poi: 0,
    });
    expect(ranked.map((r) => r.stop.id)).toEqual(["A"]);
    expect(nd.map((c) => c.stop.id)).toEqual(["B"]);
  });

  it("(b) w={demand:1,unknown:0,poi:0}이면 순서가 한낮 승차 합 내림차순", () => {
    const s1 = makeStop("A", { demandTotal: 30 });
    const s2 = makeStop("B", { demandTotal: 100 });
    const s3 = makeStop("C", { demandTotal: 60 });
    const { ranked } = buildSurveyPriority([s1, s2, s3], { demand: 1, unknown: 0, poi: 0 });
    expect(ranked.map((r) => r.stop.id)).toEqual(["B", "C", "A"]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("(c) unknownRate: 4시설 전부 unknown → 1.0, 전부 확정(yes/no) → 0", () => {
    const allUnknown = makeStop("A", { demandTotal: 10 });
    const allConfirmed = makeStop("B", {
      demandTotal: 10,
      facilities: { shade: "yes", seat: "no", light: "yes", sign: "no" },
    });
    const { ranked } = buildSurveyPriority([allUnknown, allConfirmed], { demand: 0, unknown: 1, poi: 0 });
    const rowA = ranked.find((r) => r.stop.id === "A")!;
    const rowB = ranked.find((r) => r.stop.id === "B")!;
    expect(rowA.unknownRate).toBe(1);
    expect(rowA.unknownCount).toBe(4);
    expect(rowB.unknownRate).toBe(0);
    expect(rowB.unknownCount).toBe(0);
  });

  it("(d) no와 unknown이 unknownRate에서 다르게 계산됨", () => {
    const stopNo = makeStop("A", {
      demandTotal: 10,
      facilities: { shade: "no", seat: "unknown", light: "unknown", sign: "unknown" },
    });
    const stopUnknown = makeStop("B", {
      demandTotal: 10,
      facilities: { shade: "unknown", seat: "unknown", light: "unknown", sign: "unknown" },
    });
    const { ranked } = buildSurveyPriority([stopNo, stopUnknown], { demand: 0, unknown: 1, poi: 0 });
    const rowA = ranked.find((r) => r.stop.id === "A")!;
    const rowB = ranked.find((r) => r.stop.id === "B")!;
    // A는 shade=no(미확인 아님) → unknownCount 3, B는 전부 unknown → 4
    expect(rowA.unknownCount).toBe(3);
    expect(rowB.unknownCount).toBe(4);
    expect(rowA.unknownCount).not.toBe(rowB.unknownCount);
  });

  it("poi 미제공 시 score가 demand·unknown 2항으로만 정규화됨(분모에 poi 미포함)", () => {
    const s1 = makeStop("A", { demandTotal: 100 });
    const { ranked } = buildSurveyPriority([s1], { demand: 1, unknown: 1, poi: 1 });
    const row = ranked[0];
    expect(row.poi).toBeNull();
    // 분모는 demand+unknown 가중치 합(2)뿐이어야 함 → score = (1*D + 1*UNK)/2
    const expected = (1 * row.demandQ + 1 * row.unknownRate) / 2;
    expect(row.score).toBeCloseTo(expected, 10);
  });

  it("poi 제공 시 분모에 poi 가중치 포함", () => {
    const s1 = makeStop("A", { demandTotal: 100 });
    const poiMap = new Map([["A", 0.5]]);
    const { ranked } = buildSurveyPriority([s1], { demand: 1, unknown: 1, poi: 1 }, { poiByStopId: poiMap });
    const row = ranked[0];
    expect(row.poi).toBe(0.5);
    const expected = (1 * row.demandQ + 1 * row.unknownRate + 1 * 0.5) / 3;
    expect(row.score).toBeCloseTo(expected, 10);
  });

  it("leadReason은 가중치×값이 가장 큰 항", () => {
    const s1 = makeStop("A", { demandTotal: 100, facilities: { shade: "unknown", seat: "unknown", light: "unknown", sign: "unknown" } });
    const { ranked } = buildSurveyPriority([s1], { demand: 0, unknown: 1, poi: 0 });
    expect(ranked[0].leadReason).toBe("unknown");
  });
});

describe("PRESETS", () => {
  it("(e) 기본/heat/usage에서 w.poi=0, senior에서만 w.poi>0", () => {
    expect(PRESETS.heat.w.poi).toBe(0);
    expect(PRESETS.usage.w.poi).toBe(0);
    expect(PRESETS.senior.w.poi).toBeGreaterThan(0);
  });

  it("(g) PRESETS 각 항목에 rationale 문자열 존재", () => {
    for (const key of Object.keys(PRESETS) as Array<keyof typeof PRESETS>) {
      expect(typeof PRESETS[key].rationale).toBe("string");
      expect(PRESETS[key].rationale.length).toBeGreaterThan(0);
    }
  });
});

describe("presetStability", () => {
  it("(f) topTenIn 0~3, avgRank·minRank·maxRank 필드 포함", () => {
    const stops = Array.from({ length: 15 }, (_, i) =>
      makeStop(`S${i}`, { demandTotal: (i + 1) * 10 })
    );
    const result = presetStability(stops, ["heat", "senior", "usage"]);
    expect(result.length).toBeGreaterThan(0);
    for (const row of result) {
      expect(row.topTenIn).toBeGreaterThanOrEqual(0);
      expect(row.topTenIn).toBeLessThanOrEqual(3);
      expect(typeof row.avgRank).toBe("number");
      expect(typeof row.minRank).toBe("number");
      expect(typeof row.maxRank).toBe("number");
      expect(typeof row.stopId).toBe("string");
    }
  });
});
