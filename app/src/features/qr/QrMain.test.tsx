import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { useStops } from "../../store/useStops";
import type { Stop } from "../../types/stop";
import { loadRoutes } from "../../lib/loadRoutes";
import { getArrival, type Arrival } from "../../lib/arrivals";
import QrMain from "./QrMain";

vi.mock("../../lib/loadRoutes", () => ({
  loadRoutes: vi.fn(async () => ({ generatedAt: "test", routes: [] })),
}));

// 지도(leaflet)는 jsdom 에서 그릴 수 없다. 도착정보 문구 검증에는 필요 없다.
vi.mock("./QrStopMap", () => ({ default: () => null }));

vi.mock("../../lib/arrivals", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/arrivals")>();
  return { ...actual, getArrival: vi.fn(async () => actual.headwayFallback({ headwayMin: 15 } as Stop)) };
});

const mockedLoadRoutes = vi.mocked(loadRoutes);
const mockedGetArrival = vi.mocked(getArrival);

const stop: Stop = {
  id: "250001",
  stopNo: "1001",
  name: "춘천역",
  lat: 37.884,
  lng: 127.717,
  routes: ["1"],
  facilities: {
    shade: { status: "unknown", source: "none" },
    seat: { status: "unknown", source: "none" },
    light: { status: "unknown", source: "none" },
    sign: { status: "unknown", source: "none" },
  },
};

const destinationStop: Stop = { ...stop, id: "250002", stopNo: "1002", name: "남춘천역", lat: 37.864, lng: 127.723 };

/** 출발 정류장을 손으로 고르고 목적지를 검색해 노선 후보 화면까지 간다. */
async function searchTrip(screen: ReturnType<typeof render>) {
  fireEvent.click(screen.getByRole("button", { name: "버스 도착 예정시간 확인" }));
  fireEvent.change(screen.getByLabelText("출발 정류장을 입력하세요"), { target: { value: "1001" } });
  fireEvent.click(await screen.findByRole("button", { name: "춘천역" }));
  fireEvent.change(screen.getByLabelText("목적지"), { target: { value: "남춘천역" } });
  fireEvent.click(screen.getByRole("button", { name: "찾기" }));
}

beforeEach(() => {
  localStorage.clear();
  // jsdom 에는 scrollIntoView 가 없다. 결과 화면이 스크롤을 호출해도 죽지 않게 둔다.
  Element.prototype.scrollIntoView = vi.fn();
  mockedLoadRoutes.mockResolvedValue({ generatedAt: "test", routes: [] });
  mockedGetArrival.mockResolvedValue({ text: "배차간격 약 15분", live: false, status: "failed" } satisfies Arrival);
  useStops.setState({ stops: [stop], loaded: true });
  // 위치 확인 없이도 정류장을 직접 고를 수 있어야 한다.
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
  vi.stubGlobal("crypto", { randomUUID: () => "report-qr-1" });
});

describe("<QrMain>", () => {
  it("공식 접수 연계가 없으므로 '민원 접수'라고 쓰지 않는다", () => {
    const screen = render(<QrMain />);

    expect(screen.getByRole("button", { name: "정류장 상태 알리기" })).toBeInTheDocument();
    expect(screen.queryByText(/민원 접수/)).not.toBeInTheDocument();
  });

  it("실시간을 못 받으면 배차간격으로 대기 시간을 지어내지 않는다", async () => {
    useStops.setState({ stops: [stop, destinationStop], loaded: true });
    mockedLoadRoutes.mockResolvedValue({ generatedAt: "test", routes: [{ routeId: "1", routeNo: "1", stops: ["250001", "250002"] }] });
    const screen = render(<QrMain />);

    await searchTrip(screen);

    expect(await screen.findByText("실시간 도착정보를 불러오지 못했어요")).toBeInTheDocument();
    expect(screen.queryByText(/배차간격/)).not.toBeInTheDocument();
    expect(screen.queryByText(/배차표/)).not.toBeInTheDocument();
    expect(screen.queryByText(/분 후/)).not.toBeInTheDocument();
    expect(screen.queryByText(/가장 빨리 도착/)).not.toBeInTheDocument();
  });

  it("실시간 도착정보가 오면 대기 시간만 보여주고 총 소요시간은 지어내지 않는다", async () => {
    useStops.setState({ stops: [stop, destinationStop], loaded: true });
    mockedLoadRoutes.mockResolvedValue({ generatedAt: "test", routes: [{ routeId: "1", routeNo: "1", stops: ["250001", "250002"] }] });
    mockedGetArrival.mockResolvedValue({ text: "약 9분 후 도착", live: true, status: "live" as const, byRoute: [{ routeNo: "1", min: 9, seq: 3 }] });
    const screen = render(<QrMain />);

    await searchTrip(screen);

    expect(await screen.findByText("9분 후")).toBeInTheDocument();
    expect(screen.getByText("실시간 도착정보")).toBeInTheDocument();
    expect(screen.queryByText("실시간 도착정보를 불러오지 못했어요")).not.toBeInTheDocument();
    // 검증된 경로 API 가 없으므로 목적지까지의 총 소요시간은 화면에 두지 않는다.
    expect(screen.queryByText(/목적지까지/)).not.toBeInTheDocument();
  });

  it("실시간은 정상인데 그 노선 버스가 없으면 '조회 실패'라고 말하지 않는다", async () => {
    useStops.setState({ stops: [stop, destinationStop], loaded: true });
    mockedLoadRoutes.mockResolvedValue({ generatedAt: "test", routes: [{ routeId: "1", routeNo: "1", stops: ["250001", "250002"] }] });
    mockedGetArrival.mockResolvedValue({ text: "약 9분 후 도착", live: true, status: "live" as const, byRoute: [{ routeNo: "77", min: 9, seq: 3 }] });
    const screen = render(<QrMain />);

    await searchTrip(screen);

    expect(await screen.findByText("지금 오는 버스가 없어요")).toBeInTheDocument();
    expect(screen.queryByText("실시간 도착정보를 불러오지 못했어요")).not.toBeInTheDocument();
    expect(screen.queryByText(/배차간격/)).not.toBeInTheDocument();
  });

  it("보내기 완료 화면에서 접수됐다고 확정하지 않는다", async () => {
    const screen = render(<QrMain />);

    fireEvent.click(screen.getByRole("button", { name: "정류장 상태 알리기" }));
    fireEvent.change(screen.getByLabelText("출발 정류장을 입력하세요"), { target: { value: "1001" } });
    fireEvent.click(await screen.findByRole("button", { name: "춘천역" }));
    fireEvent.click(screen.getByRole("button", { name: "네, 맞아요" }));
    fireEvent.click(screen.getByRole("button", { name: "의자가 파손됐어요" }));
    fireEvent.click(screen.getByRole("button", { name: "내용 보내기" }));
    fireEvent.click(screen.getByRole("button", { name: "확인" }));

    await waitFor(() => expect(screen.getByText("알려주셔서 고맙습니다")).toBeInTheDocument());
    expect(screen.queryByText(/접수됐어요/)).not.toBeInTheDocument();
    expect(screen.getByText("검수 후 담당 부서로 전달됩니다.")).toBeInTheDocument();
  });
});
