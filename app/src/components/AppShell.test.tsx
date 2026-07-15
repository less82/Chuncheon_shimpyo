import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import AppShell from "./AppShell";

describe("AppShell", () => {
  it("자식을 app-shell 컨테이너로 감싼다", () => {
    const { container } = render(
      <AppShell>
        <p>내용</p>
      </AppShell>,
    );
    const shell = container.querySelector(".app-shell");
    expect(shell).not.toBeNull();
    expect(shell?.textContent).toContain("내용");
  });
});
