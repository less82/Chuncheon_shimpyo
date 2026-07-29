import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useStops } from "../../store/useStops";
import type { Stop } from "../../types/stop";
import { getArrival } from "../../lib/arrivals";
import { StopSearch } from "./StopSearch";

// getArrival 만 가짜로 바꾼다. arrivalsForRoutes 는 실제 구현을 그대로 쓴다.
vi.mock("../../lib/arrivals", async () => {
  const actual = await vi.importActual<typeof import("../../lib/arrivals")>("../../lib/arrivals");
  return { ...actual, getArrival: vi.fn() };
});

const mockedGetArrival = vi.mocked(getArrival);

const chuncheonStation: Stop = {
  id: "250001",
  stopNo: "1001",
  name: "춘천역",
  lat: 37.884,
  lng: 127.717,
  routes: ["1", "12"],
  facilities: {
    shade: { status: "yes", source: "shade_registry" },
    seat: { status: "no", source: "roadview", capturedAt: "2024.05" },
    light: { status: "unknown", source: "none" },
    sign: { status: "unknown", source: "none" },
  },
};

const university: Stop = {
  ...chuncheonStation,
  id: "250002",
  stopNo: "2002",
  name: "강원대학교",
  routes: ["7"],
};

const renderSearch = () => render(<MemoryRouter><StopSearch /></MemoryRouter>);

beforeEach(() => {
  useStops.setState({ stops: [chuncheonStation, university], loaded: true });
  mockedGetArrival.mockReset();
  // 기본값은 실시간 실패다. 배차간격 폴백 문구가 화면에 새지 않는지도 함께 본다.
  mockedGetArrival.mockResolvedValue({ text: "배차간격 약 15분", live: false, status: "failed" });
});

/** 춘천역을 검색해 상세를 펼친다. */
function openChuncheon() {
  const screen = renderSearch();
  fireEvent.change(screen.getByLabelText("정류장 이름 또는 정류장번호 검색"), { target: { value: "1001" } });
  fireEvent.click(screen.getByRole("button", { name: /춘천역/ }));
  return screen;
}

describe("<StopSearch>", () => {
  it("검색어가 없으면 결과 대신 안내 문구를 보여준다", () => {
    const screen = renderSearch();
    expect(screen.getByText(/4자리 번호를 입력하세요/)).toBeInTheDocument();
  });

  it("이름으로 검색해 결과가 나온다", () => {
    const screen = renderSearch();
    fireEvent.change(screen.getByLabelText("정류장 이름 또는 정류장번호 검색"), { target: { value: "춘천" } });
    expect(screen.getByRole("button", { expanded: false, name: /춘천역/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /강원대학교/ })).not.toBeInTheDocument();
  });

  it("정류장번호로 검색해 결과가 나온다", () => {
    const screen = renderSearch();
    fireEvent.change(screen.getByLabelText("정류장 이름 또는 정류장번호 검색"), { target: { value: "2002" } });
    const row = screen.getByRole("button", { name: /강원대학교/ });
    expect(row).toBeInTheDocument();
    expect(row).toHaveTextContent("경유 노선 1개");
  });

  it("결과를 누르면 시설 3상태가 보인다", async () => {
    const screen = openChuncheon();
    await screen.findByText("실시간 도착정보를 불러오지 못했어요");

    expect(screen.getByRole("group", { name: /그늘 있음/ })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /의자 없음/ })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /조명 미확인/ })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /도착안내기 미확인/ })).toBeInTheDocument();
    expect(screen.getByText("250001")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /출발해 목적지 고르기/ })).toHaveAttribute("href", "/go?board=250001");
    expect(screen.getByRole("link", { name: /상태 알리기/ })).toHaveAttribute("href", "/app/report?stop=250001");
  });

  it("도착정보를 약속하지 않고 탑승 정류장이라는 뜻으로 안내한다", async () => {
    const screen = openChuncheon();
    await screen.findByText("실시간 도착정보를 불러오지 못했어요");

    expect(screen.getByText("이 정류장에서 출발하기")).toBeInTheDocument();
    expect(screen.queryByText(/가는 버스 보기/)).not.toBeInTheDocument();
    expect(screen.queryByText(/배차간격/)).not.toBeInTheDocument();
  });

  it("미확인 시설을 없음으로 표시하지 않는다", async () => {
    const screen = openChuncheon();
    await screen.findByText("실시간 도착정보를 불러오지 못했어요");

    // 조명·도착안내기는 근거가 없어 미확인이다. "없음"은 의자 하나뿐이어야 한다.
    const labels = screen.getAllByText(/^(있음|없음|미확인)$/).map((node) => node.textContent);
    expect(labels).toEqual(["있음", "없음", "미확인", "미확인"]);
  });
});

