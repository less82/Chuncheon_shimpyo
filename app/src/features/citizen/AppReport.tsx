import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, MapPin, MessageCircle, Navigation, Search } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { haversine } from "../../lib/geo";
import { subjectParticle } from "../../lib/korean";
import { loadRoutes } from "../../lib/loadRoutes";
import { saveReport } from "../report/reportStore";
import { useStops } from "../../store/useStops";
import {
  REPORT_KINDS,
  categoryInfo,
  issueOptionsFor,
  rideContactsForRoutes,
  reportKind,
} from "../../data/busContacts";
import type { BusContact, ContactCategory } from "../../data/busContacts";
import ContactGuide, { telHref } from "../contacts/ContactGuide";
import type { Stop } from "../../types/stop";
import type { RoutesFile } from "../../types/route";
import "./AppReport.css";

type Step = "kind" | "locating" | "find" | "confirm" | "issue" | "bus" | "when" | "review" | "done";
const MAX_DISTANCE_M = 1500;

// 전화 링크 형식은 ContactGuide 로 옮겼다. 기존 import 를 깨지 않도록 여기서 다시 내보낸다.
export { telHref };

export function stopDirection(stop: Stop, routes: RoutesFile | null, stops: Stop[]): string {
  if (!routes) return "방면 확인 중";
  const names = new Map(stops.map((item) => [item.id, item.name]));
  for (const route of routes.routes) {
    const index = route.stops.indexOf(stop.id);
    if (index < 0) continue;
    const nextName = names.get(route.stops[index + 1]);
    if (nextName && nextName !== stop.name) return `${nextName} 방면`;
  }
  return "방면 미확인";
}

/** 화면 위쪽 "n / m · 이름" 표기. 버스 이용 불편만 두 단계(버스·시각)를 더 거친다. */
const FLOW_BASE = ["kind", "target", "issue", "review"] as const;
const FLOW_RIDE = ["kind", "target", "issue", "bus", "when", "review"] as const;
const FLOW_NAMES: Record<string, string> = {
  kind: "무엇을 알릴까요",
  target: "대상 확인",
  issue: "내용 선택",
  bus: "버스 정보",
  when: "겪은 때",
  review: "내용 확인",
};

export function stepProgress(kind: ContactCategory | null, step: Step): string {
  // 두 흐름의 튜플 타입이 달라 그대로 합치면 indexOf 인자 타입이 교집합이 된다. 문자열 배열로 좁힌다.
  const flow: readonly string[] = kind === "ride" ? FLOW_RIDE : FLOW_BASE;
  const key: string = step === "locating" || step === "find" || step === "confirm" ? "target" : step;
  const index = flow.indexOf(key);
  if (index < 0) return "";
  return `${index + 1} / ${flow.length} · ${FLOW_NAMES[key]}`;
}

