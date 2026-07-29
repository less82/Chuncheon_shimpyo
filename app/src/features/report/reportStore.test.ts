import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REPORT_STORAGE_KEY,
  ReportStorageError,
  loadReports,
  saveReport,
  updateReportStatus,
  upsertReport,
} from "./reportStore";
import type { Stop } from "../../types/stop";

const stop: Stop = {
  id: "250001",
  stopNo: "1001",
  name: "춘천역",
  lat: 37.884,
  lng: 127.717,
  routes: ["1"],
  facilities: {
    shade: { status: "unknown", source: "none" },
    seat: { status: "unknown", source: "none" },
    shelter: { status: "unknown", source: "none" },
    sign: { status: "unknown", source: "none" },
  },
};

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

  it("같은 ID의 제보를 덮어써서 갱신한다", () => {
    const report = {
      id: "r9",
      stopId: "2501",
      stopNo: "1001",
      stopName: "춘천역",
      issue: "의자가 부서졌어요",
      createdAt: "2026-07-27T01:00:00.000Z",
      status: "received" as const,
    };
    upsertReport(report);
    upsertReport({ ...report, status: "reviewing" });

    const saved = JSON.parse(localStorage.getItem(REPORT_STORAGE_KEY) ?? "[]");
    expect(saved).toHaveLength(1);
    expect(saved[0].status).toBe("reviewing");
  });
});

describe("reportStore 저장 실패", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  /** 저장 공간이 가득 찬 상황을 흉내낸다. */
  const failWithQuota = () => {
    const err = new DOMException("가득 참", "QuotaExceededError");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw err; });
  };

  it("사진이 커서 저장이 막히면 조용히 성공한 척하지 않는다", () => {
    failWithQuota();
    expect(() => saveReport(stop, "의자가 부서졌어요", "data:image/jpeg;base64,AAA=")).toThrow(ReportStorageError);
  });

  it("저장 공간 초과인지 구분해서 알려준다", () => {
    failWithQuota();
    try {
      saveReport(stop, "의자가 부서졌어요");
      expect.unreachable("저장이 실패해야 한다");
    } catch (err) {
      expect(err).toBeInstanceOf(ReportStorageError);
      expect((err as ReportStorageError).quotaExceeded).toBe(true);
    }
  });

  it("저장이 막혀도 기존 제보를 지우지 않는다", () => {
    saveReport(stop, "먼저 보낸 제보");
    expect(loadReports()).toHaveLength(1);

    failWithQuota();
    expect(() => saveReport(stop, "나중에 보낸 제보")).toThrow(ReportStorageError);
    vi.restoreAllMocks();
    expect(loadReports()).toHaveLength(1);
    expect(loadReports()[0].issue).toBe("먼저 보낸 제보");
  });

  it("upsertReport 도 실패를 그대로 알린다", () => {
    failWithQuota();
    expect(() => upsertReport({
      id: "r9", stopId: "250001", stopNo: "1001", stopName: "춘천역",
      issue: "테스트", createdAt: "2026-07-28T00:00:00.000Z", status: "received",
    })).toThrow(ReportStorageError);
  });

  it("저장에 성공하면 사진이 그대로 남는다", () => {
    const saved = saveReport(stop, "의자가 부서졌어요", "data:image/jpeg;base64,AAA=", { reportKind: "facility" });
    expect(saved.photoDataUrl).toBe("data:image/jpeg;base64,AAA=");
    expect(loadReports()[0].photoDataUrl).toBe("data:image/jpeg;base64,AAA=");
  });
});
