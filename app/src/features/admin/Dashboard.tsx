// 행정 대시보드 (/admin) — 3탭 구조.
// [1단계 조사 검토 순서] / [2단계 설치 검토 우선순위] / [조건 필터(기존 v1 보존)]
// 규칙: B2G는 순위·실측이 주인공, 합성 지수는 보조 셀에만. 승차량엔 항상 "양방향 합산 기준".

import { useEffect, useState } from "react";
import { useStops } from "../../store/useStops";
import FilterTab from "./FilterTab";
import SurveyTab from "./SurveyTab";
import InstallTab from "./InstallTab";
import { loadReports, REPORT_CHANGED_EVENT, REPORT_STORAGE_KEY, updateReportStatus, type CitizenReport } from "../report/reportStore";
import "./Dashboard.css";

type TabKey = "reports" | "survey" | "install" | "filter";

const TABS: { key: TabKey; label: string }[] = [
  { key: "reports", label: "시민 제보 처리" },
  { key: "survey", label: "시설정보 검증 목록" },
  { key: "install", label: "시설 개선 후보" },
  { key: "filter", label: "데이터 분석" },
];

const REPORT_STATUS = {
  received: { label: "신규 접수", next: "reviewing" as const, action: "근거 검토 시작" },
  reviewing: { label: "자료 대조·검토", next: "task_created" as const, action: "현장 과업 생성" },
  task_created: { label: "현장 점검 대기", next: "resolved" as const, action: "처리 완료" },
  resolved: { label: "시민 정보 반영", next: null, action: "완료" },
};

function ReportsTab({ reports }: { reports: CitizenReport[] }) {
  const counts = (Object.keys(REPORT_STATUS) as CitizenReport["status"][]).map((status) => reports.filter((report) => report.status === status).length);
  return <section className="dash-section report-panel">
    <div className="report-section-head"><div><span className="dash-kicker">업무 흐름</span><h3>시민 신호에서 정보 반영까지</h3></div><p>AI는 분류와 대조를 돕고, 상태 변경은 담당자가 확정합니다.</p></div>
    <div className="report-flow" aria-label="제보 처리 흐름">{(Object.keys(REPORT_STATUS) as CitizenReport["status"][]).map((status, index) => <div key={status}><span>{index + 1}</span><p>{REPORT_STATUS[status].label}</p><strong>{counts[index]}건</strong></div>)}</div>
    <div className="report-list-head"><div><span className="dash-kicker">처리 목록</span><h3>접수된 시민 제보</h3></div><div className="report-total"><strong>{reports.length}</strong><span>전체 건</span></div></div>
    {reports.length === 0 ? <div className="report-empty"><h2>아직 접수된 제보가 없습니다</h2><p>시민 화면에서 불편 항목을 제출하면 이곳에 바로 표시됩니다.</p></div> :
      <div className="dash-tablewrap report-tablewrap"><table className="dash-table report-table"><thead><tr><th>접수시각</th><th>정류장</th><th>AI 구조화 결과</th><th>처리 상태</th><th>담당자 작업</th></tr></thead><tbody>{[...reports].reverse().map((report) => { const state = REPORT_STATUS[report.status] ?? REPORT_STATUS.received; return <tr className="dash-row" key={report.id}><td data-label="접수시각">{new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(new Date(report.createdAt))}</td><td data-label="정류장"><b className="dash-stopname">{report.stopName}</b><span className="dash-stopid">#{report.stopNo} · {report.stopId}</span></td><td data-label="AI 구조화 결과"><strong>{report.issue}</strong><span className="dash-stopid">시설 불편 · 시민 위치 확인</span></td><td data-label="처리 상태"><span className="report-status" data-status={report.status}>{state.label}</span></td><td data-label="담당자 작업">{state.next ? <button className="report-action" type="button" onClick={() => updateReportStatus(report.id, state.next!)}>{state.action}</button> : <b>처리 완료</b>}</td></tr>; })}</tbody></table></div>}
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
      <div className="dash-browser">
      <div className="dash-shell">
      <aside className="dash-sidebar">
        <div><span className="dash-kicker">춘천시 교통행정</span><h1 className="dash-title">쉼표정류장</h1></div>
        <nav className="dash-tabs" role="tablist" aria-label="관리 업무">
          {TABS.map((t) => <button key={t.key} type="button" role="tab" id={`tab-${t.key}`} aria-selected={tab === t.key} aria-controls={`tabpanel-${t.key}`} className="dash-tab" onClick={() => setTab(t.key)}>{t.label}</button>)}
        </nav>
        <p className="dash-source">시민 제보와 공공데이터를 구분해 관리합니다.</p>
      </aside>
      <section className="dash-workspace">
        <header className="dash-head"><div><span className="dash-kicker">현재 업무</span><h2>{TABS.find((item) => item.key === tab)?.label}</h2></div><span className="dash-today">2026 춘천시 데이터 활용</span></header>
        <div role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === "reports" && <ReportsTab reports={reports} />}
          {tab === "survey" && <SurveyTab stops={stops} loaded={loaded} />}
          {tab === "install" && <InstallTab stops={stops} loaded={loaded} />}
          {tab === "filter" && <FilterTab stops={stops} loaded={loaded} />}
        </div>
      </section>
      </div>
      </div>
    </main>
  );
}
