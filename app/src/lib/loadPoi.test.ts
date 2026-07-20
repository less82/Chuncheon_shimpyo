import { describe, it, expect, vi, afterEach } from "vitest";
import { loadPoi } from "./loadPoi";

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

describe("loadPoi", () => {
  it("fetch 성공 시 { id: number } 를 Map으로 파싱한다", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ "250001": 0.5, "250002": 1 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadPoi();

    expect(result).toBeInstanceOf(Map);
    expect(result.get("250001")).toBe(0.5);
    expect(result.get("250002")).toBe(1);
    expect(result.size).toBe(2);
  });

  it("fetch 404 시 빈 Map을 반환한다(throw 안 함)", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(null, false, 404));
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadPoi();

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it("fetch 가 throw 해도 빈 Map을 반환한다(throw 안 함)", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadPoi();

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it("파싱 실패 시에도 빈 Map을 반환한다", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("bad json");
      },
    }));
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const result = await loadPoi();

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });
});
