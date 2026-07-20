import { describe, it, expect } from "vitest";
import {
  CSV_HEADER,
  UTF8_BOM,
  rowsToCsv,
  buildCsvContent,
  surveyRowsToCsv,
  installRowsToCsv,
  LEAD_REASON_LABEL,
  type CsvRow,
} from "./exportCsv";
import type { FacilityInfo, Stop } from "../../types/stop";
import type { InstallRow, SurveyRow } from "../../types/priority";

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

function fac(status: FacilityInfo["status"]): FacilityInfo {
  return { status, source: status === "no" ? "roadview" : "none", capturedAt: status === "no" ? "2026.03" : undefined };
}

function makeStop(id: string): Stop {
  return {
    id,
    stopNo: id,
    name: `정류장${id}`,
    lat: 37.88,
    lng: 127.73,
    routes: ["1"],
    facilities: {
      shade: fac("unknown"),
      seat: fac("no"),
      light: fac("unknown"),
      sign: fac("unknown"),
    },
  };
}

describe("(e) surveyRowsToCsv — 1단계 구성요소 전 컬럼 + 선정 사유", () => {
  const rows: SurveyRow[] = [
    {
      stop: makeStop("250000001"),
      rank: 1,
      score: 0.75,
      demandMidday: 120,
      demandQ: 0.9,
      unknownCount: 2,
      unknownRate: 0.5,
      poi: 0.3,
      leadReason: "demand",
    },
  ];

  it("헤더에 구성요소 컬럼(분위수·미확인비율·인접도)과 선정사유 열이 있다", () => {
    const csv = surveyRowsToCsv(rows);
    const header = csv.split("\r\n")[0];
    expect(header).toContain("수요분위수");
    expect(header).toContain("미확인비율");
    expect(header).toContain("생활지원시설 인접도");
    expect(header).toContain("선정사유");
  });

  it("데이터 행에 leadReason 한글 라벨이 들어간다", () => {
    const csv = surveyRowsToCsv(rows);
    const dataLine = csv.split("\r\n")[1];
    expect(dataLine).toContain(LEAD_REASON_LABEL["demand"]);
  });
});

describe("(e) installRowsToCsv — 2단계 CSV", () => {
  const rows: InstallRow[] = [
    {
      stop: makeStop("250000002"),
      facility: "seat",
      rank: 1,
      demandMidday: 50,
      poi: null,
      surveySource: "roadview",
      capturedAt: "2026.03",
    },
  ];

  it("시설·상태 라벨을 포함한다", () => {
    const csv = installRowsToCsv(rows);
    expect(csv).toContain("의자");
    expect(csv).toContain("데이터상 설치 검토 후보");
  });
});
