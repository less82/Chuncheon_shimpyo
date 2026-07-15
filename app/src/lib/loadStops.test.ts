import { describe, it, expect, vi, afterEach } from "vitest";
import { loadStops } from "./loadStops";
import type { StopsFile } from "../types/stop";

const sample: StopsFile = {
  generatedAt: "2026-07-15T00:00:00+09:00",
  cityCenter: { lat: 37.8813, lng: 127.73 },
  stops: [],
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadStops", () => {
  it("stops.json 이 있으면 그것을 반환한다", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("stops.json") && !url.includes("sample")) {
        return jsonResponse({ ...sample, generatedAt: "primary" });
      }
      return jsonResponse(sample);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadStops();
    expect(result.generatedAt).toBe("primary");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops.json 이 404면 sample 로 폴백한다", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("sample")) {
        return jsonResponse({ ...sample, generatedAt: "fallback" });
      }
      return jsonResponse(null, false, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadStops();
    expect(result.generatedAt).toBe("fallback");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stops.json fetch 가 throw 해도 sample 로 폴백한다", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("sample")) {
        return jsonResponse({ ...sample, generatedAt: "fallback" });
      }
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadStops();
    expect(result.generatedAt).toBe("fallback");
  });
});
