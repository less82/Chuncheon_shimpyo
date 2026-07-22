import { beforeEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Stop } from "../../types/stop";
import CitizenHome, { FavoriteStopCard } from "./CitizenHome";
import { useStops } from "../../store/useStops";
import { useFavorites } from "../../store/useFavorites";

const stop: Stop = {
  id: "250001",
  stopNo: "1001",
  name: "춘천역",
  lat: 37.884,
  lng: 127.717,
  routes: ["1", "12"],
  headwayMin: 12,
  facilities: {
    shade: { status: "unknown", source: "none" },
    seat: { status: "unknown", source: "none" },
    light: { status: "unknown", source: "none" },
    sign: { status: "unknown", source: "none" },
  },
};

const board: Stop = { ...stop, id: "250010", stopNo: "1010", name: "강원대후문", lat: 37.880, lng: 127.730, routes: ["12"] };
const journey = { id: "250010:12:250001", boardStopId: board.id, destinationStopId: stop.id, routeNo: "12", direction: "춘천역 방면" };

beforeEach(() => {
  localStorage.clear();
  useStops.setState({ stops: [board, stop], loaded: true });
  useFavorites.setState({ ids: [stop.id], journeys: [journey] });
});

describe("<CitizenHome>", () => {
  it("첫 화면에서 두 핵심 업무를 가장 먼저 제공하고 주변 정류장 선택을 요구하지 않는다", () => {
    const screen = render(<MemoryRouter><CitizenHome /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "목적지행 버스 도착 예정시간" })).toHaveAttribute("href", "/go");
    expect(screen.getByRole("link", { name: "정류장 상태 알리기" })).toHaveAttribute("href", "/app/report");
    expect(screen.queryByText("주변 정류장")).not.toBeInTheDocument();
    expect(screen.queryByText("QR 스캔")).not.toBeInTheDocument();
    expect(screen.queryByText(/로그인 없이/)).not.toBeInTheDocument();
    expect(screen.queryByText("쉼표 정류장")).not.toBeInTheDocument();
    expect(screen.queryByText("무엇을 도와드릴까요?")).not.toBeInTheDocument();
  });
});

describe("<FavoriteStopCard>", () => {
  it("승차 정류장·방면·버스·목적지를 한 카드에서 확인한다", () => {
    const screen = render(<MemoryRouter><FavoriteStopCard journey={journey} stops={[board, stop]} /></MemoryRouter>);
    expect(screen.getByText("강원대후문")).toBeInTheDocument();
    expect(screen.getByText("춘천역 방면")).toBeInTheDocument();
    expect(screen.getByText("12번 · 배차간격 약 12분")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "춘천역 즐겨찾기 버스 정보" })).toHaveAttribute("href", "/go?dest=250001&board=250010");
  });
});
