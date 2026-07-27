import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { REPORT_STORAGE_KEY } from "../report/reportStore";
import MaengCoco from "./MaengCoco";

const result = {
  verdict: "damage_suspected",
  label: "side_glass_damage",
  label_display: "버스 정류장 외벽 유리",
  threshold: 0.15,
  damage_threshold: 0.22,
  detections: [
    {
      confidence: 0.6408,
      xyxy: [10, 20, 300, 240],
      label: "side_glass_damage",
      label_display: "버스 정류장 외벽 유리",
    },
  ],
  annotated_image: "data:image/jpeg;base64,ZmFrZQ==",
  notice: "시험용 모델",
};

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:preview"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("<MaengCoco>", () => {
  it("사진을 선택해 검사 API를 호출하고 파손 의심 결과를 표시한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => result,
    });
    vi.stubGlobal("fetch", fetchMock);

    const screen = render(
      <MemoryRouter>
        <MaengCoco />
      </MemoryRouter>,
    );
    const file = new File(["image"], "damaged.jpg", { type: "image/jpeg" });

    fireEvent.change(screen.getByLabelText(/정류장 사진 넣기/), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "검사 시작" }));

    expect(
      await screen.findByText(
        "(버스 정류장 외벽 유리) 파손이 확인되었습니다.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("접수하시겠습니까? · 1개 영역 · 신뢰도 64%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다른 사진" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "확인" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/maeng-coco?threshold=0.15",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "image/jpeg" },
        body: file,
      }),
    );
  });

  it("확인하면 사진과 AI 라벨을 어드민 접수로 전송한다", async () => {
    const report = {
      id: "maeng-coco-r1",
      stopId: "unidentified:maeng-coco-r1",
      stopNo: "미확인",
      stopName: "정류장 위치 미확인",
      issue: "(버스 정류장 외벽 유리) 파손이 확인되었습니다.",
      createdAt: "2026-07-27T01:00:00.000Z",
      status: "received",
      source: "maeng_coco",
      modelLabel: "side_glass_damage",
      modelLabelDisplay: "버스 정류장 외벽 유리",
      modelConfidence: 0.6408,
      detectionCount: 1,
      photoDataUrl: result.annotated_image,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => result })
      .mockResolvedValueOnce({ ok: true, json: async () => report });
    vi.stubGlobal("fetch", fetchMock);
    const screen = render(
      <MemoryRouter>
        <MaengCoco />
      </MemoryRouter>,
    );
    const file = new File(["image"], "damaged.jpg", { type: "image/jpeg" });

    fireEvent.change(screen.getByLabelText(/정류장 사진 넣기/), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "검사 시작" }));
    fireEvent.click(await screen.findByRole("button", { name: "확인" }));

    expect(await screen.findByText("어드민으로 접수되었습니다")).toBeInTheDocument();
    expect(localStorage.getItem(REPORT_STORAGE_KEY)).toContain("maeng-coco-r1");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:8000/api/maeng-coco/reports",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    const request = fetchMock.mock.calls[1][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      label: "side_glass_damage",
      label_display: "버스 정류장 외벽 유리",
      source_file_name: "damaged.jpg",
      confidence: 0.6408,
      detections: [{
        label: "side_glass_damage",
        label_display: "버스 정류장 외벽 유리",
      }],
    });
  });

  it("낮은 신뢰도 후보도 사람이 확인해 어드민으로 접수할 수 있다", async () => {
    const reviewResult = {
      ...result,
      verdict: "review_required",
      detections: [
        {
          confidence: 0.2,
          xyxy: [5, 10, 120, 220],
          label: "side_glass_damage",
          label_display: "버스 정류장 외벽 유리",
        },
        {
          confidence: 0.18,
          xyxy: [130, 15, 300, 230],
          label: "side_glass_damage",
          label_display: "버스 정류장 외벽 유리",
        },
      ],
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => reviewResult,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "maeng-coco-review",
          stopId: "unidentified:maeng-coco-review",
          stopNo: "미확인",
          stopName: "정류장 위치 미확인",
          issue: "(버스 정류장 외벽 유리) 파손이 확인되었습니다.",
          createdAt: "2026-07-27T02:00:00.000Z",
          status: "received",
          source: "maeng_coco",
          modelLabel: "side_glass_damage",
          modelLabelDisplay: "버스 정류장 외벽 유리",
          modelConfidence: 0.2,
          detectionCount: 2,
          photoDataUrl: reviewResult.annotated_image,
        }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const screen = render(
      <MemoryRouter>
        <MaengCoco />
      </MemoryRouter>,
    );
    const file = new File(["image"], "review.jpg", { type: "image/jpeg" });

    fireEvent.change(screen.getByLabelText(/정류장 사진 넣기/), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "검사 시작" }));

    expect(
      await screen.findByText(
        "(버스 정류장 외벽 유리) 파손 가능성을 확인해주세요",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/2개 영역 · 신뢰도 20%/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다른 사진" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "확인" }));

    expect(await screen.findByText("어드민으로 접수되었습니다")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:8000/api/maeng-coco/reports",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("지원하지 않는 파일 형식을 검사 전에 거절한다", () => {
    const screen = render(
      <MemoryRouter>
        <MaengCoco />
      </MemoryRouter>,
    );
    const file = new File(["text"], "memo.txt", { type: "text/plain" });

    fireEvent.change(screen.getByLabelText(/정류장 사진 넣기/), {
      target: { files: [file] },
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "JPG, PNG, WEBP 사진만 선택할 수 있습니다.",
    );
    expect(screen.queryByRole("button", { name: "검사 시작" })).not.toBeInTheDocument();
  });
});
