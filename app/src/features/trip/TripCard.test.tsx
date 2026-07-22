import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
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
      light: makeUnknown(),
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
  it("경로 설명 없이 버스 도착정보와 목적지를 렌더한다", () => {
    const { getByText, queryByText } = render(
      <TripCard
        option={directOption}
        stops={stops}
        destStop={dest}
        fromPos={fromPos}
      />,
    );
    expect(getByText(/7번/)).toBeInTheDocument();
    expect(getByText(/시청앞/)).toBeInTheDocument();
    expect(getByText(/요양원 도착/)).toBeInTheDocument();
    expect(getByText(/배차간격 약 10분/)).toBeInTheDocument();
    expect(queryByText(/걸어서|갈아타기|중앙시장/)).not.toBeInTheDocument();
  });
});
