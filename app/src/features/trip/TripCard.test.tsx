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

const transferOption: TripOption = {
  boardStopId: "A",
  walkMin: 4,
  walkReal: false,
  directBus: false,
  transferStopId: "B",
  legs: [
    { routeNos: ["7"], boardStopId: "A", alightStopId: "B" },
    { routeNos: ["9"], boardStopId: "B", alightStopId: "C" },
  ],
};

describe("<TripCard>", () => {
  it("직행 옵션의 도보시간과 노선번호를 렌더한다", () => {
    const { getByText } = render(
      <TripCard
        option={directOption}
        stops={stops}
        destStop={dest}
        fromPos={fromPos}
      />,
    );
    expect(getByText(/걸어서 4분/)).toBeInTheDocument();
    expect(getByText(/7번/)).toBeInTheDocument();
    expect(getByText(/시청앞/)).toBeInTheDocument();
  });

  it("환승 옵션은 환승 정류장과 두 번째 노선을 표시한다", () => {
    const { getByText } = render(
      <TripCard
        option={transferOption}
        stops={stops}
        destStop={dest}
        fromPos={fromPos}
      />,
    );
    expect(getByText(/중앙시장/)).toBeInTheDocument();
    expect(getByText(/갈아타기/)).toBeInTheDocument();
    expect(getByText(/9번/)).toBeInTheDocument();
  });
});
