import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useViewMode } from "../../store/useViewMode";
import { useStops } from "../../store/useStops";
import { useFavorites } from "../../store/useFavorites";
import type { Stop } from "../../types/stop";

// Leaflet 은 jsdom 에서 무겁고 불안정 → MapView 를 가짜로 대체.
vi.mock("../map/MapView", () => ({
  default: () => <div data-testid="mapview">지도</div>,
}));

import CitizenRoot from "./CitizenRoot";

const mk = (id: string, name: string): Stop => ({
  id,
  stopNo: id,
  name,
  lat: 37.8813,
  lng: 127.73,
  routes: ["1"],
  facilities: {
    shade: { status: "unknown", source: "none" },
    seat: { status: "unknown", source: "none" },
    light: { status: "unknown", source: "none" },
    sign: { status: "unknown", source: "none" },
  },
  headwayMin: 10,
});

beforeEach(() => {
  localStorage.clear();
  useFavorites.setState({ ids: [] });
  useStops.setState({ stops: [mk("A", "가까운정류장")], loaded: true });
});

const renderRoot = () =>
  render(
    <MemoryRouter>
      <CitizenRoot />
    </MemoryRouter>,
  );

describe("CitizenRoot", () => {
  it("elder 모드면 어른용 홈을 렌더한다", () => {
    useViewMode.setState({ mode: "elder" });
    renderRoot();
    expect(screen.getByText("가장 가까운 정류장")).toBeInTheDocument();
  });

  it("normal 모드면 일반(지도) 홈을 렌더한다", () => {
    useViewMode.setState({ mode: "normal" });
    renderRoot();
    expect(screen.getByTestId("mapview")).toBeInTheDocument();
  });
});
