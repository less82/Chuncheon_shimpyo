import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ChevronLeft, Mic } from "lucide-react";
import { useStops } from "../../store/useStops";
import type { Stop } from "../../types/stop";
import type { RoutesFile } from "../../types/route";
import type { TripOption } from "../../types/trip";
import {
  ARRIVAL_EMPTY_TEXT,
  ARRIVAL_UNAVAILABLE_TEXT,
  arrivalsForRoutes,
  getArrival,
  type Arrival,
} from "../../lib/arrivals";
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
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
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
  /** 실시간으로 확인된 대기 시간(분). 실시간이 아니면 null — 배차간격으로 지어내지 않는다. */
  waitMin: number | null;
  live: boolean;
  directionName: string;
}

type QrMode = "home" | "destination" | "report";
type LocationSource = "gps" | "manual" | null;
type VoiceTarget = "destination";
const MAX_NEARBY_STOP_DISTANCE_M = 1500;

function normalized(value: string): string {
  return value.replace(/[“”"'.,]/g, "").replace(/대학교|대학(?=병원)/g, "대").replace(/\s+/g, "").toLowerCase();
}

// 총 소요시간(탑승시간 포함)은 검증된 경로 API 가 값을 줄 때만 표시한다.
// 정류장 개수로 분을 추정하던 계산은 근거가 없어 제거했다(docs/현재/01_제품_화면.md).

function resizeReportPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("사진을 읽지 못했습니다."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("사진을 열지 못했습니다."));
      image.onload = () => {
        const maxSide = 1280;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
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
  const stopsFailed = useStops((state) => state.failed);
  const reloadStops = useStops((state) => state.load);
  const [mode, setMode] = useState<QrMode>("home");
  const [startId, setStartId] = useState<string | null>(null);
  const [startCandidateIds, setStartCandidateIds] = useState<string[]>([]);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState(false);
  const [outsideServiceArea, setOutsideServiceArea] = useState(false);
  const [locationSource, setLocationSource] = useState<LocationSource>(null);
  const [manualStopQuery, setManualStopQuery] = useState("");
  const [nearbyStops, setNearbyStops] = useState<Stop[]>([]);
  const [reportConfirmed, setReportConfirmed] = useState(false);
  const [reportIssue, setReportIssue] = useState("");
  const [reportPhoto, setReportPhoto] = useState("");
  const [reportReview, setReportReview] = useState(false);
  const [reportDone, setReportDone] = useState(false);
  const start = stops.find((stop) => stop.id === startId) ?? null;
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [routes, setRoutes] = useState<RoutesFile | null>(null);
  const [arrival, setArrival] = useState<Arrival | null>(null);
  const [listeningTarget, setListeningTarget] = useState<VoiceTarget | null>(null);
  const [speechActive, setSpeechActive] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceStopRequestedRef = useRef(false);
  const resultsRef = useRef<HTMLElement | null>(null);
  // 음성 세션 정리용 — 언마운트 후 자동 재시작·타이머가 남지 않게 한다.
  const voiceTimersRef = useRef<number[]>([]);
  const unmountedRef = useRef(false);

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
    // 폴백(배차간격) 문구를 상태에 담지 않는다. 실시간이 오기 전엔 비워 둔다.
    setArrival(null);
    getArrival(start).then((value) => alive && setArrival(value));
    return () => {
      alive = false;
    };
  }, [start]);

  const results = useMemo(
    () => (start && routes ? findTrips(submitted, start, stops, routes) : []),
    [submitted, start, stops, routes],
  );

  const routeChoices = useMemo<RouteSummary[]>(() => {
    if (!start || !routes || results.length === 0) return [];
    const { destination, option } = results[0];
    const firstLeg = option.legs[0];
    return firstLeg.routeNos.map((routeNo) => {
      // 실시간 응답에 있는 노선만 대기 시간을 안다. 없으면 배차간격으로 대체하지 않고 null.
      // 노선명 비교는 arrivals.ts 의 정규화(괄호 표기 제거)를 그대로 쓴다.
      const liveArrival = arrival?.live ? arrivalsForRoutes(arrival, [routeNo])[0] : undefined;
      const waitMin = liveArrival?.min ?? null;
      const route = routes.routes.find((candidate) => candidate.routeNo === routeNo);
      const boardIndex = route?.stops.indexOf(start.id) ?? -1;
      const nextStop = boardIndex >= 0 ? stops.find((stop) => stop.id === route?.stops[boardIndex + 1]) : null;
      return {
        routeNo,
        waitMin,
        live: Boolean(liveArrival),
        directionName: nextStop?.name ?? destination.name,
      };
    // 대기 시간을 아는 노선만 '못 타는 버스'를 걸러낸다. 모르면 후보로 남긴다.
    }).filter((item) => item.waitMin === null || item.waitMin >= option.walkMin + 1)
      // 근거 있는 값(실시간 대기 시간)으로만 정렬한다. 모르는 노선은 뒤로 보낸다.
      .sort((a, b) => (a.waitMin ?? Number.POSITIVE_INFINITY) - (b.waitMin ?? Number.POSITIVE_INFINITY))
      .slice(0, 3);
  }, [arrival, results, routes, start, stops]);

  const openDestination = () => {
    setMode("destination");
    setLocationError(false);
    setOutsideServiceArea(false);
    setStartId(null);
    setStartCandidateIds([]);
    setLocationSource(null);
    if (!navigator.geolocation) { setLocationError(true); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const nearest = nearestStops(coords.latitude, coords.longitude)[0];
        const distance = nearest ? Math.round(haversine({ lat: coords.latitude, lng: coords.longitude }, nearest)) : null;
        const usable = nearest && distance !== null && distance <= MAX_NEARBY_STOP_DISTANCE_M;
        setStartId(usable ? nearest.id : null);
        setStartCandidateIds(usable && nearest ? [nearest.id] : []);
        setStartCandidateIds(usable ? [nearest.id] : []);
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
    setReportPhoto("");
    setReportReview(false);
    setOutsideServiceArea(false);
    setStartId(null);
    setStartCandidateIds([]);
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
        setStartCandidateIds(usable && candidates[0] ? [candidates[0].id] : []);
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
    if (startId && locationSource) {
      if (routes && startCandidateIds.length > 1) {
        const matchedStart = startCandidateIds
          .map((id) => stops.find((stop) => stop.id === id))
          .filter((stop): stop is Stop => Boolean(stop))
          .find((stop) => findTrips(destination, stop, stops, routes).length > 0);
        if (matchedStart) setStartId(matchedStart.id);
      }
      setSubmitted(destination);
    }
    else openDestination();
  };

  const manualMatches = useMemo(() => {
    const needle = normalized(manualStopQuery);
    if (!needle) return [];
    const matches = stops.filter((stop) => normalized(stop.name).includes(needle) || stop.stopNo.includes(needle));
    return [...new Map(matches.map((stop) => [normalized(stop.name), stop])).values()].slice(0, 6);
  }, [manualStopQuery, stops]);
  const chooseManualStop = (stop: Stop) => {
    const candidateIds = stops.filter((candidate) => normalized(candidate.name) === normalized(stop.name)).map((candidate) => candidate.id);
    setStartId(stop.id);
    setStartCandidateIds(candidateIds);
    setLocationSource("manual");
    setLocationError(false);
    setOutsideServiceArea(false);
    setManualStopQuery("");
  };

  const editStartStop = () => {
    setStartId(null);
    setStartCandidateIds([]);
    setLocationSource(null);
    setManualStopQuery("");
  };

  const reportCurrentStop = () => {
    if (!start) return;
    setMode("report");
    setReportConfirmed(true);
    setReportDone(false);
    setReportIssue("");
    setReportPhoto("");
    setReportReview(false);
    setLocationError(false);
    setOutsideServiceArea(false);
    setLocating(false);
  };

  const manualStopSearch = <div className="qrmain__manual-stop">
    <label htmlFor="manual-stop">출발 정류장을 입력하세요</label>
    <input className="qrmain__manual-input" id="manual-stop" value={manualStopQuery} onChange={(event) => setManualStopQuery(event.target.value)} placeholder="정류장명 또는 정류장 번호 4자리" />
    {manualMatches.length > 0 && <ul>{manualMatches.map((stop) => <li key={stop.id}><button type="button" onClick={() => chooseManualStop(stop)}><strong>{stop.name}</strong></button></li>)}</ul>}
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

  // 화면을 떠나면 음성 세션과 타이머를 모두 정리한다(마이크가 계속 켜져 있지 않도록).
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      voiceStopRequestedRef.current = true;
      voiceTimersRef.current.forEach((id) => window.clearTimeout(id));
      voiceTimersRef.current = [];
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  const startVoice = () => {
    const target: VoiceTarget = "destination";
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
    let heardText = "";
    let failed = false;
    const startedAt = Date.now();
    let finishTimer: number | undefined;
    const track = (id: number) => {
      voiceTimersRef.current.push(id);
      return id;
    };
    const maxTimer = track(window.setTimeout(() => {
      voiceStopRequestedRef.current = true;
      recognition.stop();
    }, 45_000));
    recognition.onspeechstart = () => {
      if (unmountedRef.current) return;
      setSpeechActive(true);
      if (finishTimer) window.clearTimeout(finishTimer);
    };
    recognition.onspeechend = () => {
      if (unmountedRef.current) return;
      setSpeechActive(false);
      finishTimer = track(window.setTimeout(() => {
        voiceStopRequestedRef.current = true;
        recognition.stop();
      }, 1800));
    };
    recognition.onresult = (event) => {
      if (unmountedRef.current) return;
      heardText = Array.from(event.results)
        .map((result) => result[0]?.transcript?.trim() ?? "")
        .filter(Boolean)
        .join(" ");
      setQuery(heardText);
    };
    recognition.onerror = (event) => {
      if (event.error === "no-speech") return;
      failed = true;
      window.clearTimeout(maxTimer);
      if (finishTimer) window.clearTimeout(finishTimer);
      if (unmountedRef.current) return;
      setSpeechActive(false);
      setListeningTarget(null);
    };
    recognition.onend = () => {
      // 언마운트 뒤에는 자동 재시작하지 않는다(마이크가 계속 켜지는 것을 막는다).
      if (unmountedRef.current) {
        window.clearTimeout(maxTimer);
        if (finishTimer) window.clearTimeout(finishTimer);
        return;
      }
      if (!failed && !voiceStopRequestedRef.current && !heardText && Date.now() - startedAt < 10_000) {
        track(window.setTimeout(() => {
          if (unmountedRef.current) return;
          recognition.start();
        }, 100));
        return;
      }
      window.clearTimeout(maxTimer);
      if (finishTimer) window.clearTimeout(finishTimer);
      setSpeechActive(false);
      setListeningTarget(null);
      if (!failed && mode === "destination" && heardText) requestTrip(heardText);
    };
    recognitionRef.current = recognition;
    setListeningTarget(target);
    recognition.start();
  };

  if (!loaded) {
    // 실패를 스피너로 감추지 않는다. 실패는 말하고 다시 시도할 길을 준다.
    return <main className="qrmain">
      {stopsFailed
        ? <section className="qrmain__ask">
            <p className="qrmain__state">정류장 정보를 불러오지 못했어요</p>
            <button type="button" className="qrmain__retry" onClick={() => void reloadStops()}>다시 시도하기</button>
          </section>
        : <p className="qrmain__state">정류장 정보를 불러오는 중…</p>}
    </main>;
  }

  if (mode === "home") {
    return (
      <main className="qrmain">
        <section className="qrmain__welcome">
          <div className="qrmain__choices">
            <button type="button" onClick={openDestination}>
              <strong>버스 도착 예정시간 확인</strong>
            </button>
            <button type="button" onClick={locateForReport}>
              <strong>정류장 상태 알리기</strong>
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (mode === "report") {
    if (locating) return <main className="qrmain"><section className="qrmain__report-location"><p className="qrmain__inline-status">현재 위치를 확인하고 있어요</p></section></main>;
    if (locationError || outsideServiceArea || !start) return <main className="qrmain">
      <button className="qrmain__back" type="button" aria-label="뒤로 가기" onClick={() => setMode("home")}><ChevronLeft aria-hidden="true" /></button><section className="qrmain__report-location">
      <h1>주변 정류장을 찾지 못했습니다</h1>
      <button type="button" className="qrmain__retry" onClick={locateForReport}>위치 다시 확인하기</button>
      {manualStopSearch}
    </section></main>;
    if (!reportConfirmed) return <main className="qrmain"><button className="qrmain__back" type="button" aria-label="뒤로 가기" onClick={() => setMode("home")}><ChevronLeft aria-hidden="true" /></button><section className="qrmain__stop-confirm">
      <h1>{start.name}</h1><strong>{start.stopNo ? `정류장 번호 ${start.stopNo}` : "정류장 번호 확인 중"}</strong>
      <h2>이 정류장이 맞나요?</h2>
      <div className="qrmain__confirm-actions"><button type="button" onClick={() => setReportConfirmed(true)}>네, 맞아요</button><button type="button" onClick={() => setStartId(nearbyStops.find((stop) => stop.id !== start.id)?.id ?? start.id)}>아니요</button></div>
      <div className="qrmain__nearby"><span>다른 가까운 정류장</span>{nearbyStops.filter((stop) => stop.id !== start.id).map((stop) => <button type="button" key={stop.id} onClick={() => setStartId(stop.id)}>{stop.name} {stop.stopNo && `#${stop.stopNo}`}</button>)}</div>
    </section></main>;
    if (reportDone) return <main className="qrmain"><button className="qrmain__back" type="button" aria-label="뒤로 가기" onClick={() => setMode("home")}><ChevronLeft aria-hidden="true" /></button><section className="qrmain__ask qrmain__report-complete"><h1>알려주셔서 고맙습니다</h1><p><b>{start.name}</b><br />{reportIssue}</p><p>검수 후 담당 부서로 전달됩니다.</p><button type="button" className="qrmain__retry" onClick={() => setMode("home")}>완료</button></section></main>;
    if (reportReview) return <main className="qrmain"><button className="qrmain__back" type="button" aria-label="뒤로 가기" onClick={() => setReportReview(false)}><ChevronLeft aria-hidden="true" /></button><section className="qrmain__ask qrmain__report-complete"><h1>이 내용으로 보낼까요?</h1><p><b>{start.name}</b><br />{reportIssue}</p>{reportPhoto && <img className="qrmain__photo-preview" src={reportPhoto} alt="제보 첨부 사진" />}<button type="button" className="qrmain__report-submit" onClick={() => { saveReport(start, reportIssue, reportPhoto || undefined); setReportDone(true); setReportReview(false); }}>확인</button></section></main>;
    return <main className="qrmain"><button className="qrmain__back" type="button" aria-label="뒤로 가기" onClick={() => setReportConfirmed(false)}><ChevronLeft aria-hidden="true" /></button><section className="qrmain__ask qrmain__report-start">
      <span className="qrmain__report-stop">{start.name} {start.stopNo && `#${start.stopNo}`}</span>
      <h1>어떤 점이 불편하셨나요?</h1><p>해당하는 항목을 하나 눌러주세요.</p>
      <div className="qrmain__quick-report">{["의자가 파손됐어요", "안내 화면이 꺼졌어요", "조명이 꺼졌어요", "승강장 시설물이 파손됐어요"].map((issue) => <button type="button" aria-pressed={reportIssue === issue} onClick={() => setReportIssue(issue)} key={issue}>{issue}</button>)}</div>
      <label className="qrmain__photo-input">
        <span>{reportPhoto ? "사진 다시 찍기" : "사진 찍어 첨부하기"}</span>
        <input type="file" accept="image/*" capture="environment" onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          try { setReportPhoto(await resizeReportPhoto(file)); }
          catch { alert("사진을 불러오지 못했습니다. 다시 촬영해 주세요."); }
        }} />
      </label>
      {reportPhoto && <img className="qrmain__photo-preview" src={reportPhoto} alt="제보 첨부 사진 미리보기" />}
      <button type="button" className="qrmain__report-submit" disabled={!reportIssue} onClick={() => setReportReview(true)}>내용 보내기</button>
    </section></main>;
  }

  return (
    <main className="qrmain">
      <button className="qrmain__back" type="button" aria-label="뒤로 가기" onClick={() => submitted ? setSubmitted("") : setMode("home")}><ChevronLeft aria-hidden="true" /></button>

      {!submitted && <section className="qrmain__ask qrmain__destination-page">
        {locating && <p className="qrmain__inline-status" aria-live="polite">현재 위치를 확인하고 있어요</p>}
        {(outsideServiceArea || locationError) && <button type="button" className="qrmain__location-recovery" onClick={openDestination}>위치 정보를 찾을 수 없습니다</button>}
        {!start && manualStopSearch}
        {start && locationSource && <div className="qrmain__selected-start" aria-live="polite"><span>출발 정류장</span><strong>{start.name}</strong><button type="button" onClick={editStartStop}>다시 찾기</button></div>}
        {start && locationSource && <div className="qrmain__location-proof">
          <QrStopMap stop={start} />
        </div>}
        <h2>목적지를 입력하세요</h2>
        <button type="button" className="qrmain__mic" data-listening={listeningTarget === "destination"} onClick={startVoice}>
          <Mic aria-hidden="true" />
          {listeningTarget === "destination" ? (speechActive ? "말씀을 듣고 있어요" : "말씀해 주세요") : "목적지 말하기"}
        </button>
        <form className="qrmain__form" onSubmit={submit}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="예: 한림대학교"
            aria-label="목적지"
            enterKeyHint="search"
          />
          <button type="submit">찾기</button>
        </form>
      </section>}

      {submitted && start && (
        <section className="qrmain__results qrmain__results-page" aria-live="polite" ref={resultsRef}>
          {!routes ? (
            <p className="qrmain__state">버스 노선을 확인하는 중…</p>
          ) : results.length === 0 ? (
            <p className="qrmain__state">“{submitted}”까지 가는 노선을 찾지 못했습니다. 정류장 이름을 다시 말씀해 주세요.</p>
          ) : (
            <>
              <div className="qrmain__result-set">
                  {routeChoices.map((item, routeIndex) => (
                    <article className="qrmain__route" data-best={routeIndex === 0} key={item.routeNo}>
                      <p className="qrmain__recommend">{routeIndex !== 0 ? "다음 도착 후보" : `${results[0].destination.name}(${item.directionName} 방면) 정류장${item.live ? "에 가장 빨리 도착" : "으로 가는 버스"}`}</p>
                      <div className="qrmain__route-head">
                        <div><strong>{item.routeNo}번</strong></div>
                        {/* 확인 중 / 조회 실패 / 오는 버스 없음 을 각각 다른 문구로 나눈다.
                            목적지까지의 총 소요시간은 근거가 없어 표시하지 않는다. */}
                        {item.live && item.waitMin !== null
                          ? <p><b>{item.waitMin}분 후</b><span>실시간 도착정보</span></p>
                          : arrival === null
                            ? <p><b>도착정보를 확인하고 있어요</b></p>
                            : !arrival.live
                              ? <p><b>{ARRIVAL_UNAVAILABLE_TEXT}</b></p>
                              : <p><b>{ARRIVAL_EMPTY_TEXT}</b></p>}
                      </div>
                    </article>
                  ))}
              </div>
            </>
          )}
          {routeChoices.length > 0 && (
            <button type="button" className="qrmain__report" onClick={reportCurrentStop}>이 정류장 상태 알리기</button>
          )}
        </section>
      )}
    </main>
  );
}
