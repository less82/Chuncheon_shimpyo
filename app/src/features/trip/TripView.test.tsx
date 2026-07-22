import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TripView from "./TripView";
import { extractStopKeyword, speechErrorMessage } from "./speechRecognition";
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
const opposite: Stop = { ...stop, id: "A2", stopNo: "1482", name: "강원대후문" };

beforeEach(() => {
  useStops.setState({ stops: [stop, opposite, destination], loaded: true });
  useFavorites.setState({ ids: [], journeys: [] });
});

describe("<TripView>", () => {
  it("전체 발화 대신 정류장을 특정하는 이름이나 번호만 추출한다", () => {
    expect(extractStopKeyword("출발지는 강원대학교 후문 정류장에서 탈게요", ["강원대후문", "춘천역"])).toBe("강원대후문");
    expect(extractStopKeyword("안녕하세요 반갑습니다 강원대학교", ["강원대후문", "강원대병원"])).toBe("강원대");
    expect(extractStopKeyword("목적지는 정류장 번호 1480입니다", ["강원대후문"])).toBe("1480");
  });

  it("브라우저의 network 오류를 앱 전체 연결 문제가 아닌 음성 서비스 오류로 안내한다", () => {
    expect(speechErrorMessage("network")).toBe("음성 인식 서비스 연결 실패 · 직접 입력해주세요.");
  });

  it("출발지와 목적지를 모두 검색하고 각각 음성 입력을 제공한다", () => {
    const screen = render(<MemoryRouter initialEntries={["/go"]}><Routes><Route path="/go" element={<TripView />} /></Routes></MemoryRouter>);
    expect(screen.queryByText("어디서 어디로 가세요?")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "어디서 타세요?" }), { target: { value: "강원대" } });
    const result = screen.getByRole("button", { name: "강원대후문" });
    expect(result).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "강원대후문" })).toHaveLength(1);
    expect(within(result.closest(".tripview__field") as HTMLElement).getByRole("textbox", { name: "어디서 타세요?" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "어디로 가세요?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "출발지 말하기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "목적지 말하기" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "출발지 말하기" }));
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("이 브라우저는 음성 입력을 지원하지 않습니다.");
    expect(within(status.closest(".tripview__field") as HTMLElement).getByRole("button", { name: "출발지 말하기" })).toBeInTheDocument();
  });
});
