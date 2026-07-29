import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useStops } from "../../store/useStops";
import { REPORT_STORAGE_KEY, loadReports } from "../report/reportStore";
import type { Stop } from "../../types/stop";
import AppReport, { stepProgress, stopDirection } from "./AppReport";

const stop: Stop = {
  id: "250001",
  stopNo: "1001",
  name: "춘천역",
  lat: 37.884,
  lng: 127.717,
  routes: ["1", "12"],
  facilities: {
    shade: { status: "unknown", source: "none" },
    seat: { status: "unknown", source: "none" },
    light: { status: "unknown", source: "none" },
    sign: { status: "unknown", source: "none" },
  },
};

beforeEach(() => {
  localStorage.clear();
  useStops.setState({ stops: [stop], loaded: true });
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
  vi.stubGlobal("crypto", { randomUUID: () => "report-1" });
});

const renderReport = () => render(<MemoryRouter><AppReport /></MemoryRouter>);

/** 유형 선택 → 정류장 검색 → 정류장 확인까지. 모든 유형이 같은 앞부분을 쓴다. */
async function pickKindAndStop(screen: ReturnType<typeof renderReport>, kind: string) {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(kind) }));
  await waitFor(() => expect(screen.getByText("어느 정류장인가요?")).toBeInTheDocument());
  fireEvent.change(screen.getByPlaceholderText("예: 춘천역 또는 1001"), { target: { value: "1001" } });
  fireEvent.click(screen.getByRole("button", { name: /춘천역/ }));
  fireEvent.click(screen.getByRole("button", { name: "네, 맞아요" }));
}

describe("<AppReport>", () => {
  it("같은 이름의 정류장을 다음 정류장 방면으로 구분한다", () => {
    const next = { ...stop, id: "250002", name: "강원대학교" };
    const routes = { generatedAt: "", routes: [{ routeId: "1", routeNo: "1", stops: [stop.id, next.id] }] };
    expect(stopDirection(stop, routes, [stop, next])).toBe("강원대학교 방면");
  });

  it("버스 이용 불편만 단계가 두 개 더 길다", () => {
    expect(stepProgress("facility", "kind")).toBe("1 / 4 · 무엇을 알릴까요");
    expect(stepProgress("ride", "kind")).toBe("1 / 6 · 무엇을 알릴까요");
    expect(stepProgress("ride", "when")).toBe("5 / 6 · 겪은 때");
    // 위치 확인·검색·확인은 모두 같은 "대상 확인" 단계다
    expect(stepProgress("facility", "find")).toBe(stepProgress("facility", "confirm"));
  });

  it("첫 화면에 알리기 유형 4종이 뜬다", () => {
    const screen = renderReport();
    expect(screen.getByText(/알리시나요/)).toBeInTheDocument();
    for (const label of ["정류장 시설", "안내기 고장", "버스 이용 불편", "노선 요청"]) {
      expect(screen.getByRole("button", { name: new RegExp(label) })).toBeInTheDocument();
    }
  });

  it("정류장 시설은 정류장 확인 → 내용 → 확인 → 완료로 끝난다", async () => {
    const screen = renderReport();
    await pickKindAndStop(screen, "정류장 시설");

    fireEvent.click(screen.getByRole("button", { name: "의자가 파손됐어요" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByText(/보낼까요/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "보내기" }));

    expect(screen.getByText(/알려주셔서/)).toBeInTheDocument();
    expect(localStorage.getItem(REPORT_STORAGE_KEY)).toContain("의자가 파손됐어요");
    expect(loadReports()[0].reportKind).toBe("facility");
    // 완료 화면에 담당 부서와 전화가 함께 뜬다(전화는 보조 수단이다)
    const tel = screen.getByRole("link", { name: "춘천시 교통과 교통시설팀 033-250-3316 전화 걸기" });
    expect(tel).toHaveClass("contactguide__tel");
    expect(tel).toHaveAttribute("href", "tel:0332503316");
    expect(screen.queryByText("민원 접수")).not.toBeInTheDocument();
  });

  it("버스 이용 불편을 고르면 노선·차량번호·시각 입력이 나온다", async () => {
    const screen = renderReport();
    await pickKindAndStop(screen, "버스 이용 불편");

    fireEvent.click(screen.getByRole("button", { name: "기사님이 불친절했어요" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));

    expect(screen.getByText("어느 버스였나요?")).toBeInTheDocument();
    // 그 정류장에 오는 노선을 눌러 채울 수 있다
    fireEvent.click(screen.getByRole("button", { name: "12" }));
    fireEvent.change(screen.getByLabelText("차량번호 (선택)"), { target: { value: "강원70자1234" } });
    fireEvent.click(screen.getByRole("button", { name: "다음" }));

    expect(screen.getByText("언제 있었나요?")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("날짜"), { target: { value: "2026-07-20" } });
    fireEvent.change(screen.getByLabelText("시각"), { target: { value: "08:30" } });
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "보내기" }));

    const saved = loadReports()[0];
    expect(saved.reportKind).toBe("ride");
    expect(saved.busRoute).toBe("12");
    expect(saved.busVehicleNo).toBe("강원70자1234");
    expect(saved.happenedDate).toBe("2026-07-20");
    expect(saved.happenedTime).toBe("08:30");
    // 시내버스만 오는 정류장이므로 접수처는 춘천시민버스 한 곳이다
    expect(screen.getByRole("link", { name: /춘천시민버스 033-254-6925 전화 걸기/ })).toBeInTheDocument();
    expect(screen.queryByText("매일관광주식회사")).not.toBeInTheDocument();
    expect(screen.queryByText("민원 접수")).not.toBeInTheDocument();
  });

  it("모르는 버스 정보는 비워도 보낼 수 있고, 지어내지 않는다", async () => {
    const screen = renderReport();
    await pickKindAndStop(screen, "버스 이용 불편");

    fireEvent.click(screen.getByRole("button", { name: "물건을 두고 내렸어요" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "보내기" }));

    const saved = loadReports()[0];
    expect(saved.busRoute).toBeUndefined();
    expect(saved.busVehicleNo).toBeUndefined();
    expect(saved.happenedDate).toBeUndefined();
    expect(saved.happenedTime).toBeUndefined();
  });

  it("노선 요청은 버스팀으로 간다", async () => {
    const screen = renderReport();
    await pickKindAndStop(screen, "노선 요청");

    fireEvent.click(screen.getByRole("button", { name: "노선 신설을 요청해요" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "보내기" }));

    expect(loadReports()[0].reportKind).toBe("route");
    expect(screen.getByRole("link", { name: "춘천시 교통과 버스팀 033-250-3938 전화 걸기" })).toBeInTheDocument();
  });
});
