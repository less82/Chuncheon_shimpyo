import type { StopsFile } from "../types/stop";

const PRIMARY = "/data/stops.json";
const FALLBACK = "/data/stops.sample.json";

async function fetchStopsFile(url: string): Promise<StopsFile> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  return (await res.json()) as StopsFile;
}

/**
 * 실데이터(`/data/stops.json`)를 읽고, 없거나 실패하면
 * 샘플(`/data/stops.sample.json`)로 폴백한다.
 * 둘 다 실패하면 예외를 전파한다.
 */
export async function loadStops(): Promise<StopsFile> {
  try {
    return await fetchStopsFile(PRIMARY);
  } catch {
    return await fetchStopsFile(FALLBACK);
  }
}
