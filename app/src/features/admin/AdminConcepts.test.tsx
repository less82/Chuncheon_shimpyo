import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AdminConcepts from "./AdminConcepts";

describe("<AdminConcepts>", () => {
  it("서로 다른 구조 시안 5개를 탭으로 전환한다", () => {
    const utils = render(<AdminConcepts />);
    expect(utils.getAllByRole("tab")).toHaveLength(5);
    fireEvent.click(utils.getByRole("tab", { name: "C. 단계 보드형" }));
    expect(utils.getByText("처리 완료")).toBeInTheDocument();
    fireEvent.click(utils.getByRole("tab", { name: "D. 근거 대조형" }));
    expect(utils.getByText("공식 시설자료")).toBeInTheDocument();
  });
});
