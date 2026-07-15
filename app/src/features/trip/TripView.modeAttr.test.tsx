import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TripView from "./TripView";
import { useStops } from "../../store/useStops";
import { useFavorites } from "../../store/useFavorites";
import { useViewMode } from "../../store/useViewMode";

beforeEach(() => {
  localStorage.clear();
  useFavorites.setState({ ids: [] });
  useStops.setState({ stops: [], loaded: true });
});

const renderTrip = () =>
  render(
    <MemoryRouter>
      <TripView />
    </MemoryRouter>,
  );

describe("TripView 버전 속성", () => {
  it("어른용이면 루트에 data-mode='elder' 를 단다", () => {
    useViewMode.setState({ mode: "elder" });
    const { container } = renderTrip();
    expect(container.querySelector("main.tripview")?.getAttribute("data-mode")).toBe("elder");
  });

  it("일반이면 data-mode='normal' 이다", () => {
    useViewMode.setState({ mode: "normal" });
    const { container } = renderTrip();
    expect(container.querySelector("main.tripview")?.getAttribute("data-mode")).toBe("normal");
  });
});
