import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useStops } from "../../store/useStops";
import { REPORT_STORAGE_KEY } from "../report/reportStore";
import type { Stop } from "../../types/stop";
import AppReport, { stopDirection } from "./AppReport";

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

describe("<AppReport>", () => {
  it("같은 이름의 정류장을 다음 정류장 방면으로 구분한다", () => {
    const next = { ...stop, id: "250002", name: "강원대학교" };
    const routes = { generatedAt: "", routes: [{ routeId: "1", routeNo: "1", stops: [stop.id, next.id] }] };
    expect(stopDirection(stop, routes, [stop, next])).toBe("강원대학교 방면");
  });

  it("QR 화면 없이 정류장 검색부터 접수 완료까지 진행한다", async () => {
    const screen = render(<MemoryRouter><AppReport /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText("어느 정류장인가요?")).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText("예: 춘천역 또는 1001"), { target: { value: "1001" } });
    fireEvent.click(screen.getByRole("button", { name: /춘천역/ }));
    fireEvent.click(screen.getByRole("button", { name: "네, 맞아요" }));
    fireEvent.click(screen.getByRole("button", { name: "의자가 파손됐어요" }));
    fireEvent.click(screen.getByRole("button", { name: "내용 보내기" }));

    expect(screen.getByText(/알려주셔서/)).toBeInTheDocument();
    expect(localStorage.getItem(REPORT_STORAGE_KEY)).toContain("의자가 파손됐어요");
    // 접수처 카드는 ContactGuide 와 같은 조각·같은 클래스를 쓴다(디자인 두 벌 금지).
    const tel = screen.getByRole("link", { name: "춘천시 교통과 교통시설팀 033-250-3316 전화 걸기" });
    expect(tel).toHaveClass("contactguide__tel");
    expect(screen.queryByText("민원 접수")).not.toBeInTheDocument();
  });
});
