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
  });
});
