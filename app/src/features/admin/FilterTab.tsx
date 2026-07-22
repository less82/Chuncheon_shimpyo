// "조건 필터" 탭 — 기존 v1 대시보드 화면 그대로 보존.
// 규칙: 합성 점수 표시 금지(조건이 곧 설명), 승차량엔 항상 "양방향 합산 기준".

import { useMemo, useState } from "react";
import {
  applyFilters,
  middayBoarding,
  SEASON_PRESETS,
  SEASON_LABELS,
  SEASON_DESC,
  type FilterCriteria,
  type SeasonKey,
} from "./filters";
import { facilityLabel, statusColor, KIND_LABEL } from "../../lib/facilityText";
import { exportCsv, type CsvRow } from "./exportCsv";
import EvidenceCard from "./EvidenceCard";
import type { Stop } from "../../types/stop";

const SEASON_ORDER: SeasonKey[] = ["summer", "winter", "spring", "fall"];
const TOP_N_OPTIONS = [10, 20, 50];

/** 상위% 선택지 (합성 점수 아님 — 실측 분위수 경계). */
const PERCENT_OPTIONS = [10, 25, 40, 100];

/** 근거요약(조건 기반, 점수 아님). */
function buildEvidence(stop: Stop, c: FilterCriteria): string {
  const parts: string[] = [];
  if (c.middayTopPercent !== undefined && c.middayTopPercent < 100) {
    parts.push(`한낮 승차 상위 ${c.middayTopPercent}%`);
  }
  if (c.shadeUnknown) parts.push("그늘 미확인");
  if (c.seatUnknown) parts.push("의자 미확인");
  if (c.notShelter) parts.push("완비 쉘터 아님");
  if (parts.length === 0) {
    // 필터 없을 때도 실측 사실만 노출.
    if (stop.facilities.shade.status === "unknown") parts.push("그늘 미확인");
    if (stop.facilities.seat.status === "unknown") parts.push("의자 미확인");
  }
  return parts.join(" · ") || "조건 없음";
}

/** 시설 3상태 미니 칩 — facilityText 재사용(색 비의존: 한글 라벨 병기). */
function FacilityChip({
  kind,
  status,
}: {
  kind: keyof typeof KIND_LABEL;
  status: "yes" | "no" | "unknown";
}) {
  return (
    <span className="dash-chip" data-color={statusColor(status)}>
      {KIND_LABEL[kind]} {facilityLabel({ status, source: "none" })}
    </span>
  );
}

interface Props {
  stops: Stop[];
  loaded: boolean;
}

