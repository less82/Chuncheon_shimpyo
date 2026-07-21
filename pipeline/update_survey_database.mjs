import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const input = process.argv[2];
const output = process.argv[3] ?? input;
if (!input) throw new Error('usage: node pipeline/update_survey_database.mjs <input.csv> [output.csv]');

function parseCsv(text) {
  text = text.replace(/^\uFEFF/, ''); const rows = []; let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) { const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { value += '"'; i += 1; } else if (c === '"') quoted = false; else value += c; }
    else if (c === '"') quoted = true; else if (c === ',') { row.push(value); value = ''; }
    else if (c === '\n') { row.push(value.replace(/\r$/, '')); rows.push(row); row = []; value = ''; } else value += c;
  }
  if (value || row.length) { row.push(value.replace(/\r$/, '')); rows.push(row); }
  const headers = rows.shift();
  return rows.filter((r) => r.some(Boolean)).map((r) => Object.fromEntries(headers.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}
const read = (file, encoding = 'utf-8') => parseCsv(new TextDecoder(encoding).decode(fs.readFileSync(file)));
const quote = (v) => /[",\r\n]/.test(String(v ?? '')) ? `"${String(v ?? '').replaceAll('"', '""')}"` : String(v ?? '');
function write(file, rows, fields) {
  const body = rows.map((r) => fields.map((f) => quote(r[f])).join(',')).join('\r\n');
  fs.writeFileSync(file, `\uFEFF${fields.join(',')}\r\n${body}${body ? '\r\n' : ''}`);
}
function name(v) { return String(v ?? '').split('(')[0].replace(/\s+/g, '').replace(/아파트/g, 'A').toLowerCase(); }
function setAdd(map, key, value) { if (!key || !value) return; if (!map.has(key)) map.set(key, new Set()); map.get(key).add(value); }
function overlap(a = new Set(), b = new Set()) { let n = 0; for (const v of a) if (b.has(v)) n += 1; return n; }
function direction(v) {
  let text = String(v ?? '').trim(); if (!text) return '';
  if (text.startsWith('(') && text.endsWith(')')) text = text.slice(1, -1).trim();
  text = text.replace(/\s*방면\s*$/, '').replace(/\s+/g, ' ').trim();
  return text ? `${text} 방면` : '';
}
function env(name) {
  const line = fs.readFileSync(path.join(root, 'app', '.env'), 'utf8').split(/\r?\n/).find((v) => v.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, '') ?? '';
}

const survey = read(input);
for (const row of survey) {
  if (['TAGO 노선번호·노선순서 인접 정류장 교차매칭', 'tago_route_number_and_adjacent_stop_unique',
    '노선배열 연속구간·복수노선 1:1 교차매칭', 'route_sequence_unique_cross_validation',
    '전체 경유노선 집합 완전일치·1:1 교차매칭', 'exact_route_set_unique_cross_validation'].includes(row['승차자료 매칭방법'])) {
    row['승차자료 정류장 ID'] = ''; row['표본기간 한낮(11~16시) 개별 승차건수'] = '';
    row['승차자료 매칭방법'] = '매칭 보류'; row['승차자료 매칭신뢰등급'] = '보류';
  }
}
const locations = read(path.join(dataDir, '강원특별자치도 춘천시_버스정류장 위치정보_20260326.csv'), 'euc-kr');
const currentRoutes = read(path.join(dataDir, '강원특별자치도 춘천시_버스정류장 노선정보_20260326.csv'), 'euc-kr');
const boarding = read(path.join(dataDir, '강원특별자치도 춘천시_버스노선별 시간대별 승하차 인원_20251209.csv'), 'euc-kr');
const mapping = read(path.join(dataDir, 'stop_id_mapping.csv'));
const master = read(path.join(dataDir, '춘천시_승차정류장ID_국토부_공식대응_20250613.csv'));

const key = env('VITE_TAGO_KEY');
if (!key) throw new Error('VITE_TAGO_KEY is not configured');
const routeUrl = new URL('https://apis.data.go.kr/1613000/BusRouteInfoInqireService/getRouteNoList');
Object.entries({ serviceKey: key, _type: 'json', cityCode: '32010', numOfRows: '1000', pageNo: '1' }).forEach(([k, v]) => routeUrl.searchParams.set(k, v));
const routeResponse = await (await fetch(routeUrl)).json();
if (routeResponse?.response?.header?.resultCode !== '00') throw new Error(`TAGO route lookup failed: ${routeResponse?.response?.header?.resultMsg}`);
const tagoRoutes = [].concat(routeResponse.response.body.items.item ?? []);
const routeNoById = new Map(tagoRoutes.map((r) => [String(r.routeid).replace(/^CCB/, ''), String(r.routeno)]));
write(path.join(dataDir, 'TAGO_춘천시_버스노선_조회_20260721.csv'), tagoRoutes.map((r) => ({
  route_id: r.routeid, route_no: r.routeno, route_type: r.routetp, start_stop: r.startnodenm,
  end_stop: r.endnodenm, first_time: r.startvehicletime, last_time: r.endvehicletime, lookup_date: '2026-07-21',
})), ['route_id','route_no','route_type','start_stop','end_stop','first_time','last_time','lookup_date']);

const currentGroups = Map.groupBy(currentRoutes, (r) => r.노선);
const boardingGroups = Map.groupBy(boarding, (r) => `${r.수집일자}|${r.노선아이디}|${r.이용시간대}`);
const candidatesByName = new Map();
for (const r of master) { const n = name(r.정류장명); if (!candidatesByName.has(n)) candidatesByName.set(n, new Set()); candidatesByName.get(n).add(r.정류장아이디); }
const mappingByManagement = new Map(mapping
  .filter((r) => r.management_id && !['tago_route_number_and_adjacent_stop_unique', 'route_sequence_unique_cross_validation', 'exact_route_set_unique_cross_validation'].includes(r.match_method))
  .map((r) => [r.management_id, r]));
const middayById = new Map(mapping.map((r) => [r.boarding_stop_id, r.midday_boardings]));

function historicalRouteNo(value) {
  const text = String(value ?? '').trim();
  const matches = [...text.matchAll(/\(([^)]+)\)/g)];
  return matches.at(-1)?.[1]?.trim() || text;
}
const currentRouteSets = new Map();
for (const [routeId, rows] of currentGroups) {
  const comparableNo = historicalRouteNo(routeNoById.get(routeId));
  if (!comparableNo) continue;
  for (const row of rows) setAdd(currentRouteSets, row.정류장, comparableNo);
}
const boardingRouteSets = new Map();
for (const row of boarding) setAdd(boardingRouteSets, row.정류장아이디, row.노선번호);
const signature = (values = new Set()) => [...values].sort((a, b) => a.localeCompare(b, 'ko')).join('|');

const optionsByManagement = new Map();
for (const row of survey) {
  const options = [...(candidatesByName.get(name(row['정류장명(카카오맵 표시명)'])) ?? [])].map((boardingId) => {
    const currentRoutesForStop = currentRouteSets.get(row.관리번호) ?? new Set();
    const boardingRoutesForStop = boardingRouteSets.get(boardingId) ?? new Set();
    return { boardingId, currentRouteCount: currentRoutesForStop.size, boardingRouteCount: boardingRoutesForStop.size,
      qualifies: currentRoutesForStop.size > 0 && signature(currentRoutesForStop) === signature(boardingRoutesForStop) };
  }).filter((option) => option.qualifies);
  optionsByManagement.set(row.관리번호, options);
}
const managementsByBoarding = new Map();
for (const [managementId, options] of optionsByManagement) for (const option of options) setAdd(managementsByBoarding, option.boardingId, managementId);

const audit = [];
for (const row of survey) {
  row['카카오맵 표시 방면'] = direction(row['카카오맵 표시 방면']);
  const direct = mappingByManagement.get(row.관리번호);
  if (direct) {
    row['승차자료 정류장 ID'] = direct.boarding_stop_id; row['표본기간 한낮(11~16시) 개별 승차건수'] = Number(direct.midday_boardings) > 0 ? direct.midday_boardings : '';
    row['승차자료 매칭방법'] = direct.match_method; row['승차자료 매칭신뢰등급'] = direct.confidence;
    continue;
  }
  const candidates = [...(candidatesByName.get(name(row['정류장명(카카오맵 표시명)'])) ?? [])];
  const options = optionsByManagement.get(row.관리번호) ?? [];
  const best = options.length === 1 && managementsByBoarding.get(options[0].boardingId)?.size === 1 ? options[0] : null;
  const unambiguous = Boolean(best);
  if (unambiguous) {
    row['승차자료 정류장 ID'] = best.boardingId; row['표본기간 한낮(11~16시) 개별 승차건수'] = Number(middayById.get(best.boardingId)) > 0 ? middayById.get(best.boardingId) : '';
    row['승차자료 매칭방법'] = '전체 경유노선 집합 완전일치·1:1 교차매칭'; row['승차자료 매칭신뢰등급'] = 'high';
  }
  audit.push({ stop_no: row['정류장 번호'], management_id: row.관리번호, stop_name: row['정류장명(카카오맵 표시명)'],
    name_candidate_count: candidates.length, strict_candidate_count: options.length, selected_boarding_stop_id: best?.boardingId ?? '',
    current_route_count: best?.currentRouteCount ?? '', boarding_route_count: best?.boardingRouteCount ?? '',
    decision: unambiguous ? 'matched_strict_unique' : options.length > 1 ? 'unresolved_multiple_strict_candidates' :
      options.length === 1 ? 'unresolved_boarding_id_not_unique' : candidates.length ? 'unresolved_route_set_not_equal' : 'unresolved_no_name_candidate', lookup_date: '2026-07-21' });
}

const surveyExcludedFields = new Set([
  '승차자료 정류장 ID',
  '표본기간 한낮(11~16시) 개별 승차건수',
  '승차자료 매칭방법',
  '승차자료 매칭신뢰등급',
]);
const fields = Object.keys(survey[0]).filter((field) => !surveyExcludedFields.has(field));
write(output, survey, fields);
write(path.join(dataDir, 'stop_id_route_mapping_overrides.csv'), survey
  .filter((r) => r['승차자료 매칭방법'] === '전체 경유노선 집합 완전일치·1:1 교차매칭')
  .map((r) => ({ boarding_stop_id: r['승차자료 정류장 ID'], stop_no: r['정류장 번호'], match_status: 'inferred',
    match_method: 'exact_route_set_unique_cross_validation', confidence: 'high' })),
['boarding_stop_id','stop_no','match_status','match_method','confidence']);
write(path.join(dataDir, 'stop_id_route_match_audit.csv'), audit, ['stop_no','management_id','stop_name','name_candidate_count','strict_candidate_count','selected_boarding_stop_id','current_route_count','boarding_route_count','decision','lookup_date']);
console.log(JSON.stringify({ rows: survey.length, mapped: survey.filter((r) => r['승차자료 정류장 ID']).length, newlyMatched: audit.filter((r) => r.decision === 'matched_strict_unique').length, unresolved: survey.filter((r) => !r['승차자료 정류장 ID']).length }));
