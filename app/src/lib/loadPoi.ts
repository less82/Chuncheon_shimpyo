const PRIMARY = "/data/poi.json";

/**
 * 생활지원시설 인접도(`/data/poi.json`)를 읽어 `{관리번호: 0~1}`을
 * `Map<string, number>`로 변환한다.
 *
 * 파일 부재(404)·네트워크 실패·파싱 실패 시 모두 빈 Map을 반환한다(throw 금지).
 * 이 경우 쉼표지수 P 항(생활지원시설 인접도)은 자동으로 비활성화된다
 * (호출측 buildSurveyPriority가 빈 Map을 받아도 정상 동작해야 한다).
 */
export async function loadPoi(): Promise<Map<string, number>> {
  try {
    const res = await fetch(PRIMARY);
    if (!res.ok) return new Map();
    const data = (await res.json()) as Record<string, number>;
    return new Map(Object.entries(data));
  } catch {
    return new Map();
  }
}
