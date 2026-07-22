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
}

export function loadReports(): CitizenReport[] {
  try {
    const value = JSON.parse(localStorage.getItem(REPORT_STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function saveReport(stop: Stop, issue: string, photoDataUrl?: string): CitizenReport {
  const now = new Date().toISOString();
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
  };
  localStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify([...loadReports(), report]));
  window.dispatchEvent(new Event(REPORT_CHANGED_EVENT));
  return report;
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
