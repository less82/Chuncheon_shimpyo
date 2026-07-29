// 행정 대시보드 (/admin) — 3탭 구조.
// [1단계 조사 검토 순서] / [2단계 설치 검토 우선순위] / [조건 필터(기존 v1 보존)]
// 규칙: B2G는 순위·실측이 주인공, 합성 지수는 보조 셀에만. 승차량엔 항상 "양방향 합산 기준".

import { useEffect, useMemo, useRef, useState } from "react";
import { useStops } from "../../store/useStops";
import FilterTab from "./FilterTab";
import SurveyTab from "./SurveyTab";
import InstallTab from "./InstallTab";
import {
  loadReports,
  REPORT_CHANGED_EVENT,
  REPORT_STORAGE_KEY,
  updateReportStatus,
  upsertReport,
  type CitizenReport,
} from "../report/reportStore";
import {
  loadMaengCocoReports,
  updateMaengCocoReportStatus,
} from "../maeng-coco/maengCocoApi";
import { buildReportInsights } from "./reportInsights";
import { REPORT_KINDS, categoryInfo, type ContactCategory } from "../../data/busContacts";
// VLM 사진 설명은 관리자(B2G) 전용이다. 시민 화면에서는 이 모듈을 import 하지 않는다.
import { explainReportPhoto, type VlmExplanation } from "./facilityVlm";
import "./Dashboard.css";

type TabKey = "reports" | "survey" | "install" | "filter";

const TABS: { key: TabKey; label: string; ariaLabel: string; description: string }[] = [
  { key: "reports", label: "시민 제보", ariaLabel: "시민 제보 처리", description: "신규 신호 접수" },
  { key: "survey", label: "시설 검증", ariaLabel: "시설정보 검증 목록", description: "근거 대조·조사" },
  { key: "install", label: "개선 검토", ariaLabel: "시설 개선 후보", description: "후보·예산 검토" },
  { key: "filter", label: "데이터 조회", ariaLabel: "데이터 분석", description: "조건별 목록 추출" },
];

const REPORT_STATUS = {
  received: { label: "접수", next: "reviewing" as const, action: "접수 확인" },
  reviewing: { label: "담당 배정", next: "task_created" as const, action: "담당 확인 · 처리 시작" },
  task_created: { label: "처리 중", next: "resolved" as const, action: "처리 결과 등록" },
  resolved: { label: "처리 완료", next: null, action: "완료" },
};

/** VLM 설명 실패는 담당자가 할 수 있는 일이 다르므로 이유별로 다르게 안내한다. */
function vlmFailText(reason: VlmExplanation["reason"]): string {
  if (reason === "no_key") return "AI 설명 기능이 설정되지 않았습니다";
  if (reason === "no_image") return "사진 형식을 확인할 수 없습니다";
  if (reason === "timeout") return "시간이 초과됐습니다. 다시 시도해 주세요";
  return "설명을 만들지 못했습니다";
}

/** 목록 상단 유형 줄에서 고를 수 있는 값. null 은 전체다. */
type KindFilter = ContactCategory | "unclassified";

/**
 * 제보의 알리기 유형.
 * 시민이 직접 고른 reportKind 가 있으면 그 값이 우선이고, 없으면 저장 시점 분류를 쓴다.
 * 둘 다 없는 옛 제보는 임의로 넣지 않고 "미분류"로 둔다.
 */
function kindOfReport(report: CitizenReport): ContactCategory | null {
  return report.reportKind ?? report.contactCategory ?? null;
}

function matchesKind(report: CitizenReport, filter: KindFilter | null): boolean {
  if (!filter) return true;
  const kind = kindOfReport(report);
  return filter === "unclassified" ? kind === null : kind === filter;
}

