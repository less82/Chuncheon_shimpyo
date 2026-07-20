// 쉼표 정류장 — B2G "2단계 시설별 설치 검토" 엔진(설계 §3.2). 순수 함수, 부수효과 없음.
// ⚠️ B2C 전용 comfort 모듈(app/src/lib 아래)은 여기서 절대 import하지 않는다(A2 의존성 규칙).
// ⚠️ 중단 조건 1: unknown(미확인)은 설치 후보가 아니다. 대상은 status==="no" & source==="roadview"뿐이다.
//    yes(기설치)도 당연히 제외한다. no와 unknown을 같은 순위 효과로 섞지 않는다.

import type { Stop } from "../../types/stop";
import type { InstallFacilityKind, InstallRow } from "../../types/priority";
import { quantileRank, demandMiddayOf } from "./surveyPriority";

/**
 * 시설 f가 '없음(no, 로드뷰 확인)'인 정류장만 대상으로 설치 검토 순위.
 * 대상 조건: facilities[f].status==="no" AND facilities[f].source==="roadview".
 * status==="yes"(기설치)·"unknown"(미확인)은 대상에서 제외한다.
 * 순위 키 = (demand 있으면 wD·D) + (poi 있으면 wP·P), 활성 항 평균 정규화.
 *   - demand 결측 정류장은 D 제외(P만으로 순위), demandMidday=null로 배지.
 *   - poi 미제공이면 P 제외(D만).
 *   - 기본 가중치 wD=wP=1(설치 단계는 프리셋 없음 — 단순 동일 가중).
 */
export function buildInstallPriority(
  stops: Stop[],
  facility: InstallFacilityKind,
  opts?: { poiByStopId?: Map<string, number>; hourWindow?: [number, number] }
): InstallRow[] {
  const hourWindow = opts?.hourWindow ?? [11, 16];
  const poiByStopId = opts?.poiByStopId;

  const targets = stops.filter((stop) => {
    const f = stop.facilities[facility];
    return f.status === "no" && f.source === "roadview";
  });

  const demandValues = targets
    .filter((s) => !!s.demand)
    .map((s) => demandMiddayOf(s, hourWindow));

  const scored: Array<{ row: InstallRow; score: number }> = targets.map((stop) => {
    const hasDemand = !!stop.demand;
    const demandMidday = hasDemand ? demandMiddayOf(stop, hourWindow) : null;
    const demandQ = hasDemand ? quantileRank(demandValues, demandMidday as number) : null;
    const poi = poiByStopId?.get(stop.id) ?? null;

    const parts: number[] = [];
    if (demandQ !== null) parts.push(demandQ);
    if (poi !== null) parts.push(poi);
    const score = parts.length > 0 ? parts.reduce((a, b) => a + b, 0) / parts.length : 0;

    const row: InstallRow = {
      stop,
      facility,
      rank: 0, // 정렬 후 채움
      demandMidday,
      poi,
      surveySource: "roadview",
      capturedAt: stop.facilities[facility].capturedAt,
    };
    return { row, score };
  });

  scored.sort((a, b) => b.score - a.score);
  scored.forEach(({ row }, i) => {
    row.rank = i + 1;
  });

  return scored.map(({ row }) => row);
}
