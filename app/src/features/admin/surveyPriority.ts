// 쉼표 정류장 — B2G "1단계 조사 검토 순서" 엔진(설계 §3.1). 순수 함수, 부수효과 없음.
// ⚠️ B2C 전용 comfort 모듈(app/src/lib 아래)은 여기서 절대 import하지 않는다(A2 의존성 규칙). UNK는 직접 센다.
// ⚠️ 미확인(unknown)과 확인된 없음(no)을 같은 변수로 섞지 않는다. UNK는 오직 status==="unknown" 개수.
// 수요는 항상 "양방향 합산" 실측(stop.demand) 전제.

import type { Stop } from "../../types/stop";
import type { NoDemandCandidate, PresetKey, SurveyRow, SurveyWeights } from "../../types/priority";
import { PRESETS } from "../../types/priority";

const FACILITY_KEYS = ["shade", "seat", "light", "sign"] as const;

/** [0,1] 분위수. 극단값에 강건(min-max 아님). 동점은 평균 순위 처리. */
export function quantileRank(values: number[], v: number): number {
  const n = values.length;
  if (n === 0) return 0;
  if (n === 1) return values[0] === v ? 0 : v > values[0] ? 1 : 0;

  const sorted = [...values].sort((a, b) => a - b);
  // v보다 작은 값의 개수, v와 같은 값의 개수 → 동점은 평균 순위(중간)
  let lessCount = 0;
  let equalCount = 0;
  for (const x of sorted) {
    if (x < v) lessCount++;
    else if (x === v) equalCount++;
  }
  const avgRankIndex = lessCount + (equalCount - 1) / 2; // 0-based 평균 순위
  return avgRankIndex / (n - 1);
}

function unknownCountOf(stop: Stop): number {
  let count = 0;
  for (const key of FACILITY_KEYS) {
    if (stop.facilities[key].status === "unknown") count++;
  }
  return count;
}

export function demandMiddayOf(stop: Stop, hourWindow: [number, number]): number {
  if (!stop.demand) return 0;
  const [start, end] = hourWindow;
  let sum = 0;
  for (let h = start; h <= end; h++) {
    sum += stop.demand.byHour[h] ?? 0;
  }
  return sum;
}

/**
 * 설계 §3.1: score = ( w.demand·D + w.unknown·UNK [+ w.poi·P] ) / Σ(활성 w)
 * 수요 실측(stop.demand) 있는 정류장만 ranked에. demand 없으면 noDemand로 분리(결측 재정규화 금지).
 * UI 표기는 "조사 검토 순서"(score는 내부 계산용 명칭).
 */
export function buildSurveyPriority(
  stops: Stop[],
  w: SurveyWeights,
  opts?: { poiByStopId?: Map<string, number>; hourWindow?: [number, number] }
): { ranked: SurveyRow[]; noDemand: NoDemandCandidate[] } {
  const hourWindow = opts?.hourWindow ?? [11, 16];
  const poiByStopId = opts?.poiByStopId;

  const withDemand: Stop[] = [];
  const noDemand: NoDemandCandidate[] = [];
  for (const stop of stops) {
    if (stop.demand) {
      withDemand.push(stop);
    } else {
      noDemand.push({ stop, unknownCount: unknownCountOf(stop) });
    }
  }

  const middayValues = withDemand.map((s) => demandMiddayOf(s, hourWindow));
  const demandQuantileByValue = new Map<number, number>();
  const sortedMidday = [...middayValues].sort((a, b) => a - b);
  for (let i = 0; i < sortedMidday.length;) {
    let end = i + 1;
    while (end < sortedMidday.length && sortedMidday[end] === sortedMidday[i]) end++;
    const quantile = sortedMidday.length <= 1 ? 0 : (i + (end - i - 1) / 2) / (sortedMidday.length - 1);
    demandQuantileByValue.set(sortedMidday[i], quantile);
    i = end;
  }

  const rows: SurveyRow[] = withDemand.map((stop, i) => {
    const demandMidday = middayValues[i];
    const demandQ = demandQuantileByValue.get(demandMidday) ?? 0;
    const unknownCount = unknownCountOf(stop);
    const unknownRate = unknownCount / 4;
    const poi = poiByStopId?.get(stop.id) ?? null;

    const denom = w.demand + w.unknown + (poi !== null ? w.poi : 0);
    const num = w.demand * demandQ + w.unknown * unknownRate + (poi !== null ? w.poi * poi : 0);
    const score = denom > 0 ? num / denom : 0;

    const contributions: Array<{ reason: SurveyRow["leadReason"]; value: number }> = [
      { reason: "demand", value: w.demand * demandQ },
      { reason: "unknown", value: w.unknown * unknownRate },
      ...(poi !== null ? [{ reason: "poi" as const, value: w.poi * poi }] : []),
    ];
    const leadReason = contributions.reduce((max, c) => (c.value > max.value ? c : max)).reason;

    return {
      stop,
      rank: 0, // 정렬 후 채움
      score,
      demandMidday,
      demandQ,
      unknownCount,
      unknownRate,
      poi,
      leadReason,
    };
  });

  rows.sort((a, b) => b.score - a.score);
  rows.forEach((row, i) => {
    row.rank = i + 1;
  });

  return { ranked: rows, noDemand };
}

/**
 * 프리셋별 순위 안정성(발표 명칭은 "정책 시나리오 비교" — 세 프리셋은 팀이 정한
 * 세 점일 뿐 통계적 변동폭 분석이 아니므로 다른 명칭으로 부르지 않는다).
 * 각 정류장이 프리셋 3종 각각의 Top10에 몇 번 들었는지 + 평균/최저/최고 순위.
 */
export function presetStability(
  stops: Stop[],
  presets: PresetKey[],
  opts?: { poiByStopId?: Map<string, number> }
): { stopId: string; topTenIn: number; avgRank: number; minRank: number; maxRank: number }[] {
  const rankByStopId = new Map<string, number[]>();
  const topTenByStopId = new Map<string, number>();

  for (const presetKey of presets) {
    const preset = PRESETS[presetKey];
    const { ranked } = buildSurveyPriority(stops, preset.w, { poiByStopId: opts?.poiByStopId });
    for (const row of ranked) {
      const id = row.stop.id;
      if (!rankByStopId.has(id)) rankByStopId.set(id, []);
      rankByStopId.get(id)!.push(row.rank);
      if (row.rank <= 10) {
        topTenByStopId.set(id, (topTenByStopId.get(id) ?? 0) + 1);
      }
    }
  }

  const result: { stopId: string; topTenIn: number; avgRank: number; minRank: number; maxRank: number }[] = [];
  for (const [stopId, ranks] of rankByStopId.entries()) {
    const avgRank = ranks.reduce((a, b) => a + b, 0) / ranks.length;
    result.push({
      stopId,
      topTenIn: topTenByStopId.get(stopId) ?? 0,
      avgRank,
      minRank: Math.min(...ranks),
      maxRank: Math.max(...ranks),
    });
  }

  return result;
}
