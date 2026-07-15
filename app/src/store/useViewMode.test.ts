import { describe, it, expect, beforeEach } from "vitest";
import { useViewMode, VIEW_MODE_KEY } from "./useViewMode";

beforeEach(() => {
  localStorage.clear();
  useViewMode.setState({ mode: "elder" });
});

describe("useViewMode", () => {
  it("기본값은 elder 다", () => {
    expect(useViewMode.getState().mode).toBe("elder");
  });

  it("toggle 은 elder↔normal 을 왕복한다", () => {
    useViewMode.getState().toggle();
    expect(useViewMode.getState().mode).toBe("normal");
    useViewMode.getState().toggle();
    expect(useViewMode.getState().mode).toBe("elder");
  });

  it("setMode 결과가 localStorage 에 영속된다", () => {
    useViewMode.getState().setMode("normal");
    expect(localStorage.getItem(VIEW_MODE_KEY)).toBe("normal");
  });
});
