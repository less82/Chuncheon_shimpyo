import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ElderHome from "./ElderHome";
import { useStops } from "../../store/useStops";
import { useFavorites } from "../../store/useFavorites";
import { useViewMode } from "../../store/useViewMode";
import type { Stop } from "../../types/stop";

const mk = (id: string, name: string, lat: number, lng: number): Stop => ({
  id,
  stopNo: id,
  name,
  lat,
  lng,
  routes: ["1"],
  facilities: {
    shade: { status: "unknown", source: "none" },
    seat: { status: "yes", source: "bench_registry" },
    light: { status: "unknown", source: "none" },
    sign: { status: "unknown", source: "none" },
  },
  headwayMin: 10,
});

beforeEach(() => {
  localStorage.clear();
  useFavorites.setState({ ids: [] });
  useViewMode.setState({ mode: "elder" });
  useStops.setState({
    stops: [
      mk("A", "가까운정류장", 37.8813, 127.73),
      mk("B", "먼정류장", 37.95, 127.8),
      mk("C", "중간정류장", 37.882, 127.731),
    ],
    loaded: true,
  });
});

const renderHome = () =>
  render(
    <MemoryRouter>
      <ElderHome />
    </MemoryRouter>,
  );

describe("ElderHome", () => {
  it("즐겨찾기가 없으면 최근접 정류장을 주 카드로 보인다", () => {
    renderHome();
    expect(screen.getByText("가장 가까운 정류장")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /가까운정류장/ }),
    ).toBeInTheDocument();
  });

  it("즐겨찾기가 있으면 그 정류장을 주 카드로 보인다", () => {
    useFavorites.setState({ ids: ["B"] });
    renderHome();
    expect(screen.getByText("⭐ 내 정류장")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /먼정류장/ }),
    ).toBeInTheDocument();
  });

  it("근처 목록에서 다른 정류장을 누르면 주 카드가 바뀐다", () => {
    renderHome();
    const list = screen.getByRole("region", { name: "근처 정류장" });
    fireEvent.click(within(list).getByText("중간정류장"));
    expect(
      screen.getByRole("heading", { level: 2, name: /중간정류장/ }),
    ).toBeInTheDocument();
  });
});
