// 춘천시 「시내(마을)버스 문의사항이 생기셨나요?」 안내문의 접수처 라우팅.
//
// 출처: 춘천시 공식 안내 포스터. 시민 신호를 "누가 받는가"의 유일한 공식 근거다.
// 전화번호·담당팀·권역은 안내문 표기 그대로 옮긴다. 임의로 추정·보정하지 않는다.
//
// 주의: 이 앱은 아직 공식 접수 연계가 없다. 이 데이터는 시민에게
// **정확한 접수처를 안내**하는 용도이며, 앱이 민원을 접수했다고 표시하면 안 된다
// (docs/현재/01_제품_화면.md — "공식 연계 전에는 `민원 접수`라고 표시하지 않는다").

export type ContactCategory = "ride" | "route" | "bis" | "facility";

export interface BusContact {
  /** 접수 기관·부서 */
  org: string;
  phone: string;
  /** 마을버스처럼 담당 권역이 나뉘는 경우만 */
  scope?: string;
}

export interface ContactCategoryInfo {
  key: ContactCategory;
  /** 안내문의 대괄호 항목명 */
  title: string;
  /** 안내문이 든 예시 */
  examples: string;
  contacts: BusContact[];
  /** 안내문의 ※ 항목 — 접수 시 함께 알려야 처리가 빠른 정보 */
  required: string[];
}

export const CONTACT_CATEGORIES: ContactCategoryInfo[] = [
  {
    key: "ride",
    title: "이용 불편 민원",
    examples: "기사 불친절, 난폭운전, 분실물, 사고 접수 등",
    contacts: [
      { org: "춘천시민버스", phone: "033-254-6925", scope: "시내버스" },
      { org: "매일관광주식회사", phone: "033-255-2431", scope: "마을버스 (신북, 사북, 북산, 서면)" },
      { org: "한일여행사(자)", phone: "033-249-8000", scope: "마을버스 (신동면, 남면, 남산)" },
      { org: "뉴코리아고속관광(주)", phone: "033-256-1212", scope: "마을버스 (동면, 동산, 동내)" },
    ],
    required: ["날짜·시간", "정류소", "버스번호(차량번호)"],
  },
  {
    key: "route",
    title: "노선 민원 (신설 및 변경), 불법행위 지도단속 행정처분",
    examples: "노선 신설·변경 요청, 불법행위 지도단속",
    contacts: [{ org: "춘천시 교통과 버스팀", phone: "033-250-3938" }],
    required: [],
  },
  {
    key: "bis",
    title: "버스정류장 버스정보시스템(BIS)",
    examples: "도착안내 단말기 고장 신고 등",
    contacts: [{ org: "춘천시 교통과 교통시설팀", phone: "033-250-3897" }],
    required: [],
  },
  {
    key: "facility",
    title: "버스정류장 시설",
    examples: "온열의자, 지붕(가림막) 있는 정류장 등",
    contacts: [{ org: "춘천시 교통과 교통시설팀", phone: "033-250-3316" }],
    required: ["정류소 위치", "정류소 번호"],
  },
];

/** 안내문 [버스 노선정보] 항목. */
export const ROUTE_INFO_LINKS = [
  { label: "카카오맵", url: "https://map.kakao.com" },
  { label: "네이버맵", url: "https://map.naver.com" },
  { label: "춘천시 교통포털 (노선안내 전자책·PDF)", url: "https://www.chuncheon.go.kr/traffic/" },
  { label: "춘천 라이브 버스", url: "https://ccbus.chuncheon.go.kr" },
];

export function categoryInfo(key: ContactCategory): ContactCategoryInfo {
  const found = CONTACT_CATEGORIES.find((item) => item.key === key);
  if (!found) throw new Error(`알 수 없는 접수 분류: ${key}`);
  return found;
}

/** 정류장 상태 알리기의 선택지 — 안내문 분류에 각각 대응시킨다. */
export interface IssueOption {
  label: string;
  category: ContactCategory;
}

export const ISSUE_OPTIONS: IssueOption[] = [
  { label: "의자가 파손됐어요", category: "facility" },
  { label: "안내 화면이 꺼졌어요", category: "bis" },
  { label: "조명이 꺼졌어요", category: "facility" },
  { label: "승강장 시설물이 파손됐어요", category: "facility" },
];

/**
 * 제보 문구 → 접수 분류.
 * 알려진 선택지는 표로 확정하고, 그 밖의 자유 입력은 안내문 예시 낱말로만 좁힌다.
 * 판단이 서지 않으면 시설(facility)로 두지 않고 null을 돌려 사람이 고르게 한다.
 */
export function categoryForIssue(issue: string): ContactCategory | null {
  const known = ISSUE_OPTIONS.find((option) => option.label === issue);
  if (known) return known.category;

  const text = issue.replace(/\s+/g, "");
  if (/기사|불친절|난폭|분실|두고내|사고/.test(text)) return "ride";
  if (/노선|신설|변경|단속/.test(text)) return "route";
  if (/안내기|안내단말|안내화면|도착안내|BIS/i.test(text)) return "bis";
  if (/의자|조명|지붕|가림막|온열|승강장|시설/.test(text)) return "facility";
  return null;
}
