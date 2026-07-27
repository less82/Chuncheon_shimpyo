import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TripView from "./TripView";
import { extractStopKeyword, speechErrorMessage } from "./speechRecognition";
import { useStops } from "../../store/useStops";
import { useFavorites } from "../../store/useFavorites";
import { getArrival } from "../../lib/arrivals";
import type { Stop } from "../../types/stop";

vi.mock("./geocodePlace", () => ({
  searchPlaces: vi.fn(async (query: string) => [{ name: query, displayName: `${query}, 춘천시`, lat: 37.87, lng: 127.74 }]),
  osmEmbedUrl: vi.fn(() => "https://www.openstreetmap.org/export/embed.html"),
}));

vi.mock("../../lib/loadRoutes", () => ({
  loadRoutes: vi.fn(async () => ({
    generatedAt: "test",
    routes: [
      { routeId: "r7", routeNo: "7", stops: ["A", "B"] },
      { routeId: "r9", routeNo: "9", stops: ["A2", "B"] },
    ],
  })),
}));

vi.mock("../../lib/arrivals", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/arrivals")>();
  return { ...actual, getArrival: vi.fn() };
});

const stop: Stop = {
  id: "A", stopNo: "1480", name: "강원대후문", lat: 37.88, lng: 127.73,
  routes: ["12"], headwayMin: 12,
  facilities: {
    shade: { status: "unknown", source: "none" }, seat: { status: "unknown", source: "none" },
    light: { status: "unknown", source: "none" }, sign: { status: "unknown", source: "none" },
  },
};
const destination: Stop = { ...stop, id: "B", stopNo: "1481", name: "춘천역", lat: 37.89, lng: 127.74 };
const opposite: Stop = { ...stop, id: "A2", stopNo: "1482", name: "강원대후문", lat: 37.8802, lng: 127.7302 };

beforeEach(() => {
  useStops.setState({ stops: [stop, opposite, destination], loaded: true });
  useFavorites.setState({ ids: [], journeys: [] });
  vi.mocked(getArrival).mockResolvedValue({ text: "실시간 도착정보 없음", live: false });
});

describe("<TripView>", () => {
  it("즐겨찾기 결과로 바로 들어오면 데이터 로드 전에 입력 화면으로 되돌리지 않는다", () => {
    useStops.setState({ stops: [], loaded: false });
    const screen = render(<MemoryRouter initialEntries={["/go?board=A&dest=B"]}><Routes><Route path="/go" element={<TripView />} /></Routes></MemoryRouter>);

    expect(screen.getByText("버스 정보를 준비하고 있어요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "출발지 말하기" })).not.toBeInTheDocument();
  });

  it("전체 발화 대신 정류장을 특정하는 이름이나 번호만 추출한다", () => {
    expect(extractStopKeyword("출발지는 강원대학교 후문 정류장에서 탈게요", ["강원대후문", "춘천역"])).toBe("강원대후문");
    expect(extractStopKeyword("안녕하세요 반갑습니다 강원대학교", ["강원대후문", "강원대병원"])).toBe("강원대");
    expect(extractStopKeyword("목적지는 정류장 번호 1480입니다", ["강원대후문", "1480"])).toBe("1480");
    expect(extractStopKeyword("순천시청에서 탈게요", ["춘천시청", "1480"])).toBe("");
  });

  it("브라우저의 network 오류를 앱 전체 연결 문제가 아닌 음성 서비스 오류로 안내한다", () => {
    expect(speechErrorMessage("network")).toBe("음성 인식 서비스 연결 실패 · 직접 입력해주세요.");
  });

  it("출발지와 목적지를 모두 검색하고 각각 음성 입력을 제공한다", async () => {
    const screen = render(<MemoryRouter initialEntries={["/go"]}><Routes><Route path="/go" element={<TripView />} /></Routes></MemoryRouter>);
    expect(screen.queryByText("어디서 어디로 가세요?")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "출발지 말하기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "목적지 말하기" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "출발지 말하기" }));
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("이 브라우저는 음성 입력을 지원하지 않습니다.");
    expect(within(status.closest(".tripview__field") as HTMLElement).getByRole("button", { name: "출발지 말하기" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "어디서 출발하세요?" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "직접 쓰기" }));
    fireEvent.change(screen.getByRole("textbox", { name: "어디서 출발하세요?" }), { target: { value: "강원대" } });
    expect(screen.queryByRole("button", { name: "강원대" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "지도에서 찾기" }));
    expect(await screen.findByTitle("강원대 위치 지도")).toBeInTheDocument();
    expect(screen.queryByText("어디로 가세요?")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "이 위치에서 출발" }));
    expect(screen.getByText("출발 위치")).toBeInTheDocument();
    expect(screen.getByText("강원대")).toBeInTheDocument();
    expect(screen.getByText("어디로 가세요?")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "어디서 출발하세요?" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "어디로 가세요?" })).not.toBeInTheDocument();
  });

  it("말하기 어려운 사용자는 즉시 출발지와 목적지를 직접 입력할 수 있다", () => {
    const screen = render(<MemoryRouter initialEntries={["/go"]}><Routes><Route path="/go" element={<TripView />} /></Routes></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "지금은 말할 수 없어요" }));

    expect(screen.getByRole("textbox", { name: "어디서 출발하세요?" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "어디로 가세요?" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "출발지 말하기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "목적지 말하기" })).not.toBeInTheDocument();
  });

  it("직접 입력 중에는 검색 결과 단계로 자동 전환하지 않는다", () => {
    const screen = render(<MemoryRouter initialEntries={["/go"]}><Routes><Route path="/go" element={<TripView />} /></Routes></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "지금은 말할 수 없어요" }));
    const originInput = screen.getByRole("textbox", { name: "어디서 출발하세요?" });

    fireEvent.change(originInput, { target: { value: "강원" } });

    expect(originInput).toHaveValue("강원");
    expect(screen.getByRole("button", { name: "지도에서 찾기" })).toBeInTheDocument();
    expect(screen.queryByText("출발 위치를 확인해주세요")).not.toBeInTheDocument();
  });

  it("목적지로 가는 후보 중 실제 도착 예정시간이 가장 빠른 버스를 먼저 보여준다", async () => {
    vi.mocked(getArrival).mockImplementation(async (boardStop) => boardStop.id === "A2"
      ? { text: "약 3분 후 도착", live: true, byRoute: [{ routeNo: "9", min: 3, seq: 1 }] }
      : { text: "약 9분 후 도착", live: true, byRoute: [{ routeNo: "7", min: 9, seq: 4 }] });

    const screen = render(<MemoryRouter initialEntries={["/go?fromLat=37.88&fromLng=127.73&dest=B"]}><Routes><Route path="/go" element={<TripView />} /></Routes></MemoryRouter>);

    expect(await screen.findByText("9번")).toBeInTheDocument();
    expect(screen.getByText("3분 후")).toBeInTheDocument();
    expect(screen.queryByText("9분 후")).not.toBeInTheDocument();
  });
});
