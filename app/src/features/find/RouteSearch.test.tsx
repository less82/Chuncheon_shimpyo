import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useStops } from "../../store/useStops";
import type { Stop } from "../../types/stop";
import { fetchRouteVehicles } from "../../lib/vehicles";
import { RouteSearch } from "./RouteSearch";

// 지도는 jsdom 에서 실제로 그릴 수 없다. 초기화·정리 호출만 검증 가능하게 대체한다.
vi.mock("leaflet", () => {
  const map = {
    remove: vi.fn(),
    fitBounds: vi.fn(),
  };
  return {
    default: {
      map: vi.fn(() => map),
      tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
      circleMarker: vi.fn(() => ({ addTo: vi.fn(), remove: vi.fn(), bindTooltip: vi.fn() })),
      latLngBounds: vi.fn(() => ({ isValid: () => true })),
    },
  };
});

vi.mock("../../lib/vehicles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/vehicles")>();
  return { ...actual, fetchRouteVehicles: vi.fn(async () => ({ vehicles: [], live: false })) };
});

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
    shelter: { status: "unknown", source: "none" },
    sign: { status: "unknown", source: "none" },
  },
};

const stops: Stop[] = [
  { ...base, id: "A", stopNo: "1001", name: "춘천역" },
  { ...base, id: "B", stopNo: "1002", name: "강원대후문" },
  { ...base, id: "C", stopNo: "1003", name: "남춘천역" },
];

const vehiclesMock = vi.mocked(fetchRouteVehicles);

beforeEach(() => {
  useStops.setState({ stops, loaded: true });
  vehiclesMock.mockReset();
  vehiclesMock.mockResolvedValue({ vehicles: [], live: false });
});

afterEach(() => {
  vi.useRealTimers();
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

describe("<RouteSearch> 실시간 차량", () => {
  it("접혀 있으면 실시간을 조회하지 않고, 펼치면 그 노선만 조회한다", async () => {
    const screen = render(<MemoryRouter><RouteSearch /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText("노선 3개")).toBeInTheDocument());
    expect(vehiclesMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "1 노선 경유 정류장 펼치기" }));

    await waitFor(() => expect(vehiclesMock).toHaveBeenCalledWith("r1"));
    expect(vehiclesMock).toHaveBeenCalledTimes(1);
  });

  it("접으면 더 이상 갱신하지 않는다(타이머 정리)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const screen = render(<MemoryRouter><RouteSearch /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText("노선 3개")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "1 노선 경유 정류장 펼치기" }));
    await waitFor(() => expect(vehiclesMock).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(30000);
    expect(vehiclesMock).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "1 노선 경유 정류장 접기" }));
    await vi.advanceTimersByTimeAsync(60000);
    expect(vehiclesMock).toHaveBeenCalledTimes(2);
  });

  it("조회 실패면 배차간격이 아니라 실패 문구를 쓴다", async () => {
    const screen = render(<MemoryRouter><RouteSearch /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText("노선 3개")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "1 노선 경유 정류장 펼치기" }));

    await waitFor(() =>
      expect(screen.getByText("실시간 도착정보를 불러오지 못했어요")).toBeInTheDocument(),
    );
  });

  it("실시간은 되는데 차량이 0대면 실패와 다른 문구를 쓴다", async () => {
    vehiclesMock.mockResolvedValue({ vehicles: [], live: true });
    const screen = render(<MemoryRouter><RouteSearch /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText("노선 3개")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "1 노선 경유 정류장 펼치기" }));

    await waitFor(() => expect(screen.getByText("지금 운행 중인 버스가 없어요")).toBeInTheDocument());
    expect(screen.queryByText("실시간 도착정보를 불러오지 못했어요")).not.toBeInTheDocument();
  });

  it("차량이 있으면 지도와 함께 텍스트 목록도 준다", async () => {
    vehiclesMock.mockResolvedValue({
      live: true,
      vehicles: [
        {
          vehicleNo: "강원70자1009",
          lat: 37.8748,
          lng: 127.7269,
          nodeId: "CCB250000123",
          nodeNm: "강원대후문",
          nodeOrd: 2,
          routeNo: "1",
        },
      ],
    });
    const screen = render(<MemoryRouter><RouteSearch /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText("노선 3개")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "1 노선 경유 정류장 펼치기" }));

    await waitFor(() =>
      expect(screen.getByText("강원70자1009 · 강원대후문 (2/3번째)")).toBeInTheDocument(),
    );
    expect(screen.getByText("지금 운행 중인 버스 1대")).toBeInTheDocument();
    // 버스가 있는 정류장은 경유 목록에서도 색이 아니라 문구로 알린다.
    expect(
      screen.getByRole("link", { name: "2번째 정류장 강원대후문 지금 버스 있음에서 출발해 목적지 고르기" }),
    ).toBeInTheDocument();
  });
});
