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

/** 사진 한 장을 골라 미리보기가 뜰 때까지 기다린다. */
async function attachPhoto(screen: ReturnType<typeof renderReport>, type = "image/jpeg", size = 0) {
  const file = new File(["사진"], "stop.jpg", { type });
  if (size) Object.defineProperty(file, "size", { value: size });
  fireEvent.change(screen.getByLabelText(/사진 (고르기|다시 고르기)/), { target: { files: [file] } });
  if (type === "image/jpeg" && !size) {
    await waitFor(() => expect(screen.getByAltText("올리신 사진 미리보기")).toBeInTheDocument());
  }
}

describe("<AppReport>", () => {
  it("같은 이름의 정류장을 다음 정류장 방면으로 구분한다", () => {
    const next = { ...stop, id: "250002", name: "강원대학교" };
    const routes = { generatedAt: "", routes: [{ routeId: "1", routeNo: "1", stops: [stop.id, next.id] }] };
    expect(stopDirection(stop, routes, [stop, next])).toBe("강원대학교 방면");
  });

  it("버스 이용 불편만 단계가 두 개 더 길다", () => {
    // 정류장 계열은 확인을 모달로 하므로 화면 단계가 셋이다
    expect(stepProgress("facility", "kind")).toBe("1 / 3 · 무엇을 알릴까요");
    expect(stepProgress("facility", "photo")).toBe("3 / 3 · 사진과 내용");
    expect(stepProgress("route", "kind")).toBe("1 / 4 · 무엇을 알릴까요");
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

  it("정류장을 고르면 확인 모달이 뜨고, 확인하면 사진 단계로 간다", async () => {
    const screen = renderReport();
    fireEvent.click(screen.getByRole("button", { name: /정류장 시설/ }));
    await waitFor(() => expect(screen.getByText("어느 정류장인가요?")).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText("예: 춘천역 또는 1001"), { target: { value: "1001" } });
    fireEvent.click(screen.getByRole("button", { name: /춘천역/ }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("이 정류장이 맞나요?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "네, 맞아요" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("사진을 올려주세요")).toBeInTheDocument();
  });

  it("정류장 확인 모달을 Escape 로 닫으면 정류장을 다시 고른다", async () => {
    const screen = renderReport();
    fireEvent.click(screen.getByRole("button", { name: /정류장 시설/ }));
    await waitFor(() => expect(screen.getByText("어느 정류장인가요?")).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText("예: 춘천역 또는 1001"), { target: { value: "1001" } });
    fireEvent.click(screen.getByRole("button", { name: /춘천역/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("어느 정류장인가요?")).toBeInTheDocument();
  });

  it("사진이 없으면 보낼 수 없고, JPG·PNG·WEBP 가 아니면 거른다", async () => {
    const screen = renderReport();
    await pickKindAndStop(screen, "정류장 시설");

    expect(screen.getByRole("button", { name: "보내기" })).toBeDisabled();
    await attachPhoto(screen, "application/pdf");
    expect(await screen.findByRole("alert")).toHaveTextContent("JPG, PNG, WEBP");
    expect(screen.getByRole("button", { name: "보내기" })).toBeDisabled();
  });

  it("12MB 를 넘는 사진은 거른다", async () => {
    const screen = renderReport();
    await pickKindAndStop(screen, "정류장 시설");

    await attachPhoto(screen, "image/jpeg", 13 * 1024 * 1024);
    expect(await screen.findByRole("alert")).toHaveTextContent("12MB");
    expect(screen.getByRole("button", { name: "보내기" })).toBeDisabled();
  });

  it("사진만 있으면 글 없이도 보낼 수 있고, 최종 확인 모달을 거친다", async () => {
    const screen = renderReport();
    await pickKindAndStop(screen, "정류장 시설");
    await attachPhoto(screen);

    fireEvent.click(screen.getByRole("button", { name: "보내기" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("이 내용으로 보낼까요?")).toBeInTheDocument();
    expect(screen.getByText("1장 첨부")).toBeInTheDocument();
    expect(screen.getByText("안 적음")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "네, 보낼게요" }));

    expect(screen.getByText(/알려주셔서/)).toBeInTheDocument();
    expect(screen.getByText("사진을 받았습니다.")).toBeInTheDocument();
    const saved = loadReports()[0];
    expect(saved.reportKind).toBe("facility");
    // 글이 없으면 시민이 고른 유형 라벨을 그대로 쓴다(내용을 지어내지 않는다)
    expect(saved.issue).toBe("정류장 시설");
    expect(saved.photoDataUrl).toMatch(/^data:image\/jpeg/);
    expect(localStorage.getItem(REPORT_STORAGE_KEY)).toContain("정류장 시설");
    // 완료 화면에 담당 부서와 전화가 함께 뜬다(전화는 보조 수단이다)
    const tel = screen.getByRole("link", { name: "춘천시 교통과 교통시설팀 033-250-3316 전화 걸기" });
    expect(tel).toHaveClass("contactguide__tel");
    expect(tel).toHaveAttribute("href", "tel:0332503316");
    expect(screen.queryByText("민원 접수")).not.toBeInTheDocument();
  });

  it("보내기 확인 모달에 사진 이용 목적을 한 줄로 알린다", async () => {
    const screen = renderReport();
    await pickKindAndStop(screen, "정류장 시설");
    await attachPhoto(screen);

    fireEvent.click(screen.getByRole("button", { name: "보내기" }));
    expect(screen.getByText("보내신 사진은 담당 부서가 확인하는 데 쓰입니다.")).toBeInTheDocument();
    // 시민 화면에는 AI 를 드러내지 않는다.
    expect(screen.getByRole("dialog").textContent).not.toContain("AI");
  });

  it("글을 적으면 그 글이 제보 내용으로 저장된다", async () => {
    const screen = renderReport();
    await pickKindAndStop(screen, "안내기 고장");
    await attachPhoto(screen);
    fireEvent.change(screen.getByLabelText("더 알려주실 내용 (선택)"), { target: { value: "화면이 꺼져 있어요" } });

    fireEvent.click(screen.getByRole("button", { name: "보내기" }));
    fireEvent.click(screen.getByRole("button", { name: "네, 보낼게요" }));

    const saved = loadReports()[0];
    expect(saved.issue).toBe("화면이 꺼져 있어요");
    expect(saved.reportKind).toBe("bis");
  });

  it("시민 화면에 AI 관련 문구를 넣지 않는다", async () => {
    const screen = renderReport();
    await pickKindAndStop(screen, "정류장 시설");
    await attachPhoto(screen);
    expect(screen.container.textContent).not.toMatch(/AI|인공지능|자동 판정/);

    fireEvent.click(screen.getByRole("button", { name: "보내기" }));
    fireEvent.click(screen.getByRole("button", { name: "네, 보낼게요" }));
    expect(screen.container.textContent).not.toMatch(/AI|인공지능|자동 판정/);
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
