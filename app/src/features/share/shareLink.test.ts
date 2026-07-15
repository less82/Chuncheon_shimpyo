import { describe, it, expect } from "vitest";
import { buildShareUrl, parseShareParam } from "./shareLink";

const VALID = ["250001192", "250001193", "250026779"];

describe("parseShareParam (보안: 화이트리스트 교집합만)", () => {
  it("존재하는 id만 통과시키고 없는 id/특수문자는 제거한다", () => {
    const out = parseShareParam("?fav=250001192,BAD,<script>", VALID);
    expect(out).toEqual(["250001192"]);
  });

  it("스크립트 주입/HTML 태그를 걸러낸다", () => {
    const out = parseShareParam(
      "?fav=<script>alert(1)</script>,250001193,%3Cimg%20onerror%3D",
      VALID,
    );
    expect(out).toEqual(["250001193"]);
    expect(out.join("")).not.toContain("<");
    expect(out.join("")).not.toContain("script");
  });

  it("fav 파라미터가 없으면 빈 배열", () => {
    expect(parseShareParam("?x=1", VALID)).toEqual([]);
    expect(parseShareParam("", VALID)).toEqual([]);
  });

  it("중복 id는 한 번만", () => {
    const out = parseShareParam("?fav=250001192,250001192,250001193", VALID);
    expect(out).toEqual(["250001192", "250001193"]);
  });

  it("validIds 를 Set 으로 줘도 동작한다", () => {
    const out = parseShareParam("?fav=250026779,zzz", new Set(VALID));
    expect(out).toEqual(["250026779"]);
  });
});

describe("buildShareUrl ↔ parseShareParam round-trip", () => {
  it("build 한 URL 을 parse 하면 원래 id 목록을 얻는다", () => {
    const url = buildShareUrl(["250001192", "250001193"]);
    expect(url).toContain("fav=");
    const search = url.slice(url.indexOf("?"));
    expect(parseShareParam(search, VALID)).toEqual([
      "250001192",
      "250001193",
    ]);
  });

  it("빈 목록이면 fav 파라미터가 비거나 없다", () => {
    const url = buildShareUrl([]);
    const search = url.includes("?") ? url.slice(url.indexOf("?")) : "";
    expect(parseShareParam(search, VALID)).toEqual([]);
  });
});
