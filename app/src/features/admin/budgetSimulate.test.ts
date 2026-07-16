import { describe, it, expect } from "vitest";
import { simulate, type BudgetableRow } from "./budgetSimulate";

function row(demandMidday: number | null): BudgetableRow {
  return { demandMidday };
}

describe("simulate (예산 시뮬레이터)", () => {
  it("예산 300 · 단가 80 → covered 3 (floor(300/80)=3)", () => {
    const rows = [row(10), row(20), row(30), row(40), row(50)];
    const result = simulate(rows, 300, 80);
    expect(result.covered).toBe(3);
    expect(result.coveredStops).toHaveLength(3);
  });

  it("dailyBoardings는 커버된 곳의 demandMidday 실측 합과 일치", () => {
    const rows = [row(10), row(20), row(30)];
    const result = simulate(rows, 300, 80); // covered 3
    expect(result.dailyBoardings).toBe(10 + 20 + 30);
  });

  it("수요 미확인(demandMidday=null) 정류장은 합계 제외, unmeasuredCount로 별도 카운트", () => {
    const rows = [row(10), row(null), row(30), row(null)];
    const result = simulate(rows, 400, 100); // covered 4
    expect(result.covered).toBe(4);
    expect(result.dailyBoardings).toBe(40); // 10+30만 합산
    expect(result.unmeasuredCount).toBe(2);
  });

  it("예산이 rows.length를 초과해도 covered는 rows.length를 넘지 않는다", () => {
    const rows = [row(1), row(2)];
    const result = simulate(rows, 100000, 10);
    expect(result.covered).toBe(2);
  });

  it("단가 0 이하면 covered 0", () => {
    const rows = [row(1), row(2)];
    const result = simulate(rows, 300, 0);
    expect(result.covered).toBe(0);
  });
});
