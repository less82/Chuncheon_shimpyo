// "1단계 조사 검토 순서" 탭 — buildSurveyPriority(A3) + loadPoi(A6) + PresetBar 조립.
// 규칙: 행에는 실측값(한낮 승차 등)을 병기하고 score는 끝 보조 셀에만.
// "2025.6 4일 표본, 양방향 합산" 배지 상시 표기. noDemand는 순위 없는 별도 섹션.

import { useEffect, useMemo, useState } from "react";
import { buildSurveyPriority, presetStability } from "./surveyPriority";
import { LEAD_REASON_LABEL, exportSurveyCsv } from "./exportCsv";
import PresetBar from "./PresetBar";
import EvidenceCard from "./EvidenceCard";
import { loadPoi } from "../../lib/loadPoi";
import { PRESETS, type PresetKey, type SurveyWeights } from "../../types/priority";
import type { Stop } from "../../types/stop";

const SCENARIO_PRESETS: PresetKey[] = ["heat", "senior", "usage"];

interface Props {
  stops: Stop[];
  loaded: boolean;
}

export default function SurveyTab({ stops, loaded }: Props) {
  const [poiByStopId, setPoiByStopId] = useState<Map<string, number>>(new Map());
  const [presetKey, setPresetKey] = useState<PresetKey | null>("heat");
  const [weights, setWeights] = useState<SurveyWeights>(PRESETS.heat.w);
  const [selected, setSelected] = useState<Stop | null>(null);
  const [visibleCount, setVisibleCount] = useState(50);

  useEffect(() => {
    let cancelled = false;
    loadPoi().then((m) => {
      if (!cancelled) setPoiByStopId(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function selectPreset(key: PresetKey) {
    setPresetKey(key);
    setWeights({ ...PRESETS[key].w });
  }

  const { ranked, noDemand } = useMemo(
    () => buildSurveyPriority(stops, weights, { poiByStopId }),
    [stops, weights, poiByStopId],
  );

  const scenario = useMemo(
    () => presetStability(stops, SCENARIO_PRESETS, { poiByStopId }),
    [stops, poiByStopId],
  );

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of stops) m.set(s.id, s.name);
    return m;
  }, [stops]);

  const scenarioTop = useMemo(
    () =>
      scenario
        .slice()
        .sort((a, b) => b.topTenIn - a.topTenIn || a.avgRank - b.avgRank)
        .slice(0, 10),
    [scenario],
  );

  const selectedRow = selected
    ? ranked.find((r) => r.stop.id === selected.id)
    : undefined;

  // 근거 카드용 한낮 승차 실측 순위(조사 검토 지수 순위와 별개 — demand 내림차순).
  const demandRankOf = useMemo(() => {
    const sorted = ranked
      .slice()
      .sort((a, b) => b.demandMidday - a.demandMidday);
    const m = new Map<string, number>();
    sorted.forEach((r, i) => m.set(r.stop.id, i + 1));
    return m;
  }, [ranked]);

  return (
    <div className="admin-list-page survey-page">
      <section className="dash-section admin-toolbar" aria-label="조사 우선순위 프리셋">
        <div className="admin-section-title"><div><span className="dash-kicker">목록 조건</span><h2 className="dash-h2">검증 기준 선택</h2></div>
        <span className="dash-badge">2025.6 4일 표본, 양방향 합산</span>
        </div>
        <PresetBar
          activeKey={presetKey}
          weights={weights}
          onSelectPreset={selectPreset}
          onChangeWeights={(w) => {
            setPresetKey(null);
            setWeights(w);
          }}
        />
      </section>

      <section className="dash-section admin-support" aria-label="정책 시나리오 비교">
        <h2 className="dash-h2">정책 시나리오 비교</h2>
        <p className="dash-sub">
          폭염 대응형 · 고령자 이동지원형 · 이용량 중심형 3개 프리셋의 상위 10위 진입 빈도와
          평균 순위를 비교합니다.
        </p>
        <div className="dash-tablewrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>정류장</th>
                <th className="dash-c-num">Top10 진입 빈도</th>
                <th className="dash-c-num">평균 순위</th>
              </tr>
            </thead>
            <tbody>
              {scenarioTop.length === 0 ? (
                <tr>
                  <td className="dash-empty" colSpan={3}>
                    비교할 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                scenarioTop.map((row) => (
                  <tr key={row.stopId} className="dash-row">
                    <td>{nameById.get(row.stopId) ?? row.stopId}</td>
                    <td className="dash-c-num">{row.topTenIn} / 3</td>
                    <td className="dash-c-num">{row.avgRank.toFixed(1)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dash-section admin-list-section">
        <div className="dash-resultbar">
          <div><span className="dash-kicker">처리할 목록</span><div className="dash-count">
            {loaded
              ? `조사 검토 대상 ${ranked.length.toLocaleString()}개 정류장`
              : "데이터 불러오는 중…"}
          </div></div>
          <button
            type="button"
            className="dash-csv"
            disabled={ranked.length === 0}
            onClick={() => exportSurveyCsv(ranked)}
          >
            CSV 내려받기
          </button>
        </div>

        <div className="dash-tablewrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th className="dash-c-rank">순위</th>
                <th className="dash-c-name">정류장</th>
                <th className="dash-c-num">한낮 승차*</th>
                <th className="dash-c-num">미확인 시설</th>
                <th>선정 사유</th>
                <th className="dash-c-num">지수(보조)</th>
              </tr>
            </thead>
            <tbody>
              {ranked.length === 0 ? (
                <tr>
                  <td className="dash-empty" colSpan={6}>
                    조사 검토 대상이 없습니다.
                  </td>
                </tr>
              ) : (
                ranked.slice(0, visibleCount).map((row) => (
                  <tr
                    key={row.stop.id}
                    className="dash-row"
                    tabIndex={0}
                    onClick={() => setSelected(row.stop)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected(row.stop);
                      }
                    }}
                  >
                    <td className="dash-c-rank">{row.rank}</td>
                    <td className="dash-c-name">
                      <span className="dash-stopname">{row.stop.name}</span>
                      <span className="dash-stopid">{row.stop.id}</span>
                    </td>
                    <td className="dash-c-num">{row.demandMidday.toLocaleString()}</td>
                    <td className="dash-c-num">{row.unknownCount} / 4</td>
                    <td>{LEAD_REASON_LABEL[row.leadReason]}</td>
                    <td className="dash-c-num">{row.score.toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {ranked.length > visibleCount && <button type="button" className="dash-more" onClick={() => setVisibleCount((count) => count + 50)}>다음 50개 보기</button>}
        <p className="dash-foot">
          * 한낮 승차량은 11~16시 <strong>양방향 합산 기준</strong> 실측 승차 건수입니다.
        </p>
      </section>

      <section className="dash-section admin-secondary-list" aria-label="수요 미확인 조사 후보">
        <h2 className="dash-h2">수요 미확인 조사 후보 — 순위 없음</h2>
        {noDemand.length === 0 ? (
          <p className="dash-sub">수요 미확인 정류장이 없습니다.</p>
        ) : (
          <ul className="dash-nodemand">
            {noDemand.slice(0, 50).map((c) => (
              <li key={c.stop.id}>
                {c.stop.name} — 미확인 시설 {c.unknownCount} / 4
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected && (
        <EvidenceCard
          stop={selected}
          criteria={{}}
          rank={demandRankOf.get(selected.id) ?? null}
          population={ranked.length}
          evidence={
            selectedRow ? LEAD_REASON_LABEL[selectedRow.leadReason] : "조사 검토 후보"
          }
          onClose={() => setSelected(null)}
          surveyRow={selectedRow}
        />
      )}
    </div>
  );
}
