/**
 * 관리자(B2G) 전용 VLM 사진 설명 라이브러리.
 *
 * 시민이 올린 사진을 담당 공무원이 빠르게 이해하도록 "설명"만 만든다.
 * 파손 여부를 판정하지 않는다 — 판정과 확정은 사람이 한다.
 *
 * 시민 화면(features/citizen, features/find, features/trip)에서
 * 이 파일을 import 하지 않는다. OpenRouter 키는 관리자 빌드에만 넣는다.
 */

/** VLM 설명 결과. ok=false 면 text 는 담당자에게 보여줄 안내 문구다. */
export interface VlmExplanation {
  ok: boolean;
  text: string;
  reason?: "no_key" | "no_image" | "timeout" | "network" | "api" | "parse";
}

/** 이미지 전송이라 응답이 느리다 — 20초. */
const TIMEOUT_MS = 20000;

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/** 비전 지원 모델. */
export const VLM_MODEL = "qwen/qwen3.7-plus";

/**
 * 판정이 아니라 설명을 요구하는 프롬프트.
 * 테스트가 문구를 검증할 수 있도록 export 한다.
 */
export const EXPLAIN_PROMPT =
  "너는 버스정류장 시설 사진을 담당 공무원에게 설명하는 보조 도구다. " +
  "판정하거나 결론을 내리지 말고, 사진에 보이는 것만 한국어로 설명해라.\n" +
  "- 사진에 보이는 정류장 시설(의자, 그늘막, 쉘터, 도착안내기 등)과 그 상태를 사실 위주로 서술한다.\n" +
  "- 파손이나 이상해 보이는 부분이 있으면 어느 부분이 어떻게 보이는지 적는다.\n" +
  "- 확실하지 않으면 확실하지 않다고 적는다. 단정하지 않는다.\n" +
  "- 사진에서 보이지 않는 것은 추측하지 않는다.\n" +
  "- 3~4문장 이내로 쓴다.";

/** 전송용 사진의 긴 변 상한(px). 파손 설명에 원본 해상도는 필요 없다. */
const MAX_EDGE_PX = 1024;
/** 전송용 사진 재인코딩 품질. */
const JPEG_QUALITY = 0.7;

/** base64 dataURL 을 Blob 으로 바꾼다. 형태가 다르면 null. */
function dataUrlToBlob(dataUrl: string): Blob | null {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const header = dataUrl.slice(0, comma);
  if (!header.startsWith("data:image/") || !header.includes(";base64")) return null;
  try {
    const mime = header.slice(5, header.indexOf(";"));
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

/**
 * 전송 직전 사진을 긴 변 1024px JPEG 로 줄인다.
 * 요청 크기·이미지 토큰 과금을 줄이려는 것이고, 화면에 보여 주는 원본은 건드리지 않는다.
 * 브라우저가 축소를 못 하면(테스트 환경 등) 원본 dataURL 을 그대로 돌려준다.
 */
export async function shrinkForUpload(dataUrl: string): Promise<string> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return dataUrl;
  const blob = dataUrlToBlob(dataUrl);
  if (!blob) return dataUrl;
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1) return dataUrl;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const shrunk = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    return shrunk.startsWith("data:image/") ? shrunk : dataUrl;
  } catch {
    return dataUrl;
  }
}

/** 담당자가 참고할 부가 정보. 사실 확정이 아니라 시민이 적어 낸 값이다. */
export interface VlmContext {
  stopName?: string;
  issue?: string;
}

/** context 를 참고 정보로만 덧붙인다. 없으면 빈 문자열. */
function buildContextText(context?: VlmContext): string {
  if (!context) return "";
  const lines: string[] = [];
  if (context.stopName) lines.push(`정류장 이름(시민 입력): ${context.stopName}`);
  if (context.issue) lines.push(`시민이 적은 내용: ${context.issue}`);
  if (lines.length === 0) return "";
  return `\n\n참고 정보(확정된 사실이 아니라 시민이 적어 낸 값이다. 사진과 다르면 사진을 따른다):\n${lines.join("\n")}`;
}

/**
 * 사진 한 장을 VLM 에 보내 담당자용 설명 문장을 받는다.
 * 키가 없으면 네트워크를 타지 않고 즉시 꺼진 상태로 반환한다.
 */
export async function explainReportPhoto(
  imageDataUrl: string,
  context?: VlmContext,
): Promise<VlmExplanation> {
  const key = import.meta.env.VITE_OPENROUTER_KEY as string | undefined;
  if (!key) {
    return {
      ok: false,
      reason: "no_key",
      text: "사진 설명 기능이 꺼져 있습니다(관리자 키 미설정). 사진은 그대로 확인할 수 있습니다.",
    };
  }

  // 사진 dataURL 이 아니면 네트워크를 타지 않는다(빈 요청으로 크레딧을 쓰지 않는다).
  if (!imageDataUrl.startsWith("data:image/")) {
    return { ok: false, reason: "no_image", text: "사진 형식을 확인할 수 없어 설명을 요청하지 않았습니다." };
  }

  const uploadUrl = await shrinkForUpload(imageDataUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: VLM_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: EXPLAIN_PROMPT + buildContextText(context) },
              { type: "image_url", image_url: { url: uploadUrl } },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, reason: "api", text: `사진 설명을 받지 못했습니다 (오류 ${res.status}).` };
    }
    const data: unknown = await res.json();
    const content = readContent(data);
    if (!content) {
      return { ok: false, reason: "parse", text: "사진 설명을 해석하지 못했습니다." };
    }
    return { ok: true, text: content };
  } catch (err) {
    if (isAbortError(err)) {
      return { ok: false, reason: "timeout", text: "사진 설명 요청이 시간을 초과했습니다." };
    }
    return { ok: false, reason: "network", text: "사진 설명 요청이 실패했습니다(네트워크)." };
  } finally {
    clearTimeout(timer);
  }
}

/** 응답 본문에서 설명 문자열만 안전하게 꺼낸다. 형태가 다르면 빈 문자열. */
function readContent(data: unknown): string {
  if (typeof data !== "object" || data === null) return "";
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const message = (choices[0] as { message?: unknown } | null)?.message;
  if (typeof message !== "object" || message === null) return "";
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content.trim() : "";
}

/** 타임아웃(abort)과 그 밖의 실패를 구분한다. */
function isAbortError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { name?: unknown }).name === "AbortError";
}
