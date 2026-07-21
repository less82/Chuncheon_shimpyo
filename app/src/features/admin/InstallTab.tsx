// "2단계 설치 검토 우선순위" 탭 — buildInstallPriority(A4) + loadPoi(A6) + BudgetSim 조립.
// ⚠️ 중단 조건 1: unknown(미확인)은 절대 설치 후보로 보여주지 않는다.
//    엔진(installPriority.ts)이 이미 no & source=roadview만 필터하므로 그대로 렌더한다.

import { useEffect, useMemo, useState } from "react";
import { buildInstallPriority } from "./installPriority";
import { exportInstallCsv } from "./exportCsv";
import BudgetSim from "./BudgetSim";
import EvidenceCard from "./EvidenceCard";
import { loadPoi } from "../../lib/loadPoi";
import { sourceBadge, KIND_LABEL } from "../../lib/facilityText";
import { INSTALL_STATUS_LABEL, type InstallFacilityKind } from "../../types/priority";
import type { Stop } from "../../types/stop";

const FACILITY_ORDER: InstallFacilityKind[] = ["seat", "shade", "light"];

interface Props {
  stops: Stop[];
  loaded: boolean;
}

export default function InstallTab({ stops, loaded }: Props) {
  const [poiByStopId, setPoiByStopId] = useState<Map<string, number>>(new Map());
  const [facility, setFacility] = useState<InstallFacilityKind>("seat");
  const [selected, setSelected] = useState<Stop | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPoi().then((m) => {
      if (!cancelled) setPoiByStopId(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(
    () => buildInstallPriority(stops, facility, { poiByStopId }),
    [stops, facility, poiByStopId],
  );

  const selectedRow = selected
    ? rows.find((r) => r.stop.id === selected.id)
    : undefined;

  return (
    <div className="admin-list-page install-page">
      <section className="dash-section admin-toolbar" aria-label="설치 검토 시설 선택">
        <div className="admin-section-title"><div><span className="dash-kicker">목록 조건</span><h2 className="dash-h2">검토할 시설 선택</h2></div>
        <span className="dash-badge">2025.6 4일 표본, 양방향 합산</span>
        </div>
        <div className="dash-toggles" role="tablist" aria-label="설치 검토 시설">
          {FACILITY_ORDER.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              className="dash-pill"
              aria-selected={facility === f}
              onClick={() => setFacility(f)}
            >
              {KIND_LABEL[f]}
            </button>
          ))}
        </div>
      </section>

      <section className="dash-section admin-list-section">
        {!loaded ? (
          <p className="dash-sub">데이터 불러오는 중…</p>
        ) : rows.length === 0 ? (
          <p className="dash-sub">
            {KIND_LABEL[facility]} — 조사 반영 전 — 1단계를 먼저 진행해 로드뷰로 "없음"을
            확정해야 설치 검토 후보가 나타납니다.
          </p>
        ) : (
          <>
            <div className="dash-resultbar">
              <div><span className="dash-kicker">처리할 목록</span><div className="dash-count">
                {KIND_LABEL[facility]} 설치 검토 후보{" "}
                <strong>{rows.length.toLocaleString()}</strong>곳
              </div></div>
              <button
                type="button"
                className="dash-csv"
                onClick={() => exportInstallCsv(rows)}
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
                    <th className="dash-c-num">한낮 승차</th>
                    <th>출처</th>
                    <th>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
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
                      <td className="dash-c-num">
                        {row.demandMidday !== null ? (
                          row.demandMidday.toLocaleString()
                        ) : (
                          <span className="dash-muted">수요 미확인</span>
                        )}
                      </td>
                      <td>{sourceBadge(row.stop.facilities[row.facility])}</td>
                      <td className="dash-status">{INSTALL_STATUS_LABEL}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <BudgetSim rows={rows} facilityLabel={KIND_LABEL[facility]} />
          </>
        )}
      </section>

      {selected && selectedRow && (
        <EvidenceCard
          stop={selected}
          criteria={{}}
          rank={null}
          population={0}
          evidence={INSTALL_STATUS_LABEL}
          onClose={() => setSelected(null)}
          installRow={selectedRow}
        />
      )}
    </div>
  );
}
