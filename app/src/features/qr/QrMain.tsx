import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ChevronLeft, Mic, Navigation } from "lucide-react";
import { useStops } from "../../store/useStops";
import type { Stop } from "../../types/stop";
import type { RoutesFile } from "../../types/route";
import type { TripOption } from "../../types/trip";
import { getArrival, headwayFallback, type Arrival } from "../../lib/arrivals";
import { loadRoutes } from "../../lib/loadRoutes";
import { haversine } from "../../lib/geo";
import { planTrip } from "../trip/planTrip";
import { saveReport } from "../report/reportStore";
import QrStopMap from "./QrStopMap";
import "./QrMain.css";

interface SpeechResultEvent {
  results: ArrayLike<{ 0: { transcript: string } }>;
}

interface SpeechErrorEvent {
  error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface TripResult {
  destination: Stop;
  option: TripOption;
}

interface RouteSummary {
  routeNo: string;
  waitMin: number;
  rideMin: number;
  totalMin: number;
  live: boolean;
  directionName: string;
}

type QrMode = "home" | "destination" | "report";
type LocationSource = "gps" | "manual" | null;
type VoiceTarget = "start" | "destination";
const MAX_NEARBY_STOP_DISTANCE_M = 1500;

function normalized(value: string): string {
  return value.replace(/[“”"'.,]/g, "").replace(/대학교|대학(?=병원)/g, "대").replace(/\s+/g, "").toLowerCase();
}

function routeRideMinutes(option: TripOption, routes: RoutesFile): number {
  return option.legs.reduce((sum, leg) => {
    const route = routes.routes.find((item) =>
      leg.routeNos.includes(item.routeNo) &&
      item.stops.indexOf(leg.boardStopId) >= 0 &&
      item.stops.indexOf(leg.alightStopId) > item.stops.indexOf(leg.boardStopId),
    );
    if (!route) return sum;
    const count = route.stops.indexOf(leg.alightStopId) - route.stops.indexOf(leg.boardStopId);
    return sum + Math.max(2, count * 2);
  }, 0);
}

function clockAfter(minutes: number): string {
  return new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit" })
    .format(new Date(Date.now() + minutes * 60_000));
}

export function findTrips(
  query: string,
  start: Stop,
  stops: Stop[],
  routes: RoutesFile,
): TripResult[] {
  const needle = normalized(query);
  if (!needle) return [];
  const destinations = stops.filter((stop) => normalized(stop.name).includes(needle));
  return destinations
    .flatMap((destination) =>
      planTrip(
        { lat: start.lat, lng: start.lng },
        destination,
        stops,
        routes.routes,
        { boardStopId: start.id, walkRadiusM: 1, maxCandidates: 1 },
      ).map((option) => ({ destination, option })),
    )
    .sort((a, b) => Number(b.option.directBus) - Number(a.option.directBus))
    .slice(0, 8);
}

export default function QrMain({ initialMode = "home" }: { initialMode?: QrMode }) {
  const stops = useStops((state) => state.stops);
  const loaded = useStops((state) => state.loaded);
  const [mode, setMode] = useState<QrMode>(initialMode);
  const initialActionStarted = useRef(false);
  const [startId, setStartId] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState(false);
  const [outsideServiceArea, setOutsideServiceArea] = useState(false);
  const [locationSource, setLocationSource] = useState<LocationSource>(null);
  const [manualStopQuery, setManualStopQuery] = useState("");
  const [nearbyStops, setNearbyStops] = useState<Stop[]>([]);
  const [reportConfirmed, setReportConfirmed] = useState(false);
  const [reportIssue, setReportIssue] = useState("");
  const [reportDone, setReportDone] = useState(false);
  const start = stops.find((stop) => stop.id === startId) ?? null;
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [routes, setRoutes] = useState<RoutesFile | null>(null);
  const [arrival, setArrival] = useState<Arrival | null>(null);
  const [listeningTarget, setListeningTarget] = useState<VoiceTarget | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceStopRequestedRef = useRef(false);
  const resultsRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let alive = true;
    loadRoutes()
      .then((value) => alive && setRoutes(value))
      .catch(() => alive && setRoutes({ generatedAt: "", routes: [] }));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!start) return;
    let alive = true;
    setArrival(headwayFallback(start));
    getArrival(start).then((value) => alive && setArrival(value));
    return () => {
      alive = false;
    };
  }, [start]);

  const results = useMemo(
    () => (start && routes ? findTrips(submitted, start, stops, routes) : []),
    [submitted, start, stops, routes],
  );

