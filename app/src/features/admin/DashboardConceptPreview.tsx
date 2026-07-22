import { Activity, BarChart3, CheckCircle2, ClipboardList, GitCompare, MapPinned } from "lucide-react";
import type { CitizenReport } from "../report/reportStore";
import "./DashboardConceptPreview.css";

export type DashboardConceptKey = "queue" | "desk" | "board" | "evidence" | "control";

const STATUS_LABEL: Record<CitizenReport["status"], string> = {
  received: "접수",
  reviewing: "담당 배정",
  task_created: "처리 중",
  resolved: "처리 완료",
};

const fallback: CitizenReport[] = [
  { id: "sample-1", stopId: "257800104", stopNo: "5954", stopName: "모곡", issue: "의자가 없어요", createdAt: "2026-07-21T08:17:00.000Z", status: "received" },
  { id: "sample-2", stopId: "250000001", stopNo: "1720", stopName: "춘천역", issue: "안내기가 꺼졌어요", createdAt: "2026-07-21T08:08:00.000Z", status: "reviewing" },
  { id: "sample-3", stopId: "250002145", stopNo: "2122", stopName: "석사극동A", issue: "그늘이 부족해요", createdAt: "2026-07-21T07:52:00.000Z", status: "task_created" },
];

function reportList(reports: CitizenReport[]) {
  return reports.map((report) => <article className="cp-task" key={report.id}><div><b>{report.stopName}</b><span>#{report.stopNo} · {report.issue}</span></div><em data-status={report.status}>{STATUS_LABEL[report.status]}</em></article>);
}

function Kpis({ reports }: { reports: CitizenReport[] }) {
  const values = (["received", "reviewing", "task_created", "resolved"] as const).map((status) => reports.filter((report) => report.status === status).length);
  const icons = [ClipboardList, GitCompare, MapPinned, CheckCircle2];
  return <div className="cp-kpis">{values.map((value, index) => { const Icon = icons[index]; return <article key={index}><Icon aria-hidden="true"/><span>{["신규", "대조 중", "점검 중", "반영 완료"][index]}</span><strong>{value}</strong><small>건</small></article>; })}</div>;
}

export default function DashboardConceptPreview({ concept, reports }: { concept: DashboardConceptKey; reports: CitizenReport[] }) {
  const items = reports.length > 1 ? reports : [...reports, ...fallback.filter((sample) => !reports.some((report) => report.id === sample.id))].slice(0, 4);
  return <section className="cp" data-concept={concept}>
    <header className="cp-head"><div><span>오늘의 운영 현황</span><h2>{({ queue: "업무 큐 대시보드", desk: "제보 검토 워크스페이스", board: "처리 단계 보드", evidence: "근거 대조 센터", control: "정류장 운영 관제" } as const)[concept]}</h2></div><time>2026. 7. 21.</time></header>
    {concept === "queue" && <><Kpis reports={items}/><div className="cp-grid cp-queue"><section className="cp-panel"><header><h3>처리량 추이</h3><span>최근 7일</span></header><div className="cp-bars" aria-label="최근 7일 처리량 막대그래프">{[36,58,42,74,61,88,67].map((height, index) => <i key={index} style={{height:`${height}%`}}><span>{["월","화","수","목","금","토","일"][index]}</span></i>)}</div></section><section className="cp-panel"><header><h3>우선 처리</h3><span>{items.length}건</span></header><div className="cp-tasklist">{reportList(items)}</div></section></div></>}
    {concept === "desk" && <div className="cp-desk"><section className="cp-panel cp-inbox"><header><h3>제보 목록</h3><span>{items.length}건</span></header>{reportList(items)}</section><section className="cp-panel cp-case"><span className="cp-overline">선택한 제보</span><h3>{items[0].stopName} #{items[0].stopNo}</h3><p className="cp-quote">“{items[0].issue}”</p><dl><div><dt>AI 분류</dt><dd>시설 불편 후보</dd></div><div><dt>공식자료</dt><dd>시설정보 대조 필요</dd></div><div><dt>다음 업무</dt><dd>정류장 식별정보 확인</dd></div></dl><button type="button">검토 열기</button></section></div>}
    {concept === "board" && <div className="cp-board">{(["received","reviewing","task_created","resolved"] as const).map((status) => <section key={status}><header><h3>{STATUS_LABEL[status]}</h3><b>{items.filter((item) => item.status === status).length}</b></header>{items.filter((item) => item.status === status).map((item) => <article key={item.id}><span>{item.stopName} #{item.stopNo}</span><b>{item.issue}</b><small>{new Date(item.createdAt).toLocaleDateString("ko-KR")}</small></article>)}</section>)}</div>}
    {concept === "evidence" && <><div className="cp-evidence"><article><GitCompare/><span>시민 관측</span><b>{items[0].issue}</b><small>{items[0].stopName} #{items[0].stopNo}</small></article><i>→</i><article><BarChart3/><span>공식자료</span><b>시설정보 미확인</b><small>최신 대장과 대조 필요</small></article><i>→</i><article><ClipboardList/><span>권고 과업</span><b>현장 점검 요청</b><small>담당자 승인 전</small></article></div><section className="cp-panel cp-evidence-log"><header><h3>근거 검토 기록</h3><span>감사 로그</span></header>{["정류장 식별정보 연결", "시민 원문 보존", "공식자료 대조 대기"].map((item, index)=><p key={item}><b>{index+1}</b><span>{item}</span><em>{index < 2 ? "완료" : "대기"}</em></p>)}</section></>}
    {concept === "control" && <><Kpis reports={items}/><div className="cp-grid cp-control"><section className="cp-panel cp-map"><header><h3>제보 발생 위치</h3><span>춘천시</span></header><div className="cp-mapfield"><MapPinned/><i style={{left:"28%",top:"36%"}}/><i style={{left:"54%",top:"58%"}}/><i style={{left:"73%",top:"30%"}}/></div></section><section className="cp-panel"><header><h3>시설 유형별 신호</h3><Activity/></header>{[["의자",78],["안내기",54],["그늘",39],["조명",22]].map(([label,value])=><div className="cp-meter" key={label}><span>{label}</span><i><b style={{width:`${value}%`}}/></i><strong>{value}%</strong></div>)}</section></div></>}
  </section>;
}
