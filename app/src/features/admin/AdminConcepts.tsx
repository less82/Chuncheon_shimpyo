import { useState } from "react";
import "./AdminConcepts.css";

const CONCEPTS = [
  { key: "queue", label: "A. 업무 목록형" },
  { key: "desk", label: "B. 3단 검토형" },
  { key: "board", label: "C. 단계 보드형" },
  { key: "evidence", label: "D. 근거 대조형" },
  { key: "control", label: "E. 운영 관제형" },
] as const;

type ConceptKey = (typeof CONCEPTS)[number]["key"];

const sampleRows = [
  ["모곡 #5954", "의자가 없어요", "신규 접수"],
  ["춘천역 #1720", "안내기가 꺼졌어요", "자료 대조"],
  ["석사극동A #2122", "그늘이 부족해요", "현장 점검"],
];

function QueueTable() {
  return <div className="concept-table"><div className="concept-table-head"><span>정류장</span><span>시민 신호</span><span>현재 단계</span></div>{sampleRows.map((row) => <div key={row[0]}>{row.map((cell) => <span key={cell}>{cell}</span>)}</div>)}</div>;
}

export default function AdminConcepts() {
  const [concept, setConcept] = useState<ConceptKey>("queue");
  return <main className="concept-page">
    <header className="concept-head"><div><span>쉼표정류장 관리자 웹</span><h1>대시보드 구조 시안</h1></div><nav role="tablist" aria-label="대시보드 구조 시안">{CONCEPTS.map((item) => <button type="button" role="tab" aria-selected={concept === item.key} key={item.key} onClick={() => setConcept(item.key)}>{item.label}</button>)}</nav></header>
    <section className="concept-canvas" data-concept={concept}>
      {concept === "queue" && <><aside className="concept-nav">시민 제보<br/>시설 검증<br/>개선 검토<br/>데이터 조회</aside><div className="concept-main"><h2>처리할 업무</h2><div className="concept-steps"><b>접수 1</b><b>자료 대조 1</b><b>현장 점검 1</b><b>정보 반영 0</b></div><QueueTable /></div></>}
      {concept === "desk" && <><aside className="concept-filter"><h2>업무 조건</h2><button>신규 접수 1</button><button>자료 대조 1</button><button>현장 점검 1</button></aside><div className="concept-list"><h2>제보 목록</h2>{sampleRows.map((row) => <button key={row[0]}><b>{row[0]}</b><span>{row[1]}</span></button>)}</div><div className="concept-detail"><h2>검토 상세</h2><dl><dt>시민 원문</dt><dd>의자가 없어요</dd><dt>공식자료</dt><dd>대조 전</dd><dt>필수 확인</dt><dd>정류장 ID · 시설 분류</dd></dl></div></>}
      {concept === "board" && <div className="concept-board">{["신규 접수", "자료 대조", "현장 점검", "정보 반영"].map((stage, index) => <section key={stage}><h2>{stage}</h2>{sampleRows[index] && <article><b>{sampleRows[index][0]}</b><span>{sampleRows[index][1]}</span></article>}</section>)}</div>}
      {concept === "evidence" && <><div className="concept-evidence-list"><h2>검토 대기 목록</h2><QueueTable /></div><div className="concept-compare"><h2>근거 대조</h2><div><b>시민 관측</b><span>의자가 없어요</span></div><div><b>공식 시설자료</b><span>의자 정보 미확인</span></div><div><b>담당자 판단</b><span>현장 조사 필요</span></div></div></>}
      {concept === "control" && <div className="concept-control"><div className="concept-kpis"><b>신규 1</b><b>대조 1</b><b>점검 1</b><b>반영 0</b></div><div className="concept-control-body"><section><h2>오늘 처리할 업무</h2><QueueTable /></section><aside><h2>최근 처리 기록</h2><p>춘천역 자료 대조 시작</p><p>석사극동A 현장 과업 생성</p></aside></div></div>}
    </section>
  </main>;
}
