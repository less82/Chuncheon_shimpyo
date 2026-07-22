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
    expect(extractStopKeyword("목적지는 정류장 번호 1480입니다", ["강원대후문", "1480"])).toBe("1480");
    expect(extractStopKeyword("순천시청에서 탈게요", ["춘천시청", "1480"])).toBe("");
  });

  it("브라우저의 network 오류를 앱 전체 연결 문제가 아닌 음성 서비스 오류로 안내한다", () => {
    expect(speechErrorMessage("network")).toBe("음성 인식 서비스 연결 실패 · 직접 입력해주세요.");
  });

  it("출발지와 목적지를 모두 검색하고 각각 음성 입력을 제공한다", () => {
    const screen = render(<MemoryRouter initialEntries={["/go"]}><Routes><Route path="/go" element={<TripView />} /></Routes></MemoryRouter>);
    expect(screen.queryByText("어디서 어디로 가세요?")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "출발지 말하기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "목적지 말하기" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "출발지 말하기" }));
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("이 브라우저는 음성 입력을 지원하지 않습니다.");
    expect(within(status.closest(".tripview__field") as HTMLElement).getByRole("button", { name: "출발지 말하기" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "어디서 출발하세요?" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "직접 쓰기" }));
    fireEvent.change(screen.getByRole("textbox", { name: "어디서 출발하세요?" }), { target: { value: "강원대" } });
    expect(screen.queryByRole("button", { name: "강원대" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "출발지로 설정" }));
    expect(screen.getByText("출발 위치")).toBeInTheDocument();
    expect(screen.getByText("강원대")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "어디서 출발하세요?" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "어디로 가세요?" })).not.toBeInTheDocument();
  });

  it("말하기 어려운 사용자는 즉시 출발지와 목적지를 직접 입력할 수 있다", () => {
    const screen = render(<MemoryRouter initialEntries={["/go"]}><Routes><Route path="/go" element={<TripView />} /></Routes></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "지금은 말할 수 없어요" }));

    expect(screen.getByRole("textbox", { name: "어디서 출발하세요?" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "어디로 가세요?" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "출발지 말하기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "목적지 말하기" })).not.toBeInTheDocument();
  });

  it("직접 입력 중에는 검색 결과 단계로 자동 전환하지 않는다", () => {
    const screen = render(<MemoryRouter initialEntries={["/go"]}><Routes><Route path="/go" element={<TripView />} /></Routes></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "지금은 말할 수 없어요" }));
    const originInput = screen.getByRole("textbox", { name: "어디서 출발하세요?" });

    fireEvent.change(originInput, { target: { value: "강원" } });

    expect(originInput).toHaveValue("강원");
    expect(screen.getByRole("button", { name: "출발지로 설정" })).toBeInTheDocument();
    expect(screen.queryByText("출발 위치를 확인해주세요")).not.toBeInTheDocument();
  });
});
