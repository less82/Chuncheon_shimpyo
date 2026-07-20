// 2단계 시설별 "예산 시뮬레이터" — 단가(가정)를 입력하면 예산 내 커버 정류장 수와
// 표본기간 한낮 승차 합계를 보여준다. "수혜"·"일평균" 표현은 절대 쓰지 않는다.

import { useMemo, useState } from "react";
import { simulate } from "./budgetSimulate";
import type { InstallRow } from "../../types/priority";
import "./BudgetSim.css";

interface Props {
  rows: InstallRow[];
  facilityLabel: string; // 예: "의자"
}

const DEFAULT_BUDGET_MANWON = 1000;
const DEFAULT_UNIT_COST_MANWON = 80;

export default function BudgetSim({ rows, facilityLabel }: Props) {
  const [budget, setBudget] = useState(DEFAULT_BUDGET_MANWON);
  const [unitCost, setUnitCost] = useState(DEFAULT_UNIT_COST_MANWON);

  const result = useMemo(
    () => simulate(rows, budget, unitCost),
    [rows, budget, unitCost],
  );

  return (
    <div className="budgetsim" aria-label={`${facilityLabel} 예산 시뮬레이터`}>
      <h3 className="budgetsim-h3">예산 시뮬레이터 — {facilityLabel}</h3>
      <div className="budgetsim-inputs">
        <label className="budgetsim-field">
          <span>예산 (만원)</span>
          <input
            type="number"
            min={0}
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
          />
        </label>
        <label className="budgetsim-field">
          <span>
            단가 (만원) <em className="budgetsim-assume">가정, 편집 가능</em>
          </span>
          <input
            type="number"
            min={0}
            value={unitCost}
            onChange={(e) => setUnitCost(Number(e.target.value))}
          />
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="budgetsim-empty">설치 검토 대상이 없어 시뮬레이션할 수 없습니다.</p>
      ) : (
        <p className="budgetsim-result">
          대상 정류장 <strong>{result.covered.toLocaleString()}곳</strong> / 표본기간(2025.6,
          4일) 한낮 승차 합계 <strong>{result.dailyBoardings.toLocaleString()}건</strong>{" "}
          (양방향 합산, 수요 미확인 {result.unmeasuredCount.toLocaleString()}곳 별도)
        </p>
      )}
    </div>
  );
}
