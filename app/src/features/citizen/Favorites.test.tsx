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
  it("즐겨찾기 정류장들을 초대형 카드로 보여준다", () => {
    useFavorites.setState({ ids: ["A", "B"] });
    const { getByText, getAllByText } = renderFav();
    expect(getByText("장학교차로")).toBeInTheDocument();
    expect(getByText("상공회의소")).toBeInTheDocument();
    // 시설 요약("그늘 있음")이 각 카드에 나타난다
    expect(getAllByText(/그늘 있음/).length).toBeGreaterThanOrEqual(2);
  });

  it("즐겨찾기가 없으면 안내 문구를 보여준다", () => {
    useFavorites.setState({ ids: [] });
    const { getByText } = renderFav();
    expect(getByText(/즐겨찾기한 정류장이 없어요/)).toBeInTheDocument();
  });
});
