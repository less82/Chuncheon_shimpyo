import { afterEach, describe, expect, it, vi } from "vitest";
import { VEHICLE_TIMEOUT_MS, fetchRouteVehicles, parseTagoVehicles, tagoRouteId } from "./vehicles";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// 실제 응답 형태(getRouteAcctoBusLcList, _type=xml).
const REAL_XML =
  "<response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>" +
  "<body><items>" +
  "<item><gpslati>37.8748</gpslati><gpslong>127.7269</gpslong>" +
  "<nodeid>CCB250000123</nodeid><nodenm>일성트루엘A</nodenm><nodeord>12</nodeord>" +
  "<routenm>1</routenm><routetp>일반버스</routetp><vehicleno>강원70자1009</vehicleno></item>" +
  "<item><gpslati>37.8801</gpslati><gpslong>127.7311</gpslong>" +
  "<nodeid>CCB250000456</nodeid><nodenm>춘천역</nodenm><nodeord>5</nodeord>" +
  "<routenm>1</routenm><routetp>일반버스</routetp><vehicleno>강원70자1010</vehicleno></item>" +
  "</items><numOfRows>50</numOfRows><totalCount>2</totalCount></body></response>";

describe("tagoRouteId", () => {
  it("routes.json 의 routeId 앞에 CCB 를 붙인다", () => {
    expect(tagoRouteId("250000100")).toBe("CCB250000100");
  });
  it("이미 CCB 로 시작하면 그대로 둔다", () => {
    expect(tagoRouteId("CCB250000100")).toBe("CCB250000100");
  });
});

describe("parseTagoVehicles", () => {
  it("실제 응답 형태의 item 을 차량으로 파싱하고 순번대로 정렬한다", () => {
    expect(parseTagoVehicles(REAL_XML)).toEqual([
      {
        vehicleNo: "강원70자1010",
        lat: 37.8801,
        lng: 127.7311,
        nodeId: "CCB250000456",
        nodeNm: "춘천역",
        nodeOrd: 5,
        routeNo: "1",
      },
      {
        vehicleNo: "강원70자1009",
        lat: 37.8748,
        lng: 127.7269,
        nodeId: "CCB250000123",
        nodeNm: "일성트루엘A",
        nodeOrd: 12,
        routeNo: "1",
      },
    ]);
  });

  it("item 이 없으면 빈 배열", () => {
    expect(
      parseTagoVehicles(
        "<response><body><items></items><totalCount>0</totalCount></body></response>",
      ),
    ).toEqual([]);
  });

  it("좌표가 없거나 0,0 인 차량은 위치를 추정하지 않고 버린다", () => {
    const xml =
      "<response><body><items>" +
      "<item><nodenm>좌표없음</nodenm><vehicleno>강원70자1</vehicleno></item>" +
      "<item><gpslati>0</gpslati><gpslong>0</gpslong><vehicleno>강원70자2</vehicleno></item>" +
      "</items></body></response>";
    expect(parseTagoVehicles(xml)).toEqual([]);
  });
});

describe("fetchRouteVehicles", () => {
  it("키가 없으면 live:false, fetch 호출 안 함", async () => {
    vi.stubEnv("VITE_TAGO_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchRouteVehicles("250000100")).toEqual({
      vehicles: [],
      live: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("성공하면 live:true 와 차량 목록", async () => {
    vi.stubEnv("VITE_TAGO_KEY", "test-key");
    const fetchMock = vi.fn(
      async (_url: string) =>
        ({ ok: true, status: 200, text: async () => REAL_XML }) as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    const snap = await fetchRouteVehicles("250000100");
    expect(snap.live).toBe(true);
    expect(snap.vehicles).toHaveLength(2);
    expect(snap.vehicles[0].vehicleNo).toBe("강원70자1010");
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "routeId=CCB250000100",
    );
  });

  it("차량이 0대여도 live:true (실패와 구분한다)", async () => {
    vi.stubEnv("VITE_TAGO_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            text: async () =>
              "<response><header><resultCode>00</resultCode></header><body><items></items></body></response>",
          }) as Response,
      ),
    );
    expect(await fetchRouteVehicles("250000100")).toEqual({
      vehicles: [],
      live: true,
    });
  });

  it("resultCode 가 정상이 아니면 live:false", async () => {
    vi.stubEnv("VITE_TAGO_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            text: async () =>
              "<response><header><resultCode>30</resultCode><resultMsg>SERVICE KEY IS NOT REGISTERED ERROR.</resultMsg></header></response>",
          }) as Response,
      ),
    );
    expect((await fetchRouteVehicles("250000100")).live).toBe(false);
  });

  it("non-ok 응답이면 live:false", async () => {
    vi.stubEnv("VITE_TAGO_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500 }) as Response),
    );
    expect((await fetchRouteVehicles("250000100")).live).toBe(false);
  });

  it("네트워크 실패면 live:false", async () => {
    vi.stubEnv("VITE_TAGO_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    expect((await fetchRouteVehicles("250000100")).live).toBe(false);
  });

  it("타임아웃 abort 시 live:false", async () => {
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
    const p = fetchRouteVehicles("250000100");
    // 타임아웃 값을 하드코딩하지 않는다. 상수가 바뀌어도 이 테스트는 그대로 유효해야 한다.
    await vi.advanceTimersByTimeAsync(VEHICLE_TIMEOUT_MS + 500);
    const snap = await p;
    vi.useRealTimers();
    expect(snap).toEqual({ vehicles: [], live: false });
  });
});
