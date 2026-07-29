// 모든 네트워크 호출은 타임아웃과 실패 폴백을 가져야 한다(무한 스피너 금지).
// arrivals.ts / vehicles.ts 가 쓰는 AbortController 패턴을 한 곳에 모은 헬퍼다.

/** 기본 타임아웃(밀리초). 저장소 공통 규칙 값이다. */
export const FETCH_TIMEOUT_MS = 2500;

/**
 * 2.5초(기본) 안에 응답이 없으면 중단하는 fetch.
 * 중단되면 fetch 가 던지는 예외를 그대로 전파하므로 호출측이 폴백을 정한다.
 */
export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