/** 유형 줄과 처리 현황 머리글에 함께 쓰는 이름. */
function kindFilterLabel(filter: KindFilter | null): string {
  if (!filter) return "전체 제보";
  if (filter === "unclassified") return "미분류";
  return REPORT_KINDS.find((item) => item.category === filter)?.label ?? "미분류";
}

/**
 * 고른 유형의 담당 접수처 한 줄.
 * 버스 이용 불편은 정류장에 오는 노선에 따라 운수회사가 달라지므로 여기서 단정하지 않는다.
 */
function deskTextFor(filter: KindFilter | null): string {
  if (!filter) return "유형을 고르면 담당 접수처를 보여줍니다";
  if (filter === "unclassified") return "유형이 없어 담당 접수처를 정할 수 없습니다";
  if (filter === "ride") return "정류장에 따라 다름 — 그 정류장에 오는 노선의 운수회사";
  return categoryInfo(filter).contacts.map((contact) => `${contact.org} ${contact.phone}`).join(" · ");
}

function ReportsTab({
  reports,
  onAdvance,
}: {
  reports: CitizenReport[];
  /** 저장까지 성공했으면 true. false 면 상태가 바뀌지 않았다는 뜻이다. */
  onAdvance: (
    report: CitizenReport,
    status: CitizenReport["status"],
  ) => boolean;
}) {
  const PAGE_SIZE = 4;
  const [kindFilter, setKindFilter] = useState<KindFilter | null>(null);
  const [statusFilter, setStatusFilter] = useState<CitizenReport["status"] | null>(null);
  const [attentionFilter, setAttentionFilter] = useState<"open" | "safety" | "overlap" | null>(null);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checks, setChecks] = useState<[boolean, boolean]>([false, false]);
  /** 처리 상태 저장이 실패했을 때만 채운다. 채워져 있으면 단계가 넘어가지 않았다는 뜻이다. */
  const [advanceError, setAdvanceError] = useState("");
  // 제보 id 별 사진 설명. 담당자가 버튼을 눌렀을 때만 채워지고, 다시 열어도 남는다.
  const [explanations, setExplanations] = useState<Record<string, VlmExplanation>>({});
  const [explainingId, setExplainingId] = useState<string | null>(null);
  const modalRef = useRef<HTMLElement>(null);
  const statuses = Object.keys(REPORT_STATUS) as CitizenReport["status"][];
  const insights = useMemo(() => buildReportInsights(reports), [reports]);
  // 유형 줄의 건수는 항상 전체 제보 기준이다(무엇을 받을 수 있는지 보여주는 줄이라 0건도 남긴다).
  const kindCounts = REPORT_KINDS.map((kind) => reports.filter((report) => kindOfReport(report) === kind.category).length);
  const unclassifiedCount = reports.filter((report) => kindOfReport(report) === null).length;
  const kindLabel = kindFilterLabel(kindFilter);
  const deskText = deskTextFor(kindFilter);
  // 아래 요약·목록은 모두 고른 유형 안에서만 센다.
  const kindInsights = insights.filter(({ report }) => matchesKind(report, kindFilter));
  const counts = statuses.map((status) => kindInsights.filter(({ report }) => report.status === status).length);
  const unresolved = kindInsights.filter(({ report }) => report.status !== "resolved");
  const repeatedGroups = new Set(unresolved.filter((item) => item.overlap >= 2).map((item) => `${item.report.stopId}:${item.category}`)).size;
  const visibleInsights = kindInsights
    .filter(({ report }) => !statusFilter || report.status === statusFilter)
    .filter((item) => attentionFilter === "open" ? item.report.status !== "resolved" : attentionFilter === "safety" ? item.safety === "안전 관련" && item.report.status !== "resolved" : attentionFilter === "overlap" ? item.overlap >= 2 && item.report.status !== "resolved" : true);
  const orderedReports = [...visibleInsights].sort((a, b) => new Date(a.report.createdAt).getTime() - new Date(b.report.createdAt).getTime());
  const totalPages = Math.max(1, Math.ceil(orderedReports.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageReports = orderedReports.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pageNumbers = Array.from({ length: Math.min(5, totalPages) }, (_, index) => {
    const start = Math.min(Math.max(1, currentPage - 2), Math.max(1, totalPages - 4));
    return start + index;
  });
  const currentLabel = attentionFilter === "open" ? "미처리 제보" : attentionFilter === "safety" ? "안전 관련 제보" : attentionFilter === "overlap" ? "유사 제보 집중" : statusFilter ? REPORT_STATUS[statusFilter].label : kindLabel;
  const hasNarrowFilter = Boolean(statusFilter || attentionFilter);
  const selected = reports.find((report) => report.id === selectedId) ?? null;
  const selectedInsight = insights.find(({ report }) => report.id === selectedId) ?? null;
  const reviewItems: Record<CitizenReport["status"], [string, string] | null> = {
    received: ["정류장 식별정보 확인", "소관 담당 지정"],
    reviewing: ["제보 내용과 첨부자료 확인", "처리 방법 결정"],
    task_created: ["조치 결과 확인", "결과 기록 또는 통지 내용 확인"],
    resolved: null,
  };
  const selectedState = selected ? REPORT_STATUS[selected.status] : null;
  const requiredChecks = selected ? reviewItems[selected.status] : null;
  const selectedExplanation = selected ? explanations[selected.id] ?? null : null;
  const explaining = Boolean(selected && explainingId === selected.id);

  // 모달 기본기(포커스 이동·순환·복원·배경 스크롤 잠금)는 components/ConfirmModal 과 같은 방식으로 맞춘다.
  useEffect(() => {
    if (!selectedId) return;
    const modal = modalRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const focusables = () =>
      [...(modal?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])]
        .filter((element) => !element.hasAttribute("disabled"));
    focusables()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedId(null);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = Boolean(active && modal?.contains(active));
      if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [selectedId]);

  function openReview(id: string) {
    setSelectedId(id);
    setChecks([false, false]);
    setAdvanceError("");
  }

  // 비용이 드는 호출이라 모달을 열 때가 아니라 담당자가 눌렀을 때만 부른다.
  async function requestExplanation(report: CitizenReport) {
    if (!report.photoDataUrl || explainingId) return;
    setExplainingId(report.id);
    try {
      const result = await explainReportPhoto(report.photoDataUrl, {
        stopName: report.stopName,
        issue: report.issue,
      });
      setExplanations((current) => ({ ...current, [report.id]: result }));
    } finally {
      setExplainingId(null);
    }
  }

  function advanceSelected() {
    if (!selected || !selectedState?.next || !checks.every(Boolean)) return;
    // 저장에 실패하면 상태가 바뀌지 않았다. 모달을 닫지 않고 확인 항목도 그대로 둔다.
    if (!onAdvance(selected, selectedState.next)) {
      setAdvanceError("처리 상태를 저장하지 못했습니다. 잠시 뒤 다시 눌러주세요.");
      return;
    }
    setAdvanceError("");
    setChecks([false, false]);
  }

  function selectKind(next: KindFilter | null) {
    setKindFilter(next);
    setStatusFilter(null);
    setAttentionFilter(null);
    setPage(1);
    setSelectedId(null);
  }

  return <section className="dash-section report-panel">
    <div className="report-kinds" role="tablist" aria-label="알리기 유형">
      <button className="report-kind" type="button" role="tab" id="report-kind-all" aria-controls="report-kind-panel" aria-selected={kindFilter === null} onClick={() => selectKind(null)}><b>전체</b><strong>{reports.length}<small>건</small></strong></button>
      {REPORT_KINDS.map((kind, index) => <button className="report-kind" type="button" role="tab" key={kind.category} id={`report-kind-${kind.category}`} aria-controls="report-kind-panel" aria-selected={kindFilter === kind.category} onClick={() => selectKind(kind.category)}><b>{kind.label}</b><strong>{kindCounts[index]}<small>건</small></strong></button>)}
      {(unclassifiedCount > 0 || kindFilter === "unclassified") && <button className="report-kind" type="button" role="tab" id="report-kind-unclassified" aria-controls="report-kind-panel" aria-selected={kindFilter === "unclassified"} onClick={() => selectKind("unclassified")}><b>미분류</b><strong>{unclassifiedCount}<small>건</small></strong></button>}
    </div>
    <p className="report-desk"><span>담당 접수처</span><b>{deskText}</b></p>
    <div id="report-kind-panel" role="tabpanel" aria-labelledby={`report-kind-${kindFilter ?? "all"}`}>
    {/* 같은 숫자를 여러 번 찍지 않는다. 고른 유형의 건수는 아래 목록 범위 버튼 한 곳에서만 센다. */}
    <div className="report-section-head"><h3>처리 현황</h3><p>고르신 유형을 처리 단계별로 셉니다</p></div>
    <div className="report-flow" role="group" aria-label="처리 상태별 제보 목록">{statuses.map((status, index) => <button type="button" key={status} aria-pressed={statusFilter === status} onClick={() => { setAttentionFilter(null); setStatusFilter((current) => current === status ? null : status); setPage(1); }}><span className="report-flow-copy"><b>{REPORT_STATUS[status].label}</b></span><strong>{counts[index]}<small>건</small></strong></button>)}</div>
    <div className="report-list-head"><div><h3>{currentLabel}</h3></div><div className="report-list-tools"><div className="report-total"><strong>{visibleInsights.length}</strong><span>건</span></div>{hasNarrowFilter && <button type="button" onClick={() => { setStatusFilter(null); setAttentionFilter(null); setPage(1); }}>필터 초기화</button>}</div></div>
    <div className="report-command" role="group" aria-label="목록 범위 선택">
      <button className="report-command-total" type="button" aria-pressed={!statusFilter && !attentionFilter} onClick={() => { setStatusFilter(null); setAttentionFilter(null); setPage(1); }}><span>{kindLabel}</span><strong>{kindInsights.length}<small>건</small></strong></button>
      <div className="report-command-filters"><button type="button" data-tone="danger" aria-pressed={attentionFilter === "safety"} onClick={() => { setStatusFilter(null); setAttentionFilter(attentionFilter === "safety" ? null : "safety"); setPage(1); }}>안전 관련 후보 <b>{unresolved.filter((item) => item.safety === "안전 관련").length}</b></button><button type="button" data-tone="repeat" aria-pressed={attentionFilter === "overlap"} onClick={() => { setStatusFilter(null); setAttentionFilter(attentionFilter === "overlap" ? null : "overlap"); setPage(1); }}>유사 제보 집중 <b>{repeatedGroups}</b></button></div>
    </div>
    <div className="report-workbench"><div className="report-queue">
        {visibleInsights.length === 0 ? <div className="report-empty"><h2>{hasNarrowFilter ? `${currentLabel}가 없습니다` : kindFilter ? `${kindLabel} 제보가 없습니다` : "아직 접수된 제보가 없습니다"}</h2><p>{hasNarrowFilter ? "다른 조건을 선택해 확인하세요." : kindFilter ? "다른 유형을 선택해 확인하세요." : "새 제보가 접수되면 이곳에 표시됩니다."}</p></div> :
          <><div className="dash-tablewrap report-tablewrap"><table className="dash-table report-table"><thead><tr><th>신고 성격</th><th>정류장</th><th>유형·제보</th><th>유사 제보</th><th>접수 경과</th><th>처리 상태</th></tr></thead><tbody>{pageReports.map((item) => { const report = item.report; const state = REPORT_STATUS[report.status] ?? REPORT_STATUS.received; return <tr className="dash-row report-row" key={report.id} tabIndex={0} aria-label={`${report.stopName} ${report.issue} 상세 보기`} aria-selected={selectedId === report.id} onClick={() => openReview(report.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openReview(report.id); } }}><td data-label="신고 성격"><span className="report-risk" data-risk={item.safety}>{item.safety}</span></td><td data-label="정류장"><b className="dash-stopname">{report.stopName}</b><span className="dash-stopid">#{report.stopNo} · {report.stopId}</span></td><td data-label="유형·제보"><span className="report-category" data-kind={kindOfReport(report) ?? "unclassified"}>{kindFilterLabel(kindOfReport(report) ?? "unclassified")}</span><strong className="report-issue">{report.issue}</strong></td><td data-label="유사 제보"><strong className="report-overlap" data-repeat={item.overlap >= 2}>{item.overlap}건</strong><span className="dash-stopid">동일 정류장·유형</span></td><td data-label="접수 경과"><strong>{item.elapsedLabel}</strong>{report.status === "resolved" && <span className="report-speed" data-speed={item.speed}>{item.speed}</span>}</td><td data-label="처리 상태"><span className="report-status" data-status={report.status}>{state.label}</span></td></tr>; })}</tbody></table></div>
          <nav className="report-pagination" aria-label="제보 목록 페이지"><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>이전</button>{pageNumbers.map((pageNumber) => <button type="button" key={pageNumber} aria-current={pageNumber === currentPage ? "page" : undefined} onClick={() => setPage(pageNumber)}>{pageNumber}</button>)}<button type="button" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>다음</button></nav></>}
      </div></div>
    </div>
      {selected && <div className="report-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}><aside className="report-review" ref={modalRef} role="dialog" aria-modal="true" aria-label="제보 검토">
          <header><div><span className="dash-kicker">{selectedState?.label}</span><h3>{selected.stopName}</h3></div></header>
          <div className="report-review-body"><section className="report-case"><span className="report-label">제보 내용</span><p className="report-quote">“{selected.issue}”</p>{selected.source === "maeng_coco" && <p className="report-ai-evidence"><b>AI 검사 자료</b><span>라벨 {selected.modelLabelDisplay ?? selected.modelLabel ?? "미확인"} · 신뢰도 {Math.round((selected.modelConfidence ?? 0) * 100)}% · {selected.detectionCount ?? 0}개 영역</span></p>}{selected.photoDataUrl && <><img className="report-photo" src={selected.photoDataUrl} alt={`${selected.stopName}에서 보내온 사진`} /><div className="report-vlm"><div className="report-vlm__head"><span className="report-label">사진 설명(AI 추정)</span><button className="report-vlm__run" type="button" disabled={explaining} aria-busy={explaining} onClick={() => void requestExplanation(selected)}>{explaining ? "설명 만드는 중" : selectedExplanation ? "다시 만들기" : "사진 설명 만들기"}</button></div>{explaining ? <p className="report-vlm__status" role="status">사진 설명을 만들고 있습니다. 잠시 기다려 주세요.</p> : selectedExplanation ? selectedExplanation.ok ? <><p className="report-vlm__text">{selectedExplanation.text}</p><p className="report-vlm__notice">AI 추정입니다. 담당자 확인 결과가 우선합니다.</p></> : <p className="report-vlm__fail" role="status">{vlmFailText(selectedExplanation.reason)}</p> : <p className="report-vlm__hint">누르면 이 사진이 외부 AI 서비스(OpenRouter)로 전송돼 설명을 받습니다. 번호판·얼굴 등 개인정보가 찍혀 있으면 누르지 마세요.</p>}</div></>}</section><section className="report-facts"><dl><div><dt>정류장</dt><dd>#{selected.stopNo} · {selected.stopId}</dd></div><div><dt>유형</dt><dd>{kindFilterLabel(kindOfReport(selected) ?? "unclassified")}</dd></div><div><dt>내용 추정</dt><dd>{selectedInsight?.category ?? "기타"} <small>(문구에서 추정, 유사 제보 집계용)</small></dd></div><div><dt>신고 성격</dt><dd><span className="report-risk" data-risk={selectedInsight?.safety}>{selectedInsight?.safety ?? "일반 불편"}</span></dd></div><div><dt>유사 제보</dt><dd>{selectedInsight?.overlap ?? 1}건</dd></div><div><dt>접수 경과</dt><dd>{selectedInsight?.elapsedLabel}</dd></div><div><dt>처리 상태</dt><dd>{selectedState?.label}</dd></div></dl></section></div>
          <footer className="report-review-footer">{requiredChecks ? <fieldset className="report-checks"><legend>접수 확인 항목</legend>{requiredChecks.map((label, index) => <label key={label}><input type="checkbox" checked={checks[index]} onChange={(event) => setChecks((current) => current.map((value, itemIndex) => itemIndex === index ? event.target.checked : value) as [boolean, boolean])}/><span>{label}</span></label>)}</fieldset> : <p className="report-complete">처리가 완료된 제보입니다.</p>}{advanceError && <p className="report-save-fail" role="alert">{advanceError}</p>}<div className="report-review-actions"><button className="report-cancel" type="button" onClick={() => setSelectedId(null)}>취소</button>{selectedState?.next ? <button className="report-confirm" type="button" disabled={!checks.every(Boolean)} onClick={advanceSelected}>{selectedState.action}</button> : <button className="report-confirm" type="button" onClick={() => setSelectedId(null)}>확인</button>}</div></footer>
      </aside></div>}
  </section>;
}

export default function Dashboard() {
  const stops = useStops((s) => s.stops);
  const loaded = useStops((s) => s.loaded);
  const [tab, setTab] = useState<TabKey>("reports");
  const [reports, setReports] = useState<CitizenReport[]>(() => loadReports());

  useEffect(() => {
    const mergeReports = (
      localReports: CitizenReport[],
      remoteReports: CitizenReport[],
    ) => {
      const merged = new Map(localReports.map((report) => [report.id, report]));
      remoteReports.forEach((report) => merged.set(report.id, report));
      return [...merged.values()];
    };
    const refresh = () => {
      const localReports = loadReports();
      setReports(localReports);
      if (import.meta.env.MODE === "test") return;
      void loadMaengCocoReports()
        .then((remoteReports) => setReports(mergeReports(localReports, remoteReports)))
        .catch(() => undefined);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === REPORT_STORAGE_KEY) refresh();
    };
    refresh();
    const intervalId = window.setInterval(refresh, 5_000);
    window.addEventListener("storage", onStorage);
    window.addEventListener(REPORT_CHANGED_EVENT, refresh);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(REPORT_CHANGED_EVENT, refresh);
    };
  }, []);

  const advanceReport = (
    report: CitizenReport,
    status: CitizenReport["status"],
  ): boolean => {
    if (report.source !== "maeng_coco") {
      // 저장 공간이 차면 ReportStorageError 가 올라온다. 화면을 날리지 말고 실패로 알린다.
      try {
        updateReportStatus(report.id, status);
      } catch {
        return false;
      }
      return true;
    }
    void updateMaengCocoReportStatus(report.id, status)
      .then((updated) => {
        try {
          upsertReport(updated);
        } catch {
          setReports((current) => [
            ...current.filter((item) => item.id !== updated.id),
            updated,
          ]);
        }
      })
      .catch(() => undefined);
    // 원격 제보는 응답을 기다려야 해서 여기서 성공을 단정할 수 없다. 기존 동작을 그대로 둔다.
    return true;
  };

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
          {tab !== "reports" && <header className="dash-head"><h2>{TABS.find((item) => item.key === tab)?.label}</h2></header>}
          <div role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === "reports" && <ReportsTab reports={reports} onAdvance={advanceReport} />}
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
