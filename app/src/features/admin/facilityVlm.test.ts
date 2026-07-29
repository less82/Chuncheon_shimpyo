import { describe, it, expect, vi, afterEach } from "vitest";
import { explainReportPhoto, EXPLAIN_PROMPT, VLM_MODEL } from "./facilityVlm";

/** 테스트용 가짜 키. 실제 키는 테스트에 절대 쓰지 않는다. */
const FAKE_KEY = "test-fake-key";
const IMG = "data:image/png;base64,AAAA";

/** OpenRouter 200 응답 모양. */
function okResponse(text: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: text } }] }),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("explainReportPhoto (관리자용 사진 설명)", () => {
  it("키가 없으면 fetch 를 부르지 않고 즉시 no_key 로 반환한다", async () => {
    vi.stubEnv("VITE_OPENROUTER_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await explainReportPhoto(IMG);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("no_key");
    expect(result.text).not.toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("사진 dataURL 이 아니면 fetch 를 부르지 않고 no_image 로 반환한다", async () => {
    vi.stubEnv("VITE_OPENROUTER_KEY", FAKE_KEY);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await explainReportPhoto("https://example.com/photo.jpg");

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("no_image");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("200 응답이면 설명 문자열을 파싱해 ok=true 로 돌려준다", async () => {
    vi.stubEnv("VITE_OPENROUTER_KEY", FAKE_KEY);
    vi.stubGlobal("fetch", vi.fn(async () => okResponse("  의자 한 개가 보입니다.  ")));

    const result = await explainReportPhoto(IMG);

    expect(result.ok).toBe(true);
    expect(result.text).toBe("의자 한 개가 보입니다.");
    expect(result.reason).toBeUndefined();
  });

  it("요청 본문에 설명용 프롬프트·모델·이미지가 들어간다", async () => {
    vi.stubEnv("VITE_OPENROUTER_KEY", FAKE_KEY);
    const fetchMock = vi.fn(async () => okResponse("설명"));
    vi.stubGlobal("fetch", fetchMock);

    await explainReportPhoto(IMG, { stopName: "강원대후문", issue: "의자가 흔들려요" });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe(VLM_MODEL);
    const parts = body.messages[0].content;
    expect(parts[0].text).toContain(EXPLAIN_PROMPT);
    expect(parts[0].text).toContain("강원대후문");
    expect(parts[0].text).toContain("의자가 흔들려요");
    expect(parts[1].image_url.url).toBe(IMG);
  });

  it("프롬프트는 판정이 아니라 설명을 요구하고 단정·추측을 막는다", () => {
    expect(EXPLAIN_PROMPT).toContain("설명");
    expect(EXPLAIN_PROMPT).toContain("단정하지 않는다");
    expect(EXPLAIN_PROMPT).toContain("추측하지 않는다");
  });

  it("HTTP 오류 응답이면 reason:api", async () => {
    vi.stubEnv("VITE_OPENROUTER_KEY", FAKE_KEY);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response),
    );

    const result = await explainReportPhoto(IMG);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("api");
  });

  it("200 이지만 형태가 다르면 reason:parse", async () => {
    vi.stubEnv("VITE_OPENROUTER_KEY", FAKE_KEY);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ choices: [] }) }) as unknown as Response),
    );

    const result = await explainReportPhoto(IMG);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("parse");
  });

  it("네트워크 실패면 reason:network", async () => {
    vi.stubEnv("VITE_OPENROUTER_KEY", FAKE_KEY);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    const result = await explainReportPhoto(IMG);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("network");
  });

  it("20초를 넘기면 abort 되어 reason:timeout", async () => {
    vi.stubEnv("VITE_OPENROUTER_KEY", FAKE_KEY);
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
            });
          }),
      ),
    );

    const pending = explainReportPhoto(IMG);
    await vi.advanceTimersByTimeAsync(20000);
    const result = await pending;

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("timeout");
  });
});
