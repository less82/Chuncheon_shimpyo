import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TripView from "./TripView";
import { useStops } from "../../store/useStops";
import { useFavorites } from "../../store/useFavorites";
import type { Stop } from "../../types/stop";

const stop: Stop = {
  id: "A", stopNo: "1480", name: "강원대후문", lat: 37.88, lng: 127.73,
  routes: ["12"], headwayMin: 12,
  facilities: {
    shade: { status: "unknown", source: "none" }, seat: { status: "unknown", source: "none" },
    light: { status: "unknown", source: "none" }, sign: { status: "unknown", source: "none" },
  },
};

beforeEach(() => {
  useStops.setState({ stops: [stop], loaded: true });
  useFavorites.setState({ ids: [], journeys: [] });
});

describe("<TripView>", () => {
  it("메인 버스 진입 시 목적지보다 승차 정류장을 먼저 찾는다", () => {
    const screen = render(<MemoryRouter initialEntries={["/go"]}><Routes><Route path="/go" element={<TripView />} /></Routes></MemoryRouter>);
    expect(screen.getByText("어디서 타세요?")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "정류장 검색" }), { target: { value: "강원대" } });
    expect(screen.getByRole("button", { name: /강원대후문/ })).toBeInTheDocument();
    expect(screen.queryByText("어디로 가세요?")).not.toBeInTheDocument();
  });
});
