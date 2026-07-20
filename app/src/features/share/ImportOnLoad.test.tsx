import { describe, it, expect, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import type { Stop } from "../../types/stop";
import ImportOnLoad from "./ImportOnLoad";
import { useStops } from "../../store/useStops";
import { useFavorites } from "../../store/useFavorites";

const mk = (id: string, name: string): Stop => ({
  id,
  stopNo: id,
  name,
  lat: 37.88,
  lng: 127.73,
  routes: ["1"],
  facilities: {
    shade: { status: "yes", source: "shade_registry" },
    seat: { status: "yes", source: "bench_registry" },
    light: { status: "unknown", source: "none" },
    sign: { status: "unknown", source: "none" },
  },
  headwayMin: 10,
});

function FavoritesProbe() {
  const location = useLocation();
  const state = location.state as { importedNames?: string[] } | null;
  return <div data-testid="imported-names">{(state?.importedNames ?? []).join(",")}</div>;
}

beforeEach(() => {
  localStorage.clear();
  useFavorites.setState({ ids: [] });
  useStops.setState({
    stops: [mk("A", "장학교차로"), mk("B", "상공회의소")],
    loaded: true,
  });
});

// ImportOnLoad 는 window.location.search 를 직접 읽는다(기존 동작 보존).
const renderAt = (search: string) => {
  window.history.pushState({}, "", `/${search}`);
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<ImportOnLoad />} />
        <Route path="/favorites" element={<FavoritesProbe />} />
      </Routes>
    </MemoryRouter>,
  );
};

describe("<ImportOnLoad>", () => {
  it("화이트리스트에 있는 id 만 즐겨찾기에 병합한다(악성/미존재 id 는 제거)", async () => {
    renderAt("?fav=A,BAD,<script>,ZZZ");
    await waitFor(() => {
      expect(useFavorites.getState().ids).toEqual(["A"]);
    });
  });

  it("등록된 정류장명을 /favorites 로 전달한다", async () => {
    const { findByTestId } = renderAt("?fav=A,B");
    const el = await findByTestId("imported-names");
    expect(el.textContent).toBe("장학교차로,상공회의소");
  });

  it("fav 파라미터가 없으면 아무 것도 하지 않는다", async () => {
    renderAt("");
    await new Promise((r) => setTimeout(r, 0));
    expect(useFavorites.getState().ids).toEqual([]);
  });
});
