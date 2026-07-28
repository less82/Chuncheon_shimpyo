import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useStops } from "../../store/useStops";
import type { Stop } from "../../types/stop";
import FindHub from "./FindHub";

vi.mock("../../lib/loadRoutes", () => ({
  loadRoutes: vi.fn(async () => ({
    generatedAt: "test",
    routes: [{ routeId: "r1", routeNo: "1", stops: ["A"] }],
  })),
}));

const stops: Stop[] = [
  {
    id: "A",
    stopNo: "1001",
    name: "춘천역",
    lat: 37.88,
    lng: 127.73,
    routes: ["1"],
    facilities: {
      shade: { status: "unknown", source: "none" },
      seat: { status: "unknown", source: "none" },
      light: { status: "unknown", source: "none" },
      sign: { status: "unknown", source: "none" },
    },
  },
];

const renderHub = (search = "") =>
  render(<MemoryRouter initialEntries={[`/find${search}`]}><FindHub /></MemoryRouter>);

beforeEach(() => {
  useStops.setState({ stops, loaded: true });
});

describe("<FindHub>", () => {
  it("기본 탭은 정류장이다", () => {
    const screen = renderHub();
    expect(screen.getByRole("tab", { name: "정류장", selected: true })).toBeInTheDocument();
    expect(screen.getByLabelText("정류장 이름 또는 정류장번호 검색")).toBeInTheDocument();
  });

  it("?tab=routes 로 들어가면 노선 탭이 열린다", async () => {
    const screen = renderHub("?tab=routes");
    expect(screen.getByRole("tab", { name: "노선", selected: true })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("노선 번호 또는 이름으로 검색")).toBeInTheDocument());
  });

  it("?tab=contacts 로 들어가면 문의처가 보인다", () => {
    const screen = renderHub("?tab=contacts");
    expect(screen.getByRole("tab", { name: "문의처", selected: true })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /전화 걸기$/ }).length).toBeGreaterThan(0);
  });

  it("탭 버튼마다 role=tab 과 aria-selected 가 붙는다", () => {
    const screen = renderHub();
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    for (const tab of tabs) expect(tab).toHaveAttribute("aria-selected");
    expect(tabs.filter((tab) => tab.getAttribute("aria-selected") === "true")).toHaveLength(1);
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "findhub-tab-stops");
  });

  it("탭을 누르면 선택 상태와 본문이 함께 바뀐다", () => {
    const screen = renderHub();
    fireEvent.click(screen.getByRole("tab", { name: "문의처" }));
    expect(screen.getByRole("tab", { name: "문의처", selected: true })).toBeInTheDocument();
    expect(screen.queryByLabelText("정류장 이름 또는 정류장번호 검색")).not.toBeInTheDocument();
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "findhub-tab-contacts");
  });
});
