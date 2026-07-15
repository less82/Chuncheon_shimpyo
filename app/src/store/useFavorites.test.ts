import { describe, it, expect, beforeEach } from "vitest";
import { useFavorites, FAVORITES_KEY } from "./useFavorites";

beforeEach(() => {
  localStorage.clear();
  useFavorites.setState({ ids: [] });
});

describe("useFavorites", () => {
  it("toggle 로 추가/제거하고 has 로 확인한다", () => {
    const { toggle, has } = useFavorites.getState();
    expect(has("250001192")).toBe(false);
    toggle("250001192");
    expect(useFavorites.getState().has("250001192")).toBe(true);
    toggle("250001192");
    expect(useFavorites.getState().has("250001192")).toBe(false);
  });

  it("addMany 는 중복 없이 병합한다", () => {
    const { addMany } = useFavorites.getState();
    addMany(["a", "b"]);
    addMany(["b", "c"]);
    const ids = useFavorites.getState().ids;
    expect(ids).toContain("a");
    expect(ids).toContain("b");
    expect(ids).toContain("c");
    expect(ids.filter((x) => x === "b")).toHaveLength(1);
  });

  it("toggle 결과가 localStorage 에 영속된다", () => {
    useFavorites.getState().toggle("250026779");
    const raw = localStorage.getItem(FAVORITES_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toContain("250026779");
  });

  it("addMany 도 localStorage 에 영속된다", () => {
    useFavorites.getState().addMany(["x", "y"]);
    expect(JSON.parse(localStorage.getItem(FAVORITES_KEY) as string)).toEqual(
      expect.arrayContaining(["x", "y"]),
    );
  });
});
