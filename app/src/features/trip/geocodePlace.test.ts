import { describe, it, expect, vi, afterEach } from "vitest";
import { searchPlaces } from "./geocodePlace";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("searchPlaces", () => {
  it("결과를 좌표가 유효한 것만 남긴다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => [
          { display_name: "춘천시 한림대학교", lat: "37.8", lon: "127.7" },
          { display_name: "좌표 없음", lat: "abc", lon: "127.7" },
        ],
      }) as unknown as Response),
    );
    const places = await searchPlaces("한림대학교");
    expect(places).toHaveLength(1);
    expect(places[0].lat).toBeCloseTo(37.8);
  });

  it("응답이 오지 않으면 2.5초에 중단해 예외를 던진다(무한 스피너 금지)", async () => {
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
    const promise = searchPlaces("한림대학교");
    const settled = expect(promise).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(3000);
    await settled;
  });
});
