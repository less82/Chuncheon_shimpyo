// 보호자 대리등록 — 즐겨찾기 공유 URL.
// 보안 원칙: 들어온 fav 파라미터는 반드시 "로드된 stop.id 화이트리스트"와
// 교집합만 통과시킨다. 임의 문자열(<script> 등)은 화이트리스트에 없으므로 제거된다.

const PARAM = "fav";

/** 즐겨찾기 id 목록으로 공유 URL 을 만든다(`?fav=id1,id2`). */
export function buildShareUrl(ids: string[]): string {
  const origin =
    typeof location !== "undefined" ? location.origin : "https://localhost";
  const clean = ids.map((id) => encodeURIComponent(id)).filter(Boolean);
  if (clean.length === 0) return `${origin}/`;
  return `${origin}/?${PARAM}=${clean.join(",")}`;
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
