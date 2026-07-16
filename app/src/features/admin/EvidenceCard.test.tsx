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

describe("<EvidenceCard> (설치 근거 카드) 미확인·실측 동시표시 금지", () => {
  it("installRow만 전달되면 '한낮 승차 순위' 섹션(및 '승차 데이터 미확인' 문구)을 렌더하지 않는다", () => {
    const installRow = {
      stop,
      rank: 1,
      facility: "shade" as const,
      demandMidday: 120,
      poi: 0.3,
      surveySource: "roadview" as const,
    };
    const { queryByText, getByText } = render(
      <EvidenceCard
        stop={stop}
        criteria={{}}
        rank={null}
        population={0}
        evidence="설치 검토 후보"
        onClose={() => {}}
        installRow={installRow}
      />,
    );
    // 정직성: 같은 카드 안에서 "승차 데이터 미확인"과 "한낮 승차(실측)"이 동시 표시되면 안 됨.
    expect(queryByText(/승차 데이터 미확인/)).not.toBeInTheDocument();
    expect(queryByText("한낮 승차 순위")).not.toBeInTheDocument();
    // 설치 근거 섹션의 실측값은 그대로 노출.
    expect(getByText(/120건/)).toBeInTheDocument();
  });

  it("surveyRow 전달(1단계)이면서 rank가 null이어도 순위 섹션은 그대로 유지된다(기존 동작 보존)", () => {
    const surveyRow = {
      stop,
      rank: 1,
      score: 0.72,
      demandMidday: 120,
      demandQ: 0.9,
      unknownCount: 2,
      unknownRate: 0.5,
      poi: 0.3,
      leadReason: "demand" as const,
    };
    const { getByText } = render(
      <EvidenceCard
        stop={stop}
        criteria={{}}
        rank={null}
        population={0}
        evidence="근거"
        onClose={() => {}}
        surveyRow={surveyRow}
      />,
    );
    expect(getByText("한낮 승차 순위")).toBeInTheDocument();
    expect(getByText(/승차 데이터 미확인/)).toBeInTheDocument();
  });
});

describe("<EvidenceCard> (d) 산식 항별 분해", () => {
  it("surveyRow 전달 시 산식과 항별 분해(실측→정규화×가중치), 선정 사유를 보여준다", () => {
    const surveyRow = {
      stop,
      rank: 1,
      score: 0.72,
      demandMidday: 120,
      demandQ: 0.9,
      unknownCount: 2,
      unknownRate: 0.5,
      poi: 0.3,
      leadReason: "demand" as const,
    };
    const { getByText, getAllByText } = render(
      <EvidenceCard
        stop={stop}
        criteria={{}}
        rank={1}
        population={100}
        evidence="근거"
        onClose={() => {}}
        surveyRow={surveyRow}
      />,
    );
    expect(getByText(/지수 = /)).toBeInTheDocument();
    expect(getAllByText(/0\.90/).length).toBeGreaterThan(0);
    expect(getByText(/선정 사유/)).toBeInTheDocument();
    expect(getByText("한낮 승차 실측")).toBeInTheDocument();
  });
});
