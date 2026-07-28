import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, MapPin, MessageCircle, Navigation, Phone, Search } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { haversine } from "../../lib/geo";
import { loadRoutes } from "../../lib/loadRoutes";
import { saveReport } from "../report/reportStore";
import { useStops } from "../../store/useStops";
import {
  CONTACT_CATEGORIES,
  ISSUE_OPTIONS,
  ROUTE_INFO_LINKS,
  categoryForIssue,
  categoryInfo,
  rideContactsForRoutes,
} from "../../data/busContacts";
import type { BusContact, ContactCategoryInfo } from "../../data/busContacts";
import type { Stop } from "../../types/stop";
import type { RoutesFile } from "../../types/route";
import "./AppReport.css";

type Step = "locating" | "find" | "confirm" | "issue" | "guide" | "done";
const MAX_DISTANCE_M = 1500;

/** 전화 앱으로 넘길 때 쓰는 형식(하이픈 제거). */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/-/g, "")}`;
}

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

export default function AppReport() {
  const [searchParams] = useSearchParams();
  const requestedStopId = searchParams.get("stop");
  const stops = useStops((state) => state.stops);
  const loaded = useStops((state) => state.loaded);
  const [step, setStep] = useState<Step>("locating");
  const [selected, setSelected] = useState<Stop | null>(null);
  const [nearby, setNearby] = useState<Stop[]>([]);
  const [query, setQuery] = useState("");
  const [issue, setIssue] = useState("");
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

  useEffect(() => {
    if (!loaded) return;
    const requestedStop = stops.find((stop) => stop.id === requestedStopId);
    if (requestedStop) {
      setSelected(requestedStop);
      setStep("confirm");
      return;
    }
    locate();
    // 위치 확인은 화면 진입 시 한 번만 실행한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const submit = () => {
    if (!selected || !issue) return;
    saveReport(selected, issue);
    setStep("done");
  };

  // 접수처는 안내문(춘천시 「시내(마을)버스 문의사항이 생기셨나요?」) 기준으로 고른다.
  // 이용 불편 민원은 그 정류장에 실제로 오는 버스의 운수회사만 남긴다.
  const contactsOf = useMemo(() => {
    const routes = selected?.routes ?? [];
    return (category: ContactCategoryInfo): BusContact[] =>
      category.key === "ride" ? rideContactsForRoutes(routes) : category.contacts;
  }, [selected]);

  const contact = useMemo(() => {
    const key = categoryForIssue(issue);
    return key ? categoryInfo(key) : null;
  }, [issue]);

  return (
    <main className="appreport">
      <header className="appreport__bar">
        <Link to="/app" aria-label="앱 메인으로 돌아가기"><ChevronLeft aria-hidden="true" /><span className="sr-only">메인</span></Link>
        <strong>정류장 상태 알리기</strong>
        <span aria-hidden="true" />
      </header>

      {step === "locating" && (
        <section className="appreport__center" aria-live="polite">
          <span className="appreport__hero-icon"><Navigation aria-hidden="true" /></span>
          <p className="appreport__step">1 / 3</p>
          <h1>가까운 정류장을<br />찾고 있어요</h1>
          <p>현재 위치에서 가장 가까운 정류장을 확인합니다.</p>
        </section>
      )}

      {step === "find" && (
        <section className="appreport__panel appreport__panel--find">
          <p className="appreport__step">1 / 3 · 정류장 찾기</p>
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
          <p className="appreport__step">1 / 3 · 정류장 확인</p>
          <h1>이 정류장이 맞나요?</h1>
          <article className="appreport__stop">
            <span><MapPin aria-hidden="true" /></span>
            <div><strong>{selected.name}</strong><small>{selected.stopNo ? `정류장 번호 ${selected.stopNo}` : "정류장 번호 미확인"}</small></div>
          </article>
          {nearby.length > 1 && <div className="appreport__nearby"><span>다른 가까운 정류장</span>{nearby.filter((stop) => stop.id !== selected.id).slice(0, 2).map((stop) => <button type="button" key={stop.id} onClick={() => setSelected(stop)}>{stop.name}</button>)}</div>}
          <div className="appreport__bottom-actions"><button type="button" className="appreport__secondary" onClick={() => setStep("find")}>다른 정류장</button><button type="button" className="appreport__primary" onClick={() => setStep("issue")}>네, 맞아요</button></div>
        </section>
      )}

      {step === "issue" && selected && (
        <section className="appreport__panel">
          <p className="appreport__step">2 / 3 · 상태 선택</p>
          <span className="appreport__stop-chip"><MapPin aria-hidden="true" />{selected.name}</span>
          <h1>어떤 상태인가요?</h1>
          <p>해당하는 항목을 하나 눌러주세요.</p>
          <div className="appreport__issues">{ISSUE_OPTIONS.map((item) => <button type="button" key={item.label} aria-pressed={issue === item.label} onClick={() => setIssue(item.label)}>{item.label}</button>)}</div>
          <button type="button" className="appreport__more" onClick={() => setStep("guide")}>그 밖의 버스 문의는 어디로?</button>
          <div className="appreport__bottom-actions"><button type="button" className="appreport__secondary" onClick={() => setStep("confirm")}>이전</button><button type="button" className="appreport__primary" disabled={!issue} onClick={submit}>내용 보내기</button></div>
        </section>
      )}

      {step === "guide" && (
        <section className="appreport__panel appreport__panel--scroll">
          <p className="appreport__step">버스 문의 안내</p>
          <h1>어디로 문의할까요?</h1>
          <p>춘천시 안내에 따른 접수처입니다. 눌러서 바로 전화할 수 있어요.</p>
          {CONTACT_CATEGORIES.map((category) => (
            <article className="appreport__contact" key={category.key}>
              <h2>{category.title}</h2>
              <p className="appreport__contact-ex">{category.examples}</p>
              {category.key === "ride" && selected && (
                <p className="appreport__contact-ex"><b>{selected.name}</b>에 오는 버스 기준입니다.</p>
              )}
              {contactsOf(category).map((item) => (
                <a className="appreport__tel" href={telHref(item.phone)} key={item.phone}>
                  <Phone aria-hidden="true" />
                  <span>
                    <strong>{item.org}</strong>
                    {item.scope && <small>{item.scope}</small>}
                  </span>
                  <em>{item.phone}</em>
                </a>
              ))}
              {category.required.length > 0 && (
                <p className="appreport__contact-need">함께 알려주세요 · {category.required.join(", ")}</p>
              )}
            </article>
          ))}
          <article className="appreport__contact">
            <h2>버스 노선정보</h2>
            <div className="appreport__links">
              {ROUTE_INFO_LINKS.map((link) => (
                <a href={link.url} key={link.url} target="_blank" rel="noreferrer noopener">{link.label}</a>
              ))}
            </div>
          </article>
          <div className="appreport__bottom-actions"><button type="button" className="appreport__secondary" onClick={() => setStep("issue")}>이전</button></div>
        </section>
      )}

      {step === "done" && selected && (
        <section className="appreport__panel appreport__panel--scroll appreport__panel--done">
          <span className="appreport__hero-icon appreport__hero-icon--done"><Check aria-hidden="true" /></span>
          <p className="appreport__step">3 / 3 · 보내기 완료</p>
          <h1>알려주셔서<br />고맙습니다</h1>
          <p><strong>{selected.name}</strong>의 “{issue}” 의견을 현장 확인 자료로 전달합니다.</p>
          {contact && (
            <article className="appreport__contact appreport__contact--done">
              <h2>춘천시에 바로 알리시려면</h2>
              <p className="appreport__contact-ex">{contact.title}</p>
              {contactsOf(contact).map((item) => (
                <a className="appreport__tel" href={telHref(item.phone)} key={item.phone}>
                  <Phone aria-hidden="true" />
                  <span>
                    <strong>{item.org}</strong>
                    {item.scope && <small>{item.scope}</small>}
                  </span>
                  <em>{item.phone}</em>
                </a>
              ))}
              {contact.required.length > 0 && (
                <p className="appreport__contact-need">
                  함께 알려주세요 · {contact.required.join(", ")}
                  <br />
                  <b>{selected.name}{selected.stopNo ? ` · 정류소 번호 ${selected.stopNo}` : ""}</b>
                </p>
              )}
            </article>
          )}
          <Link className="appreport__home" to="/app"><MessageCircle aria-hidden="true" />메인으로 돌아가기</Link>
        </section>
      )}
    </main>
  );
}
