import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MaengCoco from "./MaengCoco";

const result = {
  verdict: "damage_suspected",
  threshold: 0.5,
  detections: [
    { confidence: 0.6408, xyxy: [10, 20, 300, 240] },
  ],
  annotated_image: "data:image/jpeg;base64,ZmFrZQ==",
  notice: "시험용 모델",
};

beforeEach(() => {
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

    expect(await screen.findByText("파손 의심 영역이 있습니다")).toBeInTheDocument();
    expect(screen.getByText("1개 영역 · 최고 신뢰도 64%")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/maeng-coco?threshold=0.5",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "image/jpeg" },
        body: file,
      }),
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
