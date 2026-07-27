import type { CitizenReport } from "../report/reportStore";

export type MaengCocoDetection = {
  confidence: number;
  xyxy: [number, number, number, number];
  label: string;
  label_display: string;
};

export type MaengCocoResult = {
  verdict: "damage_suspected" | "review_required" | "no_damage_detected";
  label: string;
  label_display: string;
  threshold: number;
  damage_threshold: number;
  detections: MaengCocoDetection[];
  annotated_image: string;
  notice: string;
};

type ErrorBody = { detail?: string };
type FetchLike = typeof fetch;

export const maengCocoApiBase = (
  import.meta.env.VITE_MAENG_COCO_API_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

export async function inspectBusStopImage(
  file: File,
  threshold = 0.15,
  fetcher: FetchLike = fetch,
): Promise<MaengCocoResult> {
  const response = await fetcher(
    `${maengCocoApiBase}/api/maeng-coco?threshold=${encodeURIComponent(threshold)}`,
    {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    },
  );

  if (!response.ok) {
    let message = "이미지 검사에 실패했습니다.";
    try {
      const body = (await response.json()) as ErrorBody;
      if (body.detail) message = body.detail;
    } catch {
      // JSON 오류 본문이 아니면 기본 메시지를 유지한다.
    }
    throw new Error(message);
  }

  return (await response.json()) as MaengCocoResult;
}

export async function submitMaengCocoReport(
  file: File,
  result: MaengCocoResult,
  fetcher: FetchLike = fetch,
): Promise<CitizenReport> {
  const confidence = result.detections.reduce(
    (best, detection) => Math.max(best, detection.confidence),
    0,
  );
  const response = await fetcher(`${maengCocoApiBase}/api/maeng-coco/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      label: result.label,
      label_display: result.label_display,
      source_file_name: file.name,
      photo_data_url: result.annotated_image,
      confidence,
      detections: result.detections,
    }),
  });
  if (!response.ok) {
    throw new Error("파손 접수를 어드민으로 보내지 못했습니다.");
  }
  return (await response.json()) as CitizenReport;
}

export async function loadMaengCocoReports(
  fetcher: FetchLike = fetch,
): Promise<CitizenReport[]> {
  const response = await fetcher(`${maengCocoApiBase}/api/maeng-coco/reports`);
  if (!response.ok) return [];
  const value = (await response.json()) as unknown;
  return Array.isArray(value) ? (value as CitizenReport[]) : [];
}

export async function updateMaengCocoReportStatus(
  id: string,
  status: CitizenReport["status"],
  fetcher: FetchLike = fetch,
): Promise<CitizenReport> {
  const response = await fetcher(
    `${maengCocoApiBase}/api/maeng-coco/reports/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    },
  );
  if (!response.ok) {
    throw new Error("파손 접수 상태를 변경하지 못했습니다.");
  }
  return (await response.json()) as CitizenReport;
}
