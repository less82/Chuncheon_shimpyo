import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import type { FacilityInfo } from "../types/stop";
import FacilityBadge from "./FacilityBadge";

const info = (partial: Partial<FacilityInfo>): FacilityInfo => ({
  status: "unknown",
  source: "none",
  ...partial,
});

describe("<FacilityBadge>", () => {
  it("미확인 상태를 '미확인' + 시설명으로 렌더한다", () => {
    const { getByText } = render(
      <FacilityBadge kind="shade" info={info({ status: "unknown" })} />,
    );
    expect(getByText("그늘")).toBeInTheDocument();
    expect(getByText("미확인")).toBeInTheDocument();
  });

  it("로드뷰 출처는 '로드뷰 확인 (촬영 2026.03)' 배지를 보여준다", () => {
    const { getByText } = render(
      <FacilityBadge
        kind="seat"
        info={info({ status: "yes", source: "roadview", capturedAt: "2026.03" })}
      />,
    );
    expect(getByText("로드뷰 확인 (촬영 2026.03)")).toBeInTheDocument();
  });

  it("상태별 색상 데이터 속성 yes=green / no=red / unknown=gray", () => {
    const { container: yes } = render(
      <FacilityBadge kind="light" info={info({ status: "yes" })} />,
    );
    const { container: no } = render(
      <FacilityBadge kind="light" info={info({ status: "no" })} />,
    );
    const { container: unk } = render(
      <FacilityBadge kind="light" info={info({ status: "unknown" })} />,
    );
    expect(yes.querySelector('[data-color="green"]')).not.toBeNull();
    expect(no.querySelector('[data-color="red"]')).not.toBeNull();
    expect(unk.querySelector('[data-color="gray"]')).not.toBeNull();
  });

  it("어떤 상태에서도 금지 문구가 화면에 없다", () => {
    const forbidden = "현장" + " " + "확인"; // 리터럴 회피(코드베이스 grep 0건 유지)
    for (const status of ["yes", "no", "unknown"] as const) {
      const { container } = render(
        <FacilityBadge
          kind="sign"
          info={info({ status, source: "roadview", capturedAt: "2026.03" })}
        />,
      );
      expect(container.textContent).not.toContain(forbidden);
    }
  });
});
