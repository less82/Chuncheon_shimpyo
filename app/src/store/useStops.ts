import { create } from "zustand";
import type { Stop } from "../types/stop";
import { CITY_CENTER } from "../types/stop";
import { haversine, type LatLng } from "../lib/geo";
import { loadStops } from "../lib/loadStops";

interface StopsState {
  stops: Stop[];
  cityCenter: { lat: number; lng: number };
  loaded: boolean;
  /** stops.json(폴백 sample)을 읽어 스토어를 채운다. */
  load: () => Promise<void>;
  /** 주어진 좌표에서 가장 가까운 정류장. 비었으면 null. */
  nearest: (pos: LatLng) => Stop | null;
}

export const useStops = create<StopsState>((set, get) => ({
  stops: [],
  cityCenter: { lat: CITY_CENTER.lat, lng: CITY_CENTER.lng },
  loaded: false,

  load: async () => {
    const file = await loadStops();
    set({
      stops: file.stops,
      cityCenter: file.cityCenter ?? {
        lat: CITY_CENTER.lat,
        lng: CITY_CENTER.lng,
      },
      loaded: true,
    });
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
