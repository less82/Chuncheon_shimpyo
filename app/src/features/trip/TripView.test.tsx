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
const destination: Stop = { ...stop, id: "B", stopNo: "1481", name: "춘천역" };

beforeEach(() => {
  useStops.setState({ stops: [stop, destination], loaded: true });
  useFavorites.setState({ ids: [], journeys: [] });
});

describe("<TripView>", () => {
  it("출발지와 목적지를 모두 검색하고 각각 음성 입력을 제공한다", () => {
    const screen = render(<MemoryRouter initialEntries={["/go"]}><Routes><Route path="/go" element={<TripView />} /></Routes></MemoryRouter>);
    expect(screen.getByText("정류장을 선택하세요")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "출발 정류장" }), { target: { value: "강원대" } });
    expect(screen.getByRole("button", { name: /강원대후문/ })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "목적지 정류장" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "출발 정류장 음성 입력" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "목적지 정류장 음성 입력" })).toBeInTheDocument();
  });
});
