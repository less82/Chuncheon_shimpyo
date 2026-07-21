import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = path.join(root, 'data');
const paths = {
  master: path.join(data, '춘천시_승차정류장ID_국토부_공식대응_20250613.csv'),
  location: path.join(data, '강원특별자치도 춘천시_버스정류장 위치정보_20260326.csv'),
  boarding: path.join(data, '강원특별자치도 춘천시_버스노선별 시간대별 승하차 인원_20251209.csv'),
  overrides: path.join(data, 'stop_id_mapping_overrides.csv'),
  routeOverrides: path.join(data, 'stop_id_route_mapping_overrides.csv'),
  output: path.join(data, 'stop_id_mapping.csv'),
};

const fields = [
  'boarding_stop_id', 'boarding_stop_names', 'legal_district_codes',
  'legal_district_names', 'stop_no', 'management_id', 'current_stop_name',
  'longitude', 'latitude', 'midday_boardings', 'match_status', 'match_method',
  'confidence', 'source_record_count', 'boarding_sample_period',
  'mapping_source_dates',
];

function parseCsv(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { value += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(value); value = ''; }
    else if (char === '\n') { row.push(value.replace(/\r$/, '')); rows.push(row); row = []; value = ''; }
    else value += char;
  }
  if (value || row.length) { row.push(value.replace(/\r$/, '')); rows.push(row); }
  const headers = rows.shift();
  return rows.filter((item) => item.some(Boolean)).map((item) =>
    Object.fromEntries(headers.map((header, index) => [header.trim(), (item[index] ?? '').trim()])),
  );
}

function readCsv(file, encoding = 'utf-8') {
  return parseCsv(new TextDecoder(encoding).decode(fs.readFileSync(file)));
}

function csvValue(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function joined(values) {
  return [...values].filter(Boolean).sort((a, b) => a.localeCompare(b, 'ko')).join('|');
}

const master = readCsv(paths.master);
const locations = readCsv(paths.location, 'euc-kr');
const boarding = readCsv(paths.boarding, 'euc-kr');
const overrides = [...readCsv(paths.routeOverrides), ...readCsv(paths.overrides)];
const locationByNo = new Map(locations.map((row) => [row['정류장 번호'], row]));
const overrideById = new Map(overrides.map((row) => [row.boarding_stop_id, row]));

const midday = new Map();
for (const row of boarding) {
  const hour = Number(row.이용시간대);
  if (hour >= 11 && hour <= 16) {
    midday.set(row.정류장아이디, (midday.get(row.정류장아이디) ?? 0) + Number(row.승차건수));
  }
}

const grouped = new Map();
for (const row of master) {
  const id = row.정류장아이디;
  if (!grouped.has(id)) grouped.set(id, []);
  grouped.get(id).push(row);
}

const result = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, sourceRows]) => {
  const mobileIds = new Set(sourceRows.map((row) => row.모바일아이디).filter((value) => /^\d{4}$/.test(value)));
  let stopNo = mobileIds.size === 1 ? [...mobileIds][0] : '';
  let location = locationByNo.get(stopNo);
  let status = location ? 'direct' : 'unresolved';
  let method = location ? 'molit_mobile_stop_no_to_chuncheon_stop_no' : '';
  let confidence = location ? 'high' : '';
  const override = overrideById.get(id);
  if (override) {
    stopNo = override.stop_no;
    location = locationByNo.get(stopNo);
    status = override.match_status;
    method = override.match_method;
    confidence = override.confidence;
  }
  return {
    boarding_stop_id: id,
    boarding_stop_names: joined(new Set(sourceRows.map((row) => row.정류장명))),
    legal_district_codes: joined(new Set(sourceRows.map((row) => row['읍면동코드(법정동)']))),
    legal_district_names: joined(new Set(sourceRows.map((row) => row['읍면동명(법정동)']))),
    stop_no: stopNo,
    management_id: location?.관리번호 ?? '',
    current_stop_name: location?.정류장명 ?? '',
    longitude: location?.경도 ?? '',
    latitude: location?.위도 ?? '',
    midday_boardings: (midday.get(id) ?? 0) > 0 ? midday.get(id) : '',
    match_status: status,
    match_method: method,
    confidence,
    source_record_count: sourceRows.length,
    boarding_sample_period: '2025-06-25/2025-06-28',
    mapping_source_dates: '2025-06-13|2026-03-26',
  };
});

const output = [fields.join(','), ...result.map((row) => fields.map((field) => csvValue(row[field])).join(','))].join('\r\n');
fs.writeFileSync(paths.output, `\uFEFF${output}\r\n`, 'utf8');
console.log(`rows=${result.length} output=${paths.output}`);
