import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Armchair, BusFront, Clock3, CloudSun, LampDesk, MapPin,
  Monitor, Navigation, Shirt, Signpost, Umbrella,
} from "lucide-react";
import "./DesignPreview.css";

const concepts = [
  ["정류장 중심", "현장 확인이 먼저"],
  ["시간표 중심", "내 버스를 빠르게 확인"],
  ["방면 표지", "길 찾듯 크게 안내"],
  ["상황 대시보드", "정보를 영역별 비교"],
  ["큰글자 순차형", "한 줄씩 차분하게"],
] as const;

function Facilities({ compact = false }: { compact?: boolean }) {
  const items = [
    [Umbrella, "그늘", "있음", "ok"], [Armchair, "의자", "있음", "ok"],
    [LampDesk, "조명", "있음", "ok"], [Monitor, "안내기", "미확인", "unknown"],
  ] as const;
  return <section className={`facilities ${compact ? "is-compact" : ""}`} aria-label="정류장 편의시설">
    {items.map(([Icon, label, state, tone]) => <div className={tone} key={label}><Icon aria-hidden="true"/><span>{label}</span><b>{state}</b></div>)}
  </section>;
}

function Weather() {
  return <section className="weather" aria-label="날씨와 옷차림">
    <div><CloudSun aria-hidden="true"/><span>현재 춘천</span><b>24°C</b><small>습도 85%</small></div>
    <div><Shirt aria-hidden="true"/><span>오늘 옷차림</span><b>얇은 반소매</b><small>냉방용 겉옷 챙기기</small></div>
  </section>;
}

function Guide() {
  return <Link className="guide" to="/app?stop=250026920"><Navigation aria-hidden="true"/> 정류장까지 길 안내</Link>;
}

function ConceptOne() {
  return <div className="concept concept-one">
    <header><span><MapPin aria-hidden="true"/> 걸어서 약 2분</span><small>정류장 2645</small></header>
    <section className="stop-hero"><span>현재 정류장</span><h2>춘천여고앞</h2><p>한림대학교 · 샘밭장터 <b>방면</b></p></section>
    <section className="bus-summary"><BusFront aria-hidden="true"/><div><span>내가 탈 버스</span><b>300번</b></div><strong>7분 후</strong><small>다음 18분 후</small></section>
    <Weather/><Facilities compact/><Guide/>
  </div>;
}

function ConceptTwo() {
  return <div className="concept concept-two">
    <header><b>춘천여고앞</b><span>2645</span></header>
    <p className="direction">한림대학교 · 샘밭장터 방면</p>
    <section className="board"><div className="board-head"><Clock3 aria-hidden="true"/> 도착 예정</div><div className="board-row active"><b>300</b><span>내가 탈 버스</span><strong>7분</strong></div><div className="board-row"><b>18</b><span>한림대 방면</span><strong>11분</strong></div><div className="board-row"><b>11</b><span>샘밭장터 방면</span><strong>18분</strong></div></section>
    <div className="two-bottom"><Weather/><Facilities compact/></div><Guide/>
  </div>;
}

function ConceptThree() {
  return <div className="concept concept-three">
    <header><Signpost aria-hidden="true"/><span>현재 정류장</span><small>2645</small></header>
    <section className="sign-direction"><span>이쪽으로 가는 버스</span><h2>한림대학교</h2><h2>샘밭장터</h2><b>방면 →</b></section>
    <section className="sign-stop"><span>정류장 이름</span><strong>춘천여고앞</strong></section>
    <section className="sign-bus"><b>300번</b><strong>7분 후</strong><span>그다음 18분 후</span></section>
    <div className="sign-info"><Weather/><Facilities compact/></div><Guide/>
  </div>;
}

function ConceptFour() {
  return <div className="concept concept-four">
    <header><div><span>현재 정류장</span><h2>춘천여고앞</h2></div><small>2645</small></header>
    <p className="direction">한림대학교 · 샘밭장터 방면</p>
    <section className="dashboard"><div className="dash-bus"><BusFront aria-hidden="true"/><span>300번</span><b>7분 후</b><small>다음 18분</small></div><div className="dash-weather"><CloudSun aria-hidden="true"/><span>현재</span><b>24°C</b><small>습도 85%</small></div><div className="dash-clothes"><Shirt aria-hidden="true"/><span>추천 옷차림</span><b>얇은 반소매</b><small>얇은 겉옷 챙기기</small></div></section>
    <Facilities/><Guide/>
  </div>;
}

function ConceptFive() {
  return <div className="concept concept-five">
    <p className="step-label">1 · 정류장 확인</p><h2>춘천여고앞</h2><span className="stop-no">정류장 2645</span>
    <p className="step-label">2 · 가는 방면</p><strong className="large-direction">한림대학교 · 샘밭장터 방면</strong>
    <p className="step-label">3 · 내가 탈 버스</p><section className="large-bus"><b>300번</b><strong>7분 후</strong><span>그다음 18분 후</span></section>
    <p className="step-label">4 · 외출 정보</p><Weather/><Facilities compact/><Guide/>
  </div>;
}

const screens = [ConceptOne, ConceptTwo, ConceptThree, ConceptFour, ConceptFive];

export default function DesignPreview() {
  const [selected, setSelected] = useState(0);
  const Screen = screens[selected];
  return <main className="design-lab">
    <nav className="design-tabs" role="tablist" aria-label="홈 디자인 시안">
      {concepts.map(([name, reason], i) => <button type="button" role="tab" aria-selected={selected === i} onClick={() => setSelected(i)} key={name}><b>{i + 1}</b><span>{name}<small>{reason}</small></span></button>)}
    </nav>
    <section className="phone" role="tabpanel" aria-label={`${selected + 1}번 ${concepts[selected][0]} 시안`}><Screen/></section>
  </main>;
}
