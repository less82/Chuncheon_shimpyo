import { describe, it, expect, vi, afterEach } from "vitest";
import { getArrival, headwayFallback } from "./arrivals";
import type { Stop } from "../types/stop";
import { makeUnknown } from "../types/stop";

function makeStop(headwayMin?: number): Stop {
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

    const r = await getArrival(makeStop(20));
    expect(r).toEqual({ text: "배차간격 약 20분", live: false });
  });

  it("키가 있어도 non-ok 응답이면 폴백", async () => {
    vi.stubEnv("VITE_TAGO_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500 }) as Response),
    );
    const r = await getArrival(makeStop());
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
    const r = await getArrival(makeStop(12));
    expect(r).toEqual({ text: "약 5분 후 도착", live: true });
  });
});
