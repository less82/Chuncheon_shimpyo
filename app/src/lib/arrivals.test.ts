import { describe, it, expect, vi, afterEach } from "vitest";
import { getArrival, headwayFallback } from "./arrivals";
import type { Stop } from "../types/stop";
import { makeUnknown } from "../types/stop";

function makeStop(headwayMin?: number, tagoNodeId?: string): Stop {
  return {
    id: "250001192",
    stopNo: "1001",
    name: "대형약국",
    lat: 37.876,
    lng: 127.775,
    routes: ["1"],
    facilities: {
      shade: makeUnknown(),
      seat: makeUnknown(),
      light: makeUnknown(),
      sign: makeUnknown(),
    },
    headwayMin,
    tagoNodeId,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("headwayFallback", () => {
  it("headwayMin 을 문구에 사용", () => {
    expect(headwayFallback(makeStop(12))).toEqual({
      text: "배차간격 약 12분",
      live: false,
    });
  });
  it("headwayMin 없으면 15분 기본", () => {
    expect(headwayFallback(makeStop()).text).toBe("배차간격 약 15분");
  });
});

describe("getArrival", () => {
  it("키가 없으면 즉시 폴백(live:false), fetch 호출 안 함", async () => {
    vi.stubEnv("VITE_TAGO_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const r = await getArrival(makeStop(12, "NODE1"));
    expect(r).toEqual({ text: "배차간격 약 12분", live: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tagoNodeId 없으면 키가 있어도 즉시 폴백, fetch 호출 안 함", async () => {
    vi.stubEnv("VITE_TAGO_KEY", "test-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const r = await getArrival(makeStop(12));
    expect(r).toEqual({ text: "배차간격 약 12분", live: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("키가 있어도 fetch 실패 시 폴백", async () => {
    vi.stubEnv("VITE_TAGO_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    const r = await getArrival(makeStop(20, "NODE1"));
    expect(r).toEqual({ text: "배차간격 약 20분", live: false });
  });

  it("타임아웃(abort) 시 폴백", async () => {
    vi.stubEnv("VITE_TAGO_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, opts: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            opts.signal.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      ),
    );
    vi.useFakeTimers();
    const p = getArrival(makeStop(20, "NODE1"));
    await vi.advanceTimersByTimeAsync(3000);
    const r = await p;
    vi.useRealTimers();
    expect(r).toEqual({ text: "배차간격 약 20분", live: false });
  });

  it("키가 있어도 non-ok 응답이면 폴백", async () => {
    vi.stubEnv("VITE_TAGO_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500 }) as Response),
    );
    const r = await getArrival(makeStop(undefined, "NODE1"));
    expect(r.live).toBe(false);
    expect(r.text).toBe("배차간격 약 15분");
  });

  it("키가 있고 arrtime 파싱되면 live:true", async () => {
    vi.stubEnv("VITE_TAGO_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            text: async () => "<response><arrtime>300</arrtime></response>",
          }) as Response,
      ),
    );
    const r = await getArrival(makeStop(12, "NODE1"));
    expect(r.live).toBe(true);
    expect(r.text).toBe("약 5분 후 도착");
    expect(r.byRoute).toEqual([{ routeNo: "", min: 5, seq: 0 }]);
  });

  it("여러 item 을 byRoute 로 파싱하고 최소 도착 노선을 대표로", async () => {
    vi.stubEnv("VITE_TAGO_KEY", "test-key");
    const xml =
      "<response><body><items>" +
      "<item><routeno>7</routeno><arrtime>600</arrtime><arrprevstationcnt>5</arrprevstationcnt></item>" +
      "<item><routeno>3</routeno><arrtime>120</arrtime><arrprevstationcnt>1</arrprevstationcnt></item>" +
      "</items></body></response>";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({ ok: true, status: 200, text: async () => xml }) as Response,
      ),
    );
    const r = await getArrival(makeStop(12, "NODE1"));
    expect(r.live).toBe(true);
    expect(r.text).toBe("약 2분 후 도착");
    expect(r.byRoute).toEqual([
      { routeNo: "3", min: 2, seq: 1 },
      { routeNo: "7", min: 10, seq: 5 },
    ]);
  });

  it("routeNo 지정 시 해당 노선을 대표 문구로", async () => {
    vi.stubEnv("VITE_TAGO_KEY", "test-key");
    const xml =
      "<response><items>" +
      "<item><routeno>7</routeno><arrtime>600</arrtime><arrprevstationcnt>5</arrprevstationcnt></item>" +
      "<item><routeno>3</routeno><arrtime>120</arrtime><arrprevstationcnt>1</arrprevstationcnt></item>" +
      "</items></response>";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({ ok: true, status: 200, text: async () => xml }) as Response,
      ),
    );
    const r = await getArrival(makeStop(12, "NODE1"), "7");
    expect(r.text).toBe("약 10분 후 도착");
  });
});
