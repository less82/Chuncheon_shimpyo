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

beforeEach(() => {
  localStorage.clear();
  useStops.setState({ stops: [stop], loaded: true });
  useFavorites.setState({ ids: [stop.id] });
});

describe("<CitizenHome>", () => {
  it("첫 화면에서 두 핵심 업무를 가장 먼저 제공하고 주변 정류장 선택을 요구하지 않는다", () => {
    const screen = render(<MemoryRouter><CitizenHome /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /목적지로 가는 길 찾기/ })).toHaveAttribute("href", "/go");
    expect(screen.getByRole("link", { name: /정류장 불편 알리기/ })).toHaveAttribute("href", "/app/report");
    expect(screen.queryByText("주변 정류장")).not.toBeInTheDocument();
    expect(screen.queryByText("QR 스캔")).not.toBeInTheDocument();
    expect(screen.queryByText(/로그인 없이/)).not.toBeInTheDocument();
    expect(screen.queryByText("쉼표 정류장")).not.toBeInTheDocument();
  });
});

describe("<FavoriteStopCard>", () => {
  it("재방문 사용자가 정류장 운행정보와 바로가기를 메인에서 확인한다", () => {
    const screen = render(<MemoryRouter><FavoriteStopCard stop={stop} /></MemoryRouter>);
    expect(screen.getByText("춘천역")).toBeInTheDocument();
    expect(screen.getByText("배차간격 약 12분")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /이곳으로 가기/ })).toHaveAttribute("href", "/go?dest=250001");
  });
});
