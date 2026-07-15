// 행정 대시보드 — TOP N 후보표 CSV 내보내기.
// 엑셀에서 한글이 깨지지 않도록 UTF-8 BOM 을 앞에 붙인다.
// 승차량 컬럼은 항상 "양방향 합산" 임을 헤더에 명시한다.

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
