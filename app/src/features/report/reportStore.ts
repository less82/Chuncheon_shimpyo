import { categoryForIssue } from "../../data/busContacts";
import type { ContactCategory } from "../../data/busContacts";
import type { Stop } from "../../types/stop";

export const REPORT_STORAGE_KEY = "shimpyo:reports";
export const REPORT_CHANGED_EVENT = "shimpyo:reports-changed";

export interface CitizenReport {
  id: string;
  stopId: string;
  stopNo: string;
  stopName: string;
  issue: string;
  photoDataUrl?: string;
  createdAt: string;
  updatedAt?: string;
  resolvedAt?: string;
  status: "received" | "reviewing" | "task_created" | "resolved";
  /** 춘천시 안내문 기준 접수처 분류. 판단이 서지 않으면 두지 않는다(사람이 확정). */
  contactCategory?: ContactCategory;
  /** 시민이 첫 화면에서 고른 알리기 유형. 문구가 아니라 사람이 고른 값이라 분류보다 우선한다. */
  reportKind?: ContactCategory;
  /** 버스 이용 불편일 때만. 시민이 적은 값 그대로 남기고, 비어 있으면 아예 두지 않는다. */
  busRoute?: string;
  busVehicleNo?: string;
  /** 겪은 날짜(YYYY-MM-DD)와 시각(HH:mm). 모르면 두지 않는다 — 추정하지 않는다. */
  happenedDate?: string;
  happenedTime?: string;
  source?: "citizen" | "maeng_coco";
  modelLabel?: string;
  modelLabelDisplay?: string;
  modelConfidence?: number;
  detectionCount?: number;
  detections?: Array<{
    confidence: number;
    xyxy: [number, number, number, number];
    label?: string;
    label_display?: string;
  }>;
  sourceFileName?: string;
}

export function loadReports(): CitizenReport[] {
  try {
    const value = JSON.parse(localStorage.getItem(REPORT_STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

/** 알리기 흐름이 함께 남기는 값. 빈 문자열은 저장하지 않는다(모르는 값을 지어내지 않는다). */
export type ReportDetails = Pick<
  CitizenReport,
  "reportKind" | "busRoute" | "busVehicleNo" | "happenedDate" | "happenedTime"
>;

/** 빈 문자열·공백만 있는 값은 통째로 버린다. */
function keepFilled(details: ReportDetails): ReportDetails {
  const entries = Object.entries(details).filter(([, value]) => typeof value === "string" && value.trim() !== "");
  return Object.fromEntries(entries) as ReportDetails;
}

export function saveReport(
  stop: Stop,
  issue: string,
  photoDataUrl?: string,
  details: ReportDetails = {},
): CitizenReport {
  const now = new Date().toISOString();
  const category = details.reportKind ?? categoryForIssue(issue);
  const report: CitizenReport = {
    id: crypto.randomUUID(),
    stopId: stop.id,
    stopNo: stop.stopNo,
    stopName: stop.name,
    issue,
    photoDataUrl,
    createdAt: now,
    updatedAt: now,
    status: "received",
    ...(category ? { contactCategory: category } : {}),
    ...keepFilled(details),
  };
  localStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify([...loadReports(), report]));
  window.dispatchEvent(new Event(REPORT_CHANGED_EVENT));
  return report;
}

export function upsertReport(report: CitizenReport): void {
  const reports = loadReports();
  const next = [...reports.filter((item) => item.id !== report.id), report];
  localStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(REPORT_CHANGED_EVENT));
}

export function updateReportStatus(id: string, status: CitizenReport["status"]): void {
  const now = new Date().toISOString();
  localStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify(loadReports().map((report) => report.id === id ? {
    ...report,
    status,
    updatedAt: now,
    ...(status === "resolved" ? { resolvedAt: now } : {}),
  } : report)));
  window.dispatchEvent(new Event(REPORT_CHANGED_EVENT));
}
