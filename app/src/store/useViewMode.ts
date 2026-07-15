import { create } from "zustand";

// 화면 버전 = 어른용(큰 카드/리스트) | 일반(지도 중심). localStorage 영속. 기본은 어른용.
export const VIEW_MODE_KEY = "swimpyo:viewMode";

export type ViewMode = "elder" | "normal";

function readMode(): ViewMode {
  try {
    return localStorage.getItem(VIEW_MODE_KEY) === "normal" ? "normal" : "elder";
  } catch {
    return "elder";
  }
}

function writeMode(mode: ViewMode): void {
  try {
    localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    /* 저장 실패는 조용히 무시(프라이빗 모드 등) */
  }
}

interface ViewModeState {
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
  toggle: () => void;
}

export const useViewMode = create<ViewModeState>((set, get) => ({
  mode: readMode(),
  setMode: (m) => {
    writeMode(m);
    set({ mode: m });
  },
  toggle: () => {
    const next: ViewMode = get().mode === "elder" ? "normal" : "elder";
    writeMode(next);
    set({ mode: next });
  },
}));
