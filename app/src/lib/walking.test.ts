import { describe, it, expect, vi, afterEach } from "vitest";
import { getWalkRoute, straightWalk } from "./walking";
import { haversine } from "./geo";

const FROM = { lat: 37.876, lng: 127.775 };
const TO = { lat: 37.881, lng: 127.73 };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("straightWalk", () => {
  it("haversine/80(반올림) 분·직선 polyline·real:false", () => {
    const r = straightWalk(FROM, TO);
    const expectMin = Math.max(1, Math.round(haversine(FROM, TO) / 80));
    expect(r.real).toBe(false);
    expect(r.minutes).toBe(expectMin);
    expect(r.polyline).toEqual([
      [FROM.lat, FROM.lng],
      [TO.lat, TO.lng],
    ]);
  });
});

describe("getWalkRoute", () => {
  it("fetch 실패 시 직선 폴백(real:false)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    const r = await getWalkRoute(FROM, TO);
    expect(r.real).toBe(false);
    expect(r.minutes).toBe(Math.max(1, Math.round(haversine(FROM, TO) / 80)));
    expect(r.polyline).toEqual([
      [FROM.lat, FROM.lng],
      [TO.lat, TO.lng],
    ]);
  });

  it("non-ok 응답이면 직선 폴백", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500 }) as Response),
    );
    const r = await getWalkRoute(FROM, TO);
    expect(r.real).toBe(false);
  });

  it("타임아웃(abort) 시 직선 폴백", async () => {
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
    const p = getWalkRoute(FROM, TO);
    await vi.advanceTimersByTimeAsync(3000);
    const r = await p;
    expect(r.real).toBe(false);
  });

  it("mock 정상응답 시 real:true, polyline 은 [lat,lng] 로 뒤집힌 응답 좌표", async () => {
    const osrm = {
      code: "Ok",
      routes: [
        {
          duration: 360, // 6분
          geometry: {
            coordinates: [
              [127.775, 37.876],
              [127.75, 37.878],
              [127.73, 37.881],
            ],
          },
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({ ok: true, status: 200, json: async () => osrm }) as Response,
      ),
    );
    const r = await getWalkRoute(FROM, TO);
    expect(r.real).toBe(true);
    expect(r.minutes).toBe(6);
    expect(r.polyline).toEqual([
      [37.876, 127.775],
      [37.878, 127.75],
      [37.881, 127.73],
    ]);
  });

  it("routes 비었으면 직선 폴백", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ code: "NoRoute", routes: [] }),
          }) as Response,
      ),
    );
    const r = await getWalkRoute(FROM, TO);
    expect(r.real).toBe(false);
  });
});
