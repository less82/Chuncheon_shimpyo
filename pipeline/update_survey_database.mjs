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
function write(file, rows, fields) { fs.writeFileSync(file, `\uFEFF${fields.join(',')}\r\n${rows.map((r) => fields.map((f) => quote(r[f])).join(',')).join('\r\n')}\r\n`); }
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
  if (['TAGO 노선번호·노선순서 인접 정류장 교차매칭', 'tago_route_number_and_adjacent_stop_unique'].includes(row['승차자료 매칭방법'])) {
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

const currentRouteNos = new Map(), currentNext = new Map(), currentPrev = new Map();
const currentGroups = Map.groupBy(currentRoutes, (r) => r.노선);
for (const [routeId, rows] of currentGroups) {
  const ordered = rows.sort((a, b) => Number(a.정류장순서) - Number(b.정류장순서)); const routeNo = routeNoById.get(routeId);
  for (let i = 0; i < ordered.length; i += 1) { const id = ordered[i].정류장; setAdd(currentRouteNos, id, routeNo); setAdd(currentPrev, id, name(ordered[i - 1]?.정류장명)); setAdd(currentNext, id, name(ordered[i + 1]?.정류장명)); }
}

const boardingRouteNos = new Map(), boardingNext = new Map(), boardingPrev = new Map();
const boardingGroups = Map.groupBy(boarding, (r) => `${r.수집일자}|${r.노선아이디}|${r.이용시간대}`);
for (const rows of boardingGroups.values()) {
  for (let i = 0; i < rows.length; i += 1) { const id = rows[i].정류장아이디; setAdd(boardingRouteNos, id, rows[i].노선번호); setAdd(boardingPrev, id, name(rows[i - 1]?.정류장명)); setAdd(boardingNext, id, name(rows[i + 1]?.정류장명)); }
}
const candidatesByName = new Map();
for (const r of master) { const n = name(r.정류장명); if (!candidatesByName.has(n)) candidatesByName.set(n, new Set()); candidatesByName.get(n).add(r.정류장아이디); }
const mappingByManagement = new Map(mapping
  .filter((r) => r.management_id && r.match_method !== 'tago_route_number_and_adjacent_stop_unique')
  .map((r) => [r.management_id, r]));
const middayById = new Map(mapping.map((r) => [r.boarding_stop_id, r.midday_boardings]));

const audit = [];
for (const row of survey) {
  row['카카오맵 표시 방면'] = direction(row['카카오맵 표시 방면']);
  const direct = mappingByManagement.get(row.관리번호);
  if (direct) {
    row['승차자료 정류장 ID'] = direct.boarding_stop_id; row['표본기간 한낮(11~16시) 개별 승차건수'] = direct.midday_boardings;
    row['승차자료 매칭방법'] = direct.match_method; row['승차자료 매칭신뢰등급'] = direct.confidence;
    continue;
  }
  const candidates = [...(candidatesByName.get(name(row['정류장명(카카오맵 표시명)'])) ?? [])];
  const scored = candidates.map((id) => {
    const route = overlap(currentRouteNos.get(row.관리번호), boardingRouteNos.get(id));
    const prev = overlap(currentPrev.get(row.관리번호), boardingPrev.get(id));
    const next = overlap(currentNext.get(row.관리번호), boardingNext.get(id));
    return { id, score: route + (prev * 3) + (next * 3), route, prev, next };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const best = scored[0], second = scored[1];
  const unambiguous = best && best.score > 0 && best.score >= (second?.score ?? 0) + 3 && (best.prev + best.next > 0);
  if (unambiguous) {
    row['승차자료 정류장 ID'] = best.id; row['표본기간 한낮(11~16시) 개별 승차건수'] = middayById.get(best.id) ?? '';
    row['승차자료 매칭방법'] = 'TAGO 노선번호·노선순서 인접 정류장 교차매칭'; row['승차자료 매칭신뢰등급'] = 'medium';
  }
  audit.push({ stop_no: row['정류장 번호'], management_id: row.관리번호, stop_name: row['정류장명(카카오맵 표시명)'],
    candidate_count: candidates.length, selected_boarding_stop_id: unambiguous ? best.id : '', best_score: best?.score ?? '',
    second_score: second?.score ?? '', route_overlap: best?.route ?? '', previous_stop_overlap: best?.prev ?? '', next_stop_overlap: best?.next ?? '',
    decision: unambiguous ? 'matched' : 'unresolved', lookup_date: '2026-07-21' });
}

// A settlement stop ID represents one physical boarding point. If multiple
// current stops select the same ID, retain it only when one score is uniquely
// stronger; otherwise roll every conflicting proposal back to unresolved.
const autoRows = survey.filter((r) => r['승차자료 매칭방법'] === 'TAGO 노선번호·노선순서 인접 정류장 교차매칭');
for (const conflicts of Map.groupBy(autoRows, (r) => r['승차자료 정류장 ID']).values()) {
  if (conflicts.length < 2) continue;
  const ranked = conflicts.map((row) => ({ row, audit: audit.find((a) => a.management_id === row.관리번호) }))
    .sort((a, b) => Number(b.audit?.best_score ?? 0) - Number(a.audit?.best_score ?? 0));
  const keep = Number(ranked[0].audit?.best_score ?? 0) >= Number(ranked[1].audit?.best_score ?? 0) + 3 ? ranked[0].row : null;
  for (const { row, audit: record } of ranked) {
    if (row === keep) continue;
    row['승차자료 정류장 ID'] = ''; row['표본기간 한낮(11~16시) 개별 승차건수'] = '';
    row['승차자료 매칭방법'] = '매칭 보류'; row['승차자료 매칭신뢰등급'] = '보류';
    if (record) { record.selected_boarding_stop_id = ''; record.decision = 'unresolved_duplicate_candidate'; }
  }
}

const fields = Object.keys(survey[0]);
write(output, survey, fields);
write(path.join(dataDir, 'stop_id_route_mapping_overrides.csv'), survey
  .filter((r) => r['승차자료 매칭방법'] === 'TAGO 노선번호·노선순서 인접 정류장 교차매칭')
  .map((r) => ({ boarding_stop_id: r['승차자료 정류장 ID'], stop_no: r['정류장 번호'], match_status: 'inferred',
    match_method: 'tago_route_number_and_adjacent_stop_unique', confidence: 'medium' })),
['boarding_stop_id','stop_no','match_status','match_method','confidence']);
write(path.join(dataDir, 'stop_id_route_match_audit.csv'), audit, ['stop_no','management_id','stop_name','candidate_count','selected_boarding_stop_id','best_score','second_score','route_overlap','previous_stop_overlap','next_stop_overlap','decision','lookup_date']);
console.log(JSON.stringify({ rows: survey.length, mapped: survey.filter((r) => r['승차자료 정류장 ID']).length, newlyMatched: audit.filter((r) => r.decision === 'matched').length, unresolved: survey.filter((r) => !r['승차자료 정류장 ID']).length }));
