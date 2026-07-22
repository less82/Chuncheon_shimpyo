import type { CitizenReport } from "../report/reportStore";

export type ReportCategory = "안전" | "조명" | "안내정보" | "편의시설" | "기타";
export type RiskLevel = "높음" | "주의" | "일반";

const CATEGORY_RULES: Array<[ReportCategory, RegExp]> = [
  ["안전", /파손|깨졌|날카|넘어|쓰러|위험|유리|화재|누전|침수/],
  ["조명", /조명|가로등|어두|불이\s*꺼/],
  ["안내정보", /안내|화면|표지|시간|도착|노선/],
  ["편의시설", /의자|그늘|쉘터|지붕|비|더위|추위/],
];

export function classifyCategory(issue: string): ReportCategory {
  return CATEGORY_RULES.find(([, pattern]) => pattern.test(issue))?.[0] ?? "기타";
}

export function classifyRisk(issue: string): RiskLevel {
  if (/파손|깨졌|날카|쓰러|위험|유리|화재|누전|침수/.test(issue)) return "높음";
  if (/조명|어두|화면이\s*꺼|안내.*꺼/.test(issue)) return "주의";
  return "일반";
}

function elapsedHours(from: string, to: string): number {
  return Math.max(0, (new Date(to).getTime() - new Date(from).getTime()) / 3_600_000);
}

export function formatElapsed(hours: number): string {
  if (hours < 1) return "1시간 미만";
  if (hours < 24) return `${Math.floor(hours)}시간`;
  return `${Math.floor(hours / 24)}일`;
}

export interface ReportInsight {
  report: CitizenReport;
  category: ReportCategory;
  risk: RiskLevel;
  overlap: number;
  elapsedHours: number;
  elapsedLabel: string;
  speed: "빠름" | "보통" | "지연" | "진행 중" | "측정 불가";
  priorityScore: number;
}

export function buildReportInsights(reports: CitizenReport[], now = new Date()): ReportInsight[] {
  const overlap = new Map<string, number>();
  reports.forEach((report) => {
    const key = `${report.stopId}:${classifyCategory(report.issue)}`;
    overlap.set(key, (overlap.get(key) ?? 0) + 1);
  });

  return reports.map((report) => {
    const category = classifyCategory(report.issue);
    const risk = classifyRisk(report.issue);
    const end = report.resolvedAt ?? now.toISOString();
    const hours = elapsedHours(report.createdAt, end);
    const count = overlap.get(`${report.stopId}:${category}`) ?? 1;
    const speed = report.status !== "resolved"
      ? (hours >= 72 ? "지연" : "진행 중")
      : !report.resolvedAt
        ? "측정 불가"
        : hours <= 24 ? "빠름" : hours <= 72 ? "보통" : "지연";
    const priorityScore = ({ 높음: 300, 주의: 200, 일반: 100 }[risk]) + Math.min(count, 10) * 10 + Math.min(Math.floor(hours / 24), 30);
    return { report, category, risk, overlap: count, elapsedHours: hours, elapsedLabel: formatElapsed(hours), speed, priorityScore };
  });
}
