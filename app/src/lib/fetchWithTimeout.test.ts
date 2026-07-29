import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchWithTimeout } from "./fetchWithTimeout";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("fetchWithTimeout", () => {
  it("응답이 오면 그대로 돌려준다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200 }) as Response));
    const res = await fetchWithTimeout("/data/stops.json");
    expect(res.ok).toBe(true);
  });

  it("2.5초 안에 응답이 없으면 중단하고 예외를 던진다(무한 대기 없음)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, opts: { signal: AbortSignal }) =>
          new Promise<Response>((_resolve, reject) => {
            opts.signal.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      ),
    );
    vi.useFakeTimers();
    const promise = fetchWithTimeout("/data/stops.json");
    const settled = expect(promise).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(3000);
    await settled;
  });
});
