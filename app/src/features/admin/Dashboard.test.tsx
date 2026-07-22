import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";
import type { Stop, FacilityInfo } from "../../types/stop";
import Dashboard from "./Dashboard";
import { useStops } from "../../store/useStops";
import * as csv from "./exportCsv";
import { INSTALL_STATUS_LABEL } from "../../types/priority";

const F = (s: FacilityInfo["status"] = "unknown"): FacilityInfo => ({
  status: s,
  source: "none",
});

function stop(
  id: string,
  name: string,
  midday: number,
  shade: FacilityInfo["status"],
): Stop {
  const byHour = new Array(24).fill(0);
  for (const h of [11, 12, 13, 14, 15, 16]) byHour[h] = midday / 6;
  return {
    id,
    stopNo: id,
    name,
    lat: 37.88,
    lng: 127.73,
    routes: ["1"],
    facilities: { shade: F(shade), seat: F(), light: F(), sign: F() },
    demand: {
      byHour,
      total: midday * 3,
      aggregatedBidirectional: true,
      matchedName: name,
    },
  };
}

const stops: Stop[] = [
  stop("250000001", "춘천역", 300, "unknown"),
  stop("250000002", "명동", 200, "unknown"),
  stop("250000003", "후평동", 100, "yes"), // 그늘 있음 → 여름 프리셋 제외
  stop("250000004", "석사동", 10, "unknown"), // 하위 → 상위% 제외
];

beforeEach(() => {
  localStorage.clear();
  useStops.setState({
    stops,
    cityCenter: { lat: 37.88, lng: 127.73 },
    loaded: true,
  });
});

function openFilterTab(utils: ReturnType<typeof render>) {
  fireEvent.click(utils.getByRole("tab", { name: "데이터 분석" }));
  return utils;
}

describe("<Dashboard> — 조건 필터 탭(v1 보존)", () => {
  it("(g) 기본(여름 프리셋)에서 조건 만족 정류장을 표에 렌더한다", () => {
    const utils = render(<Dashboard />);
    openFilterTab(utils);
    const { getByText, queryByText } = utils;
    // 여름 = 상위25% & 그늘 미확인 → 춘천역만 (상위 25% of 4 = 1개, 최다승차 300)
    expect(getByText("춘천역")).toBeInTheDocument();
    // 그늘 있음(후평동)·하위(석사동)는 제외
    expect(queryByText("후평동")).toBeNull();
    expect(queryByText("석사동")).toBeNull();
  });

  it("(g) 양방향 합산 각주를 표기한다", () => {
    const utils = render(<Dashboard />);
    openFilterTab(utils);
    expect(utils.getByText(/양방향 합산 기준/)).toBeInTheDocument();
  });

  it("(g) CSV 내려받기 버튼이 exportCsv 를 호출한다", () => {
    const spy = vi.spyOn(csv, "exportCsv").mockImplementation(() => {});
    const utils = render(<Dashboard />);
    openFilterTab(utils);
    fireEvent.click(utils.getByRole("button", { name: "CSV 내려받기" }));
    expect(spy).toHaveBeenCalledOnce();
    const rows = spy.mock.calls[0][0];
    expect(rows[0].name).toBe("춘천역");
    expect(rows[0].middayBoarding).toBe(300);
    spy.mockRestore();
  });

  it("(g) 행 클릭 시 근거 카드를 연다", () => {
    const utils = render(<Dashboard />);
    openFilterTab(utils);
    fireEvent.click(utils.getByText("춘천역"));
    const dialog = utils.getByRole("dialog");
    expect(within(dialog).getByText("한낮 승차 순위")).toBeInTheDocument();
    expect(within(dialog).getByText(/1위/)).toBeInTheDocument();
  });
});

