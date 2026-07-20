// 보호자 대리등록 — 즐겨찾기 공유 URL.
// 보안 원칙: 들어온 fav 파라미터는 반드시 "로드된 stop.id 화이트리스트"와
// 교집합만 통과시킨다. 임의 문자열(<script> 등)은 화이트리스트에 없으므로 제거된다.

const PARAM = "fav";
export const QR_ENTRY_PATH = "/qr_main";
const QR_FROM_PARAM = "from";

/** 즐겨찾기 id 목록으로 공유 URL 을 만든다(`?fav=id1,id2`). */
export function buildShareUrl(ids: string[]): string {
  const origin =
    typeof location !== "undefined" ? location.origin : "https://localhost";
  const clean = ids.map((id) => encodeURIComponent(id)).filter(Boolean);
  if (clean.length === 0) return `${origin}/app`;
  return `${origin}/app?${PARAM}=${clean.join(",")}`;
}

/** 정류장에 부착할 QR URL. 스캔한 정류장을 출발지로 고정한다. */
export function buildQrEntryUrl(stopId: string): string {
  const origin =
    typeof location !== "undefined" ? location.origin : "https://localhost";
  return `${origin}${QR_ENTRY_PATH}?${QR_FROM_PARAM}=${encodeURIComponent(stopId)}`;
}

/** QR URL에서 실제 데이터에 존재하는 출발 정류장 ID만 반환한다. */
export function parseQrStopId(text: string, validIds: Iterable<string>): string | null {
  const whitelist = validIds instanceof Set ? validIds : new Set(validIds);
  try {
    const url = new URL(text, "https://localhost");
    if (url.pathname !== QR_ENTRY_PATH) return null;
    const id = url.searchParams.get(QR_FROM_PARAM);
    return id && whitelist.has(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * 공유 URL 의 검색 문자열에서 유효한 즐겨찾기 id 만 추출한다.
 * validIds(로드된 stops 의 id 집합)에 실제로 존재하는 값만 통과 — 주입/XSS 방어.
 */
export function parseShareParam(
  search: string,
  validIds: Iterable<string>,
): string[] {
  const whitelist = validIds instanceof Set ? validIds : new Set(validIds);
  let raw: string | null = null;
  try {
    raw = new URLSearchParams(search).get(PARAM);
  } catch {
    raw = null;
  }
  if (!raw) return [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    let id = part.trim();
    try {
      id = decodeURIComponent(id);
    } catch {
      continue; // 잘못된 인코딩은 폐기
    }
    if (!id || seen.has(id)) continue;
    if (!whitelist.has(id)) continue; // 화이트리스트 교집합만
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * 스캔된 QR 텍스트에서 유효한 즐겨찾기 id 만 추출한다.
 * 우리 QR 은 buildShareUrl → `.../?fav=id1,id2` 형태. 전체 URL 도, 검색문자열도 허용한다.
 * 임의의 QR(우리 형식 아님)은 fav 파라미터가 없어 [] 를 반환한다.
 * 최종 통과는 parseShareParam 의 화이트리스트(로드된 stop.id) 교집합 — 주입/XSS 방어 동일.
 */
export function extractFavIdsFromScan(
  text: string,
  validIds: Iterable<string>,
): string[] {
  if (!text) return [];
  let search: string;
  try {
    search = new URL(text).search; // 전체 URL 이면 검색문자열만 사용
  } catch {
    const q = text.indexOf("?");
    search = q >= 0 ? text.slice(q) : text; // '?fav=...' 또는 'fav=...' 로 간주
  }
  return parseShareParam(search, validIds);
}
