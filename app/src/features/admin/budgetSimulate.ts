// 쉼표 정류장 — B2G "시설별 예산 시뮬레이터" 순수 로직(설계 §3.2 보조).
// 우선순위 정렬된 행(rows)을 상위부터 예산이 소진될 때까지 커버한다.
// ⚠️ 수요 미확인(demandMidday === null) 정류장은 합계에서 제외하고 별도 카운트한다("일평균"·"수혜" 명칭 금지 — 표기는 컴포넌트 쪽 책임).

export interface BudgetableRow {
  demandMidday: number | null;
}

export interface BudgetResult<T extends BudgetableRow> {
  /** 예산으로 커버 가능한 정류장 수. */
  covered: number;
  /** 커버되는 상위 정류장 행(입력 순서 유지). */
  coveredStops: T[];
  /** 커버된 곳 중 수요 실측(demandMidday)이 있는 것들의 합("표본기간 한낮 승차 합계"). */
  dailyBoardings: number;
  /** 커버된 곳 중 수요 미확인(demandMidday===null) 개수 — 합계에서 제외되어 별도 표기. */
  unmeasuredCount: number;
}

/**
 * rows(우선순위 정렬됨) 상위부터 예산 소진까지 커버.
 * covered = min(floor(budgetManwon / unitCostManwon), rows.length)
 * coveredStops = 상위 covered개.
 * dailyBoardings = coveredStops 중 demandMidday 있는 것의 합(수요 미확인 곳은 합산 제외, 별도 카운트).
 */
export function simulate<T extends BudgetableRow>(
  rows: T[],
  budgetManwon: number,
  unitCostManwon: number,
): BudgetResult<T> {
  const covered =
    unitCostManwon > 0
      ? Math.min(Math.floor(budgetManwon / unitCostManwon), rows.length)
      : 0;
  const coveredStops = rows.slice(0, Math.max(0, covered));

  let dailyBoardings = 0;
  let unmeasuredCount = 0;
  for (const row of coveredStops) {
    if (row.demandMidday === null || row.demandMidday === undefined) {
      unmeasuredCount++;
    } else {
      dailyBoardings += row.demandMidday;
    }
  }

  return { covered: coveredStops.length, coveredStops, dailyBoardings, unmeasuredCount };
}
