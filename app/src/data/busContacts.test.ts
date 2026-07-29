import { describe, expect, it } from "vitest";
import {
  CONTACT_CATEGORIES,
  ISSUE_OPTIONS,
  REPORT_KINDS,
  categoryForIssue,
  categoryInfo,
  issueOptionsFor,
  reportKind,
  rideContactsForRoutes,
  villageZoneOf,
} from "./busContacts";

describe("춘천시 버스 문의 안내문 데이터", () => {
  it("안내문의 네 가지 접수 분류를 모두 담는다", () => {
    expect(CONTACT_CATEGORIES.map((item) => item.key)).toEqual(["ride", "route", "bis", "facility"]);
  });

  it("이용 불편 민원은 시내버스 1곳과 마을버스 3개 권역을 모두 담는다", () => {
    const ride = categoryInfo("ride");
    expect(ride.contacts).toHaveLength(4);
    expect(ride.contacts.map((c) => c.phone)).toEqual([
      "033-254-6925",
      "033-255-2431",
      "033-249-8000",
      "033-256-1212",
    ]);
    // 마을버스는 권역이 반드시 붙어야 시민이 고를 수 있다
    for (const contact of ride.contacts.slice(1)) {
      expect(contact.scope).toMatch(/마을버스/);
    }
  });

  it("BIS 고장과 정류장 시설은 같은 팀이지만 번호가 다르다 (안내문 그대로)", () => {
    expect(categoryInfo("bis").contacts[0]).toMatchObject({
      org: "춘천시 교통과 교통시설팀",
      phone: "033-250-3897",
    });
    expect(categoryInfo("facility").contacts[0]).toMatchObject({
      org: "춘천시 교통과 교통시설팀",
      phone: "033-250-3316",
    });
  });

  it("노선 민원은 버스팀이 받는다", () => {
    expect(categoryInfo("route").contacts[0].phone).toBe("033-250-3938");
  });

  it("안내문 ※ 항목을 함께 알려줄 정보로 갖는다", () => {
    expect(categoryInfo("ride").required).toEqual(["날짜·시간", "정류소", "버스번호(차량번호)"]);
    expect(categoryInfo("facility").required).toEqual(["정류소 위치", "정류소 번호"]);
  });

  it("모든 전화번호는 033 지역번호 형식이다", () => {
    for (const category of CONTACT_CATEGORIES) {
      for (const contact of category.contacts) {
        expect(contact.phone).toMatch(/^033-\d{3}-\d{4}$/);
      }
    }
  });

  it("앱 밖으로 내보내는 외부 지도·포털 링크를 두지 않는다", async () => {
    // 노선 조회는 앱 안에서 직접 제공한다. 링크 목록을 되살리면 흐름이 다시 갈라진다.
    const module = await import("./busContacts");
    expect("ROUTE_INFO_LINKS" in module).toBe(false);
  });
});

describe("REPORT_KINDS", () => {
  it("알리기 유형 4종이 안내문 분류와 1:1로 대응한다", () => {
    expect(REPORT_KINDS.map((kind) => kind.category)).toEqual(["facility", "bis", "ride", "route"]);
    expect(REPORT_KINDS.map((kind) => kind.label)).toEqual([
      "정류장 시설",
      "안내기 고장",
      "버스 이용 불편",
      "노선 요청",
    ]);
  });

  it("유형마다 담당 접수처가 반드시 있다", () => {
    for (const kind of REPORT_KINDS) {
      expect(categoryInfo(kind.category).contacts.length).toBeGreaterThan(0);
      expect(reportKind(kind.category).label).toBe(kind.label);
    }
  });

  it("모르는 유형은 조용히 넘기지 않는다", () => {
    // @ts-expect-error 알 수 없는 분류를 넣으면 터져야 한다
    expect(() => reportKind("unknown")).toThrow();
  });
});

describe("issueOptionsFor", () => {
  it("유형마다 선택지를 주고, 한 화면에 담기도록 4개를 넘지 않는다", () => {
    for (const kind of REPORT_KINDS) {
      const options = issueOptionsFor(kind.category);
      expect(options.length).toBeGreaterThan(0);
      expect(options.length).toBeLessThanOrEqual(4);
      for (const option of options) expect(option.category).toBe(kind.category);
    }
  });

  it("정류장 시설 유형은 선택지 네 개를 채운다", () => {
    expect(issueOptionsFor("facility")).toHaveLength(4);
  });

  it("기획에서 뺀 조명 선택지는 남아 있지 않다", () => {
    expect(ISSUE_OPTIONS.some((option) => option.label.includes("조명"))).toBe(false);
  });

  it("선택지 문구는 겹치지 않는다", () => {
    expect(new Set(ISSUE_OPTIONS.map((option) => option.label)).size).toBe(ISSUE_OPTIONS.length);
  });
});

