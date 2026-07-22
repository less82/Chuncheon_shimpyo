import { create } from "zustand";

// 즐겨찾기 = 정류장 id 목록. localStorage 영속(개인정보 아님, id만 저장).
export const FAVORITES_KEY = "swimpyo:favorites";
export const FAVORITE_JOURNEYS_KEY = "swimpyo:favorite-journeys";

export interface FavoriteJourney {
  id: string;
  boardStopId: string;
  destinationStopId: string;
  routeNo: string;
  direction: string;
}

function readIds(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

function writeIds(ids: string[]): void {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
  } catch {
    /* 저장 실패는 조용히 무시(브라우저 프라이빗 모드 등) */
  }
}

function readJourneys(): FavoriteJourney[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(FAVORITE_JOURNEYS_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is FavoriteJourney =>
      item && typeof item.id === "string" && typeof item.boardStopId === "string" &&
      typeof item.destinationStopId === "string" && typeof item.routeNo === "string" &&
      typeof item.direction === "string");
  } catch { return []; }
}

function writeJourneys(journeys: FavoriteJourney[]): void {
  try { localStorage.setItem(FAVORITE_JOURNEYS_KEY, JSON.stringify(journeys)); } catch { /* ignore */ }
}

interface FavoritesState {
  ids: string[];
  journeys: FavoriteJourney[];
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  /** 여러 id를 중복 없이 병합(보호자 대리등록 등). */
  addMany: (ids: string[]) => void;
  saveJourney: (journey: Omit<FavoriteJourney, "id">) => void;
  removeJourney: (id: string) => void;
}

export const useFavorites = create<FavoritesState>((set, get) => ({
  ids: readIds(),
  journeys: readJourneys(),

  has: (id) => get().ids.includes(id),

  toggle: (id) =>
    set((s) => {
      const ids = s.ids.includes(id)
        ? s.ids.filter((x) => x !== id)
        : [...s.ids, id];
      writeIds(ids);
      return { ids };
    }),

  addMany: (add) =>
    set((s) => {
      const ids = Array.from(new Set([...s.ids, ...add]));
      writeIds(ids);
      return { ids };
    }),

  saveJourney: (journey) => set((s) => {
    const id = `${journey.boardStopId}:${journey.routeNo}:${journey.destinationStopId}`;
    const saved = { ...journey, id };
    const journeys = [...s.journeys.filter((item) => item.id !== id), saved];
    const ids = Array.from(new Set([...s.ids, journey.destinationStopId]));
    writeJourneys(journeys);
    writeIds(ids);
    return { journeys, ids };
  }),

  removeJourney: (id) => set((s) => {
    const journeys = s.journeys.filter((item) => item.id !== id);
    writeJourneys(journeys);
    return { journeys };
  }),
}));
