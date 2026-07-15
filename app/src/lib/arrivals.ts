import type { Stop } from "../types/stop";

export interface Arrival {
  text: string;
  live: boolean;
}

const TIMEOUT_MS = 2500;
const DEFAULT_HEADWAY = 15;

/** 배차간격 폴백 문구. 실시간 도착정보가 없을 때 항상 이 값을 즉시 보여준다. */
export function headwayFallback(stop: Stop): Arrival {
  const min = stop.headwayMin ?? DEFAULT_HEADWAY;
  return { text: `배차간격 약 ${min}분`, live: false };
}

/** TAGO 도착정보 XML 응답에서 첫 도착 예정(초)을 뽑아 사람이 읽을 문구로. */
function parseTagoArrival(xml: string): Arrival | null {
  const match = xml.match(/<arrtime>(\d+)<\/arrtime>/);
  if (!match) return null;
  const sec = Number(match[1]);
  if (!Number.isFinite(sec)) return null;
  const min = Math.max(0, Math.round(sec / 60));
  return { text: min <= 0 ? "곧 도착" : `약 ${min}분 후 도착`, live: true };
}

/**
 * 정류장 도착정보. `VITE_TAGO_KEY` 가 있으면 TAGO 실시간 도착 API를 2.5초
 * 타임아웃으로 시도하고, 키가 없거나 실패/타임아웃/파싱실패면 즉시 배차간격
 * 폴백 문구를 반환한다. 어떤 경우에도 무한 대기하지 않는다.
 */
export async function getArrival(stop: Stop): Promise<Arrival> {
  const key = import.meta.env.VITE_TAGO_KEY as string | undefined;
  if (!key) return headwayFallback(stop);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url =
      "https://apis.data.go.kr/1613000/ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList" +
      `?serviceKey=${encodeURIComponent(key)}` +
      "&_type=xml&numOfRows=1" +
      `&nodeId=${encodeURIComponent(stop.stopNo)}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return headwayFallback(stop);
    const body = await res.text();
    const parsed = parseTagoArrival(body);
    return parsed ?? headwayFallback(stop);
  } catch {
    return headwayFallback(stop);
  } finally {
    clearTimeout(timer);
  }
}
