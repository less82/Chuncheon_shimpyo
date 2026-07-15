import { describe, it, expect } from "vitest";
import type { FacilityInfo } from "../types/stop";
import {
  facilityLabel,
  sourceBadge,
  statusColor,
  KIND_LABEL,
} from "./facilityText";

const info = (partial: Partial<FacilityInfo>): FacilityInfo => ({
  status: "unknown",
  source: "none",
  ...partial,
});

describe("facilityLabel", () => {
  it("yes → 있음, no → 없음, unknown → 미확인", () => {
    expect(facilityLabel(info({ status: "yes" }))).toBe("있음");
    expect(facilityLabel(info({ status: "no" }))).toBe("없음");
    expect(facilityLabel(info({ status: "unknown" }))).toBe("미확인");
  });
});

describe("statusColor", () => {
  it("yes=green / no=red / unknown=gray", () => {
    expect(statusColor("yes")).toBe("green");
    expect(statusColor("no")).toBe("red");
    expect(statusColor("unknown")).toBe("gray");
  });
});

describe("sourceBadge", () => {
  it("roadview 출처는 촬영시점을 포함해 '로드뷰 확인 (촬영 YYYY.MM)'", () => {
    const s = sourceBadge(
      info({ status: "yes", source: "roadview", capturedAt: "2026.03" }),
    );
    expect(s).toBe("로드뷰 확인 (촬영 2026.03)");
  });

  it("각 대장 출처는 '○○대장 기준'", () => {
    expect(sourceBadge(info({ status: "yes", source: "bench_registry" }))).toContain(
      "대장 기준",
    );
    expect(sourceBadge(info({ status: "yes", source: "shade_registry" }))).toContain(
      "대장 기준",
    );
    expect(sourceBadge(info({ status: "yes", source: "light_registry" }))).toContain(
      "대장 기준",
    );
  });

  it("근거 없음(none)은 빈 문자열", () => {
    expect(sourceBadge(info({ source: "none" }))).toBe("");
  });

  it("어떤 입력도 금지 문구를 만들지 않는다", () => {
    const forbidden = "현장" + " " + "확인"; // 리터럴 회피(코드베이스 grep 0건 유지)
    const sources: FacilityInfo["source"][] = [
      "roadview",
      "bench_registry",
      "shade_registry",
      "light_registry",
      "none",
    ];
    for (const source of sources) {
      const s = sourceBadge(info({ source, capturedAt: "2026.03" }));
      expect(s).not.toContain(forbidden);
    }
  });
});

describe("KIND_LABEL", () => {
  it("네 시설의 한글 라벨을 제공한다", () => {
    expect(KIND_LABEL.shade).toBe("그늘");
    expect(KIND_LABEL.seat).toBe("의자");
    expect(KIND_LABEL.light).toBe("조명");
    expect(KIND_LABEL.sign).toBe("도착안내기");
  });
});
