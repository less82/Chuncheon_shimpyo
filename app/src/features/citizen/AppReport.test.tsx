import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useStops } from "../../store/useStops";
import { REPORT_STORAGE_KEY } from "../report/reportStore";
import type { Stop } from "../../types/stop";
import AppReport from "./AppReport";

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
  it("QR 화면 없이 정류장 검색부터 접수 완료까지 진행한다", async () => {
    const screen = render(<MemoryRouter><AppReport /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText("어느 정류장인가요?")).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText("예: 춘천역 또는 1001"), { target: { value: "1001" } });
    fireEvent.click(screen.getByRole("button", { name: /춘천역/ }));
    fireEvent.click(screen.getByRole("button", { name: "네, 맞아요" }));
    fireEvent.click(screen.getByRole("button", { name: "의자가 없어요" }));
    fireEvent.click(screen.getByRole("button", { name: "불편 사항 보내기" }));

    expect(screen.getByText(/알려주셔서/)).toBeInTheDocument();
    expect(localStorage.getItem(REPORT_STORAGE_KEY)).toContain("의자가 없어요");
  });
});
