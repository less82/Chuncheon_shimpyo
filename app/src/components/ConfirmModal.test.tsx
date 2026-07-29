import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
// Tab 순환(포커스 트랩) 검사는 아래 "모달 밖으로 포커스가 새지 않는다" 에 있다.
import { fireEvent, render } from "@testing-library/react";
import ConfirmModal from "./ConfirmModal";

/** 열고 닫는 흐름을 그대로 보려고 실제 화면처럼 여는 버튼을 하나 둔다. */
function Harness({ onConfirm }: { onConfirm?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>열기</button>
      <ConfirmModal
        open={open}
        title="이 정류장이 맞나요?"
        confirmLabel="네, 맞아요"
        cancelLabel="아니요"
        onConfirm={() => { setOpen(false); onConfirm?.(); }}
        onCancel={() => setOpen(false)}
      >
        <span>춘천역</span>
      </ConfirmModal>
    </>
  );
}

describe("<ConfirmModal>", () => {
  it("닫혀 있으면 아무것도 그리지 않는다", () => {
    const screen = render(<Harness />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("열리면 dialog 역할과 제목 연결을 갖는다", () => {
    const screen = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "열기" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("이 정류장이 맞나요?");
    expect(screen.getByText("춘천역")).toBeInTheDocument();
  });

  it("열리면 첫 버튼에 포커스가 가고 뒤 화면 스크롤을 막는다", () => {
    const screen = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "열기" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "아니요" }));
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("닫히면 스크롤과 이전 포커스를 되돌린다", () => {
    const screen = render(<Harness />);
    const opener = screen.getByRole("button", { name: "열기" });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole("button", { name: "아니요" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(opener);
  });

  it("Escape 로 닫힌다", () => {
    const screen = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "열기" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("배경을 누르면 닫히고, 모달 안을 누르면 닫히지 않는다", () => {
    const screen = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "열기" }));
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("presentation"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("확인을 누르면 onConfirm 이 불린다", () => {
    const onConfirm = vi.fn();
    const screen = render(<Harness onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "열기" }));
    fireEvent.click(screen.getByRole("button", { name: "네, 맞아요" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("Tab 이 모달 밖으로 새지 않는다 (aria-modal 선언과 동작을 맞춘다)", () => {
    const screen = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "열기" }));
    const cancel = screen.getByRole("button", { name: "아니요" });
    const confirm = screen.getByRole("button", { name: "네, 맞아요" });
    expect(document.activeElement).toBe(cancel);

    // 마지막 요소에서 Tab → 첫 요소로 돌아온다
    confirm.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(cancel);

    // 첫 요소에서 Shift+Tab → 마지막 요소로 간다
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(confirm);
  });
});
