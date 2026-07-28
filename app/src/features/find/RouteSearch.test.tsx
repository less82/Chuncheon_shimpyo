import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useStops } from "../../store/useStops";
import type { Stop } from "../../types/stop";
import { RouteSearch } from "./RouteSearch";

vi.mock("../../lib/loadRoutes", () => ({
  loadRoutes: vi.fn(async () => ({
    generatedAt: "test",
    routes: [
      { routeId: "r1", routeNo: "1", stops: ["A", "B", "C"] },
      { routeId: "r12", routeNo: "12", stops: ["B", "A"] },
      { routeId: "rns3", routeNo: "남산3(남산304)", stops: ["C", "B"] },
    ],
  })),
}));

const base: Omit<Stop, "id" | "stopNo" | "name"> = {
  lat: 37.88,
  lng: 127.73,
  routes: ["1"],
  facilities: {
    shade: { status: "unknown", source: "none" },
    seat: { status: "unknown", source: "none" },
    light: { status: "unknown", source: "none" },
    sign: { status: "unknown", source: "none" },
  },
};

const stops: Stop[] = [
  { ...base, id: "A", stopNo: "1001", name: "춘천역" },
  { ...base, id: "B", stopNo: "1002", name: "강원대후문" },
  { ...base, id: "C", stopNo: "1003", name: "남춘천역" },
];

beforeEach(() => {
  useStops.setState({ stops, loaded: true });
});

describe("<RouteSearch>", () => {
  it("노선 번호로 검색하면 맞는 노선만 남는다", async () => {
    const screen = render(<MemoryRouter><RouteSearch /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText("노선 3개")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("노선 번호 또는 이름으로 검색"), { target: { value: "12" } });

    expect(screen.getByText("노선 1개")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^12 노선 경유 정류장/ })).toBeInTheDocument();
  });

  it("노선을 누르면 경유 정류장이 정차 순서대로 나온다", async () => {
    const screen = render(<MemoryRouter><RouteSearch /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText("노선 3개")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "1 노선 경유 정류장 펼치기" }));

    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["1춘천역", "2강원대후문", "3남춘천역"]);
    const first = within(items[0]).getByRole("link");
    expect(first).toHaveAttribute("href", "/go?board=A");
    // 도착정보를 약속하지 않는다. 링크가 가는 곳은 목적지 고르기 화면이다.
    expect(first).toHaveAccessibleName("1번째 정류장 춘천역에서 출발해 목적지 고르기");
  });

  it("마을버스 노선에는 권역 배지가, 시내버스에는 시내버스 배지가 붙는다", async () => {
    const screen = render(<MemoryRouter><RouteSearch /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText("노선 3개")).toBeInTheDocument());

    expect(screen.getByText("마을 · 남산")).toBeInTheDocument();
    expect(screen.getAllByText("시내버스")).toHaveLength(2);
  });

  it("stops.json 에 없는 정류장은 이름을 지어내지 않는다", async () => {
    useStops.setState({ stops: [stops[0]], loaded: true });
    const screen = render(<MemoryRouter><RouteSearch /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText("노선 3개")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "1 노선 경유 정류장 펼치기" }));

    expect(screen.getAllByText("이름 미확인")).toHaveLength(2);
  });
});
