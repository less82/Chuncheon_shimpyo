import { describe, it, expect } from "vitest";
import {
  buildShareUrl,
  buildQrEntryUrl,
  parseQrStopId,
  parseShareParam,
  extractFavIdsFromScan,
} from "./shareLink";

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
    expect(new URL(url).pathname).toBe("/app");
    expect(url).toContain("fav=");
    const search = url.slice(url.indexOf("?"));
    expect(parseShareParam(search, VALID)).toEqual([
      "250001192",
      "250001193",
    ]);
  });

  it("빈 목록이면 fav 파라미터가 비거나 없다", () => {
    const url = buildShareUrl([]);
    expect(new URL(url).pathname).toBe("/app");
    const search = url.includes("?") ? url.slice(url.indexOf("?")) : "";
    expect(parseShareParam(search, VALID)).toEqual([]);
  });
});

describe("정류장 출발 QR", () => {
  it("qr_main 경로와 출발 정류장 ID를 만든다", () => {
    const url = buildQrEntryUrl("250001192");
    expect(new URL(url).pathname).toBe("/qr_main");
    expect(parseQrStopId(url, VALID)).toBe("250001192");
  });

  it("존재하지 않는 정류장이나 다른 경로는 거부한다", () => {
    expect(parseQrStopId("https://x/qr_main?from=BAD", VALID)).toBeNull();
    expect(parseQrStopId("https://x/app?from=250001192", VALID)).toBeNull();
  });
});

describe("extractFavIdsFromScan (QR 스캔 텍스트 → id)", () => {
  it("우리 QR(전체 URL)을 스캔하면 id 목록을 얻는다", () => {
    const url = "https://chuncheon-shimpyo.vercel.app/?fav=250001192,250001193";
    expect(extractFavIdsFromScan(url, VALID)).toEqual([
      "250001192",
      "250001193",
    ]);
  });

  it("검색문자열/파라미터 단독 형태도 허용한다", () => {
    expect(extractFavIdsFromScan("?fav=250026779", VALID)).toEqual([
      "250026779",
    ]);
    expect(extractFavIdsFromScan("fav=250026779", VALID)).toEqual([
      "250026779",
    ]);
  });

  it("우리 형식이 아닌 임의 QR(다른 URL/문자열)은 빈 배열", () => {
    expect(extractFavIdsFromScan("https://example.com/foo", VALID)).toEqual([]);
    expect(extractFavIdsFromScan("아무 텍스트", VALID)).toEqual([]);
    expect(extractFavIdsFromScan("", VALID)).toEqual([]);
  });

  it("화이트리스트 밖 id·주입 문자열은 스캔에서도 걸러낸다", () => {
    const url = "https://x.app/?fav=<script>,250001192,BAD";
    const out = extractFavIdsFromScan(url, VALID);
    expect(out).toEqual(["250001192"]);
    expect(out.join("")).not.toContain("<");
  });
});
