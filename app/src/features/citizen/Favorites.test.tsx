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
  useFavorites.setState({ ids: [], journeys: [] });
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
    useFavorites.setState({ journeys: [
      { id: "A:1:B", boardStopId: "A", destinationStopId: "B", routeNo: "1", direction: "상공회의소 방면" },
      { id: "B:1:A", boardStopId: "B", destinationStopId: "A", routeNo: "1", direction: "장학교차로 방면" },
    ] });
    const { getAllByText, getAllByRole } = renderFav();
    expect(getAllByText("장학교차로").length).toBeGreaterThan(0);
    expect(getAllByText("상공회의소").length).toBeGreaterThan(0);
    const links = getAllByRole("link", { name: /즐겨찾기 버스 정보/ });
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "/go?dest=B&board=A");
  });

  it("즐겨찾기가 없으면 안내 문구를 보여준다", () => {
    useFavorites.setState({ ids: [] });
    const { getByText } = renderFav();
    expect(getByText(/저장한 목적지가 없습니다/)).toBeInTheDocument();
  });

  it("QR 로 등록된 정류장명을 배너로 보여준다(1곳)", () => {
    useFavorites.setState({ ids: ["A"] });
    const { getByText } = render(
      <MemoryRouter
        initialEntries={[
          { pathname: "/favorites", state: { importedNames: ["장학교차로"] } },
        ]}
      >
        <Favorites />
      </MemoryRouter>,
    );
    expect(
      getByText(/장학교차로 정류장을 즐겨찾기에 넣었어요/),
    ).toBeInTheDocument();
  });

  it("여러 곳이 등록되면 '외 N곳' 문구를 보여준다", () => {
    useFavorites.setState({ ids: ["A", "B"] });
    const { getByText } = render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/favorites",
            state: { importedNames: ["장학교차로", "상공회의소"] },
          },
        ]}
      >
        <Favorites />
      </MemoryRouter>,
    );
    expect(getByText(/장학교차로 외 1곳/)).toBeInTheDocument();
  });
});