describe("categoryForIssue", () => {
  it("정류장 상태 선택지를 알맞은 접수처로 보낸다", () => {
    expect(categoryForIssue("의자가 파손됐어요")).toBe("facility");
    expect(categoryForIssue("그늘막이 파손됐어요")).toBe("facility");
    expect(categoryForIssue("승강장 시설물이 파손됐어요")).toBe("facility");
    // 도착안내 단말기 고장은 시설이 아니라 BIS 담당이다
    expect(categoryForIssue("안내 화면이 꺼졌어요")).toBe("bis");
  });

  it("모든 선택지가 분류를 갖는다", () => {
    for (const option of ISSUE_OPTIONS) {
      expect(categoryForIssue(option.label)).toBe(option.category);
    }
  });

  it("자유 입력도 안내문 낱말로 분류한다", () => {
    expect(categoryForIssue("기사님이 난폭운전을 했어요")).toBe("ride");
    expect(categoryForIssue("우산을 두고 내렸어요")).toBe("ride");
    expect(categoryForIssue("노선을 바꿔주세요")).toBe("route");
    expect(categoryForIssue("온열의자를 놓아주세요")).toBe("facility");
    expect(categoryForIssue("지붕이 없어요")).toBe("facility");
  });

  it("판단이 서지 않으면 임의로 분류하지 않는다", () => {
    expect(categoryForIssue("그냥 좀 그래요")).toBeNull();
    expect(categoryForIssue("")).toBeNull();
  });
});

describe("villageZoneOf", () => {
  it("마을버스 노선명 접두에서 권역을 읽는다", () => {
    expect(villageZoneOf("남산3(남산304)")).toBe("남산");
    expect(villageZoneOf("사북3-1(사북302)")).toBe("사북");
    expect(villageZoneOf("동내2-1(동내203)")).toBe("동내");
  });

  it("시내버스 노선은 권역이 없다", () => {
    expect(villageZoneOf("10-S")).toBeNull();
    expect(villageZoneOf("7-2(칠전동경유)")).toBeNull();
    expect(villageZoneOf("100-1")).toBeNull();
  });

  it("신동이 동면으로 잘못 읽히지 않는다 (부분 문자열 함정)", () => {
    // '신동1-2(신동107)' 안에는 '동'이 있지만 접두는 신동이다.
    expect(villageZoneOf("신동1-2(신동107)")).toBe("신동");
    expect(villageZoneOf("동면1(동면106)")).toBe("동면");
  });
});

describe("rideContactsForRoutes", () => {
  const phones = (routes: string[]) => rideContactsForRoutes(routes).map((c) => c.phone);

  it("마을버스 권역에 맞는 회사만 남긴다", () => {
    // 남산 = 한일여행사
    expect(phones(["남산3(남산304)"])).toEqual(["033-249-8000"]);
    // 사북 = 매일관광
    expect(phones(["사북3-1(사북302)"])).toEqual(["033-255-2431"]);
    // 동내 = 뉴코리아고속관광
    expect(phones(["동내1(동내101)"])).toEqual(["033-256-1212"]);
  });

  it("시내버스만 오면 춘천시민버스만 남긴다", () => {
    expect(phones(["10-S", "12-1", "3"])).toEqual(["033-254-6925"]);
  });

  it("여러 권역이 겹치면 해당 회사를 모두 남긴다", () => {
    // 남춘천역처럼 여러 권역 마을버스가 함께 오는 환승 거점
    const result = phones(["100", "동내2(동내201)", "남면1(남면101)"]);
    expect(result).toContain("033-254-6925"); // 시내버스
    expect(result).toContain("033-256-1212"); // 뉴코리아(동내)
    expect(result).toContain("033-249-8000"); // 한일(남면)
    expect(result).not.toContain("033-255-2431"); // 매일관광은 오지 않는다
  });

  it("노선 근거가 없으면 안내문 전체를 그대로 보여준다", () => {
    expect(rideContactsForRoutes([])).toHaveLength(4);
  });

  it("돌려주는 값은 언제나 안내문에 실린 접수처다", () => {
    const known = new Set(categoryInfo("ride").contacts.map((c) => c.phone));
    for (const contact of rideContactsForRoutes(["남산1(남산101)", "9"])) {
      expect(known.has(contact.phone)).toBe(true);
    }
  });
});
