import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import VersionToggle from "./VersionToggle";
import { useViewMode } from "../store/useViewMode";

beforeEach(() => {
  localStorage.clear();
  useViewMode.setState({ mode: "elder" });
});

describe("VersionToggle", () => {
  it("어른용이면 '일반' 라벨을 보인다", () => {
    render(<VersionToggle />);
    expect(screen.getByRole("button")).toHaveTextContent("일반");
  });

  it("일반이면 '큰글씨' 라벨을 보인다", () => {
    useViewMode.setState({ mode: "normal" });
    render(<VersionToggle />);
    expect(screen.getByRole("button")).toHaveTextContent("큰글씨");
  });

  it("클릭하면 모드가 전환된다", () => {
    render(<VersionToggle />);
    fireEvent.click(screen.getByRole("button"));
    expect(useViewMode.getState().mode).toBe("normal");
  });
});
