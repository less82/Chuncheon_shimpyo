export type MaengCocoDetection = {
  confidence: number;
  xyxy: [number, number, number, number];
};

export type MaengCocoResult = {
  verdict: "damage_suspected" | "review_required" | "no_damage_detected";
  threshold: number;
  damage_threshold: number;
  detections: MaengCocoDetection[];
  annotated_image: string;
  notice: string;
};

type ErrorBody = { detail?: string };
type FetchLike = typeof fetch;

const apiBase = (
  import.meta.env.VITE_MAENG_COCO_API_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

export async function inspectBusStopImage(
  file: File,
  threshold = 0.25,
  fetcher: FetchLike = fetch,
): Promise<MaengCocoResult> {
  const response = await fetcher(
    `${apiBase}/api/maeng-coco?threshold=${encodeURIComponent(threshold)}`,
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
