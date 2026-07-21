import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Stop } from "../../types/stop";
import { FavoriteStopCard } from "./CitizenHome";

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

describe("<FavoriteStopCard>", () => {
  it("재방문 사용자가 정류장 운행정보와 바로가기를 메인에서 확인한다", () => {
    const screen = render(<MemoryRouter><FavoriteStopCard stop={stop} onSelect={vi.fn()} /></MemoryRouter>);
    expect(screen.getByText("춘천역")).toBeInTheDocument();
    expect(screen.getByText("배차간격 약 12분")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /이곳으로 가기/ })).toHaveAttribute("href", "/go?dest=250001");
  });
});
