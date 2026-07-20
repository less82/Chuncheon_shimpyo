import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Stop } from "../../types/stop";
import StopCard from "./StopCard";
import { useFavorites } from "../../store/useFavorites";
import { buildQrEntryUrl } from "../share/shareLink";

vi.mock("../share/qr", () => ({
  toQrDataUrl: vi.fn(async () => "data:image/png;base64,MOCKQR"),
}));
import { toQrDataUrl } from "../share/qr";

const sample: Stop = {
  id: "250001192",
  stopNo: "1001",
  name: "대형약국",
  lat: 37.876,
  lng: 127.775,
  routes: ["1", "7"],
  facilities: {
    shade: { status: "yes", source: "roadview", capturedAt: "2026.03" },
    seat: { status: "yes", source: "bench_registry" },
    light: { status: "unknown", source: "none" },
    sign: { status: "unknown", source: "none" },
  },
  headwayMin: 12,
};

beforeEach(() => {
  localStorage.clear();
  useFavorites.setState({ ids: [] });
});

const renderCard = (stop: Stop) =>
  render(
    <MemoryRouter>
      <StopCard stop={stop} />
    </MemoryRouter>,
  );

describe("<StopCard>", () => {
  it("정류장명을 보여준다", () => {
    const { getByText } = renderCard(sample);
    expect(getByText("대형약국")).toBeInTheDocument();
  });

  it("네 시설 배지(그늘·의자·조명·도착안내기)를 모두 렌더한다", () => {
    const { getByText } = renderCard(sample);
    expect(getByText("그늘")).toBeInTheDocument();
    expect(getByText("의자")).toBeInTheDocument();
    expect(getByText("조명")).toBeInTheDocument();
    expect(getByText("도착안내기")).toBeInTheDocument();
  });

  it("실시간 정보가 없으면 특정 노선의 배차처럼 오해시키지 않는다", () => {
    const { getByText } = renderCard(sample);
    expect(getByText(/실시간 도착 정보 없음/)).toBeInTheDocument();
  });

  it("안내문 인쇄 링크가 /print/:id 를 가리킨다", () => {
    const { getByRole } = renderCard(sample);
    const link = getByRole("link", { name: /안내문 인쇄/ });
    expect(link.getAttribute("href")).toContain("/print/250001192");
  });

  it("real=true면 '도보' 문구를 보여준다", () => {
    const { getByText } = render(
      <MemoryRouter>
        <StopCard stop={sample} walkMin={6} walkReal={true} />
      </MemoryRouter>,
    );
    expect(getByText(/도보 약 6분/)).toBeInTheDocument();
  });

  it("real=false면 '직선거리' 문구를 보여준다(거짓 실경로 금지)", () => {
    const { getByText } = render(
      <MemoryRouter>
        <StopCard stop={sample} walkMin={4} walkReal={false} />
      </MemoryRouter>,
    );
    expect(getByText(/직선거리 약 4분/)).toBeInTheDocument();
  });

  it("'이 정류장 QR' 버튼을 누르면 buildShareUrl([stop.id]) 기반 QR 이 표시된다", async () => {
    const { getByRole, findByRole } = renderCard(sample);
    const btn = getByRole("button", { name: /이 정류장 QR/ });
    fireEvent.click(btn);

    const img = await findByRole("img", { name: /QR/ });
    expect(img.getAttribute("src")).toBe("data:image/png;base64,MOCKQR");
    expect(toQrDataUrl).toHaveBeenCalledWith(buildQrEntryUrl(sample.id));
  });
});