describe("<Dashboard> — (a) 탭 구조", () => {
  it("실제 운영 화면에는 개발용 시안 비교 탭을 노출하지 않는다", () => {
    const utils = render(<Dashboard />);
    expect(utils.queryByRole("navigation", { name: "대시보드 시안 비교" })).toBeNull();
    expect(utils.getByRole("heading", { name: "처리 현황" })).toBeInTheDocument();
  });

  it("시민 앱에서 저장한 불편 제보를 기본 화면에 표시한다", () => {
    localStorage.setItem("shimpyo:reports", JSON.stringify([{ id: "r1", stopId: "250000001", stopNo: "1001", stopName: "춘천역", issue: "의자가 없어요", createdAt: "2026-07-21T08:00:00.000Z", status: "received" }]));
    const { getByText } = render(<Dashboard />);
    expect(getByText("의자가 없어요")).toBeInTheDocument();
    expect(getByText("#1001 · 250000001")).toBeInTheDocument();
  });

  it("처리 단계를 누르면 해당 단계의 제보만 목록에 표시한다", () => {
    localStorage.setItem("shimpyo:reports", JSON.stringify([
      { id: "r1", stopId: "250000001", stopNo: "1001", stopName: "춘천역", issue: "의자가 없어요", createdAt: "2026-07-21T08:00:00.000Z", status: "received" },
      { id: "r2", stopId: "250000002", stopNo: "1002", stopName: "명동", issue: "안내기가 꺼졌어요", createdAt: "2026-07-21T08:10:00.000Z", status: "reviewing" },
    ]));
    const { getByRole, getByText, queryByText } = render(<Dashboard />);
    fireEvent.click(getByRole("button", { name: /^접수/ }));
    expect(getByText("의자가 없어요")).toBeInTheDocument();
    expect(queryByText("안내기가 꺼졌어요")).toBeNull();
    expect(getByText("처리 상태")).toBeInTheDocument();
  });

  it("안전 관련 여부와 유사 제보 집중을 요약하고 해당 업무만 필터링한다", () => {
    localStorage.setItem("shimpyo:reports", JSON.stringify([
      { id: "r1", stopId: "250000001", stopNo: "1001", stopName: "춘천역", issue: "시설물이 파손됐어요", createdAt: "2026-07-21T08:00:00.000Z", status: "received" },
      { id: "r2", stopId: "250000001", stopNo: "1001", stopName: "춘천역", issue: "유리가 깨졌어요", createdAt: "2026-07-21T08:10:00.000Z", status: "reviewing" },
      { id: "r3", stopId: "250000002", stopNo: "1002", stopName: "명동", issue: "의자가 없어요", createdAt: "2026-07-21T08:20:00.000Z", status: "received" },
    ]));
    const utils = render(<Dashboard />);
    const signals = utils.getByRole("group", { name: "목록 범위 선택" });

    expect(within(signals).getByRole("button", { name: /안전 관련 후보 2/ })).toBeInTheDocument();
    expect(within(signals).getByRole("button", { name: /유사 제보 집중 1/ })).toBeInTheDocument();
    fireEvent.click(within(signals).getByRole("button", { name: /안전 관련/ }));
    expect(utils.getByRole("heading", { name: "안전 관련 제보" })).toBeInTheDocument();
    expect(utils.getByText("시설물이 파손됐어요")).toBeInTheDocument();
    expect(utils.queryByText("의자가 없어요")).toBeNull();
    expect(utils.queryByText("평균 처리시간")).toBeNull();
  });

  it("제보가 4건을 넘으면 스크롤 대신 페이지를 나눠 표시한다", () => {
    localStorage.setItem("shimpyo:reports", JSON.stringify(Array.from({ length: 7 }, (_, index) => ({
      id: `r${index + 1}`,
      stopId: `25000000${index + 1}`,
      stopNo: `${1001 + index}`,
      stopName: `정류장 ${index + 1}`,
      issue: `제보 ${index + 1}`,
      createdAt: `2026-07-21T08:0${index}:00.000Z`,
      status: "received",
    }))));
    const utils = render(<Dashboard />);

    expect(utils.getByRole("navigation", { name: "제보 목록 페이지" })).toBeInTheDocument();
    expect(utils.getByText("제보 1")).toBeInTheDocument();
    expect(utils.queryByText("제보 7")).toBeNull();

    fireEvent.click(utils.getByRole("button", { name: "다음" }));
    expect(utils.getByText("제보 7")).toBeInTheDocument();
    expect(utils.queryByText("제보 1")).toBeNull();
  });

  it("처리 완료 건은 검토가 아니라 처리 기록을 연다", () => {
    localStorage.setItem("shimpyo:reports", JSON.stringify([
      { id: "r1", stopId: "250000001", stopNo: "1001", stopName: "춘천역", issue: "의자가 없어요", createdAt: "2026-07-21T08:00:00.000Z", status: "resolved" },
    ]));
    const utils = render(<Dashboard />);
    fireEvent.click(within(utils.getByRole("group", { name: "처리 상태별 제보 목록" })).getByRole("button", { name: /처리 완료/ }));
    expect(utils.queryByRole("button", { name: "검토 열기" })).toBeNull();
    fireEvent.click(utils.getByRole("row", { name: "춘천역 의자가 없어요 상세 보기" }));
    expect(utils.getByText("처리가 완료된 제보입니다.")).toBeInTheDocument();
  });

  it("검토 열기만으로 상태가 바뀌지 않고 필수 확인 후에만 다음 단계로 이동한다", () => {
    localStorage.setItem("shimpyo:reports", JSON.stringify([
      { id: "r1", stopId: "250000001", stopNo: "1001", stopName: "춘천역", issue: "의자가 없어요", createdAt: "2026-07-21T08:00:00.000Z", status: "received" },
    ]));
    const utils = render(<Dashboard />);
    fireEvent.click(utils.getByRole("row", { name: "춘천역 의자가 없어요 상세 보기" }));
    expect(utils.getByRole("dialog", { name: "제보 검토" })).toBeInTheDocument();
    const confirm = utils.getByRole("button", { name: "접수 확인" });
    expect(confirm).toBeDisabled();
    expect(JSON.parse(localStorage.getItem("shimpyo:reports") ?? "[]")[0].status).toBe("received");
    fireEvent.click(utils.getByRole("checkbox", { name: "정류장 식별정보 확인" }));
    fireEvent.click(utils.getByRole("checkbox", { name: "소관 담당 지정" }));
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(JSON.parse(localStorage.getItem("shimpyo:reports") ?? "[]")[0].status).toBe("reviewing");
  });

  it("1단계/2단계/조건 필터 탭이 모두 존재한다", () => {
    const { getByRole } = render(<Dashboard />);
    expect(getByRole("tab", { name: "시설정보 검증 목록" })).toBeInTheDocument();
    expect(getByRole("tab", { name: "시설 개선 후보" })).toBeInTheDocument();
    expect(getByRole("tab", { name: "데이터 분석" })).toBeInTheDocument();
  });

  it("1단계 탭에서 수요 미확인 조사 후보 섹션이 노출된다", () => {
    const { getByText, getByRole } = render(<Dashboard />);
    fireEvent.click(getByRole("tab", { name: "시설정보 검증 목록" }));
    expect(getByText("수요 미확인 조사 후보 — 순위 없음")).toBeInTheDocument();
  });

  it("2단계 탭에서 no=0(실데이터 없음)이면 '조사 반영 전 — 1단계를 먼저' 안내가 뜬다", () => {
    const { getByRole, getByText } = render(<Dashboard />);
    fireEvent.click(getByRole("tab", { name: "시설 개선 후보" }));
    // 픽스처는 모든 시설이 unknown/yes 뿐이라 no=0.
    expect(getByText(/조사 반영 전 — 1단계를 먼저/)).toBeInTheDocument();
  });

  it("2단계에서 설치 후보가 있을 때 전 행에 INSTALL_STATUS_LABEL이 노출된다", () => {
    const withNo: Stop[] = [
      ...stops,
      {
        ...stop("250000005", "설치후보", 50, "unknown"),
        facilities: {
          shade: F("unknown"),
          seat: { status: "no", source: "roadview", capturedAt: "2026.03" },
          light: F("unknown"),
          sign: F("unknown"),
        },
      },
    ];
    useStops.setState({ stops: withNo, cityCenter: { lat: 37.88, lng: 127.73 }, loaded: true });
    const { getByRole, getAllByText } = render(<Dashboard />);
    fireEvent.click(getByRole("tab", { name: "시설 개선 후보" }));
    expect(getAllByText(INSTALL_STATUS_LABEL).length).toBeGreaterThan(0);
  });

  it("unknown 시설은 2단계 설치 후보 표에 절대 노출되지 않는다 — 중단 조건 1", () => {
    const withUnknownOnly: Stop[] = [
      {
        ...stop("250000006", "미확인정류장", 50, "unknown"),
        facilities: {
          shade: F("unknown"),
          seat: F("unknown"),
          light: F("unknown"),
          sign: F("unknown"),
        },
      },
    ];
    useStops.setState({
      stops: withUnknownOnly,
      cityCenter: { lat: 37.88, lng: 127.73 },
      loaded: true,
    });
    const { getByRole, queryByText } = render(<Dashboard />);
    fireEvent.click(getByRole("tab", { name: "시설 개선 후보" }));
    expect(queryByText("미확인정류장")).toBeNull();
  });
});

