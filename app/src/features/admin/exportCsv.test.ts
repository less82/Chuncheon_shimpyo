import { describe, it, expect } from "vitest";
import {
  CSV_HEADER,
  UTF8_BOM,
  rowsToCsv,
  buildCsvContent,
  type CsvRow,
} from "./exportCsv";

const rows: CsvRow[] = [
  {
    rank: 1,
    name: "춘천역, 시외버스",
    id: "250001192",
    middayBoarding: 106,
    totalBoarding: 320,
    shade: "미확인",
    seat: "있음",
    light: "미확인",
    sign: "미확인",
    evidence: "한낮 승차 상위 25% · 그늘 미확인",
  },
  {
    rank: 2,
    name: "명동입구",
    id: "250002001",
    middayBoarding: 88,
    totalBoarding: 240,
    shade: "미확인",
    seat: "미확인",
    light: "미확인",
    sign: "미확인",
    evidence: "한낮 승차 상위 25% · 그늘 미확인",
  },
];

describe("exportCsv — CSV 문자열 생성", () => {
  it("헤더 첫 줄이 한글 컬럼명이고 승차량에 양방향 합산 표기", () => {
    const csv = rowsToCsv(rows);
    const header = csv.split("\r\n")[0];
    expect(header).toBe(CSV_HEADER.join(","));
    expect(header).toContain("양방향 합산");
  });

  it("각 데이터 행을 헤더와 같은 열 수로 생성한다", () => {
    const csv = rowsToCsv(rows);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(1 + rows.length); // 헤더 + 2행
    expect(lines[1]).toContain("250001192");
    expect(lines[1]).toContain("106");
  });

  it("콤마가 들어간 필드는 따옴표로 감싼다", () => {
    const csv = rowsToCsv(rows);
    // "춘천역, 시외버스" 는 콤마 포함 → 큰따옴표로 감쌈
    expect(csv).toContain('"춘천역, 시외버스"');
  });

  it("buildCsvContent 는 UTF-8 BOM 으로 시작한다(엑셀 한글 안깨짐)", () => {
    const content = buildCsvContent(rows);
    expect(UTF8_BOM).toBe("﻿");
    expect(content.startsWith("﻿")).toBe(true);
    expect(content.charCodeAt(0)).toBe(0xfeff);
    expect(content).toContain(CSV_HEADER.join(","));
  });
});
