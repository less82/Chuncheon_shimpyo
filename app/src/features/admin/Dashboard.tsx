// 행정 대시보드 (/admin) — 3탭 구조.
// [1단계 조사 검토 순서] / [2단계 설치 검토 우선순위] / [조건 필터(기존 v1 보존)]
// 규칙: B2G는 순위·실측이 주인공, 합성 지수는 보조 셀에만. 승차량엔 항상 "양방향 합산 기준".

import { useEffect, useState } from "react";
import { useStops } from "../../store/useStops";
import FilterTab from "./FilterTab";
import SurveyTab from "./SurveyTab";
import InstallTab from "./InstallTab";
import { loadReports, REPORT_CHANGED_EVENT, REPORT_STORAGE_KEY, type CitizenReport } from "../report/reportStore";
import "./Dashboard.css";

type TabKey = "reports" | "survey" | "install" | "filter";

const TABS: { key: TabKey; label: string }[] = [
  { key: "reports", label: "시민 불편 제보" },
  { key: "survey", label: "1단계 조사 검토 순서" },
  { key: "install", label: "2단계 설치 검토 우선순위" },
  { key: "filter", label: "조건 필터" },
];

function ReportsTab({ reports }: { reports: CitizenReport[] }) {
  return <section className="dash-section report-panel">
    <div className="report-summary"><div><span>신규 제보</span><strong>{reports.length}</strong></div><p>시민 앱에서 위치와 정류장을 확인한 뒤 제출한 항목입니다.</p></div>
    {reports.length === 0 ? <div className="report-empty"><h2>아직 접수된 제보가 없습니다</h2><p>시민 화면에서 불편 항목을 제출하면 이곳에 바로 표시됩니다.</p></div> :
      <div className="dash-tablewrap"><table className="dash-table report-table"><thead><tr><th>접수시각</th><th>정류장</th><th>불편 내용</th><th>상태</th></tr></thead><tbody>{[...reports].reverse().map((report) => <tr className="dash-row" key={report.id}><td>{new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(new Date(report.createdAt))}</td><td><b className="dash-stopname">{report.stopName}</b><span className="dash-stopid">#{report.stopNo} · {report.stopId}</span></td><td><strong>{report.issue}</strong></td><td><span className="report-status">신규 접수</span></td></tr>)}</tbody></table></div>}
  </section>;
}

export default function Dashboard() {
  const stops = useStops((s) => s.stops);
  const loaded = useStops((s) => s.loaded);
  const [tab, setTab] = useState<TabKey>("reports");
  const [reports, setReports] = useState<CitizenReport[]>(() => loadReports());

  useEffect(() => {
    const refresh = () => setReports(loadReports());
    const onStorage = (event: StorageEvent) => {
      if (event.key === REPORT_STORAGE_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(REPORT_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(REPORT_CHANGED_EVENT, refresh);
    };
  }, []);

  return (
    <main className="dash">
      <header className="dash-head">
        <div>
          <h1 className="dash-title">쉼표정류장 행정 대시보드</h1>
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
        {tab === "reports" && <ReportsTab reports={reports} />}
        {tab === "survey" && <SurveyTab stops={stops} loaded={loaded} />}
        {tab === "install" && <InstallTab stops={stops} loaded={loaded} />}
        {tab === "filter" && <FilterTab stops={stops} loaded={loaded} />}
      </div>
    </main>
  );
}
