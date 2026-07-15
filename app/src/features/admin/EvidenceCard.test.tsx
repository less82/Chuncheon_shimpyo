import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import type { Stop } from "../../types/stop";
import EvidenceCard from "./EvidenceCard";

const stop: Stop = {
  id: "250001192",
  stopNo: "1001",
  name: "춘천역",
  lat: 37.885,
  lng: 127.718,
  routes: ["1", "7"],
  facilities: {
    shade: { status: "unknown", source: "none" },
    seat: { status: "yes", source: "bench_registry" },
    light: { status: "unknown", source: "none" },
    sign: { status: "unknown", source: "none" },
  },
  demand: {
    byHour: new Array(24).fill(0).map((_, h) => (h >= 11 && h <= 16 ? 20 : 1)),
    total: 500,
    aggregatedBidirectional: true,
    matchedName: "춘천역",
  },
};

describe("<EvidenceCard>", () => {
  it("정류장명·ID와 승차 순위를 보여준다", () => {
    const { getByText, getByRole } = render(
      <EvidenceCard
        stop={stop}
        criteria={{ middayTopPercent: 25, shadeUnknown: true }}
        rank={3}
        population={1667}
        evidence="한낮 승차 상위 25% · 그늘 미확인"
        onClose={() => {}}
      />,
    );
    expect(getByText("춘천역")).toBeInTheDocument();
    expect(getByRole("dialog")).toBeInTheDocument();
    // 순위·모집단·양방향 합산 표기
    expect(getByText(/3위/)).toBeInTheDocument();
    expect(getByText(/1,667개/)).toBeInTheDocument();
    expect(getByText(/양방향 합산/)).toBeInTheDocument();
  });

  it("아직 확인되지 않은(있음 아님) 시설을 미비 내역으로 보여준다", () => {
    const { getAllByText, queryAllByText } = render(
      <EvidenceCard
        stop={stop}
        criteria={{}}
        rank={3}
        population={1667}
        evidence="그늘 미확인"
        onClose={() => {}}
      />,
    );
    // 그늘·조명·도착안내기(미확인)는 미비 배지에 등장, 의자(있음)는 미비에 없음.
    expect(getAllByText("그늘").length).toBeGreaterThan(0);
    expect(getAllByText("도착안내기").length).toBeGreaterThan(0);
    expect(queryAllByText("의자")).toHaveLength(0);
  });

  it("근거 요약(조건)을 그대로 노출한다", () => {
    const { getByText } = render(
      <EvidenceCard
        stop={stop}
        criteria={{ middayTopPercent: 25, shadeUnknown: true }}
        rank={3}
        population={1667}
        evidence="한낮 승차 상위 25% · 그늘 미확인"
        onClose={() => {}}
      />,
    );
    expect(getByText("한낮 승차 상위 25% · 그늘 미확인")).toBeInTheDocument();
  });
});
