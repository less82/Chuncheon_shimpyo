import type { Stop } from "../types/stop";

export interface RouteArrival {
  routeNo: string;
  min: number;
  seq: number; // 남은 정류장 수(arrprevstationcnt)
}

export interface Arrival {
  text: string;
  live: boolean;
  byRoute?: RouteArrival[];
}

const TIMEOUT_MS = 2500;
const DEFAULT_HEADWAY = 15;

/** 배차간격 폴백 문구. 실시간 도착정보가 없을 때 항상 이 값을 즉시 보여준다. */
export function headwayFallback(stop: Stop): Arrival {
  const min = stop.headwayMin ?? DEFAULT_HEADWAY;
  return { text: `배차간격 약 ${min}분`, live: false };
}

function arrivalText(min: number): string {
  return min <= 0 ? "곧 도착" : `약 ${min}분 후 도착`;
}

function firstTag(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m ? m[1].trim() : null;
}

/**
 * TAGO 도착정보 XML 응답 파싱. <item> 블록별로 노선/도착시간/남은정류장을
 * 뽑아 byRoute 로 정리한다. item 이 없으면 단일 <arrtime> 만이라도 파싱한다.
 * routeNo 가 주어지면 해당 노선 우선으로 대표 문구를 만든다.
 */
export function parseTagoArrival(
  xml: string,
  routeNo?: string,
): Arrival | null {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g);
  const byRoute: RouteArrival[] = [];

  if (items) {
    for (const block of items) {
      const arrtime = Number(firstTag(block, "arrtime"));
      if (!Number.isFinite(arrtime)) continue;
      byRoute.push({
        routeNo: firstTag(block, "routeno") ?? "",
        min: Math.max(0, Math.round(arrtime / 60)),
        seq: Number(firstTag(block, "arrprevstationcnt") ?? "0") || 0,
      });
    }
  } else {
    const m = xml.match(/<arrtime>(\d+)<\/arrtime>/);
    if (m && Number.isFinite(Number(m[1]))) {
      byRoute.push({
        routeNo: firstTag(xml, "routeno") ?? "",
        min: Math.max(0, Math.round(Number(m[1]) / 60)),
        seq: Number(firstTag(xml, "arrprevstationcnt") ?? "0") || 0,
      });
    }
  }

  if (byRoute.length === 0) return null;
  byRoute.sort((a, b) => a.min - b.min);

  const rep =
    (routeNo && byRoute.find((r) => r.routeNo === routeNo)) || byRoute[0];
  return { text: arrivalText(rep.min), live: true, byRoute };
}

/**
 * 정류장 도착정보. `stop.tagoNodeId` 와 `VITE_TAGO_KEY` 가 모두 있으면 TAGO
 * 실시간 도착 API를 2.5초 타임아웃으로 시도하고, 하나라도 없거나
 * 실패/타임아웃/파싱실패면 즉시 배차간격 폴백 문구를 반환한다.
 * 어떤 경우에도 무한 대기하지 않는다(무한 스피너 금지).
 */
export async function getArrival(
  stop: Stop,
  routeNo?: string,
): Promise<Arrival> {
  const key = import.meta.env.VITE_TAGO_KEY as string | undefined;
  if (!key || !stop.tagoNodeId) return headwayFallback(stop);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url =
      "https://apis.data.go.kr/1613000/ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList" +
      `?serviceKey=${encodeURIComponent(key)}` +
      "&_type=xml&numOfRows=20" +
      `&nodeId=${encodeURIComponent(stop.tagoNodeId)}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return headwayFallback(stop);
    const body = await res.text();
    const parsed = parseTagoArrival(body, routeNo);
    return parsed ?? headwayFallback(stop);
  } catch {
    return headwayFallback(stop);
  } finally {
    clearTimeout(timer);
  }
}
