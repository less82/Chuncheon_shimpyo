import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REPORT_STORAGE_KEY, updateReportStatus } from "./reportStore";

describe("reportStore 처리 시각", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T03:00:00.000Z"));
  });

  afterEach(() => vi.useRealTimers());

  it("단계 변경 시각과 완료 시각을 저장한다", () => {
    localStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify([{
      id: "r1", stopId: "2501", stopNo: "1001", stopName: "춘천역",
      issue: "의자가 없어요", createdAt: "2026-07-21T00:00:00.000Z", status: "task_created",
    }]));

    updateReportStatus("r1", "resolved");
    const [saved] = JSON.parse(localStorage.getItem(REPORT_STORAGE_KEY) ?? "[]");
    expect(saved.updatedAt).toBe("2026-07-22T03:00:00.000Z");
    expect(saved.resolvedAt).toBe("2026-07-22T03:00:00.000Z");
  });
});
