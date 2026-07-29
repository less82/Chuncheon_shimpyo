import type { Stop } from "../types/stop";

export interface RouteArrival {
  routeNo: string;
  min: number;
  seq: number; // 남은 정류장 수(arrprevstationcnt)
}

/**
 * 도착정보 상태 3분기.
 * - live: 실시간 응답을 받았고 대상 노선의 버스가 있다.
 * - empty: 실시간 응답을 정상으로 받았지만 지금 오는 버스가 없다.
 * - failed: 조회 실패·타임아웃·파싱실패. 이때만 실패 문구를 쓴다.
 */
export type ArrivalStatus = "live" | "empty" | "failed";

export interface Arrival {
  text: string;
  /** 실시간 조회 자체가 성공했는지. status !== "failed" 와 같다. */
  live: boolean;
  status: ArrivalStatus;
  byRoute?: RouteArrival[];
}

/** 노선명 비교용 정규화 — 공백을 지우고 뒤에 붙은 괄호 설명을 뗀다. */
export function routeNoKey(routeNo: string): string {
  return routeNo.trim().replace(/\s+/g, "").replace(/\([^)]*\)$/g, "");
}

/** 앱 노선명의 괄호 설명을 제외하고 TAGO 응답과 일치하는 도착정보만 고른다. */
export function arrivalsForRoutes(arrival: Arrival, routeNos: string[]): RouteArrival[] {
  const allowed = new Set(routeNos.map(routeNoKey));
  return (arrival.byRoute ?? [])
    .filter((item) => allowed.has(routeNoKey(item.routeNo)))
    .sort((a, b) => a.min - b.min);
}

const TIMEOUT_MS = 2500;
const DEFAULT_HEADWAY = 15;

/**
 * 실시간 조회가 실패했을 때 화면에 쓰는 고정 문구.
 * 실패를 배차간격으로 대체하지 않는다(docs/현재/04_발표.md).
 */
export const ARRIVAL_UNAVAILABLE_TEXT = "실시간 도착정보를 불러오지 못했어요";

/**
 * 조회는 성공했는데 지금 오는 버스가 없을 때의 문구.
 * '조회 실패'와 절대 같은 문구를 쓰지 않는다(심야에 거짓 실패를 말하지 않기 위함).
 */
export const ARRIVAL_EMPTY_TEXT = "지금 오는 버스가 없어요";

/**
 * 배차간격 폴백 값. 화면 문구로 그대로 쓰지 말고, 실패(status:"failed") 판정에만 쓴다.
 * (표시는 ARRIVAL_UNAVAILABLE_TEXT 로 한다.)
 */
export function headwayFallback(stop: Stop): Arrival {
  const min = stop.headwayMin ?? DEFAULT_HEADWAY;
  return { text: `배차간격 약 ${min}분`, live: false, status: "failed" };
}

/** 실시간은 정상인데 오는 버스가 없는 상태. byRoute 는 응답 원본을 그대로 남긴다. */
function emptyArrival(byRoute: RouteArrival[]): Arrival {
  return { text: ARRIVAL_EMPTY_TEXT, live: true, status: "empty", byRoute };
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
 *
 * 반환 규칙(실패와 '0대'를 구분한다):
 * - null            : 응답이 정상 TAGO 형식이 아니거나 오류코드다 → 호출측이 failed 처리.
 * - status "empty"  : 정상 응답인데 도착 예정 버스가 없다(또는 요청 노선이 응답에 없다).
 * - status "live"   : 요청 노선(없으면 최속 노선)의 도착시간을 찾았다.
 *
 * routeNo 가 주어졌는데 응답에 그 노선이 없으면 다른 노선으로 절대 대체하지 않는다.
 */
export function parseTagoArrival(
  xml: string,
  routeNo?: string,
): Arrival | null {
  // 오류 응답에도 200 이 오는 경우가 있어 resultCode 를 먼저 본다(vehicles.ts 와 같은 패턴).
  // 00 = 정상, 03 = 데이터 없음. 그 외 코드는 실패로 본다.
  const code = firstTag(xml, "resultCode");
  if (code !== null && code !== "00" && code !== "03") return null;

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

  if (byRoute.length === 0) {
    // 정상 응답임을 확인할 수 있을 때만 '0대'로 본다. 아니면 파싱실패(null).
    const responded = code !== null || /<(totalCount|items|body)\b/.test(xml);
    return responded ? emptyArrival([]) : null;
  }
  byRoute.sort((a, b) => a.min - b.min);

  // routeNo 가 지정되면 그 노선만 본다. 없으면 '0대'이지 다른 노선으로 바꿔치지 않는다.
  const wanted = routeNo ? routeNoKey(routeNo) : null;
  const rep = wanted
    ? byRoute.find((r) => routeNoKey(r.routeNo) === wanted)
    : byRoute[0];
  if (!rep) return emptyArrival(byRoute);
  return { text: arrivalText(rep.min), live: true, status: "live", byRoute };
}

/**
 * 정류장 도착정보. `stop.tagoNodeId` 와 `VITE_TAGO_KEY` 가 모두 있으면 TAGO
 * 실시간 도착 API를 2.5초 타임아웃으로 시도한다.
 * - 실패/타임아웃/파싱실패/오류코드 → status "failed"
 * - 정상 응답인데 (요청 노선의) 도착 예정 버스가 없음 → status "empty"
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
      "&_type=xml&numOfRows=20&cityCode=32010" +
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