export default function FilterTab({ stops, loaded }: Props) {
  const [criteria, setCriteria] = useState<FilterCriteria>(
    SEASON_PRESETS.summer,
  );
  const [activePreset, setActivePreset] = useState<SeasonKey | null>("summer");
  const [topN, setTopN] = useState(10);
  const [selected, setSelected] = useState<Stop | null>(null);

  // 한낮 승차 순위(전체 demand 모집단) — 근거 카드용.
  const { rankOf, population } = useMemo(() => {
    const pop = stops
      .filter((s) => s.demand)
      .map((s) => ({ id: s.id, m: middayBoarding(s) ?? 0 }))
      .sort((a, b) => b.m - a.m);
    const map = new Map<string, number>();
    pop.forEach((x, i) => map.set(x.id, i + 1));
    return { rankOf: map, population: pop.length };
  }, [stops]);

  // 필터 적용 → 한낮 승차 내림차순 → TOP N.
  const results = useMemo(() => {
    const filtered = applyFilters(stops, criteria);
    return filtered
      .slice()
      .sort((a, b) => (middayBoarding(b) ?? 0) - (middayBoarding(a) ?? 0))
      .slice(0, topN);
  }, [stops, criteria, topN]);

  const totalMatched = useMemo(
    () => applyFilters(stops, criteria).length,
    [stops, criteria],
  );

  const rows: CsvRow[] = useMemo(
    () =>
      results.map((s, i) => ({
        rank: i + 1,
        name: s.name,
        id: s.id,
        middayBoarding: middayBoarding(s) ?? 0,
        totalBoarding: s.demand?.total ?? 0,
        shade: facilityLabel(s.facilities.shade),
        seat: facilityLabel(s.facilities.seat),
        light: facilityLabel(s.facilities.light),
        sign: facilityLabel(s.facilities.sign),
        evidence: buildEvidence(s, criteria),
      })),
    [results, criteria],
  );

  function selectPreset(key: SeasonKey) {
    setActivePreset(key);
    setCriteria({ ...SEASON_PRESETS[key] });
  }

  function toggle(field: keyof FilterCriteria) {
    setActivePreset(null);
    setCriteria((c) => ({ ...c, [field]: c[field] ? undefined : true }));
  }

  function setPercent(pct: number) {
    setActivePreset(null);
    setCriteria((c) => ({ ...c, middayTopPercent: pct }));
  }

  return (
    <div className="admin-list-page filter-page">
      {/* 계절 프리셋 */}
      <section className="dash-section admin-toolbar filter-presets" aria-label="계절 프리셋">
        <span className="dash-kicker">빠른 조건</span><h2 className="dash-h2">계절 프리셋</h2>
        <div className="dash-presets">
          {SEASON_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              className="dash-preset"
              aria-pressed={activePreset === key}
              onClick={() => selectPreset(key)}
            >
              <span className="dash-preset__name">{SEASON_LABELS[key]}</span>
              <span className="dash-preset__desc">{SEASON_DESC[key]}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 개별 조건 토글 */}
      <section className="dash-section admin-toolbar filter-conditions" aria-label="조건 필터">
        <span className="dash-kicker">세부 조건</span><h2 className="dash-h2">직접 조정</h2>
        <div className="dash-toggles">
          <div className="dash-percent" role="group" aria-label="한낮 승차 상위">
            <span className="dash-toggle-label">한낮(11~16시) 승차 상위</span>
            {PERCENT_OPTIONS.map((p) => (
              <button
                key={p}
                type="button"
                className="dash-pill"
                aria-pressed={criteria.middayTopPercent === p}
                onClick={() => setPercent(p)}
              >
                {p === 100 ? "전체" : `${p}%`}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="dash-pill"
            aria-pressed={!!criteria.shadeUnknown}
            onClick={() => toggle("shadeUnknown")}
          >
            그늘 미확인만
          </button>
          <button
            type="button"
            className="dash-pill"
            aria-pressed={!!criteria.seatUnknown}
            onClick={() => toggle("seatUnknown")}
          >
            의자 미확인만
          </button>
          <button
            type="button"
            className="dash-pill"
            aria-pressed={!!criteria.notShelter}
            onClick={() => toggle("notShelter")}
          >
            완비 쉘터 제외
          </button>
        </div>
      </section>

      {/* 결과 요약 + CSV */}
      <section className="dash-section admin-list-section filter-results">
        <div className="dash-resultbar">
          <div><span className="dash-kicker">조회 결과</span><div className="dash-count">
            {loaded ? (
              <>
                조건 만족 <strong>{totalMatched.toLocaleString()}</strong>개 정류장
                · 상위{" "}
                <label className="dash-topn">
                  <select
                    value={topN}
                    onChange={(e) => setTopN(Number(e.target.value))}
                    aria-label="상위 몇 개 표시"
                  >
                    {TOP_N_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                개 표시
              </>
            ) : (
              "데이터 불러오는 중…"
            )}
          </div></div>
          <button
            type="button"
            className="dash-csv"
            disabled={rows.length === 0}
            onClick={() => exportCsv(rows)}
          >
            CSV 내려받기
          </button>
        </div>

        {/* TOP N 표 */}
        <div className="dash-tablewrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th className="dash-c-rank">순위</th>
                <th className="dash-c-name">정류장</th>
                <th className="dash-c-num">
                  한낮 승차<sup>*</sup>
                </th>
                <th className="dash-c-fac">시설 현황</th>
                <th className="dash-c-ev">근거 요약</th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 ? (
                <tr>
                  <td className="dash-empty" colSpan={5}>
                    조건을 만족하는 정류장이 없습니다.
                  </td>
                </tr>
              ) : (
                results.map((s, i) => (
                  <tr
                    key={s.id}
                    className="dash-row"
                    tabIndex={0}
                    onClick={() => setSelected(s)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected(s);
                      }
                    }}
                  >
                    <td className="dash-c-rank">{i + 1}</td>
                    <td className="dash-c-name">
                      <span className="dash-stopname">{s.name}</span>
                      <span className="dash-stopid">{s.id}</span>
                    </td>
                    <td className="dash-c-num">
                      {(middayBoarding(s) ?? 0).toLocaleString()}
                    </td>
                    <td className="dash-c-fac">
                      <div className="dash-chips">
                        <FacilityChip kind="shade" status={s.facilities.shade.status} />
                        <FacilityChip kind="seat" status={s.facilities.seat.status} />
                        <FacilityChip kind="light" status={s.facilities.light.status} />
                        <FacilityChip kind="sign" status={s.facilities.sign.status} />
                      </div>
                    </td>
                    <td className="dash-c-ev">{buildEvidence(s, criteria)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="dash-foot">
          <sup>*</sup> 한낮 승차량은 11~16시 <strong>양방향 합산 기준</strong>{" "}
          실측 승차 건수입니다. 미확인 시설은 "없음"이 아니라 아직 조사되지 않았음을
          뜻합니다.
        </p>
      </section>

      {selected && (
        <EvidenceCard
          stop={selected}
          criteria={criteria}
          rank={rankOf.get(selected.id) ?? null}
          population={population}
          evidence={buildEvidence(selected, criteria)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
