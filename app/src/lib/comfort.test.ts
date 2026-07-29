import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { FacilityInfo, Stop } from "../types/stop";
import { comfortScore, comfortReasons } from "./comfort";

const info = (partial: Partial<FacilityInfo>): FacilityInfo => ({
  status: "unknown",
  source: "none",
  ...partial,
});

const stop = (partial?: {
  shade?: Partial<FacilityInfo>;
  seat?: Partial<FacilityInfo>;
  shelter?: Partial<FacilityInfo>;
  sign?: Partial<FacilityInfo>;
}): Stop => ({
  id: "250001",
  stopNo: "1",
  name: "테스트정류장",
  lat: 37.88,
  lng: 127.73,
  routes: [],
  facilities: {
    shade: info(partial?.shade ?? {}),
    seat: info(partial?.seat ?? {}),
    shelter: info(partial?.shelter ?? {}),
    sign: info(partial?.sign ?? {}),
  },
});

describe("comfortScore", () => {
  it("(a) 4시설 전부 unknown → 0", () => {
    expect(comfortScore(stop())).toBe(0);
  });

  it("(b) seat=yes만 → 0.5", () => {
    const s = stop({ seat: { status: "yes" } });
    expect(comfortScore(s)).toBe(0.5);
  });

  it("(c) shelter=yes면 그늘·의자를 모두 갖춘 것으로 보아 만점", () => {
    const s = stop({ shelter: { status: "yes", source: "roadview" } });
    expect(comfortScore(s)).toBe(1);
  });

  it("shelter=unknown은 감점 근거가 아니다(seat=yes면 그대로 0.5)", () => {
    const s = stop({ seat: { status: "yes" }, shelter: { status: "unknown" } });
    expect(comfortScore(s)).toBe(0.5);
  });

  it("(d) no와 unknown은 같은 0 가점(감점 없음)", () => {
    const sNo = stop({ seat: { status: "no" } });
    const sUnknown = stop({ seat: { status: "unknown" } });
    expect(comfortScore(sNo)).toBe(comfortScore(sUnknown));
    expect(comfortScore(sNo)).toBe(0);
  });

  it("그늘·의자 모두 yes → 1", () => {
    const s = stop({
      shade: { status: "yes" },
      seat: { status: "yes" },
    });
    expect(comfortScore(s)).toBe(1);
  });
});

describe("comfortReasons", () => {
  it("(e) 어떤 입력에도 '현장 확인' 문자열 미포함", () => {
    const forbidden = "현장" + " " + "확인";
    const combos: Stop[] = [
      stop(),
      stop({ seat: { status: "yes", source: "bench_registry" } }),
      stop({
        seat: { status: "yes", source: "roadview", capturedAt: "2026.03" },
      }),
      stop({ shade: { status: "no", source: "shade_registry" } }),
      stop({ shelter: { status: "yes", source: "roadview", capturedAt: "2026.03" } }),
    ];
    for (const s of combos) {
      const reasons = comfortReasons(s);
      for (const r of reasons) {
        expect(r).not.toContain(forbidden);
      }
    }
  });

  it("확인된 시설의 근거 문자열을 포함한다", () => {
    const s = stop({ seat: { status: "yes", source: "bench_registry" } });
    const reasons = comfortReasons(s);
    expect(reasons.some((r) => r.includes("의자") && r.includes("있음"))).toBe(
      true,
    );
    expect(reasons.some((r) => r.includes("대장 기준"))).toBe(true);
  });

  it("미확인 시설은 '○○ 미확인'으로 표기", () => {
    const s = stop();
    const reasons = comfortReasons(s);
    expect(reasons.some((r) => r.includes("미확인"))).toBe(true);
  });

  it("sign(도착안내기)은 comfort와 무관하므로 comfortReasons에 포함하지 않는다", () => {
    const s = stop({ sign: { status: "yes", source: "roadview" } });
    const reasons = comfortReasons(s);
    expect(reasons.some((r) => r.includes("도착안내기"))).toBe(false);
  });
});

describe("의존성: comfort는 B2G(admin) 산식에서 import되지 않는다", () => {
  it("app/src/features/admin/ 아래 어떤 소스도 lib/comfort를 import하지 않는다", () => {
    const adminDir = join(__dirname, "..", "features", "admin");
    let entries: string[] = [];
    try {
      entries = readdirSync(adminDir);
    } catch {
      // 디렉토리 없으면 통과
      return;
    }
    const collectFiles = (dir: string, names: string[]): string[] => {
      let files: string[] = [];
      for (const name of names) {
        const full = join(dir, name);
        const st = statSync(full);
        if (st.isDirectory()) {
          files = files.concat(collectFiles(full, readdirSync(full)));
        } else if (/\.(ts|tsx)$/.test(name)) {
          files.push(full);
        }
      }
      return files;
    };
    const files = collectFiles(adminDir, entries);
    expect(files.length >= 0).toBe(true); // 0개면 통과
    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      expect(content).not.toMatch(/from ["'].*comfort["']/);
      expect(content).not.toContain("lib/comfort");
    }
  });
});
