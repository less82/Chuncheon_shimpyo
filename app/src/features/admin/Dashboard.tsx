// 행정 대시보드 (/admin) — 3탭 구조.
// [1단계 조사 검토 순서] / [2단계 설치 검토 우선순위] / [조건 필터(기존 v1 보존)]
// 규칙: B2G는 순위·실측이 주인공, 합성 지수는 보조 셀에만. 승차량엔 항상 "양방향 합산 기준".

import { useState } from "react";
import { useStops } from "../../store/useStops";
import FilterTab from "./FilterTab";
import SurveyTab from "./SurveyTab";
import InstallTab from "./InstallTab";
import "./Dashboard.css";

type TabKey = "survey" | "install" | "filter";

const TABS: { key: TabKey; label: string }[] = [
  { key: "survey", label: "1단계 조사 검토 순서" },
  { key: "install", label: "2단계 설치 검토 우선순위" },
  { key: "filter", label: "조건 필터" },
];

export default function Dashboard() {
  const stops = useStops((s) => s.stops);
  const loaded = useStops((s) => s.loaded);
  const [tab, setTab] = useState<TabKey>("survey");

  return (
    <main className="dash">
      <header className="dash-head">
        <div>
          <h1 className="dash-title">쉼표 정류장 · 설치 후보 대시보드</h1>
          <p className="dash-sub">
            1단계는 조사(로드뷰) 우선순위, 2단계는 조사로 확정된 "없음" 시설의 설치
            검토 순위입니다. 순위와 승차량은 모두 <strong>실측치</strong>이며, 미확인
            시설을 설치 후보로 보여주지 않습니다.
          </p>
        </div>
      </header>

      <div className="dash-tabs" role="tablist" aria-label="대시보드 탭">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`tabpanel-${t.key}`}
            className="dash-tab"
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`tabpanel-${tab}`}
        aria-labelledby={`tab-${tab}`}
      >
        {tab === "survey" && <SurveyTab stops={stops} loaded={loaded} />}
        {tab === "install" && <InstallTab stops={stops} loaded={loaded} />}
        {tab === "filter" && <FilterTab stops={stops} loaded={loaded} />}
      </div>
    </main>
  );
}
