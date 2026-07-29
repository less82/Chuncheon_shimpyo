import { create } from "zustand";
import type { Stop } from "../types/stop";
import { CITY_CENTER } from "../types/stop";
import { haversine, type LatLng } from "../lib/geo";
import { loadStops } from "../lib/loadStops";

interface StopsState {
  stops: Stop[];
  cityCenter: { lat: number; lng: number };
  loaded: boolean;
  /** 정류장 로딩이 실패했는지. 화면은 이때 재시도를 제공한다(무한 스피너 금지). */
  failed: boolean;
  /** stops.json(폴백 sample)을 읽어 스토어를 채운다. 실패해도 throw 하지 않는다. */
  load: () => Promise<void>;
  /** 주어진 좌표에서 가장 가까운 정류장. 비었으면 null. */
  nearest: (pos: LatLng) => Stop | null;
}

export const useStops = create<StopsState>((set, get) => ({
  stops: [],
  cityCenter: { lat: CITY_CENTER.lat, lng: CITY_CENTER.lng },
  loaded: false,
  failed: false,

  load: async () => {
    set({ failed: false });
    try {
      const file = await loadStops();
      set({
        stops: file.stops,
        cityCenter: file.cityCenter ?? {
          lat: CITY_CENTER.lat,
          lng: CITY_CENTER.lng,
        },
        loaded: true,
        failed: false,
      });
    } catch {
      // 실패를 삼키지 않고 상태로 남긴다. 화면이 실패를 말하고 재시도를 준다.
      set({ loaded: false, failed: true });
    }
  },

  nearest: (pos) => {
    const { stops } = get();
    if (stops.length === 0) return null;
    let best: Stop | null = null;
    let bestD = Infinity;
    for (const s of stops) {
      const d = haversine(pos, { lat: s.lat, lng: s.lng });
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  },
}));
