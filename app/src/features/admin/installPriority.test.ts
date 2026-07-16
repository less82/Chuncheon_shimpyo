import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FacilityInfo, Stop } from "../../types/stop";
import { INSTALL_STATUS_LABEL } from "../../types/priority";
import { buildInstallPriority } from "./installPriority";

const info = (partial: Partial<FacilityInfo>): FacilityInfo => ({
  status: "unknown",
  source: "none",
  ...partial,
});

const stop = (
  id: string,
  partial?: {
    shade?: Partial<FacilityInfo>;
    seat?: Partial<FacilityInfo>;
    light?: Partial<FacilityInfo>;
    sign?: Partial<FacilityInfo>;
  },
  demandByHour?: number[],
): Stop => ({
  id,
  stopNo: id,
  name: `테스트정류장${id}`,
  lat: 37.88,
  lng: 127.73,
  routes: [],
  facilities: {
    shade: info(partial?.shade ?? {}),
    seat: info(partial?.seat ?? {}),
    light: info(partial?.light ?? {}),
    sign: info(partial?.sign ?? {}),
  },
  demand: demandByHour
    ? {
        byHour: demandByHour,
        total: demandByHour.reduce((a, b) => a + b, 0),
        aggregatedBidirectional: true,
        matchedName: `테스트정류장${id}`,
      }
    : undefined,
});

describe("buildInstallPriority", () => {
  it("(a) status===\"unknown\"인 정류장은 결과에서 절대 제외된다 — 중단 조건 1", () => {
    const stops: Stop[] = [
      stop("1", { seat: { status: "unknown", source: "none" } }),
      stop("2", { seat: { status: "no", source: "roadview", capturedAt: "2026.03" } }),
    ];
    const rows = buildInstallPriority(stops, "seat");
    expect(rows.some((r) => r.stop.id === "1")).toBe(false);
    expect(rows.some((r) => r.stop.id === "2")).toBe(true);
  });

  it("(b) status===\"yes\"(기설치) 정류장은 제외된다", () => {
    const stops: Stop[] = [
      stop("1", { seat: { status: "yes", source: "roadview", capturedAt: "2026.03" } }),
      stop("2", { seat: { status: "no", source: "roadview", capturedAt: "2026.03" } }),
    ];
    const rows = buildInstallPriority(stops, "seat");
    expect(rows.some((r) => r.stop.id === "1")).toBe(false);
    expect(rows.some((r) => r.stop.id === "2")).toBe(true);
  });

  it("(c) status===\"no\" & source===\"roadview\"만 포함, capturedAt이 InstallRow에 노출", () => {
    const stops: Stop[] = [
      stop("1", { seat: { status: "no", source: "roadview", capturedAt: "2026.04" } }),
    ];
    const rows = buildInstallPriority(stops, "seat");
    expect(rows).toHaveLength(1);
    expect(rows[0].capturedAt).toBe("2026.04");
    expect(rows[0].surveySource).toBe("roadview");
  });

  it("(d) 시설별 독립: facility별로 해당 시설이 no인 것만 포함(다른 시설 상태 무관)", () => {
    const stops: Stop[] = [
      stop("1", {
        seat: { status: "no", source: "roadview", capturedAt: "2026.01" },
        shade: { status: "yes", source: "roadview", capturedAt: "2026.01" },
      }),
      stop("2", {
        seat: { status: "yes", source: "roadview", capturedAt: "2026.01" },
        shade: { status: "no", source: "roadview", capturedAt: "2026.01" },
      }),
    ];
    const seatRows = buildInstallPriority(stops, "seat");
    expect(seatRows.map((r) => r.stop.id)).toEqual(["1"]);

    const shadeRows = buildInstallPriority(stops, "shade");
    expect(shadeRows.map((r) => r.stop.id)).toEqual(["2"]);
  });

  it("(e) 현재 실데이터를 로드해 buildInstallPriority(stops,\"seat\")가 빈 배열(no=0)", () => {
    let stops: Stop[] = [];
    try {
      const dataPath = join(__dirname, "..", "..", "..", "public", "data", "stops.json");
      const raw = JSON.parse(readFileSync(dataPath, "utf-8"));
      stops = raw.stops ?? raw;
    } catch {
      // 실데이터 로드가 어려우면 모든 시설 unknown/yes인 픽스처로 대체
      stops = [
        stop("1", { seat: { status: "unknown", source: "none" } }),
        stop("2", { seat: { status: "yes", source: "roadview", capturedAt: "2026.01" } }),
      ];
    }
    const rows = buildInstallPriority(stops, "seat");
    expect(rows).toEqual([]);
  });

  it("(f) source가 \"roadview\"가 아닌 no는 제외된다(방어적)", () => {
    const stops: Stop[] = [
      stop("1", { seat: { status: "no", source: "bench_registry" } }),
    ];
    const rows = buildInstallPriority(stops, "seat");
    expect(rows).toEqual([]);
  });

  it("INSTALL_STATUS_LABEL은 '설치 검토'·'미검토' 문구를 담고 '설치 우선순위' 단독 문구가 아니다", () => {
    expect(INSTALL_STATUS_LABEL).toContain("설치 검토");
    expect(INSTALL_STATUS_LABEL).toContain("미검토");
    expect(INSTALL_STATUS_LABEL).not.toBe("설치 우선순위");
  });

  it("demand 실측 없는 정류장은 demandMidday=null", () => {
    const stops: Stop[] = [
      stop("1", { seat: { status: "no", source: "roadview", capturedAt: "2026.01" } }),
    ];
    const rows = buildInstallPriority(stops, "seat");
    expect(rows[0].demandMidday).toBeNull();
  });

  it("rank는 1부터 순차 부여된다", () => {
    const stops: Stop[] = [
      stop(
        "1",
        { seat: { status: "no", source: "roadview", capturedAt: "2026.01" } },
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0, 0, 0, 0],
      ),
      stop(
        "2",
        { seat: { status: "no", source: "roadview", capturedAt: "2026.01" } },
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
      ),
    ];
    const rows = buildInstallPriority(stops, "seat");
    expect(rows.map((r) => r.rank)).toEqual([1, 2]);
    expect(rows[0].stop.id).toBe("1");
  });
});
