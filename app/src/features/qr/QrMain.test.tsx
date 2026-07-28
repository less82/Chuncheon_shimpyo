import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { useStops } from "../../store/useStops";
import type { Stop } from "../../types/stop";
import QrMain from "./QrMain";

vi.mock("../../lib/loadRoutes", () => ({
  loadRoutes: vi.fn(async () => ({ generatedAt: "test", routes: [] })),
}));

const stop: Stop = {
  id: "250001",
  stopNo: "1001",
  name: "춘천역",
  lat: 37.884,
  lng: 127.717,
  routes: ["1"],
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
  // 위치 확인 없이도 정류장을 직접 고를 수 있어야 한다.
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
  vi.stubGlobal("crypto", { randomUUID: () => "report-qr-1" });
});

describe("<QrMain>", () => {
  it("공식 접수 연계가 없으므로 '민원 접수'라고 쓰지 않는다", () => {
    const screen = render(<QrMain />);

    expect(screen.getByRole("button", { name: "정류장 상태 알리기" })).toBeInTheDocument();
    expect(screen.queryByText(/민원 접수/)).not.toBeInTheDocument();
  });

  it("보내기 완료 화면에서 접수됐다고 확정하지 않는다", async () => {
    const screen = render(<QrMain />);

    fireEvent.click(screen.getByRole("button", { name: "정류장 상태 알리기" }));
    fireEvent.change(screen.getByLabelText("출발 정류장을 입력하세요"), { target: { value: "1001" } });
    fireEvent.click(await screen.findByRole("button", { name: "춘천역" }));
    fireEvent.click(screen.getByRole("button", { name: "네, 맞아요" }));
    fireEvent.click(screen.getByRole("button", { name: "의자가 파손됐어요" }));
    fireEvent.click(screen.getByRole("button", { name: "내용 보내기" }));
    fireEvent.click(screen.getByRole("button", { name: "확인" }));

    await waitFor(() => expect(screen.getByText("알려주셔서 고맙습니다")).toBeInTheDocument());
    expect(screen.queryByText(/접수됐어요/)).not.toBeInTheDocument();
    expect(screen.getByText("검수 후 담당 부서로 전달됩니다.")).toBeInTheDocument();
  });
});
