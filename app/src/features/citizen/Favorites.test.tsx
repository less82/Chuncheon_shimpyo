import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Stop } from "../../types/stop";
import Favorites from "./Favorites";
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

beforeEach(() => {
  localStorage.clear();
  useFavorites.setState({ ids: [] });
  useStops.setState({
    stops: [mk("A", "장학교차로"), mk("B", "상공회의소")],
    loaded: true,
  });
});

const renderFav = () =>
  render(
    <MemoryRouter>
      <Favorites />
    </MemoryRouter>,
  );

describe("<Favorites>", () => {
  it("저장한 정류장을 검색 없는 목적지 단추로 보여준다", () => {
    useFavorites.setState({ ids: ["A", "B"] });
    const { getByText, getAllByRole } = renderFav();
    expect(getByText("장학교차로")).toBeInTheDocument();
    expect(getByText("상공회의소")).toBeInTheDocument();
    const links = getAllByRole("link", { name: /이곳으로 가기/ });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "/go?dest=A");
  });

  it("즐겨찾기가 없으면 안내 문구를 보여준다", () => {
    useFavorites.setState({ ids: [] });
    const { getByText } = renderFav();
    expect(getByText(/저장한 목적지가 없습니다/)).toBeInTheDocument();
  });
});
