import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Armchair, BusFront, ChevronLeft, ChevronRight, Clock3, MapPin, MessageCircle, Mic, Navigation, Search, Umbrella } from "lucide-react";
import { useStops } from "../../store/useStops";
import type { Stop } from "../../types/stop";
import type { RoutesFile } from "../../types/route";
import type { TripOption } from "../../types/trip";
import { getArrival, headwayFallback, type Arrival } from "../../lib/arrivals";
import { loadRoutes } from "../../lib/loadRoutes";
import { haversine } from "../../lib/geo";
import { planTrip } from "../trip/planTrip";
import { saveReport } from "../report/reportStore";
import "./QrMain.css";

interface SpeechResultEvent {
  results: ArrayLike<{ 0: { transcript: string } }>;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
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

function normalized(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
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

function mapEmbedUrl(stop: Stop): string {
  const delta = 0.004;
  const bbox = `${stop.lng - delta},${stop.lat - delta},${stop.lng + delta},${stop.lat + delta}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${stop.lat},${stop.lng}`;
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

export default function QrMain() {
  const stops = useStops((state) => state.stops);
  const loaded = useStops((state) => state.loaded);
  const [mode, setMode] = useState<QrMode>("home");
  const [startId, setStartId] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState(false);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [stopDistance, setStopDistance] = useState<number | null>(null);
  const [nearbyStops, setNearbyStops] = useState<Stop[]>([]);
  const [reportConfirmed, setReportConfirmed] = useState(false);
  const [reportIssue, setReportIssue] = useState("");
  const [reportDone, setReportDone] = useState(false);
  const start = stops.find((stop) => stop.id === startId) ?? null;
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [routes, setRoutes] = useState<RoutesFile | null>(null);
  const [arrival, setArrival] = useState<Arrival | null>(null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
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
    setStartId(null);
    setLocationAccuracy(null);
    setStopDistance(null);
    if (!navigator.geolocation) { setLocationError(true); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const nearest = nearestStops(coords.latitude, coords.longitude)[0];
        setStartId(nearest?.id ?? null);
        setLocationAccuracy(Math.round(coords.accuracy));
        setStopDistance(nearest ? Math.round(haversine({ lat: coords.latitude, lng: coords.longitude }, nearest)) : null);
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
    setStartId(null);
    setLocationAccuracy(null);
    setStopDistance(null);
    if (!navigator.geolocation) {
      setLocationError(true);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const candidates = nearestStops(coords.latitude, coords.longitude);
        setNearbyStops(candidates);
        setStartId(candidates[0]?.id ?? null);
        setLocationAccuracy(Math.round(coords.accuracy));
        setStopDistance(candidates[0] ? Math.round(haversine({ lat: coords.latitude, lng: coords.longitude }, candidates[0])) : null);
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
    if (startId && locationAccuracy !== null && stopDistance !== null) setSubmitted(destination);
    else openDestination();
  };

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

  const startVoice = () => {
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
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim() ?? "";
      setQuery(transcript);
      if (mode === "destination") requestTrip(transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  if (!loaded) {
    return <main className="qrmain"><p className="qrmain__state">정류장 정보를 불러오는 중…</p></main>;
  }

  if (mode === "home") {
    return (
      <main className="qrmain">
        <section className="qrmain__welcome">
          <span className="qrmain__brand">쉼표정류장</span>
          <div className="qrmain__hello"><span>안녕하세요!</span><h1>무엇을 도와드릴까요?</h1></div>
          <p>복잡하게 찾지 않아도 괜찮아요.<br />원하는 도움을 눌러주세요.</p>
          <div className="qrmain__choices">
            <button type="button" onClick={openDestination}>
              <span><Navigation aria-hidden="true" /></span>
              <strong>목적지로 가는 길 찾기</strong>
              <small>목적지를 말씀하면 탈 버스를 알려드려요</small>
              <ChevronRight aria-hidden="true" />
            </button>
            <button type="button" onClick={locateForReport}>
              <span><MessageCircle aria-hidden="true" /></span>
              <strong>정류장 불편 알리기</strong>
              <small>기다리며 불편했던 점을 말씀해 주세요</small>
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
          <p className="qrmain__privacy">로그인 없이 바로 이용할 수 있어요</p>
        </section>
      </main>
    );
  }

  if (mode === "report") {
    if (locating) return <main className="qrmain"><section className="qrmain__error"><Navigation aria-hidden="true" className="qrmain__locate-icon" /><h1>가까운 정류장을 찾고 있어요</h1><p>현재 위치와 가장 가까운 정류장을 확인할게요.</p></section></main>;
    if (locationError || !start) return <main className="qrmain"><section className="qrmain__error">
      <button className="qrmain__back" type="button" onClick={() => setMode("home")}><ChevronLeft aria-hidden="true" /> 처음으로</button>
      <Navigation aria-hidden="true" className="qrmain__locate-icon" /><h1>현재 위치가 필요해요</h1><p>불편한 정류장을 확인하려면 위치 사용을 허용해 주세요.</p><button type="button" className="qrmain__retry" onClick={locateForReport}>위치 다시 확인하기</button>
    </section></main>;
    if (!reportConfirmed) return <main className="qrmain"><section className="qrmain__ask qrmain__stop-confirm">
      <button className="qrmain__back" type="button" onClick={() => setMode("home")}><ChevronLeft aria-hidden="true" /> 처음으로</button>
      <span className="qrmain__report-icon"><MapPin aria-hidden="true" /></span>
      <p>현재 위치에서 가장 가까운 정류장이에요.</p><h1>{start.name}</h1><strong>{start.stopNo ? `정류장 번호 ${start.stopNo}` : "정류장 번호 확인 중"}</strong>
      <iframe className="qrmain__map" title={`${start.name} 정류장 지도`} src={mapEmbedUrl(start)} loading="lazy" />
      <h2>이 정류장이 맞나요?</h2>
      <div className="qrmain__confirm-actions"><button type="button" onClick={() => setReportConfirmed(true)}>네, 맞아요</button><button type="button" onClick={() => setStartId(nearbyStops.find((stop) => stop.id !== start.id)?.id ?? start.id)}>아니요</button></div>
      <div className="qrmain__nearby"><span>다른 가까운 정류장</span>{nearbyStops.filter((stop) => stop.id !== start.id).map((stop) => <button type="button" key={stop.id} onClick={() => setStartId(stop.id)}>{stop.name} {stop.stopNo && `#${stop.stopNo}`}</button>)}</div>
    </section></main>;
    if (reportDone) return <main className="qrmain"><section className="qrmain__ask qrmain__report-complete"><span className="qrmain__report-icon"><MessageCircle aria-hidden="true" /></span><h1>불편 사항을 접수했어요</h1><p><b>{start.name}</b>의 `{reportIssue}` 의견을 현장 확인 자료로 전달할게요.</p><button type="button" className="qrmain__retry" onClick={() => setMode("home")}>처음 화면으로</button></section></main>;
    return <main className="qrmain"><section className="qrmain__ask qrmain__report-start">
      <button className="qrmain__back" type="button" onClick={() => setReportConfirmed(false)}><ChevronLeft aria-hidden="true" /> 정류장 다시 확인</button>
      <span className="qrmain__report-icon"><MessageCircle aria-hidden="true" /></span><span className="qrmain__report-stop">{start.name} {start.stopNo && `#${start.stopNo}`}</span>
      <h1>어떤 점이 불편하셨나요?</h1><p>해당하는 항목을 하나 눌러주세요.</p>
      <div className="qrmain__quick-report">{["의자가 없어요", "그늘이 없어요", "안내 화면이 꺼졌어요", "조명이 어두워요"].map((issue) => <button type="button" aria-pressed={reportIssue === issue} onClick={() => setReportIssue(issue)} key={issue}>{issue}</button>)}</div>
      <button type="button" className="qrmain__report-submit" disabled={!reportIssue} onClick={() => { saveReport(start, reportIssue); setReportDone(true); }}>불편 사항 보내기</button>
    </section></main>;
  }

  if (locating) {
    return <main className="qrmain"><section className="qrmain__error">
      <button className="qrmain__back" type="button" onClick={() => setMode("home")}><ChevronLeft aria-hidden="true" /> 처음으로</button>
      <Navigation aria-hidden="true" className="qrmain__locate-icon" />
      <h1>가까운 정류장을 찾고 있어요</h1>
      <p>위치를 확인한 뒤 목적지를 여쭤볼게요.</p>
    </section></main>;
  }

  return (
    <main className="qrmain">
      <button className="qrmain__back" type="button" onClick={() => setMode("home")}><ChevronLeft aria-hidden="true" /> 처음으로</button>

      {!submitted && <section className="qrmain__ask qrmain__destination-page">
        {start && locationAccuracy !== null && stopDistance !== null && <div className="qrmain__location-proof">
          <iframe className="qrmain__map" title={`${start.name} 주변 지도`} src={mapEmbedUrl(start)} loading="lazy" />
          <div><span><MapPin aria-hidden="true" /> GPS로 찾은 가장 가까운 정류장</span><strong>{start.name} {start.stopNo && <small>#{start.stopNo}</small>}</strong><p>현재 위치에서 약 {stopDistance}m · GPS 오차범위 약 {locationAccuracy}m</p></div>
        </div>}
        <h2>어디로 가세요?</h2>
        <p>마이크를 누르고 목적지를 말씀해 주세요.</p>
        <button type="button" className="qrmain__mic" data-listening={listening} onClick={startVoice}>
          <Mic aria-hidden="true" />
          {listening ? "듣고 있어요…" : "목적지 말하기"}
        </button>
        <form className="qrmain__form" onSubmit={submit}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="예: 한림대학교"
            aria-label="목적지"
          />
          <button type="submit"><Search aria-hidden="true" /> 찾기</button>
        </form>
        {locationError && <div className="qrmain__location-error" role="alert"><b>위치를 확인하지 못했어요.</b><span>휴대폰의 위치 사용을 허용한 뒤 다시 눌러주세요.</span><button type="button" onClick={() => requestTrip(query.trim())}>위치 다시 확인하기</button></div>}
      </section>}

      {submitted && start && (
        <section className="qrmain__results qrmain__results-page" aria-live="polite" ref={resultsRef}>
          <div className="qrmain__results-title"><button type="button" onClick={() => setSubmitted("")}><ChevronLeft aria-hidden="true" /> 목적지 다시 입력</button><h2>{submitted}까지 가는 버스</h2></div>
          {!routes ? (
            <p className="qrmain__state">버스 노선을 확인하는 중…</p>
          ) : results.length === 0 ? (
            <p className="qrmain__state">“{submitted}”까지 가는 노선을 찾지 못했습니다. 정류장 이름을 다시 말씀해 주세요.</p>
          ) : (
            results.map(({ destination, option }, index) => {
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
                .slice(0, 3);
              return (
                <div className="qrmain__result-set" key={`${destination.id}-${index}`}>
                  {routeArrivals.map((item, routeIndex) => (
                    <article className="qrmain__route" data-best={index === 0 && routeIndex === 0} key={item.routeNo}>
                      {index === 0 && routeIndex === 0 && <span className="qrmain__recommend">가장 빨리 도착해요</span>}
                      <p className="qrmain__instruction">이 버스를 타세요</p>
                      <div className="qrmain__route-head">
                        <span className="qrmain__bus-icon"><BusFront aria-hidden="true" /></span>
                        <div><strong>{item.routeNo}번</strong><small>{option.directBus ? "환승 없이 이동" : "1회 환승"}</small></div>
                        <p><b>총 약 {item.totalMin}분</b><span>{clockAfter(item.totalMin)} 도착 예상</span></p>
                      </div>
                      <div className="qrmain__timing">
                        <p><Clock3 aria-hidden="true" /><span>버스</span><b>{item.waitMin}분 후</b></p>
                        <p><MapPin aria-hidden="true" /><span>타는 곳까지</span><b>도보 {option.walkMin}분</b></p>
                      </div>
                      <div className="qrmain__boarding">
                        <span>버스를 탈 곳</span>
                        <strong>{start.name} <small>{start.stopNo ? `#${start.stopNo}` : ""}</small></strong>
                        <p><b>{item.directionName} 방면</b> · 다음 정류장 기준 방향</p>
                        <p>{item.live ? "실시간 도착정보" : "배차정보 기준 예상"}</p>
                      </div>
                      <iframe className="qrmain__map" title={`${start.name} 승차 위치 지도`} src={mapEmbedUrl(start)} loading="lazy" />
                      <div className="qrmain__facilities" aria-label="정류장 편의시설">
                        <span data-state={start.facilities.seat.status}><Armchair aria-hidden="true" /> 의자 {start.facilities.seat.status === "yes" ? "있음" : "미확인"}</span>
                        <span data-state={start.facilities.shade.status}><Umbrella aria-hidden="true" /> 그늘 {start.facilities.shade.status === "yes" ? "있음" : "미확인"}</span>
                      </div>
                      <button type="button" className="qrmain__place" onClick={() => window.open(`https://map.kakao.com/link/map/${encodeURIComponent(start.name)},${start.lat},${start.lng}`, "_blank", "noopener,noreferrer")}>버스를 탈 곳 보기 <ChevronRight aria-hidden="true" /></button>
                    </article>
                  ))}
                </div>
              );
            })
          )}
          {results.length > 0 && (
            <button type="button" className="qrmain__report" onClick={locateForReport}><MessageCircle aria-hidden="true" /> 이 정류장에서 불편한 점 알리기</button>
          )}
        </section>
      )}
    </main>
  );
}
