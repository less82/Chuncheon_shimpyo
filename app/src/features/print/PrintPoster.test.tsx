import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { Stop } from "../../types/stop";
import PrintPoster from "./PrintPoster";
import { useStops } from "../../store/useStops";

vi.mock("../share/qr", () => ({
  toQrDataUrl: vi.fn(async () => "data:image/png;base64,MOCKQR"),
}));

const stop: Stop = {
  id: "250026779",
  stopNo: "2366",
  name: "장학해온채A",
  lat: 37.897,
  lng: 127.754,
  routes: ["1"],
  facilities: {
    shade: { status: "no", source: "roadview", capturedAt: "2026.03" },
    seat: { status: "yes", source: "bench_registry" },
    light: { status: "yes", source: "light_registry" },
    sign: { status: "unknown", source: "none" },
  },
  headwayMin: 20,
};

beforeEach(() => {
  useStops.setState({ stops: [stop], loaded: true });
});

const renderAt = (id: string) =>
  render(
    <MemoryRouter initialEntries={[`/print/${id}`]}>
      <Routes>
        <Route path="/print/:id" element={<PrintPoster />} />
      </Routes>
    </MemoryRouter>,
  );

describe("<PrintPoster>", () => {
  it("정류장명과 4시설 3상태를 큰 글씨로 렌더한다", () => {
    const { getByText, getAllByText } = renderAt("250026779");
    expect(getByText("장학해온채A")).toBeInTheDocument();
    expect(getByText("그늘")).toBeInTheDocument();
    expect(getByText("의자")).toBeInTheDocument();
    expect(getByText("조명")).toBeInTheDocument();
    expect(getByText("도착안내기")).toBeInTheDocument();
    // 3상태 값이 모두 나타남
    expect(getAllByText("있음").length).toBeGreaterThanOrEqual(2);
    expect(getAllByText("없음").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("미확인").length).toBeGreaterThanOrEqual(1);
  });

  it("로드뷰 촬영시점을 표기한다", () => {
    const { getByText } = renderAt("250026779");
    expect(getByText(/촬영 2026\.03/)).toBeInTheDocument();
  });

  it("없는 id면 안내 문구를 보여준다", () => {
    const { getByText } = renderAt("NOPE");
    expect(getByText(/정류장을 찾을 수 없어요/)).toBeInTheDocument();
  });

  it("정류장 QR 과 등록 안내 문구를 렌더한다", async () => {
    const { findByRole, getByText } = renderAt("250026779");
    const img = await findByRole("img", { name: /QR/ });
    expect(img.getAttribute("src")).toMatch(/^data:image\//);
    expect(
      getByText(/목적지를 말하면 탈 버스와 도착시간을 알려드립니다/),
    ).toBeInTheDocument();
  });
});
