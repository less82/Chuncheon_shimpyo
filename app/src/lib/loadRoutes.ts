import type { RoutesFile } from "../types/route";

const PRIMARY = "/data/routes.json";

/**
 * 노선 그래프(`/data/routes.json`)를 읽는다. 경로탐색 엔진 planTrip 이 소비한다.
 * 실패하면 예외를 전파(호출측이 빈 결과 폴백을 책임진다).
 */
export async function loadRoutes(): Promise<RoutesFile> {
  const res = await fetch(PRIMARY);
  if (!res.ok) throw new Error(`fetch ${PRIMARY} -> ${res.status}`);
  return (await res.json()) as RoutesFile;
}
