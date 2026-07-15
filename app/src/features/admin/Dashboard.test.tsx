import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";
import type { Stop, FacilityInfo } from "../../types/stop";
import Dashboard from "./Dashboard";
import { useStops } from "../../store/useStops";
import * as csv from "./exportCsv";

const F = (s: FacilityInfo["status"] = "unknown"): FacilityInfo => ({
  status: s,
  source: "none",
});

function stop(
  id: string,
  name: string,
  midday: number,
  shade: FacilityInfo["status"],
): Stop {
  const byHour = new Array(24).fill(0);
  for (const h of [11, 12, 13, 14, 15, 16]) byHour[h] = midday / 6;
  return {
    id,
    stopNo: id,
    name,
    lat: 37.88,
    lng: 127.73,
    routes: ["1"],
    facilities: { shade: F(shade), seat: F(), light: F(), sign: F() },
    demand: {
      byHour,
      total: midday * 3,
      aggregatedBidirectional: true,
      matchedName: name,
    },
  };
}

const stops: Stop[] = [
  stop("250000001", "춘천역", 300, "unknown"),
  stop("250000002", "명동", 200, "unknown"),
  stop("250000003", "후평동", 100, "yes"), // 그늘 있음 → 여름 프리셋 제외
  stop("250000004", "석사동", 10, "unknown"), // 하위 → 상위% 제외
];

beforeEach(() => {
  useStops.setState({
    stops,
    cityCenter: { lat: 37.88, lng: 127.73 },
    loaded: true,
  });
});

describe("<Dashboard>", () => {
  it("기본(여름 프리셋)에서 조건 만족 정류장을 표에 렌더한다", () => {
    const { getByText, queryByText } = render(<Dashboard />);
    // 여름 = 상위25% & 그늘 미확인 → 춘천역만 (상위 25% of 4 = 1개, 최다승차 300)
    expect(getByText("춘천역")).toBeInTheDocument();
    // 그늘 있음(후평동)·하위(석사동)는 제외
    expect(queryByText("후평동")).toBeNull();
    expect(queryByText("석사동")).toBeNull();
  });

  it("양방향 합산 각주를 표기한다", () => {
    const { getByText } = render(<Dashboard />);
    expect(getByText(/양방향 합산 기준/)).toBeInTheDocument();
  });

  it("CSV 내려받기 버튼이 exportCsv 를 호출한다", () => {
    const spy = vi.spyOn(csv, "exportCsv").mockImplementation(() => {});
    const { getByRole } = render(<Dashboard />);
    fireEvent.click(getByRole("button", { name: "CSV 내려받기" }));
    expect(spy).toHaveBeenCalledOnce();
    const rows = spy.mock.calls[0][0];
    expect(rows[0].name).toBe("춘천역");
    expect(rows[0].middayBoarding).toBe(300);
    spy.mockRestore();
  });

  it("행 클릭 시 근거 카드를 연다", () => {
    const { getByText, getByRole } = render(<Dashboard />);
    fireEvent.click(getByText("춘천역"));
    const dialog = getByRole("dialog");
    expect(within(dialog).getByText("한낮 승차 순위")).toBeInTheDocument();
    expect(within(dialog).getByText(/1위/)).toBeInTheDocument();
  });
});
