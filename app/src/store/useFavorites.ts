import { create } from "zustand";

// 즐겨찾기 = 정류장 id 목록. localStorage 영속(개인정보 아님, id만 저장).
export const FAVORITES_KEY = "swimpyo:favorites";

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

interface FavoritesState {
  ids: string[];
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  /** 여러 id를 중복 없이 병합(보호자 대리등록 등). */
  addMany: (ids: string[]) => void;
}

export const useFavorites = create<FavoritesState>((set, get) => ({
  ids: readIds(),

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
}));
