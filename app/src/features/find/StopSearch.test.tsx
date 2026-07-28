import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useStops } from "../../store/useStops";
import type { Stop } from "../../types/stop";
import { StopSearch } from "./StopSearch";

const chuncheonStation: Stop = {
  id: "250001",
  stopNo: "1001",
  name: "춘천역",
  lat: 37.884,
  lng: 127.717,
  routes: ["1", "12"],
  facilities: {
    shade: { status: "yes", source: "shade_registry" },
    seat: { status: "no", source: "roadview", capturedAt: "2024.05" },
    light: { status: "unknown", source: "none" },
    sign: { status: "unknown", source: "none" },
  },
};

const university: Stop = {
  ...chuncheonStation,
  id: "250002",
  stopNo: "2002",
  name: "강원대학교",
  routes: ["7"],
};

const renderSearch = () => render(<MemoryRouter><StopSearch /></MemoryRouter>);

beforeEach(() => {
  useStops.setState({ stops: [chuncheonStation, university], loaded: true });
});

describe("<StopSearch>", () => {
  it("검색어가 없으면 결과 대신 안내 문구를 보여준다", () => {
    const screen = renderSearch();
    expect(screen.getByText(/4자리 번호를 입력하세요/)).toBeInTheDocument();
  });

  it("이름으로 검색해 결과가 나온다", () => {
    const screen = renderSearch();
    fireEvent.change(screen.getByLabelText("정류장 이름 또는 정류장번호 검색"), { target: { value: "춘천" } });
    expect(screen.getByRole("button", { expanded: false, name: /춘천역/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /강원대학교/ })).not.toBeInTheDocument();
  });

  it("정류장번호로 검색해 결과가 나온다", () => {
    const screen = renderSearch();
    fireEvent.change(screen.getByLabelText("정류장 이름 또는 정류장번호 검색"), { target: { value: "2002" } });
    const row = screen.getByRole("button", { name: /강원대학교/ });
    expect(row).toBeInTheDocument();
    expect(row).toHaveTextContent("경유 노선 1개");
  });

  it("결과를 누르면 시설 3상태가 보인다", () => {
    const screen = renderSearch();
    fireEvent.change(screen.getByLabelText("정류장 이름 또는 정류장번호 검색"), { target: { value: "1001" } });
    fireEvent.click(screen.getByRole("button", { name: /춘천역/ }));

    expect(screen.getByRole("group", { name: /그늘 있음/ })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /의자 없음/ })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /조명 미확인/ })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /도착안내기 미확인/ })).toBeInTheDocument();
    expect(screen.getByText("250001")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /출발해 목적지 고르기/ })).toHaveAttribute("href", "/go?board=250001");
    expect(screen.getByRole("link", { name: /상태 알리기/ })).toHaveAttribute("href", "/app/report?stop=250001");
  });

  it("도착정보를 약속하지 않고 탑승 정류장이라는 뜻으로 안내한다", () => {
    const screen = renderSearch();
    fireEvent.change(screen.getByLabelText("정류장 이름 또는 정류장번호 검색"), { target: { value: "1001" } });
    fireEvent.click(screen.getByRole("button", { name: /춘천역/ }));

    expect(screen.getByText("이 정류장에서 출발하기")).toBeInTheDocument();
    expect(screen.queryByText(/가는 버스 보기/)).not.toBeInTheDocument();
    expect(screen.queryByText(/도착정보/)).not.toBeInTheDocument();
  });

  it("미확인 시설을 없음으로 표시하지 않는다", () => {
    const screen = renderSearch();
    fireEvent.change(screen.getByLabelText("정류장 이름 또는 정류장번호 검색"), { target: { value: "1001" } });
    fireEvent.click(screen.getByRole("button", { name: /춘천역/ }));

    // 조명·도착안내기는 근거가 없어 미확인이다. "없음"은 의자 하나뿐이어야 한다.
    const labels = screen.getAllByText(/^(있음|없음|미확인)$/).map((node) => node.textContent);
    expect(labels).toEqual(["있음", "없음", "미확인", "미확인"]);
  });
});