  const openDestination = () => {
    setMode("destination");
    setLocationError(false);
    setOutsideServiceArea(false);
    setStartId(null);
    setLocationSource(null);
    if (!navigator.geolocation) { setLocationError(true); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const nearest = nearestStops(coords.latitude, coords.longitude)[0];
        const distance = nearest ? Math.round(haversine({ lat: coords.latitude, lng: coords.longitude }, nearest)) : null;
        const usable = nearest && distance !== null && distance <= MAX_NEARBY_STOP_DISTANCE_M;
        setStartId(usable ? nearest.id : null);
        setLocationSource(usable ? "gps" : null);
        setOutsideServiceArea(Boolean(nearest && !usable));
        setLocationError(!nearest);
        setLocating(false);
      },
      () => { setLocationError(true); setLocating(false); },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 },
    );
  };

  const nearestStops = (latitude: number, longitude: number) => stops
    .map((stop) => ({ stop, distance: haversine({ lat: latitude, lng: longitude }, stop) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5)
    .map(({ stop }) => stop);

  const locateForReport = () => {
    setMode("report");
    setLocationError(false);
    setReportConfirmed(false);
    setReportDone(false);
    setReportIssue("");
    setOutsideServiceArea(false);
    setStartId(null);
    setLocationSource(null);
    if (!navigator.geolocation) {
      setLocationError(true);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const candidates = nearestStops(coords.latitude, coords.longitude);
        const distance = candidates[0] ? Math.round(haversine({ lat: coords.latitude, lng: coords.longitude }, candidates[0])) : null;
        const usable = distance !== null && distance <= MAX_NEARBY_STOP_DISTANCE_M;
        setNearbyStops(candidates);
        setStartId(usable ? candidates[0]?.id ?? null : null);
        setLocationSource(usable ? "gps" : null);
        setOutsideServiceArea(candidates.length > 0 && !usable);
        setLocationError(candidates.length === 0);
        setLocating(false);
      },
      () => {
        setLocationError(true);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 },
    );
  };

  const requestTrip = (destination: string) => {
    if (!destination) return;
    if (startId && locationSource) setSubmitted(destination);
    else openDestination();
  };

  const manualMatches = useMemo(() => {
    const needle = normalized(manualStopQuery);
    if (!needle) return [];
    return stops.filter((stop) => normalized(stop.name).includes(needle) || stop.stopNo.includes(needle)).slice(0, 6);
  }, [manualStopQuery, stops]);

  const chooseManualStop = (stop: Stop) => {
    setStartId(stop.id);
    setLocationSource("manual");
    setLocationError(false);
    setOutsideServiceArea(false);
    setManualStopQuery("");
  };

  useEffect(() => {
    if (initialMode !== "report" || initialActionStarted.current || !loaded) return;
    initialActionStarted.current = true;
    locateForReport();
  }, [initialMode, loaded]);

  const manualStopSearch = <div className="qrmain__manual-stop">
    <label htmlFor="manual-stop">출발 정류장을 입력하세요</label>
    <div className="qrmain__voice-input">
      <input id="manual-stop" value={manualStopQuery} onChange={(event) => setManualStopQuery(event.target.value)} placeholder="정류장명 또는 정류장 번호 4자리" />
      <button type="button" data-listening={listeningTarget === "start"} aria-label={listeningTarget === "start" ? "출발 정류장 듣는 중, 누르면 완료" : "출발 정류장 말하기"} onClick={() => startVoice("start")}><Mic aria-hidden="true" /></button>
    </div>
    {manualMatches.length > 0 && <ul>{manualMatches.map((stop) => <li key={stop.id}><button type="button" onClick={() => chooseManualStop(stop)}><strong>{stop.name}</strong><span>{stop.stopNo ? `#${stop.stopNo}` : "번호 미확인"}</span></button></li>)}</ul>}
  </div>;

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    requestTrip(query.trim());
  };

  useEffect(() => {
    if (!submitted || !start || !routes) return;
    const frame = window.requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [submitted, start, routes]);

  const startVoice = (target: "start" | "destination" = "destination") => {
    if (listeningTarget) {
      voiceStopRequestedRef.current = true;
      recognitionRef.current?.stop();
      return;
    }
    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      alert("이 브라우저는 음성 입력을 지원하지 않습니다. 목적지를 직접 입력해 주세요.");
      return;
    }
    recognitionRef.current?.stop();
    const recognition = new Recognition();
    recognition.lang = "ko-KR";
    voiceStopRequestedRef.current = false;
    recognition.interimResults = false;
    recognition.continuous = true;
    let heardText = target === "start" ? manualStopQuery.trim() : query.trim();
    let failed = false;
    const startedAt = Date.now();
    recognition.onresult = (event) => {
      heardText = Array.from(event.results)
        .map((result) => result[0]?.transcript?.trim() ?? "")
        .filter(Boolean)
        .join(" ");
      if (target === "start") setManualStopQuery(heardText);
      else setQuery(heardText);
    };
    recognition.onerror = (event) => {
      if (event.error === "no-speech") return;
      failed = true;
      setListeningTarget(null);
    };
    recognition.onend = () => {
      if (!failed && !voiceStopRequestedRef.current && Date.now() - startedAt < 8000) {
        window.setTimeout(() => recognition.start(), 100);
        return;
      }
      setListeningTarget(null);
      if (!failed && target === "destination" && mode === "destination" && heardText) requestTrip(heardText);
    };
    recognitionRef.current = recognition;
    setListeningTarget(target);
    recognition.start();
  };

  if (!loaded) {
    return <main className="qrmain"><p className="qrmain__state">정류장 정보를 불러오는 중…</p></main>;
  }

  if (mode === "home") {
    return (
      <main className="qrmain">
        <section className="qrmain__welcome">
          <span className="qrmain__brand">쉼표 정류장</span>
          <div className="qrmain__hello">
            <h1>무엇을 하시겠어요?</h1>
          </div>
          <div className="qrmain__choices">
            <button type="button" onClick={openDestination}>
              <strong>목적지로 가는 길 찾기</strong>
            </button>
            <button type="button" onClick={locateForReport}>
              <strong>정류장 불편 알리기</strong>
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (mode === "report") {
    if (locating) return <main className="qrmain"><section className="qrmain__error"><Navigation aria-hidden="true" className="qrmain__locate-icon" /><h1>가까운 정류장을 찾고 있어요</h1><p>현재 위치와 가장 가까운 정류장을 확인할게요.</p></section></main>;
    if (locationError || outsideServiceArea || !start) return <main className="qrmain"><section className="qrmain__report-location">
      <button className="qrmain__back qrmain__back--icon" type="button" aria-label="뒤로 가기" onClick={() => setMode("home")}><ChevronLeft aria-hidden="true" /></button>
      <h1>주변 정류장을 찾지 못했습니다</h1>
      <button type="button" className="qrmain__retry" onClick={locateForReport}>위치 다시 확인하기</button>
      {manualStopSearch}
    </section></main>;
    if (!reportConfirmed) return <main className="qrmain"><section className="qrmain__stop-confirm">
      <button className="qrmain__back qrmain__back--icon" type="button" aria-label="뒤로 가기" onClick={() => setMode("home")}><ChevronLeft aria-hidden="true" /></button>
      <h1>{start.name}</h1><strong>{start.stopNo ? `정류장 번호 ${start.stopNo}` : "정류장 번호 확인 중"}</strong>
      <h2>이 정류장이 맞나요?</h2>
      <div className="qrmain__confirm-actions"><button type="button" onClick={() => setReportConfirmed(true)}>네, 맞아요</button><button type="button" onClick={() => setStartId(nearbyStops.find((stop) => stop.id !== start.id)?.id ?? start.id)}>아니요</button></div>
      <div className="qrmain__nearby"><span>다른 가까운 정류장</span>{nearbyStops.filter((stop) => stop.id !== start.id).map((stop) => <button type="button" key={stop.id} onClick={() => setStartId(stop.id)}>{stop.name} {stop.stopNo && `#${stop.stopNo}`}</button>)}</div>
    </section></main>;
    if (reportDone) return <main className="qrmain"><section className="qrmain__ask qrmain__report-complete"><h1>불편 사항을 접수했어요</h1><p><b>{start.name}</b>의 `{reportIssue}` 의견을 현장 확인 자료로 전달할게요.</p><button type="button" className="qrmain__retry" onClick={() => setMode("home")}>확인</button></section></main>;
    return <main className="qrmain"><section className="qrmain__ask qrmain__report-start">
      <button className="qrmain__back qrmain__back--icon" type="button" aria-label="뒤로 가기" onClick={() => setReportConfirmed(false)}><ChevronLeft aria-hidden="true" /></button>
      <span className="qrmain__report-stop">{start.name} {start.stopNo && `#${start.stopNo}`}</span>
      <h1>어떤 점이 불편하셨나요?</h1><p>해당하는 항목을 하나 눌러주세요.</p>
      <div className="qrmain__quick-report">{["의자가 없어요", "그늘이 없어요", "안내 화면이 꺼졌어요", "조명이 어두워요"].map((issue) => <button type="button" aria-pressed={reportIssue === issue} onClick={() => setReportIssue(issue)} key={issue}>{issue}</button>)}</div>
      <button type="button" className="qrmain__report-submit" disabled={!reportIssue} onClick={() => { saveReport(start, reportIssue); setReportDone(true); }}>불편 사항 보내기</button>
    </section></main>;
  }

  if (locating) {
    return <main className="qrmain"><section className="qrmain__error">
      <button className="qrmain__back qrmain__back--icon" type="button" aria-label="뒤로 가기" onClick={() => setMode("home")}><ChevronLeft aria-hidden="true" /></button>
      <Navigation aria-hidden="true" className="qrmain__locate-icon" />
      <h1>가까운 정류장을 찾고 있어요</h1>
      <p>위치를 확인한 뒤 목적지를 여쭤볼게요.</p>
    </section></main>;
  }

  return (
    <main className="qrmain">
      <button className="qrmain__back qrmain__back--icon" type="button" aria-label="뒤로 가기" onClick={() => submitted ? setSubmitted("") : setMode("home")}><ChevronLeft aria-hidden="true" /></button>

      {!submitted && <section className="qrmain__ask qrmain__destination-page">
        {(outsideServiceArea || locationError) && <div className="qrmain__location-recovery" role="alert"><span>위치 정보를 찾을 수 없습니다</span><button type="button" onClick={openDestination}>위치 찾기</button></div>}
        {manualStopSearch}
        {start && locationSource && <div className="qrmain__location-proof">
          <QrStopMap stop={start} />
        </div>}
        <h2>목적지를 입력하세요</h2>
        <form className="qrmain__voice-input" onSubmit={submit}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="예: 한림대학교"
            aria-label="목적지"
            enterKeyHint="search"
          />
          <button type="button" data-listening={listeningTarget === "destination"} aria-label={listeningTarget === "destination" ? "목적지 듣는 중, 누르면 완료" : "목적지 말하기"} onClick={() => startVoice("destination")}><Mic aria-hidden="true" /></button>
        </form>
      </section>}

      {submitted && start && (
        <section className="qrmain__results qrmain__results-page" aria-live="polite" ref={resultsRef}>
          <div className="qrmain__results-title"><span>목적지</span><h2>{submitted}</h2></div>
          {!routes ? (
            <p className="qrmain__state">버스 노선을 확인하는 중…</p>
          ) : results.length === 0 ? (
            <p className="qrmain__state">“{submitted}”까지 가는 노선을 찾지 못했습니다. 정류장 이름을 다시 말씀해 주세요.</p>
          ) : (
            results.slice(0, 1).map(({ destination, option }, index) => {
              const firstLeg = option.legs[0];
              const rideMin = routeRideMinutes(option, routes);
              const routeArrivals: RouteSummary[] = firstLeg.routeNos.map((routeNo) => {
                const liveArrival = arrival?.byRoute?.find((item) => item.routeNo === routeNo);
                const waitMin = liveArrival?.min ?? start.headwayMin ?? 15;
                const route = routes.routes.find((candidate) => candidate.routeNo === routeNo);
                const boardIndex = route?.stops.indexOf(start.id) ?? -1;
                const nextStop = boardIndex >= 0 ? stops.find((stop) => stop.id === route?.stops[boardIndex + 1]) : null;
                return {
                  routeNo,
                  waitMin,
                  rideMin,
                  totalMin: option.walkMin + waitMin + rideMin,
                  live: Boolean(liveArrival),
                  directionName: nextStop?.name ?? destination.name,
                };
              }).filter((item) => item.waitMin >= option.walkMin + 1)
                .sort((a, b) => a.totalMin - b.totalMin)
                .slice(0, 1);
              return (
                <div className="qrmain__result-set" key={`${destination.id}-${index}`}>
                  {routeArrivals.map((item, routeIndex) => (
                    <article className="qrmain__route" data-best={index === 0 && routeIndex === 0} key={item.routeNo}>
                      <p className="qrmain__recommend">가장 빠른 버스</p>
                      <div className="qrmain__route-head">
                        <div><strong>{item.routeNo}번</strong><small>{option.directBus ? "환승 없이 이동" : "1회 환승"}</small></div>
                        <p><b>{item.waitMin}분 후</b><span>총 약 {item.totalMin}분 · {clockAfter(item.totalMin)} 도착</span></p>
                      </div>
                      <div className="qrmain__boarding">
                        <span>버스를 탈 곳</span>
                        <strong>{start.name} <small>{start.stopNo ? `#${start.stopNo}` : ""}</small></strong>
                        <p><b>{item.directionName} 방면</b> · 도보 {option.walkMin}분</p>
                        <small>{item.live ? "실시간 도착정보" : "배차정보 기준 예상"}</small>
                      </div>
                    </article>
                  ))}
                </div>
              );
            })
          )}
          {results.length > 0 && (
            <button type="button" className="qrmain__report" onClick={locateForReport}>정류장 불편 신고</button>
          )}
        </section>
      )}
    </main>
  );
}
