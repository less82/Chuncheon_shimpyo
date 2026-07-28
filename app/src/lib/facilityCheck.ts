export interface FacilityCheckResult {
  ok: boolean;
  text: string;
}

const TIMEOUT_MS = 20000;
const MODEL = "qwen/qwen3.7-plus";
const PROMPT =
  "이 버스정류장 시설(의자/그늘막/조명 등) 사진을 보고 파손 여부를 한국어로 간단히 판단해줘. " +
  "파손이 보이면 어느 부분이 어떻게 파손됐는지, 파손이 없으면 '파손 없음'이라고 답해줘.";

/**
 * OpenRouter의 Qwen3.7 Plus에 시설 사진을 보내 파손 여부를 물어본다.
 * 개발용 테스트 전용 — 키가 없으면(공개 배포 빌드 포함) 즉시 안내 문구만 반환한다.
 */
export async function checkFacilityDamage(
  imageDataUrl: string,
): Promise<FacilityCheckResult> {
  const key = import.meta.env.VITE_OPENROUTER_KEY as string | undefined;
  if (!key) {
    return { ok: false, text: "VITE_OPENROUTER_KEY 미설정 — app/.env에 키를 넣어야 동작합니다." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, text: `API 오류 (${res.status})` };
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content) {
      return { ok: false, text: "응답을 해석하지 못했습니다." };
    }
    return { ok: true, text: content };
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === "AbortError";
    return { ok: false, text: aborted ? "요청 시간 초과" : "네트워크 오류" };
  } finally {
    clearTimeout(timer);
  }
}
