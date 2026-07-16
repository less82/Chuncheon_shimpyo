// 행정 대시보드 — TOP N 후보표 CSV 내보내기.
// 엑셀에서 한글이 깨지지 않도록 UTF-8 BOM 을 앞에 붙인다.
// 승차량 컬럼은 항상 "양방향 합산" 임을 헤더에 명시한다.

import type { InstallRow, SurveyRow } from "../../types/priority";
import { INSTALL_STATUS_LABEL } from "../../types/priority";
import { sourceBadge, KIND_LABEL } from "../../lib/facilityText";

export interface CsvRow {
  rank: number;
  name: string;
  id: string;
  middayBoarding: number; // 한낮(11~16시) 승차합 — 양방향 합산
  totalBoarding: number; // 전체 승차합 — 양방향 합산
  shade: string; // 3상태 한글 라벨
  seat: string;
  light: string;
  sign: string;
  evidence: string; // 근거요약(조건 기반, 점수 아님)
}

/** UTF-8 BOM — 엑셀 한글 깨짐 방지. */
export const UTF8_BOM = "﻿";

/** CSV 헤더 — 승차량 열에 "양방향 합산" 표기 동반. */
export const CSV_HEADER = [
  "순위",
  "정류장명",
  "정류장ID",
  "한낮승차(11~16시, 양방향 합산)",
  "전체승차(양방향 합산)",
  "그늘",
  "의자",
  "조명",
  "도착안내기",
  "근거요약",
] as const;

/** 한 필드를 CSV 이스케이프(콤마·따옴표·개행 포함 시 큰따옴표로 감싸고 따옴표는 중복). */
function escapeField(value: string | number): string {
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowToLine(r: CsvRow): string {
  return [
    r.rank,
    r.name,
    r.id,
    r.middayBoarding,
    r.totalBoarding,
    r.shade,
    r.seat,
    r.light,
    r.sign,
    r.evidence,
  ]
    .map(escapeField)
    .join(",");
}

/** 헤더 + 데이터 행을 CRLF 로 이은 CSV 본문(BOM 없음). */
export function rowsToCsv(rows: CsvRow[]): string {
  const lines = [CSV_HEADER.join(","), ...rows.map(rowToLine)];
  return lines.join("\r\n");
}

/** BOM 을 앞에 붙인 최종 CSV 내용. */
export function buildCsvContent(rows: CsvRow[]): string {
  return UTF8_BOM + rowsToCsv(rows);
}

/**
 * CSV 를 브라우저 다운로드로 저장한다. (부수효과 — jsdom 밖에서만 동작)
 */
export function exportCsv(rows: CsvRow[], filename = "쉼표정류장_후보.csv"): void {
  const content = buildCsvContent(rows);
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 브라우저 다운로드 공용 헬퍼(부수효과). */
function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---- 1단계 "조사 검토 순서" CSV (구성요소 전 컬럼 + 선정 사유) ----

/** leadReason → 한글 선정 사유 문구. */
export const LEAD_REASON_LABEL: Record<SurveyRow["leadReason"], string> = {
  demand: "한낮 승차 실측",
  unknown: "미확인 시설 수",
  poi: "생활지원시설 인접도",
};

export const SURVEY_CSV_HEADER = [
  "순위",
  "정류장명",
  "정류장ID",
  "한낮승차(11~16시, 양방향 합산)",
  "수요분위수(0~1)",
  "미확인시설수(0~4)",
  "미확인비율(0~1)",
  "생활지원시설 인접도(0~1, 미확보시 빈값)",
  "조사검토지수(보조)",
  "선정사유",
] as const;

function surveyRowToLine(r: SurveyRow): string {
  return [
    r.rank,
    r.stop.name,
    r.stop.id,
    r.demandMidday,
    r.demandQ.toFixed(4),
    r.unknownCount,
    r.unknownRate.toFixed(4),
    r.poi !== null ? r.poi.toFixed(4) : "",
    r.score.toFixed(4),
    LEAD_REASON_LABEL[r.leadReason],
  ]
    .map(escapeField)
    .join(",");
}

/** 1단계 조사 검토 순서 CSV 본문(BOM 없음). */
export function surveyRowsToCsv(rows: SurveyRow[]): string {
  const lines = [SURVEY_CSV_HEADER.join(","), ...rows.map(surveyRowToLine)];
  return lines.join("\r\n");
}

export function buildSurveyCsvContent(rows: SurveyRow[]): string {
  return UTF8_BOM + surveyRowsToCsv(rows);
}

export function exportSurveyCsv(
  rows: SurveyRow[],
  filename = "쉼표정류장_조사검토순서.csv",
): void {
  downloadCsv(buildSurveyCsvContent(rows), filename);
}

// ---- 2단계 "설치 검토 우선순위" CSV ----

export const INSTALL_CSV_HEADER = [
  "순위",
  "정류장명",
  "정류장ID",
  "시설",
  "한낮승차(11~16시, 양방향 합산, 미확인시 빈값)",
  "생활지원시설 인접도(0~1, 미확보시 빈값)",
  "출처",
  "상태",
] as const;

function installRowToLine(r: InstallRow): string {
  return [
    r.rank,
    r.stop.name,
    r.stop.id,
    KIND_LABEL[r.facility],
    r.demandMidday !== null ? r.demandMidday : "",
    r.poi !== null ? r.poi.toFixed(4) : "",
    sourceBadge(r.stop.facilities[r.facility]),
    INSTALL_STATUS_LABEL,
  ]
    .map(escapeField)
    .join(",");
}

export function installRowsToCsv(rows: InstallRow[]): string {
  const lines = [INSTALL_CSV_HEADER.join(","), ...rows.map(installRowToLine)];
  return lines.join("\r\n");
}

export function buildInstallCsvContent(rows: InstallRow[]): string {
  return UTF8_BOM + installRowsToCsv(rows);
}

export function exportInstallCsv(
  rows: InstallRow[],
  filename = "쉼표정류장_설치검토우선순위.csv",
): void {
  downloadCsv(buildInstallCsvContent(rows), filename);
}
