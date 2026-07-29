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

/**
 * 마을버스 노선명 접두 → 운수회사 전화번호.
 *
 * 춘천 마을버스 노선명은 `남산3(남산304)`처럼 권역명으로 시작한다.
 * 안내문의 10개 권역과 실제 노선명 접두 10종이 정확히 일치한다.
 * 정류장이 어느 법정동에 있느냐가 아니라 **어느 회사 버스가 그 정류장에 오느냐**가
 * 이용 불편 민원의 접수처다. 그래서 위치가 아니라 노선으로 판별한다.
 */
const VILLAGE_ZONE_PHONE: Record<string, string> = {
  신북: "033-255-2431",
  사북: "033-255-2431",
  북산: "033-255-2431",
  서면: "033-255-2431",
  신동: "033-249-8000",
  남면: "033-249-8000",
  남산: "033-249-8000",
  동면: "033-256-1212",
  동산: "033-256-1212",
  동내: "033-256-1212",
};

/** 노선명 접두에서 마을버스 권역을 읽는다. 시내버스(숫자 시작)는 null. */
export function villageZoneOf(routeName: string): string | null {
  // `신동`이 `동면`을 부분 문자열로 포함하는 함정이 있어 반드시 접두로만 맞춘다.
  for (const zone of Object.keys(VILLAGE_ZONE_PHONE)) {
    if (routeName.startsWith(zone)) return zone;
  }
  return null;
}

/**
 * 이 정류장에 실제로 오는 버스의 접수처만 추린다.
 * 근거가 전혀 없으면 안내문 전체(4곳)를 그대로 돌려준다 — 임의로 좁히지 않는다.
 */
export function rideContactsForRoutes(routes: string[]): BusContact[] {
  const all = categoryInfo("ride").contacts;
  if (!routes.length) return all;

  const phones = new Set<string>();
  let hasCityBus = false;
  for (const route of routes) {
    const zone = villageZoneOf(route);
    if (zone) phones.add(VILLAGE_ZONE_PHONE[zone]);
    else hasCityBus = true;
  }
  if (hasCityBus) phones.add(all[0].phone); // 춘천시민버스(시내버스)
  if (!phones.size) return all;
  return all.filter((contact) => phones.has(contact.phone));
}

export function categoryInfo(key: ContactCategory): ContactCategoryInfo {
  const found = CONTACT_CATEGORIES.find((item) => item.key === key);
  if (!found) throw new Error(`알 수 없는 접수 분류: ${key}`);
  return found;
}

/**
 * 알리기 첫 화면의 유형 4종.
 * 시민이 고르는 말과 안내문 분류(ContactCategory)를 1:1로 묶는다.
 * 이 대응이 곧 담당 부서 배정이므로 임의로 늘리거나 합치지 않는다.
 */
export interface ReportKind {
  category: ContactCategory;
  /** 화면에 그대로 쓰는 시민의 말 */
  label: string;
  /** 유형 선택을 도와줄 한 줄 예시 */
  hint: string;
}

export const REPORT_KINDS: ReportKind[] = [
  { category: "facility", label: "정류장 시설", hint: "의자, 지붕, 그늘막" },
  { category: "bis", label: "안내기 고장", hint: "도착안내 화면" },
  { category: "ride", label: "버스 이용 불편", hint: "기사, 운전, 분실물" },
  { category: "route", label: "노선 요청", hint: "신설·변경 요청" },
];

export function reportKind(category: ContactCategory): ReportKind {
  const found = REPORT_KINDS.find((item) => item.category === category);
  if (!found) throw new Error(`알 수 없는 알리기 유형: ${category}`);
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
  { label: "승강장 시설물이 파손됐어요", category: "facility" },
  { label: "지붕(가림막)이 없어요", category: "facility" },
  { label: "그늘막이 파손됐어요", category: "facility" },
  { label: "도착안내가 표시되지 않아요", category: "bis" },
  { label: "안내 화면이 잘 안 보여요", category: "bis" },
  { label: "기사님이 불친절했어요", category: "ride" },
  { label: "난폭운전이 있었어요", category: "ride" },
  { label: "물건을 두고 내렸어요", category: "ride" },
  { label: "사고가 있었어요", category: "ride" },
  { label: "노선 신설을 요청해요", category: "route" },
  { label: "노선 변경을 요청해요", category: "route" },
  { label: "불법행위 지도단속을 요청해요", category: "route" },
];

/**
 * 유형별 선택지. 한 화면에 스크롤 없이 담기도록 4개까지만 보여준다.
 * (선택지를 더 늘려야 하면 화면 규칙부터 다시 본다.)
 */
export function issueOptionsFor(category: ContactCategory): IssueOption[] {
  return ISSUE_OPTIONS.filter((option) => option.category === category).slice(0, 4);
}

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
  if (/의자|그늘|쉘터|지붕|가림막|온열|승강장|시설/.test(text)) return "facility";
  return null;
}
