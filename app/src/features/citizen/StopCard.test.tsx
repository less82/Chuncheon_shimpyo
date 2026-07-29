import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Stop } from "../../types/stop";
import StopCard from "./StopCard";
import { useFavorites } from "../../store/useFavorites";

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
    shelter: { status: "unknown", source: "none" },
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

  it("네 시설 배지(그늘·의자·쉘터·도착안내기)를 모두 렌더한다", () => {
    const { getByText } = renderCard(sample);
    expect(getByText("그늘")).toBeInTheDocument();
    expect(getByText("의자")).toBeInTheDocument();
    expect(getByText("쉘터")).toBeInTheDocument();
    expect(getByText("도착안내기")).toBeInTheDocument();
  });

  it("실시간 정보가 없으면 특정 노선의 배차처럼 오해시키지 않는다", () => {
    const { getByText, queryByText } = renderCard(sample);
    expect(getByText("실시간 도착정보를 불러오지 못했어요")).toBeInTheDocument();
    expect(queryByText(/배차간격/)).not.toBeInTheDocument();
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
});
