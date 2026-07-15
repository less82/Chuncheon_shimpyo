import { describe, it, expect } from "vitest";
import type { Stop, FacilityInfo } from "../../types/stop";
import {
  applyFilters,
  middayBoarding,
  MIDDAY_HOURS,
  SEASON_PRESETS,
  SEASON_LABELS,
  type FilterCriteria,
} from "./filters";

// ---- 테스트용 정류장 팩토리 ----
const F = (partial: Partial<FacilityInfo> = {}): FacilityInfo => ({
  status: "unknown",
  source: "none",
  ...partial,
});

let seq = 0;
function makeStop(opts: {
  midday?: number; // 한낮(11~16시) 각 시간대에 midday/6 균등 배분한 합
  hasDemand?: boolean;
  shade?: FacilityInfo["status"];
  seat?: FacilityInfo["status"];
}): Stop {
  const { midday = 0, hasDemand = true, shade = "unknown", seat = "unknown" } =
    opts;
  const byHour = new Array(24).fill(0);
  // 한낮 시간대에만 값을 실어 middayBoarding 이 midday 가 되도록.
  for (const h of MIDDAY_HOURS) byHour[h] = midday / MIDDAY_HOURS.length;
  seq += 1;
  return {
    id: `2500${String(seq).padStart(5, "0")}`,
    stopNo: String(seq),
    name: `정류장${seq}`,
    lat: 37.88,
    lng: 127.73,
    routes: ["1"],
    facilities: {
      shade: F({ status: shade }),
      seat: F({ status: seat }),
      light: F(),
      sign: F(),
    },
    demand: hasDemand
      ? {
          byHour,
          total: byHour.reduce((a, b) => a + b, 0),
          aggregatedBidirectional: true,
          matchedName: `정류장${seq}`,
        }
      : undefined,
  };
}

describe("middayBoarding", () => {
  it("한낮(11~16시) 승차합을 반환, demand 없으면 null", () => {
    const s = makeStop({ midday: 120 });
    expect(middayBoarding(s)).toBe(120);
    expect(middayBoarding(makeStop({ hasDemand: false }))).toBeNull();
  });
});

describe("applyFilters — 상위 N% (실측 분위수)", () => {
  it("한낮 승차 상위 25% 정류장만 반환한다", () => {
    // demand 있는 8개: 승차 10,20,...,80. 상위 25% = 상위 2개(70,80).
    const stops = [10, 20, 30, 40, 50, 60, 70, 80].map((m) =>
      makeStop({ midday: m }),
    );
    const out = applyFilters(stops, { middayTopPercent: 25 });
    const sums = out.map((s) => middayBoarding(s)).sort((a, b) => a! - b!);
    expect(sums).toEqual([70, 80]);
  });

  it("demand 없는 정류장은 상위% 조건에서 제외한다(미확인은 뽑지 않음)", () => {
    const withDemand = [10, 20, 30, 40].map((m) => makeStop({ midday: m }));
    const noDemand = makeStop({ hasDemand: false }); // demand 미확인
    const out = applyFilters([...withDemand, noDemand], {
      middayTopPercent: 100, // 모두 통과시키는 조건이라도
    });
    expect(out).not.toContain(noDemand);
    expect(out).toHaveLength(4);
  });
});

describe("applyFilters — 조건 결합(AND, 점수 없음)", () => {
  it("상위 25% AND 그늘 미확인 = 두 조건 모두 만족만 반환", () => {
    const top1 = makeStop({ midday: 90, shade: "unknown" }); // 상위 & 미확인 ✓
    const top2 = makeStop({ midday: 80, shade: "yes" }); // 상위지만 그늘 있음 ✗
    const low = makeStop({ midday: 10, shade: "unknown" }); // 미확인이나 하위 ✗
    const out = applyFilters([top1, top2, low], {
      middayTopPercent: 50,
      shadeUnknown: true,
    });
    expect(out).toEqual([top1]);
  });

  it("seatUnknown 은 의자 미확인만 통과", () => {
    const a = makeStop({ midday: 50, seat: "unknown" });
    const b = makeStop({ midday: 50, seat: "yes" });
    const out = applyFilters([a, b], { seatUnknown: true });
    expect(out).toEqual([a]);
  });

  it("notShelter 는 그늘+의자 모두 있음(쉘터)인 곳을 제외", () => {
    const shelter = makeStop({ midday: 50, shade: "yes", seat: "yes" }); // 쉘터 ✗
    const partial = makeStop({ midday: 50, shade: "yes", seat: "unknown" }); // 쉘터 아님 ✓
    const out = applyFilters([shelter, partial], { notShelter: true });
    expect(out).toEqual([partial]);
  });

  it("빈 criteria 는 전체를 반환(필터 없음)", () => {
    const stops = [makeStop({ midday: 10 }), makeStop({ midday: 20 })];
    expect(applyFilters(stops, {})).toHaveLength(2);
  });
});

describe("SEASON_PRESETS — 저장된 criteria 조합(별도 로직 아님)", () => {
  const KNOWN_KEYS = new Set([
    "middayTopPercent",
    "shadeUnknown",
    "seatUnknown",
    "notShelter",
    "season",
  ]);

  it("여름/겨울/봄/가을 4종이 존재하고 라벨을 가진다", () => {
    expect(Object.keys(SEASON_PRESETS).sort()).toEqual(
      ["fall", "spring", "summer", "winter"].sort(),
    );
    expect(SEASON_LABELS.summer).toContain("여름");
  });

  it("각 프리셋은 순수 criteria(알려진 키 · 함수 없음)로만 구성된다", () => {
    for (const key of Object.keys(SEASON_PRESETS) as (keyof typeof SEASON_PRESETS)[]) {
      const c: FilterCriteria = SEASON_PRESETS[key];
      for (const [k, v] of Object.entries(c)) {
        expect(KNOWN_KEYS.has(k)).toBe(true);
        expect(typeof v).not.toBe("function");
      }
    }
  });

  it("여름 프리셋 = 한낮 상위 25% AND 그늘 미확인", () => {
    expect(SEASON_PRESETS.summer.middayTopPercent).toBe(25);
    expect(SEASON_PRESETS.summer.shadeUnknown).toBe(true);
  });

  it("criteria.season 지정 시 해당 프리셋 조건으로 필터링된다", () => {
    const hot = makeStop({ midday: 90, shade: "unknown" }); // 상위 & 그늘 미확인 ✓
    const shady = makeStop({ midday: 90, shade: "yes" }); // 그늘 있음 ✗
    const out = applyFilters([hot, shady], { season: "summer" });
    expect(out).toEqual([hot]);
  });
});
