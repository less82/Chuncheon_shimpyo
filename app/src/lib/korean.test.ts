import { describe, expect, it } from "vitest";
import { hasBatchim, particle, subjectParticle } from "./korean";

describe("hasBatchim", () => {
  it("한글 받침을 판별한다", () => {
    expect(hasBatchim("춘천시민버스")).toBe(false); // 스
    expect(hasBatchim("교통시설팀")).toBe(true); // 팀
    expect(hasBatchim("한일여행사")).toBe(false); // 사
    expect(hasBatchim("버스팀")).toBe(true); // 팀
  });

  it("숫자는 발음 기준으로 본다", () => {
    expect(hasBatchim("12")).toBe(false); // 이
    expect(hasBatchim("11")).toBe(true); // 일
    expect(hasBatchim("7")).toBe(true); // 칠
  });

  it("판단할 수 없으면 null", () => {
    expect(hasBatchim("")).toBeNull();
    expect(hasBatchim("   ")).toBeNull();
    expect(hasBatchim("BIS")).toBeNull();
  });
});

describe("subjectParticle", () => {
  it("받침 없는 말에는 가를 붙인다", () => {
    expect(`춘천시민버스${subjectParticle("춘천시민버스")}`).toBe("춘천시민버스가");
    expect(`한일여행사${subjectParticle("한일여행사")}`).toBe("한일여행사가");
  });

  it("받침 있는 말에는 이를 붙인다", () => {
    expect(`교통시설팀${subjectParticle("교통시설팀")}`).toBe("교통시설팀이");
    expect(`등${subjectParticle("등")}`).toBe("등이");
  });

  it("판단할 수 없으면 조사를 붙이지 않는다", () => {
    expect(subjectParticle("BIS")).toBe("");
  });
});

describe("particle", () => {
  it("은/는 같은 다른 조사도 고른다", () => {
    expect(particle("버스", "은", "는")).toBe("는");
    expect(particle("노선팀", "은", "는")).toBe("은");
  });
});
