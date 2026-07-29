import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";
import type { Stop, FacilityInfo } from "../../types/stop";
import Dashboard from "./Dashboard";
import { useStops } from "../../store/useStops";
import * as csv from "./exportCsv";
import { INSTALL_STATUS_LABEL } from "../../types/priority";
import { explainReportPhoto } from "./facilityVlm";

// VLM 호출은 과금되는 외부 요청이라 테스트에서는 모듈째 대체한다.
vi.mock("./facilityVlm", () => ({ explainReportPhoto: vi.fn() }));
const explainMock = vi.mocked(explainReportPhoto);

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
    facilities: { shade: F(shade), seat: F(), shelter: F(), sign: F() },
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

  it("검토 모달을 열면 모달 안으로 포커스가 들어가고 배경 스크롤이 잠긴다", () => {
    localStorage.setItem("shimpyo:reports", JSON.stringify([
      { id: "r1", stopId: "250000001", stopNo: "1001", stopName: "춘천역", issue: "의자가 없어요", createdAt: "2026-07-21T08:00:00.000Z", status: "received" },
    ]));
    const utils = render(<Dashboard />);
    fireEvent.click(utils.getByRole("row", { name: "춘천역 의자가 없어요 상세 보기" }));
    const dialog = utils.getByRole("dialog", { name: "제보 검토" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("검토 모달을 닫으면 스크롤과 원래 포커스를 되돌린다", () => {
    localStorage.setItem("shimpyo:reports", JSON.stringify([
      { id: "r1", stopId: "250000001", stopNo: "1001", stopName: "춘천역", issue: "의자가 없어요", createdAt: "2026-07-21T08:00:00.000Z", status: "received" },
    ]));
    const utils = render(<Dashboard />);
    const row = utils.getByRole("row", { name: "춘천역 의자가 없어요 상세 보기" });
    row.focus();
    fireEvent.click(row);
    fireEvent.click(utils.getByRole("button", { name: "취소" }));
    expect(utils.queryByRole("dialog", { name: "제보 검토" })).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(row);
  });

  it("검토 모달에서 Tab 포커스가 모달 밖으로 나가지 않는다", () => {
    localStorage.setItem("shimpyo:reports", JSON.stringify([
      { id: "r1", stopId: "250000001", stopNo: "1001", stopName: "춘천역", issue: "의자가 없어요", createdAt: "2026-07-21T08:00:00.000Z", status: "received" },
    ]));
    const utils = render(<Dashboard />);
    fireEvent.click(utils.getByRole("row", { name: "춘천역 의자가 없어요 상세 보기" }));
    const dialog = utils.getByRole("dialog", { name: "제보 검토" });
    // 마지막 요소에서 Tab 을 누르면 첫 요소로 돌아온다.
    const cancel = utils.getByRole("button", { name: "취소" });
    cancel.focus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(window, { key: "Tab" });
    expect(dialog.contains(document.activeElement)).toBe(true);
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
          shelter: F("unknown"),
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
          shelter: F("unknown"),
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

describe("<Dashboard> — 사진 설명(AI 추정)", () => {
  const photoReport = {
    id: "p1",
    stopId: "250000001",
    stopNo: "1001",
    stopName: "춘천역",
    issue: "의자가 부서졌어요",
    photoDataUrl: "data:image/jpeg;base64,ZmFrZQ==",
    createdAt: "2026-07-21T08:00:00.000Z",
    status: "received",
  };

  beforeEach(() => {
    explainMock.mockReset();
    localStorage.setItem("shimpyo:reports", JSON.stringify([photoReport]));
  });

  function openReview() {
    const utils = render(<Dashboard />);
    fireEvent.click(utils.getByRole("row", { name: "춘천역 의자가 부서졌어요 상세 보기" }));
    return utils;
  }

  it("버튼을 누르기 전에 사진이 외부로 전송된다는 사실을 알린다", () => {
    const utils = openReview();
    const hint = utils.getByText(/외부 AI 서비스\(OpenRouter\)로 전송/);
    expect(hint).toBeInTheDocument();
    expect(hint.textContent).toContain("개인정보가 찍혀 있으면 누르지 마세요");
  });

  it("모달을 열기만 해서는 설명을 만들지 않는다", () => {
    const utils = openReview();
    expect(utils.getByRole("button", { name: "사진 설명 만들기" })).toBeInTheDocument();
    expect(explainMock).not.toHaveBeenCalled();
    expect(utils.queryByText(/AI 추정입니다/)).toBeNull();
  });

  it("버튼을 누르면 사진과 참고 정보를 넘겨 설명을 요청한다", async () => {
    explainMock.mockResolvedValue({ ok: true, text: "의자 좌판 한쪽이 갈라져 보입니다." });
    const utils = openReview();
    fireEvent.click(utils.getByRole("button", { name: "사진 설명 만들기" }));
    expect(explainMock).toHaveBeenCalledWith(photoReport.photoDataUrl, {
      stopName: "춘천역",
      issue: "의자가 부서졌어요",
    });
    await utils.findByText("의자 좌판 한쪽이 갈라져 보입니다.");
  });

  it("성공하면 설명 본문과 사람이 확정한다는 고지를 함께 보여준다", async () => {
    explainMock.mockResolvedValue({ ok: true, text: "의자 좌판 한쪽이 갈라져 보입니다." });
    const utils = openReview();
    fireEvent.click(utils.getByRole("button", { name: "사진 설명 만들기" }));
    expect(await utils.findByText("의자 좌판 한쪽이 갈라져 보입니다.")).toBeInTheDocument();
    expect(utils.getByText("AI 추정입니다. 담당자 확인 결과가 우선합니다.")).toBeInTheDocument();
  });

  it("키가 없으면 설정되지 않았다고만 안내한다", async () => {
    explainMock.mockResolvedValue({ ok: false, reason: "no_key", text: "꺼짐" });
    const utils = openReview();
    fireEvent.click(utils.getByRole("button", { name: "사진 설명 만들기" }));
    expect(await utils.findByText("AI 설명 기능이 설정되지 않았습니다")).toBeInTheDocument();
    expect(utils.queryByText(/AI 추정입니다/)).toBeNull();
  });

  it("시간이 초과되면 다시 시도하라고 안내한다", async () => {
    explainMock.mockResolvedValue({ ok: false, reason: "timeout", text: "초과" });
    const utils = openReview();
    fireEvent.click(utils.getByRole("button", { name: "사진 설명 만들기" }));
    expect(await utils.findByText("시간이 초과됐습니다. 다시 시도해 주세요")).toBeInTheDocument();
  });

  it("그 밖의 실패는 설명을 만들지 못했다고 안내한다", async () => {
    explainMock.mockResolvedValue({ ok: false, reason: "network", text: "실패" });
    const utils = openReview();
    fireEvent.click(utils.getByRole("button", { name: "사진 설명 만들기" }));
    expect(await utils.findByText("설명을 만들지 못했습니다")).toBeInTheDocument();
  });

  it("만드는 동안에는 버튼을 다시 누를 수 없다", async () => {
    let release: (value: { ok: boolean; text: string }) => void = () => {};
    explainMock.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const utils = openReview();
    fireEvent.click(utils.getByRole("button", { name: "사진 설명 만들기" }));
    const running = utils.getByRole("button", { name: "설명 만드는 중" });
    expect(running).toBeDisabled();
    fireEvent.click(running);
    expect(explainMock).toHaveBeenCalledTimes(1);
    release({ ok: true, text: "설명 본문" });
    expect(await utils.findByText("설명 본문")).toBeInTheDocument();
  });

  it("사진을 다시 열어도 이미 만든 설명이 남아 있다", async () => {
    explainMock.mockResolvedValue({ ok: true, text: "그늘막 지붕 일부가 떨어져 보입니다." });
    const utils = openReview();
    fireEvent.click(utils.getByRole("button", { name: "사진 설명 만들기" }));
    expect(await utils.findByText("그늘막 지붕 일부가 떨어져 보입니다.")).toBeInTheDocument();
    fireEvent.click(utils.getByRole("button", { name: "취소" }));
    fireEvent.click(utils.getByRole("row", { name: "춘천역 의자가 부서졌어요 상세 보기" }));
    expect(utils.getByText("그늘막 지붕 일부가 떨어져 보입니다.")).toBeInTheDocument();
    expect(explainMock).toHaveBeenCalledTimes(1);
  });
});

describe("<Dashboard> — 알리기 4유형 구분", () => {
  // reportKind 는 시민이 직접 고른 값, contactCategory 는 저장 시 분류, 둘 다 없으면 미분류다.
  const kindReports = [
    { id: "k1", stopId: "250000001", stopNo: "1001", stopName: "춘천역", issue: "의자가 파손됐어요", createdAt: "2026-07-21T08:00:00.000Z", status: "received", reportKind: "facility", contactCategory: "facility" },
    { id: "k2", stopId: "250000002", stopNo: "1002", stopName: "명동", issue: "안내 화면이 꺼졌어요", createdAt: "2026-07-21T08:10:00.000Z", status: "received", reportKind: "bis", contactCategory: "bis" },
    { id: "k3", stopId: "250000003", stopNo: "1003", stopName: "후평동", issue: "기사님이 불친절했어요", createdAt: "2026-07-21T08:20:00.000Z", status: "reviewing", reportKind: "ride", contactCategory: "ride" },
    { id: "k4", stopId: "250000004", stopNo: "1004", stopName: "석사동", issue: "옛 제보입니다", createdAt: "2026-07-21T08:30:00.000Z", status: "received" },
  ];

  beforeEach(() => {
    localStorage.setItem("shimpyo:reports", JSON.stringify(kindReports));
  });

  function kindTabs(utils: ReturnType<typeof render>) {
    return within(utils.getByRole("tablist", { name: "알리기 유형" }));
  }

  it("전체와 알리기 4유형을 탭으로 보여준다 — 0건이어도 남긴다", () => {
    const utils = render(<Dashboard />);
    const tabs = kindTabs(utils);
    expect(tabs.getByRole("tab", { name: /전체/ })).toBeInTheDocument();
    expect(tabs.getByRole("tab", { name: /정류장 시설/ })).toBeInTheDocument();
    expect(tabs.getByRole("tab", { name: /안내기 고장/ })).toBeInTheDocument();
    expect(tabs.getByRole("tab", { name: /버스 이용 불편/ })).toBeInTheDocument();
    // 노선 요청은 0건이지만 무엇을 받을 수 있는지 보여야 하므로 남는다.
    expect(tabs.getByRole("tab", { name: /노선 요청\s*0건/ })).toBeInTheDocument();
  });

  it("유형별 건수를 함께 보여준다", () => {
    const utils = render(<Dashboard />);
    const tabs = kindTabs(utils);
    expect(tabs.getByRole("tab", { name: /전체\s*4건/ })).toBeInTheDocument();
    expect(tabs.getByRole("tab", { name: /정류장 시설\s*1건/ })).toBeInTheDocument();
    expect(tabs.getByRole("tab", { name: /미분류\s*1건/ })).toBeInTheDocument();
  });

  it("유형을 고르면 그 유형의 제보만 목록에 남는다", () => {
    const utils = render(<Dashboard />);
    fireEvent.click(kindTabs(utils).getByRole("tab", { name: /안내기 고장/ }));
    expect(utils.getByText("안내 화면이 꺼졌어요")).toBeInTheDocument();
    expect(utils.queryByText("의자가 파손됐어요")).toBeNull();
    expect(utils.queryByText("옛 제보입니다")).toBeNull();
  });

  it("유형이 없는 옛 제보는 4유형 어디에도 섞이지 않고 미분류에만 남는다", () => {
    const utils = render(<Dashboard />);
    const tabs = kindTabs(utils);
    for (const label of ["정류장 시설", "안내기 고장", "버스 이용 불편", "노선 요청"]) {
      fireEvent.click(tabs.getByRole("tab", { name: new RegExp(label) }));
      expect(utils.queryByText("옛 제보입니다")).toBeNull();
    }
    fireEvent.click(tabs.getByRole("tab", { name: /미분류/ }));
    expect(utils.getByText("옛 제보입니다")).toBeInTheDocument();
  });

  it("유형을 고르면 처리 현황도 그 유형 기준으로 센다", () => {
    const utils = render(<Dashboard />);
    fireEvent.click(kindTabs(utils).getByRole("tab", { name: /버스 이용 불편/ }));
    const flow = within(utils.getByRole("group", { name: "처리 상태별 제보 목록" }));
    expect(flow.getByRole("button", { name: /^접수\s*0건/ })).toBeInTheDocument();
    expect(flow.getByRole("button", { name: /^담당 배정\s*1건/ })).toBeInTheDocument();
    // 고른 유형의 건수는 목록 범위 버튼 한 곳에서만 센다(같은 숫자를 여러 번 찍지 않는다).
    expect(within(utils.getByRole("group", { name: "목록 범위 선택" })).getByRole("button", { name: /^버스 이용 불편\s*1건/ })).toBeInTheDocument();
  });

  it("유형에 맞는 담당 접수처를 보여준다", () => {
    const utils = render(<Dashboard />);
    const tabs = kindTabs(utils);
    fireEvent.click(tabs.getByRole("tab", { name: /정류장 시설/ }));
    expect(utils.getByText("춘천시 교통과 교통시설팀 033-250-3316")).toBeInTheDocument();
    fireEvent.click(tabs.getByRole("tab", { name: /노선 요청/ }));
    expect(utils.getByText("춘천시 교통과 버스팀 033-250-3938")).toBeInTheDocument();
  });

  it("버스 이용 불편은 목록 화면에서 운수회사를 단정하지 않는다", () => {
    const utils = render(<Dashboard />);
    fireEvent.click(kindTabs(utils).getByRole("tab", { name: /버스 이용 불편/ }));
    expect(utils.getByText(/정류장에 따라 다름/)).toBeInTheDocument();
    expect(utils.queryByText(/춘천시민버스/)).toBeNull();
  });

  it("선택 상태를 색이 아니라 aria-selected 로도 알린다", () => {
    const utils = render(<Dashboard />);
    const tabs = kindTabs(utils);
    expect(tabs.getByRole("tab", { name: /전체/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(tabs.getByRole("tab", { name: /정류장 시설/ }));
    expect(tabs.getByRole("tab", { name: /정류장 시설/ })).toHaveAttribute("aria-selected", "true");
    expect(tabs.getByRole("tab", { name: /전체/ })).toHaveAttribute("aria-selected", "false");
  });

  it("목록 각 행에 시민이 고른 유형을 표시한다", () => {
    const utils = render(<Dashboard />);
    const row = utils.getByRole("row", { name: "춘천역 의자가 파손됐어요 상세 보기" });
    expect(within(row).getByText("정류장 시설")).toBeInTheDocument();
    const oldRow = utils.getByRole("row", { name: "석사동 옛 제보입니다 상세 보기" });
    expect(within(oldRow).getByText("미분류")).toBeInTheDocument();
  });

  it("검토 모달의 '유형'은 목록과 같은 값(시민이 고른 유형)을 쓴다", () => {
    const utils = render(<Dashboard />);
    fireEvent.click(utils.getByRole("row", { name: "후평동 기사님이 불친절했어요 상세 보기" }));
    const modal = within(utils.getByRole("dialog", { name: "제보 검토" }));
    const kindRow = modal.getByText("유형").parentElement as HTMLElement;
    expect(within(kindRow).getByText("버스 이용 불편")).toBeInTheDocument();
    // 문구에서 뽑은 값은 '유형'이 아니라 추정으로만 남긴다.
    expect(modal.getByText("내용 추정")).toBeInTheDocument();
  });

  it("건수 0인 유형을 고르면 제보가 없다고 뭉뚱그리지 않는다", () => {
    const utils = render(<Dashboard />);
    fireEvent.click(kindTabs(utils).getByRole("tab", { name: /노선 요청/ }));
    expect(utils.getByText("노선 요청 제보가 없습니다")).toBeInTheDocument();
    expect(utils.queryByText("아직 접수된 제보가 없습니다")).toBeNull();
  });

  it("처리 상태 저장이 실패하면 화면을 날리지 않고 실패를 알린다", () => {
    const utils = render(<Dashboard />);
    fireEvent.click(utils.getByRole("row", { name: "춘천역 의자가 파손됐어요 상세 보기" }));
    const modal = within(utils.getByRole("dialog", { name: "제보 검토" }));
    modal.getAllByRole("checkbox").forEach((box) => fireEvent.click(box));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("가득 참", "QuotaExceededError");
    });

    fireEvent.click(modal.getByRole("button", { name: "접수 확인" }));

    expect(modal.getByRole("alert")).toHaveTextContent("처리 상태를 저장하지 못했습니다");
    expect(utils.getByRole("dialog", { name: "제보 검토" })).toBeInTheDocument();
    vi.restoreAllMocks();
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
