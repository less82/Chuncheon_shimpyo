import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Stop } from "../../types/stop";
import { makeUnknown } from "../../types/stop";
import type { TripOption } from "../../types/trip";
import TripCard from "./TripCard";

function mkStop(id: string, name: string): Stop {
  return {
    id,
    stopNo: id,
    name,
    lat: 37.88,
    lng: 127.73,
    routes: [],
    facilities: {
      shade: makeUnknown(),
      seat: makeUnknown(),
      shelter: makeUnknown(),
      sign: makeUnknown(),
    },
    headwayMin: 10,
  };
}

const board = mkStop("A", "시청앞");
const transfer = mkStop("B", "중앙시장");
const dest = mkStop("C", "요양원");
const stops = [board, transfer, dest];
const fromPos = { lat: 37.8801, lng: 127.7301 };

const directOption: TripOption = {
  boardStopId: "A",
  walkMin: 4,
  walkReal: false,
  directBus: true,
  legs: [{ routeNos: ["7"], boardStopId: "A", alightStopId: "C" }],
};

describe("<TripCard>", () => {
  it("실시간 도착정보가 없을 때 배차간격을 도착예정처럼 표시하지 않는다", async () => {
    const { getByText, findByText, queryByText } = render(
      <MemoryRouter><TripCard
        option={directOption}
        stops={stops}
        destStop={dest}
        fromPos={fromPos}
      /></MemoryRouter>,
    );
    expect(getByText(/시청앞/)).toBeInTheDocument();
    expect(getByText(/요양원 방면/)).toBeInTheDocument();
    expect(getByText(/도보 약 4분/)).toBeInTheDocument();
    expect(await findByText("실시간 도착정보를 불러오지 못했어요")).toBeInTheDocument();
    expect(queryByText(/배차간격/)).not.toBeInTheDocument();
    expect(queryByText(/걸어서|갈아타기|중앙시장/)).not.toBeInTheDocument();
    expect(queryByText(/정거장 전/)).not.toBeInTheDocument();
  });

  it("실시간이면 도착시간 아래에 남은 정거장 수를 덧붙인다", () => {
    const { getByText, queryByText } = render(
      <MemoryRouter><TripCard
        option={directOption}
        stops={stops}
        destStop={dest}
        fromPos={fromPos}
        arrival={{ text: "약 7분 후 도착", live: true, status: "live" as const, byRoute: [{ routeNo: "7", min: 7, seq: 9 }] }}
      /></MemoryRouter>,
    );
    expect(getByText("7분 후")).toBeInTheDocument();
    expect(getByText("9정거장 전")).toBeInTheDocument();
    expect(queryByText(/배차간격/)).not.toBeInTheDocument();
  });

  it("실시간은 정상인데 이 노선 버스가 없으면 '조회 실패'라고 말하지 않는다", () => {
    const { getByText, queryByText } = render(
      <MemoryRouter><TripCard
        option={directOption}
        stops={stops}
        destStop={dest}
        fromPos={fromPos}
        arrival={{ text: "약 3분 후 도착", live: true, status: "live" as const, byRoute: [{ routeNo: "99", min: 3, seq: 2 }] }}
      /></MemoryRouter>,
    );
    expect(getByText("지금 오는 버스가 없어요")).toBeInTheDocument();
    expect(queryByText("실시간 도착정보를 불러오지 못했어요")).not.toBeInTheDocument();
    expect(queryByText(/배차간격/)).not.toBeInTheDocument();
  });

  it("곧 도착이면 0정거장 전을 쓰지 않는다", () => {
    const { getByText, queryByText } = render(
      <MemoryRouter><TripCard
        option={directOption}
        stops={stops}
        destStop={dest}
        fromPos={fromPos}
        arrival={{ text: "곧 도착", live: true, status: "live" as const, byRoute: [{ routeNo: "7", min: 0, seq: 0 }] }}
      /></MemoryRouter>,
    );
    expect(getByText("곧 도착")).toBeInTheDocument();
    expect(queryByText(/정거장 전/)).not.toBeInTheDocument();
  });
});