describe("<Dashboard> — (b) 프리셋 + 정책 시나리오 비교", () => {
  it("프리셋 3버튼과 각 rationale이 표시된다", () => {
    const { getByRole, getByText } = render(<Dashboard />);
    fireEvent.click(getByRole("tab", { name: "시설정보 검증 목록" }));
    expect(getByRole("button", { name: "폭염 대응형" })).toBeInTheDocument();
    expect(getByRole("button", { name: "고령자 이동지원형" })).toBeInTheDocument();
    expect(getByRole("button", { name: "이용량 중심형" })).toBeInTheDocument();
    fireEvent.click(getByRole("button", { name: "고령자 이동지원형" }));
    expect(getByText(/병원·경로당·시장/)).toBeInTheDocument();
  });

  it("정책 시나리오 비교 표가 노출된다", () => {
    const { getByText, getByRole } = render(<Dashboard />);
    fireEvent.click(getByRole("tab", { name: "시설정보 검증 목록" }));
    expect(getByText("정책 시나리오 비교")).toBeInTheDocument();
  });

  it("'민감도' 문자열은 사용하지 않는다", () => {
    const { container } = render(<Dashboard />);
    expect(container.textContent).not.toContain("민감도");
  });
});

describe("<Dashboard> — (c) 실측값 병기 + 표본 배지", () => {
  it("1단계 표에 한낮 승차 실측값이 병기되고 지수는 별도 열", () => {
    const { getAllByText, getByRole } = render(<Dashboard />);
    fireEvent.click(getByRole("tab", { name: "시설정보 검증 목록" }));
    expect(getAllByText("한낮 승차*").length).toBeGreaterThan(0);
    expect(getAllByText("지수(보조)").length).toBeGreaterThan(0);
  });

  it("'2025.6 4일 표본, 양방향 합산' 배지가 상시 노출된다", () => {
    const { getByText, getByRole } = render(<Dashboard />);
    fireEvent.click(getByRole("tab", { name: "시설정보 검증 목록" }));
    expect(getByText("2025.6 4일 표본, 양방향 합산")).toBeInTheDocument();
  });
});

describe("<Dashboard> — '현장 확인' 금지 문구", () => {
  it("어떤 탭에도 '현장 확인' 문자열이 없다", () => {
    const utils = render(<Dashboard />);
    expect(utils.container.textContent).not.toContain("현장 확인");
    fireEvent.click(utils.getByRole("tab", { name: "시설 개선 후보" }));
    expect(utils.container.textContent).not.toContain("현장 확인");
    fireEvent.click(utils.getByRole("tab", { name: "데이터 분석" }));
    expect(utils.container.textContent).not.toContain("현장 확인");
  });
});
