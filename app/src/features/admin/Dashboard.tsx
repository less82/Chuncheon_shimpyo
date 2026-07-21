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

const TABS: { key: TabKey; label: string; ariaLabel: string; description: string }[] = [
  { key: "reports", label: "시민 제보", ariaLabel: "시민 제보 처리", description: "신규 신호 접수" },
  { key: "survey", label: "시설 검증", ariaLabel: "시설정보 검증 목록", description: "근거 대조·조사" },
  { key: "install", label: "개선 검토", ariaLabel: "시설 개선 후보", description: "후보·예산 검토" },
  { key: "filter", label: "데이터 조회", ariaLabel: "데이터 분석", description: "조건별 목록 추출" },
];

const REPORT_STATUS = {
  received: { label: "신규 접수", next: "reviewing" as const, action: "확인 완료 · 자료 대조로 이동" },
  reviewing: { label: "자료 대조", next: "task_created" as const, action: "대조 완료 · 현장 과업 생성" },
  task_created: { label: "현장 점검", next: "resolved" as const, action: "결과 확정 · 시민 정보 반영" },
  resolved: { label: "정보 반영", next: null, action: "완료" },
};

function ReportsTab({ reports }: { reports: CitizenReport[] }) {
  const [statusFilter, setStatusFilter] = useState<CitizenReport["status"] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checks, setChecks] = useState<[boolean, boolean]>([false, false]);
  const statuses = Object.keys(REPORT_STATUS) as CitizenReport["status"][];
  const counts = (Object.keys(REPORT_STATUS) as CitizenReport["status"][]).map((status) => reports.filter((report) => report.status === status).length);
  const visibleReports = statusFilter ? reports.filter((report) => report.status === statusFilter) : reports;
  const currentLabel = statusFilter ? REPORT_STATUS[statusFilter].label : "전체 제보";
  const selected = reports.find((report) => report.id === selectedId) ?? null;
  const reviewItems: Record<CitizenReport["status"], [string, string] | null> = {
    received: ["정류장 식별정보 확인", "시민 원문과 AI 분류 대조"],
    reviewing: ["공식 시설자료 대조", "최근 중복 제보 확인"],
    task_created: ["현장 조사 결과 확인", "사진·조사시각 증빙 확인"],
    resolved: null,
  };
  const selectedState = selected ? REPORT_STATUS[selected.status] : null;
  const requiredChecks = selected ? reviewItems[selected.status] : null;

  function openReview(id: string) {
    setSelectedId(id);
    setChecks([false, false]);
  }

  function advanceSelected() {
    if (!selected || !selectedState?.next || !checks.every(Boolean)) return;
    updateReportStatus(selected.id, selectedState.next);
    setChecks([false, false]);
  }

  return <section className="dash-section report-panel">
    <div className="report-section-head"><div><span className="dash-kicker">처리 단계</span><h3>접수부터 시민 정보 반영까지</h3></div></div>
    <div className="report-flow" aria-label="제보 처리 단계">{statuses.map((status, index) => <button type="button" key={status} aria-pressed={statusFilter === status} onClick={() => setStatusFilter((current) => current === status ? null : status)}><span>{index + 1}</span><span className="report-flow-copy"><small>{index === 0 ? "시민 신호" : index === 1 ? "근거 확인" : index === 2 ? "담당자 실행" : "정보 갱신"}</small><b>{REPORT_STATUS[status].label}</b></span><strong>{counts[index]}<small>건</small></strong></button>)}</div>
    <div className="report-list-head"><div><span className="dash-kicker">업무 목록</span><h3>{currentLabel}</h3></div><div className="report-list-tools"><div className="report-total"><strong>{visibleReports.length}</strong><span>건</span></div>{statusFilter && <button type="button" onClick={() => setStatusFilter(null)}>전체 보기</button>}</div></div>
    <div className="report-workbench">
      <div className="report-queue">
        {visibleReports.length === 0 ? <div className="report-empty"><h2>{statusFilter ? `${currentLabel} 업무가 없습니다` : "아직 접수된 제보가 없습니다"}</h2><p>{statusFilter ? "다른 처리 단계를 선택해 확인하세요." : "시민 화면에서 불편 항목을 제출하면 이곳에 바로 표시됩니다."}</p></div> :
          <div className="dash-tablewrap report-tablewrap"><table className="dash-table report-table"><thead><tr><th>접수시각</th><th>정류장</th><th>AI 구조화 결과</th><th>현재 단계</th><th>검토</th></tr></thead><tbody>{[...visibleReports].reverse().map((report) => { const state = REPORT_STATUS[report.status] ?? REPORT_STATUS.received; return <tr className="dash-row" key={report.id} aria-selected={selectedId === report.id}><td data-label="접수시각">{new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(new Date(report.createdAt))}</td><td data-label="정류장"><b className="dash-stopname">{report.stopName}</b><span className="dash-stopid">#{report.stopNo} · {report.stopId}</span></td><td data-label="AI 구조화 결과"><strong>{report.issue}</strong><span className="dash-stopid">분류 후보 · 시설 불편</span></td><td data-label="현재 단계"><span className="report-status" data-status={report.status}>{state.label}</span></td><td data-label="검토"><button className="report-action" type="button" onClick={() => openReview(report.id)}>검토 열기</button></td></tr>; })}</tbody></table></div>}
      </div>
      <aside className="report-review" aria-label="제보 검토 패널">
        {!selected ? <div className="report-review-empty"><strong>검토할 제보를 선택하세요</strong><span>목록의 ‘검토 열기’를 누르면 근거와 필수 확인 항목이 표시됩니다.</span></div> : <>
          <header><div><span className="dash-kicker">{selectedState?.label}</span><h3>{selected.stopName}</h3></div><button type="button" onClick={() => setSelectedId(null)} aria-label="검토 패널 닫기">×</button></header>
          <dl className="report-evidence">
            <div><dt>시민 원문</dt><dd>{selected.issue}</dd></div>
            <div><dt>정류장 근거</dt><dd>#{selected.stopNo} · {selected.stopId}</dd></div>
            <div><dt>AI 분류</dt><dd>시설 불편 후보 · 담당자 확정 전</dd></div>
            <div><dt>공식자료 대조</dt><dd>{selected.status === "received" ? "아직 대조하지 않음" : "담당자 확인 단계 통과"}</dd></div>
          </dl>
          {requiredChecks ? <fieldset className="report-checks"><legend>필수 확인</legend>{requiredChecks.map((label, index) => <label key={label}><input type="checkbox" checked={checks[index]} onChange={(event) => setChecks((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.checked : value) as [boolean, boolean])}/><span>{label}</span></label>)}</fieldset> : <p className="report-complete">사람의 확인을 거쳐 시민 정보에 반영된 건입니다.</p>}
          {selectedState?.next && <button className="report-confirm" type="button" disabled={!checks.every(Boolean)} onClick={advanceSelected}>{selectedState.action}</button>}
        </>}
      </aside>
    </div>
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
          {TABS.map((t) => <button key={t.key} type="button" role="tab" id={`tab-${t.key}`} aria-label={t.ariaLabel} aria-selected={tab === t.key} aria-controls={`tabpanel-${t.key}`} className="dash-tab" onClick={() => setTab(t.key)}><span><b>{t.label}</b><small>{t.description}</small></span></button>)}
        </nav>
      </aside>
      <section className="dash-workspace">
        <header className="dash-head"><div><span className="dash-kicker">{TABS.find((item) => item.key === tab)?.description}</span><h2>{TABS.find((item) => item.key === tab)?.label}</h2></div></header>
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
