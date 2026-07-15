import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useStops } from "./useStops";
import type { Stop, StopsFile } from "../types/stop";
import { makeUnknown } from "../types/stop";

function stop(id: string, lat: number, lng: number): Stop {
  return {
    id,
    stopNo: id,
    name: `정류장${id}`,
    lat,
    lng,
    routes: ["1"],
    facilities: {
      shade: makeUnknown(),
      seat: makeUnknown(),
      light: makeUnknown(),
      sign: makeUnknown(),
    },
  };
}

const file: StopsFile = {
  generatedAt: "t",
  cityCenter: { lat: 37.9, lng: 127.8 },
  stops: [
    stop("A", 37.8813, 127.73),
    stop("B", 37.8636, 127.7255),
    stop("C", 37.9, 127.8),
  ],
};

beforeEach(() => {
  useStops.setState({
    stops: [],
    cityCenter: { lat: 37.8813, lng: 127.73 },
    loaded: false,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useStops", () => {
  it("초기엔 비어 있고 loaded=false", () => {
    const s = useStops.getState();
    expect(s.stops).toHaveLength(0);
    expect(s.loaded).toBe(false);
  });

  it("nearest 는 비었을 때 null", () => {
    expect(useStops.getState().nearest({ lat: 37.88, lng: 127.73 })).toBeNull();
  });

  it("load 후 stops·cityCenter 채워지고 loaded=true", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => file }) as Response),
    );
    await useStops.getState().load();
    const s = useStops.getState();
    expect(s.loaded).toBe(true);
    expect(s.stops).toHaveLength(3);
    expect(s.cityCenter).toEqual({ lat: 37.9, lng: 127.8 });
  });

  it("nearest 는 최단거리 정류장을 반환", () => {
    useStops.setState({ stops: file.stops, loaded: true });
    // 춘천시청 좌표 근방 → A
    const near = useStops.getState().nearest({ lat: 37.8814, lng: 127.7301 });
    expect(near?.id).toBe("A");
    // 남춘천역 좌표 근방 → B
    const near2 = useStops.getState().nearest({ lat: 37.8637, lng: 127.7256 });
    expect(near2?.id).toBe("B");
  });
});
