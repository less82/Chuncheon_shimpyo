import { describe, expect, it } from "vitest";
import type { CitizenReport } from "../report/reportStore";
import { buildReportInsights, classifyCategory, classifySafety } from "./reportInsights";

const report = (id: string, issue: string, overrides: Partial<CitizenReport> = {}): CitizenReport => ({
  id, stopId: "2501", stopNo: "1001", stopName: "춘천역", issue,
  createdAt: "2026-07-20T00:00:00.000Z", status: "received", ...overrides,
});

describe("reportInsights", () => {
  it("민원 유형과 안전 관련 여부를 규칙 기반 후보로 분류한다", () => {
    expect(classifyCategory("승강장 시설물이 파손됐어요")).toBe("안전");
    expect(classifySafety("승강장 시설물이 파손됐어요")).toBe("안전 관련");
    expect(classifyCategory("의자가 없어요")).toBe("편의시설");
  });

  it("같은 정류장의 같은 유형 제보를 중첩 건수로 묶는다", () => {
    const result = buildReportInsights([report("1", "의자가 없어요"), report("2", "그늘이 없어요")], new Date("2026-07-22T00:00:00.000Z"));
    expect(result.map((item) => item.overlap)).toEqual([2, 2]);
  });

  it("완료 시각이 없는 과거 완료 건은 처리 속도를 추정하지 않는다", () => {
    const [result] = buildReportInsights([report("1", "안내 화면이 꺼졌어요", { status: "resolved" })], new Date("2026-07-22T00:00:00.000Z"));
    expect(result.speed).toBe("측정 불가");
  });
});
