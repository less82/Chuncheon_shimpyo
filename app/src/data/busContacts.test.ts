import { describe, expect, it } from "vitest";
import {
  CONTACT_CATEGORIES,
  ISSUE_OPTIONS,
  ROUTE_INFO_LINKS,
  categoryForIssue,
  categoryInfo,
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

  it("버스 노선정보 링크 네 곳을 담는다", () => {
    expect(ROUTE_INFO_LINKS.map((l) => l.label)).toContain("춘천 라이브 버스");
    expect(ROUTE_INFO_LINKS).toHaveLength(4);
    for (const link of ROUTE_INFO_LINKS) expect(link.url).toMatch(/^https:\/\//);
  });
});

describe("categoryForIssue", () => {
  it("정류장 상태 선택지를 알맞은 접수처로 보낸다", () => {
    expect(categoryForIssue("의자가 파손됐어요")).toBe("facility");
    expect(categoryForIssue("조명이 꺼졌어요")).toBe("facility");
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
