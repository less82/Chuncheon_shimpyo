import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TripView from "./TripView";
import { speechErrorMessage } from "./speechRecognition";
import { useStops } from "../../store/useStops";
import { useFavorites } from "../../store/useFavorites";
import type { Stop } from "../../types/stop";

const stop: Stop = {
  id: "A", stopNo: "1480", name: "강원대후문", lat: 37.88, lng: 127.73,
  routes: ["12"], headwayMin: 12,
  facilities: {
    shade: { status: "unknown", source: "none" }, seat: { status: "unknown", source: "none" },
    light: { status: "unknown", source: "none" }, sign: { status: "unknown", source: "none" },
  },
};
const destination: Stop = { ...stop, id: "B", stopNo: "1481", name: "춘천역" };

beforeEach(() => {
  useStops.setState({ stops: [stop, destination], loaded: true });
  useFavorites.setState({ ids: [], journeys: [] });
});

describe("<TripView>", () => {
  it("브라우저의 network 오류를 앱 전체 연결 문제가 아닌 음성 서비스 오류로 안내한다", () => {
    expect(speechErrorMessage("network")).toBe("음성 인식 서비스 연결 실패 · 직접 입력해주세요.");
  });

  it("출발지와 목적지를 모두 검색하고 각각 음성 입력을 제공한다", () => {
    const screen = render(<MemoryRouter initialEntries={["/go"]}><Routes><Route path="/go" element={<TripView />} /></Routes></MemoryRouter>);
    expect(screen.queryByText("어디서 어디로 가세요?")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "어디서 타세요?" }), { target: { value: "강원대" } });
    expect(screen.getByRole("button", { name: /강원대후문/ })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "어디로 가세요?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "출발지 말하기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "목적지 말하기" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "출발지 말하기" }));
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("이 브라우저는 음성 입력을 지원하지 않습니다.");
    expect(within(status.closest(".tripview__field") as HTMLElement).getByRole("button", { name: "출발지 말하기" })).toBeInTheDocument();
  });
});