describe("<StopSearch> 지금 오는 버스", () => {
  it("펼친 정류장만 조회한다", async () => {
    const screen = renderSearch();
    fireEvent.change(screen.getByLabelText("정류장 이름 또는 정류장번호 검색"), { target: { value: "1001" } });
    expect(mockedGetArrival).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /춘천역/ }));
    expect(mockedGetArrival).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("실시간 도착정보를 불러오지 못했어요")).toBeInTheDocument();
  });

  it("남은 정거장 수와 도착시간을 함께 보여준다", async () => {
    mockedGetArrival.mockResolvedValue({
      text: "약 7분 후 도착",
      live: true,
      status: "live" as const,
      byRoute: [
        { routeNo: "12", min: 7, seq: 9 },
        { routeNo: "1", min: 12, seq: 15 },
      ],
    });
    const screen = openChuncheon();

    expect(await screen.findByText("9정거장 전 · 약 7분")).toBeInTheDocument();
    expect(screen.getByText("15정거장 전 · 약 12분")).toBeInTheDocument();
  });

  it("남은 정거장이 0이면 곧 도착으로 쓴다", async () => {
    mockedGetArrival.mockResolvedValue({
      text: "곧 도착",
      live: true,
      status: "live" as const,
      byRoute: [{ routeNo: "1", min: 0, seq: 0 }],
    });
    const screen = openChuncheon();

    expect(await screen.findByText("곧 도착")).toBeInTheDocument();
    expect(screen.queryByText(/정거장 전/)).not.toBeInTheDocument();
  });

  it("경유 노선만 남기고 빠른 순으로 최대 3개만 보여준다", async () => {
    useStops.setState({
      stops: [{ ...chuncheonStation, routes: ["1", "12", "3", "5"] }, university],
      loaded: true,
    });
    mockedGetArrival.mockResolvedValue({
      text: "약 2분 후 도착",
      live: true,
      status: "live" as const,
      byRoute: [
        { routeNo: "12", min: 2, seq: 2 },
        { routeNo: "1", min: 4, seq: 5 },
        { routeNo: "3", min: 6, seq: 8 },
        { routeNo: "5", min: 9, seq: 11 },
        { routeNo: "9", min: 1, seq: 1 },
      ],
    });
    const screen = openChuncheon();

    expect(await screen.findByText("2정거장 전 · 약 2분")).toBeInTheDocument();
    expect(screen.getByText("5정거장 전 · 약 4분")).toBeInTheDocument();
    expect(screen.getByText("8정거장 전 · 약 6분")).toBeInTheDocument();
    expect(screen.queryByText("11정거장 전 · 약 9분")).not.toBeInTheDocument();
    expect(screen.queryByText("9번")).not.toBeInTheDocument();
  });

  it("실시간이 아니면 배차간격 대신 안내 문구만 쓴다", async () => {
    const screen = openChuncheon();

    expect(await screen.findByText("실시간 도착정보를 불러오지 못했어요")).toBeInTheDocument();
    expect(screen.queryByText(/배차간격/)).not.toBeInTheDocument();
    expect(screen.queryByText(/정거장 전/)).not.toBeInTheDocument();
  });

  it("실시간인데 오는 버스가 없으면 없다고 쓴다", async () => {
    mockedGetArrival.mockResolvedValue({ text: "곧 도착", live: true, status: "live" as const, byRoute: [{ routeNo: "9", min: 3, seq: 3 }] });
    const screen = openChuncheon();

    expect(await screen.findByText("지금 오는 버스가 없어요")).toBeInTheDocument();
    expect(screen.queryByText(/배차간격/)).not.toBeInTheDocument();
  });
});
