// 대안 정류장 안내 — 보조(P1). 조건을 전부 만족할 때만 '은은한 한 줄'로 뜨고,
// 아니면 아무것도 그리지 않는다(null). 주인공 UI(카드·지도)를 침범하지 않는다.

import type { Stop } from "../../types/stop";
import { Footprints } from "lucide-react";
import type { Arrival } from "../../lib/arrivals";
import { useStops } from "../../store/useStops";
import { suggestAlt, describeAlt } from "./altStop";

interface Props {
  stop: Stop;
  arrival: Arrival;
}

/**
 * 도착정보에서 '몇 분 뒤'를 숫자로 뽑는다.
 * - 실시간이고 '곧 도착' → 0 (임박 → 제안 숨김 유도).
 * - 실시간 "약 N분 후 도착" → N.
 * - 폴백(실시간 아님)이면 임박 여부를 알 수 없으므로 배차간격으로 둔다
 *   (곧도착 숨김이 잘못 발동하지 않도록 — 배차는 항상 도보의 2배 이상).
 */
function arrivalMinutes(arrival: Arrival, stop: Stop): number {
  if (arrival.live) {
    if (arrival.text.includes("곧")) return 0;
    const m = arrival.text.match(/(\d+)\s*분/);
    if (m) return Number(m[1]);
  }
  return stop.headwayMin ?? 15;
}

export default function AltStopHint({ stop, arrival }: Props) {
  const stops = useStops((s) => s.stops);
  const alt = suggestAlt(stop, stops, arrivalMinutes(arrival, stop));
  if (!alt) return null;

  const hint = describeAlt(stop, alt);
  const facilityText = hint.facilities.join("과 ");

  return (
    <p className="stopcard__alt" aria-label="대안 정류장 안내">
      <Footprints width={20} height={20} aria-hidden="true" />
      <span>
        걸어서 {hint.walkMin}분 거리 <b>{alt.name}</b> 정류장에 {facilityText}가
        있습니다{hint.route ? ` (같은 ${hint.route}번 버스)` : ""}
      </span>
    </p>
  );
}