export default function AppReport() {
  const [searchParams] = useSearchParams();
  const requestedStopId = searchParams.get("stop");
  const stops = useStops((state) => state.stops);
  const loaded = useStops((state) => state.loaded);
  const [step, setStep] = useState<Step>("kind");
  const [kind, setKind] = useState<ContactCategory | null>(null);
  const [selected, setSelected] = useState<Stop | null>(null);
  const [nearby, setNearby] = useState<Stop[]>([]);
  const [query, setQuery] = useState("");
  const [issue, setIssue] = useState("");
  const [busRoute, setBusRoute] = useState("");
  const [busVehicleNo, setBusVehicleNo] = useState("");
  const [happenedDate, setHappenedDate] = useState("");
  const [happenedTime, setHappenedTime] = useState("");
  const [routes, setRoutes] = useState<RoutesFile | null>(null);

  const locate = () => {
    setStep("locating");
    if (!navigator.geolocation) {
      setStep("find");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const candidates = stops
          .map((stop) => ({ stop, distance: haversine({ lat: coords.latitude, lng: coords.longitude }, stop) }))
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 3);
        const first = candidates[0];
        setNearby(candidates.map(({ stop }) => stop));
        if (!first || first.distance > MAX_DISTANCE_M) {
          setStep("find");
          return;
        }
        setSelected(first.stop);
        setStep("confirm");
      },
      () => setStep("find"),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 },
    );
  };

  // 길찾기 결과 등에서 ?stop= 으로 들어오면 정류장을 미리 잡아둔다(유형은 그래도 시민이 고른다).
  useEffect(() => {
    if (!loaded) return;
    const requestedStop = stops.find((stop) => stop.id === requestedStopId);
    if (requestedStop) setSelected(requestedStop);
  }, [loaded, requestedStopId, stops]);

  useEffect(() => {
    let alive = true;
    loadRoutes().then((value) => alive && setRoutes(value)).catch(() => alive && setRoutes(null));
    return () => { alive = false; };
  }, []);

  const matches = useMemo(() => {
    const needle = query.replace(/\s+/g, "").toLowerCase();
    if (!needle) return [];
    return stops
      .filter((stop) => stop.name.replace(/\s+/g, "").toLowerCase().includes(needle) || stop.stopNo.includes(needle))
      .slice(0, 3);
  }, [query, stops]);

  const choose = (stop: Stop) => {
    setSelected(stop);
    setQuery("");
    setStep("confirm");
  };

  const chooseKind = (category: ContactCategory) => {
    setKind(category);
    setIssue("");
    if (selected) {
      setStep("confirm");
      return;
    }
    locate();
  };

  const afterIssue = () => setStep(kind === "ride" ? "bus" : "review");

  const submit = () => {
    if (!selected || !issue || !kind) return;
    saveReport(selected, issue, undefined, {
      reportKind: kind,
      busRoute,
      busVehicleNo,
      happenedDate,
      happenedTime,
    });
    setStep("done");
  };

  // 접수처는 안내문(춘천시 「시내(마을)버스 문의사항이 생기셨나요?」) 기준으로 고른다.
  // 이용 불편은 그 정류장에 실제로 오는 버스의 운수회사만 남긴다.
  const doneContacts = useMemo((): BusContact[] => {
    if (!kind) return [];
    return kind === "ride" ? rideContactsForRoutes(selected?.routes ?? []) : categoryInfo(kind).contacts;
  }, [kind, selected]);

  const doneOrg = doneContacts[0]?.org ?? "담당 부서";
  const progress = stepProgress(kind, step);
  // 노선 후보는 그 정류장에 오는 버스뿐이다. 한 화면에 담기도록 4개까지만 버튼으로 준다.
  const routeChips = (selected?.routes ?? []).slice(0, 4);

  return (
    <main className="appreport">
      <header className="appreport__bar">
        <Link to="/app" aria-label="앱 메인으로 돌아가기"><ChevronLeft aria-hidden="true" /><span className="sr-only">메인</span></Link>
        <strong>알리기</strong>
        <span aria-hidden="true" />
      </header>

      {step === "kind" && (
        <section className="appreport__panel">
          <p className="appreport__step">{progress}</p>
          <h1>무엇을<br />알리시나요?</h1>
          <p>고르시면 담당하는 곳으로 정리해 전달합니다.</p>
          <div className="appreport__issues">
            {REPORT_KINDS.map((item) => (
              <button type="button" key={item.category} onClick={() => chooseKind(item.category)}>
                {item.label}
                <small>{item.hint}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === "locating" && (
        <section className="appreport__center" aria-live="polite">
          <span className="appreport__hero-icon"><Navigation aria-hidden="true" /></span>
          <p className="appreport__step">{progress}</p>
          <h1>가까운 정류장을<br />찾고 있어요</h1>
          <p>현재 위치에서 가장 가까운 정류장을 확인합니다.</p>
        </section>
      )}

      {step === "find" && (
        <section className="appreport__panel appreport__panel--find">
          <p className="appreport__step">{progress}</p>
          <h1>어느 정류장인가요?</h1>
          <p>정류장 이름이나 표지판의 4자리 번호를 입력하세요.</p>
          <label className="appreport__search">
            <Search aria-hidden="true" />
            <span className="sr-only">정류장 검색</span>
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="예: 춘천역 또는 1001" />
          </label>
          <div className="appreport__matches">
            {matches.map((stop) => <button type="button" key={stop.id} onClick={() => choose(stop)}><MapPin aria-hidden="true" /><span><strong>{stop.name}</strong><small>{stopDirection(stop, routes, stops)} · {stop.stopNo ? `정류장 ${stop.stopNo}` : "번호 미확인"}</small></span></button>)}
          </div>
          <button type="button" className="appreport__secondary" onClick={locate}>현재 위치 다시 확인</button>
        </section>
      )}

      {step === "confirm" && selected && (
        <section className="appreport__panel">
          <p className="appreport__step">{progress}</p>
          <h1>{kind === "ride" ? "어느 정류장에서 있었나요?" : "이 정류장이 맞나요?"}</h1>
          <article className="appreport__stop">
            <span><MapPin aria-hidden="true" /></span>
            <div><strong>{selected.name}</strong><small>{selected.stopNo ? `정류장 번호 ${selected.stopNo}` : "정류장 번호 미확인"}</small></div>
          </article>
          {nearby.length > 1 && <div className="appreport__nearby"><span>다른 가까운 정류장</span>{nearby.filter((stop) => stop.id !== selected.id).slice(0, 2).map((stop) => <button type="button" key={stop.id} onClick={() => setSelected(stop)}>{stop.name}</button>)}</div>}
          <div className="appreport__bottom-actions"><button type="button" className="appreport__secondary" onClick={() => setStep("find")}>다른 정류장</button><button type="button" className="appreport__primary" onClick={() => setStep("issue")}>네, 맞아요</button></div>
        </section>
      )}

      {step === "issue" && selected && kind && (
        <section className="appreport__panel">
          <p className="appreport__step">{progress}</p>
          <span className="appreport__stop-chip"><MapPin aria-hidden="true" />{selected.name}</span>
          <h1>{kind === "route" ? "무엇을 요청하시나요?" : "어떤 일이 있었나요?"}</h1>
          <p>해당하는 항목을 하나 눌러주세요.</p>
          <div className="appreport__issues">{issueOptionsFor(kind).map((item) => <button type="button" key={item.label} aria-pressed={issue === item.label} onClick={() => setIssue(item.label)}>{item.label}</button>)}</div>
          <div className="appreport__bottom-actions"><button type="button" className="appreport__secondary" onClick={() => setStep("confirm")}>이전</button><button type="button" className="appreport__primary" disabled={!issue} onClick={afterIssue}>다음</button></div>
        </section>
      )}

      {step === "bus" && (
        <section className="appreport__panel">
          <p className="appreport__step">{progress}</p>
          <h1>어느 버스였나요?</h1>
          <p>기억나는 것만 적으셔도 됩니다. 모르면 비워두세요.</p>
          <label className="appreport__field">
            <span>버스 번호</span>
            <input value={busRoute} onChange={(event) => setBusRoute(event.target.value)} placeholder="예: 12" />
          </label>
          {routeChips.length > 0 && (
            <div className="appreport__chips">
              <span>이 정류장에 오는 버스</span>
              {routeChips.map((route) => <button type="button" key={route} aria-pressed={busRoute === route} onClick={() => setBusRoute(route)}>{route}</button>)}
            </div>
          )}
          <label className="appreport__field">
            <span>차량번호 (선택)</span>
            <input value={busVehicleNo} onChange={(event) => setBusVehicleNo(event.target.value)} placeholder="예: 강원70자1234" />
          </label>
          <div className="appreport__bottom-actions"><button type="button" className="appreport__secondary" onClick={() => setStep("issue")}>이전</button><button type="button" className="appreport__primary" onClick={() => setStep("when")}>다음</button></div>
        </section>
      )}

      {step === "when" && (
        <section className="appreport__panel">
          <p className="appreport__step">{progress}</p>
          <h1>언제 있었나요?</h1>
          <p>운수회사가 확인하려면 날짜와 시각이 필요합니다. 모르면 비워두세요.</p>
          <label className="appreport__field">
            <span>날짜</span>
            <input type="date" value={happenedDate} onChange={(event) => setHappenedDate(event.target.value)} />
          </label>
          <label className="appreport__field">
            <span>시각</span>
            <input type="time" value={happenedTime} onChange={(event) => setHappenedTime(event.target.value)} />
          </label>
          <div className="appreport__bottom-actions"><button type="button" className="appreport__secondary" onClick={() => setStep("bus")}>이전</button><button type="button" className="appreport__primary" onClick={() => setStep("review")}>다음</button></div>
        </section>
      )}

      {step === "review" && selected && kind && (
        <section className="appreport__panel">
          <p className="appreport__step">{progress}</p>
          <h1>이 내용으로<br />보낼까요?</h1>
          <dl className="appreport__summary">
            <div><dt>유형</dt><dd>{reportKind(kind).label}</dd></div>
            <div><dt>정류장</dt><dd>{selected.name}{selected.stopNo ? ` · ${selected.stopNo}` : ""}</dd></div>
            <div><dt>내용</dt><dd>{issue}</dd></div>
            {kind === "ride" && <div><dt>버스</dt><dd>{busRoute || "안 적음"}{busVehicleNo ? ` · ${busVehicleNo}` : ""}</dd></div>}
            {kind === "ride" && <div><dt>겪은 때</dt><dd>{happenedDate || happenedTime ? `${happenedDate} ${happenedTime}`.trim() : "안 적음"}</dd></div>}
          </dl>
          <div className="appreport__bottom-actions"><button type="button" className="appreport__secondary" onClick={() => setStep(kind === "ride" ? "when" : "issue")}>이전</button><button type="button" className="appreport__primary" onClick={submit}>보내기</button></div>
        </section>
      )}

      {step === "done" && selected && kind && (
        <section className="appreport__panel appreport__panel--scroll appreport__panel--done">
          <span className="appreport__hero-icon appreport__hero-icon--done"><Check aria-hidden="true" /></span>
          <p className="appreport__step">보내기 완료</p>
          <h1>알려주셔서<br />고맙습니다</h1>
          <p>
            <strong>{doneOrg}</strong>
            {doneContacts.length > 1 ? " 등" : ""}
            {subjectParticle(doneContacts.length > 1 ? "등" : doneOrg)} 맡는 내용입니다. 현장 확인 자료로 전달합니다.
          </p>
          <p>바로 말씀하시려면 지금 전화하셔도 됩니다.</p>
          <div className="appreport__contact--done">
            <ContactGuide categories={[kind]} routes={selected.routes} stopName={kind === "ride" ? selected.name : undefined} compact />
            <p className="contactguide__contact-need">
              함께 알릴 정보
              <br />
              <b>{selected.name}{selected.stopNo ? ` · 정류소 번호 ${selected.stopNo}` : ""}</b>
              <br />
              {issue}
              {kind === "ride" && busRoute && <><br />버스 {busRoute}{busVehicleNo ? ` · ${busVehicleNo}` : ""}</>}
              {kind === "ride" && (happenedDate || happenedTime) && <><br />{`${happenedDate} ${happenedTime}`.trim()}</>}
              {/* 안내문이 요구하는 정보 중 빠진 게 있으면 전화할 때 무엇을 더 말해야 하는지 알려준다. */}
              {kind === "ride" && (!busRoute || !(happenedDate || happenedTime)) && (
                <><br />전화하실 때 {[!busRoute && "버스 번호", !(happenedDate || happenedTime) && "겪은 때"].filter(Boolean).join("와 ")}를 함께 말씀하시면 빠릅니다.</>
              )}
            </p>
          </div>
          <Link className="appreport__home" to="/app"><MessageCircle aria-hidden="true" />메인으로 돌아가기</Link>
        </section>
      )}
    </main>
  );
}
