// 목적지행 버스 도착정보 화면 (/go).
// 키보드 0: 즐겨찾기(=목적지)를 탭만으로 고르면 경로 카드가 나온다. 타이핑 불필요.
// 즐겨찾기가 없으면 별표 저장 안내. 결과 없으면 정직하게 "찾지 못했습니다".

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import type { Stop } from "../../types/stop";
import type { RoutesFile } from "../../types/route";
import type { LatLng } from "../../lib/geo";
import { useStops } from "../../store/useStops";
import { loadRoutes } from "../../lib/loadRoutes";
import { planTrip } from "./planTrip";
import { extractStopKeyword, speechErrorMessage } from "./speechRecognition";
import TripCard from "./TripCard";
import "./TripView.css";

type SpeechRecognitionSession = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onstart: () => void;
  onend: () => void;
  onaudiostart: () => void;
  onaudioend: () => void;
  onspeechstart: () => void;
  onspeechend: () => void;
  onresult: (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onerror: (event: { error: string }) => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionSession;
type OriginPlace = LatLng & { name: string };

function speechDevLog(field: "board" | "dest", event: string, detail = ""): void {
  if (import.meta.env.DEV) console.info(`[speech-recognition] ${field} ${event}${detail ? `: ${detail}` : ""}`);
}

export default function TripView() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const stops = useStops((s) => s.stops);
  const cityCenter = useStops((s) => s.cityCenter);
  const requestedDestId = searchParams.get("dest");
  const requestedBoardId = searchParams.get("board");
  const requestedFromLatValue = searchParams.get("fromLat");
  const requestedFromLngValue = searchParams.get("fromLng");
  const requestedFromLat = Number(requestedFromLatValue);
  const requestedFromLng = Number(requestedFromLngValue);
  const hasRequestedOrigin = requestedFromLatValue !== null && requestedFromLngValue !== null
    && Number.isFinite(requestedFromLat) && Number.isFinite(requestedFromLng);
  const safePreview = searchParams.get("safePreview") === "1" || window.self !== window.top;
  const [routes, setRoutes] = useState<RoutesFile | null>(null);
  const [fromPos, setFromPos] = useState<LatLng>(cityCenter);
  const [queries, setQueries] = useState({ board: "", dest: "" });
  const [picked, setPicked] = useState<{ board: OriginPlace | null; dest: Stop | null }>({ board: null, dest: null });
  const [activeField, setActiveField] = useState<"board" | "dest">("board");
  const [voiceMessage, setVoiceMessage] = useState("");
  const [voiceField, setVoiceField] = useState<"board" | "dest" | null>(null);
  const [listeningField, setListeningField] = useState<"board" | "dest" | null>(null);
  const [manualFields, setManualFields] = useState({ board: false, dest: false });
  const [manualAvailable, setManualAvailable] = useState({ board: false, dest: false });
  const [inputMode, setInputMode] = useState<"voice" | "manual">("voice");
  const [pendingTrip, setPendingTrip] = useState<{ origin: OriginPlace; dest: Stop } | null>(null);
  const [tripMessage, setTripMessage] = useState("");
  const recognitionRef = useRef<SpeechRecognitionSession | null>(null);
  const inputRefs = useRef<Record<"board" | "dest", HTMLInputElement | null>>({ board: null, dest: null });
  const stopQuery = queries[activeField];

  const stopMatches = useMemo(() => {
    const needle = stopQuery.replace(/\s+/g, "").toLowerCase();
    if (!needle) return [];
    return stops.filter((stop) => stop.name.replace(/\s+/g, "").toLowerCase().includes(needle) || stop.stopNo.includes(needle)).slice(0, 4);
  }, [stopQuery, stops]);
  const visibleMatches = useMemo(() => {
    if (activeField === "board" || picked.dest) return [];
    return Array.from(new Map(stopMatches.map((stop) => [stop.name.replace(/\s+/g, ""), stop])).values());
  }, [activeField, picked, stopMatches]);
  const originCandidate = useMemo<OriginPlace | null>(() => {
    const name = queries.board.trim();
    const needle = name.replace(/\s+/g, "").toLowerCase();
    if (needle.length < 2) return null;
    const anchors = stops.filter((stop) => stop.name.replace(/\s+/g, "").toLowerCase().includes(needle));
    if (anchors.length === 0) return null;
    return {
      name,
      lat: anchors.reduce((sum, stop) => sum + stop.lat, 0) / anchors.length,
      lng: anchors.reduce((sum, stop) => sum + stop.lng, 0) / anchors.length,
    };
  }, [queries.board, stops]);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const listen = (field: "board" | "dest") => {
    if (listeningField === field) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      setListeningField(null);
      setVoiceMessage("");
      return;
    }
    recognitionRef.current?.stop();
    setVoiceField(field);
    const speechWindow = window as typeof window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) { setManualAvailable((value) => ({ ...value, [field]: true })); setVoiceMessage("이 브라우저는 음성 입력을 지원하지 않습니다."); return; }
    if (!window.isSecureContext) { setManualAvailable((value) => ({ ...value, [field]: true })); setVoiceMessage("음성 입력은 보안 연결에서만 사용할 수 있습니다."); return; }
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = "ko-KR";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => { setListeningField(field); setVoiceMessage(""); speechDevLog(field, "start", `lang=${recognition.lang}`); };
    recognition.onaudiostart = () => speechDevLog(field, "audio-start", "마이크 입력 시작");
    recognition.onspeechstart = () => speechDevLog(field, "speech-start", "사람 음성 감지");
    recognition.onspeechend = () => speechDevLog(field, "speech-end", "사람 음성 종료");
    recognition.onaudioend = () => speechDevLog(field, "audio-end", "마이크 입력 종료");
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const keyword = extractStopKeyword(transcript, stops.flatMap((stop) => [stop.name, stop.stopNo]));
      speechDevLog(field, "keyword", keyword || "추출 실패");
      if (keyword) {
        setQueries((value) => ({ ...value, [field]: keyword }));
        setVoiceMessage("");
      } else {
        setQueries((value) => ({ ...value, [field]: "" }));
        setVoiceField(field);
        setVoiceMessage(field === "board"
          ? "춘천시 출발 위치를 찾지 못했어요. 다시 말해주세요."
          : "춘천시 목적지를 찾지 못했어요. 다시 말해주세요.");
      }
      setListeningField(null);
      if (recognitionRef.current === recognition) recognitionRef.current = null;
    };
    recognition.onerror = (event) => {
      setListeningField(null);
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      if (import.meta.env.DEV) console.warn(`[speech-recognition] ${field} error: ${event.error}`);
      if (["not-allowed", "service-not-allowed", "audio-capture"].includes(event.error)) {
        setManualAvailable((value) => ({ ...value, [field]: true }));
      }
      setVoiceMessage(speechErrorMessage(event.error));
    };
    recognition.onend = () => { speechDevLog(field, "end"); setListeningField(null); if (recognitionRef.current === recognition) recognitionRef.current = null; };
    setActiveField(field);
    setVoiceMessage("");
    try { recognition.start(); } catch (error) {
      setListeningField(null);
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      setManualAvailable((value) => ({ ...value, [field]: true }));
      setVoiceMessage(error instanceof DOMException && error.name === "InvalidStateError" ? "이미 음성을 듣고 있습니다." : "브라우저가 음성 입력을 시작하지 못했습니다.");
    }
  };

  // 노선 그래프 로드(로컬 routes.json — 오프라인 동작). 실패해도 화면은 살아있다.
  useEffect(() => {
    let alive = true;
    loadRoutes()
      .then((r) => alive && setRoutes(r))
      .catch(() => alive && setRoutes({ generatedAt: "", routes: [] }));
    return () => {
      alive = false;
    };
  }, []);

  // 현위치. 권한 거부/미지원이면 시청 중심 폴백(무한 대기 없음).
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setFromPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setFromPos(cityCenter),
      { timeout: 4000, maximumAge: 60000 },
    );
  }, [cityCenter]);

  const destStop = stops.find((s) => s.id === requestedDestId) ?? null;
  const routeFromPos = useMemo<LatLng>(() => {
    if (hasRequestedOrigin) return { lat: requestedFromLat, lng: requestedFromLng };
    if (requestedBoardId) {
      const legacyBoard = stops.find((stop) => stop.id === requestedBoardId);
      if (legacyBoard) return { lat: legacyBoard.lat, lng: legacyBoard.lng };
    }
    return fromPos;
  }, [fromPos, hasRequestedOrigin, requestedBoardId, requestedFromLat, requestedFromLng, stops]);

  const options = useMemo(() => {
    if (!destStop || !routes) return [];
    return planTrip(routeFromPos, destStop, stops, routes.routes, {
      walkRadiusM: 1000,
      maxCandidates: 8,
      maxTransfers: 0,
    });
  }, [destStop, routes, routeFromPos, stops]);

  const openArrivals = useCallback((origin: OriginPlace, destinationChoice: Stop) => {
    if (!routes) {
      setPendingTrip({ origin, dest: destinationChoice });
      setTripMessage("버스 정보를 준비하고 있어요.");
      return;
    }
    const destinationCandidates = stops.filter((stop) => stop.name === destinationChoice.name);
    for (const destination of destinationCandidates) {
        const routeExists = planTrip(origin, destination, stops, routes.routes, {
          walkRadiusM: 1000,
          maxCandidates: 8,
          maxTransfers: 0,
        }).length > 0;
        if (routeExists) {
          setTripMessage("");
          navigate(`/go?fromLat=${origin.lat}&fromLng=${origin.lng}&from=${encodeURIComponent(origin.name)}&dest=${encodeURIComponent(destination.id)}${safePreview ? "&safePreview=1" : ""}`);
          return;
        }
    }
    setPicked((value) => ({ ...value, dest: null }));
    setQueries((value) => ({ ...value, dest: "" }));
    setActiveField("dest");
    setTripMessage("이 위치 주변에서 목적지로 가는 버스를 찾지 못했어요. 목적지를 다시 선택해주세요.");
  }, [navigate, routes, safePreview, stops]);

  useEffect(() => {
    if (!routes || !pendingTrip) return;
    const next = pendingTrip;
    setPendingTrip(null);
    openArrivals(next.origin, next.dest);
  }, [openArrivals, routes, pendingTrip]);

  const chooseOrigin = (origin: OriginPlace) => {
    setPicked((value) => ({ ...value, board: origin }));
    setQueries((value) => ({ ...value, board: origin.name }));
    setFromPos({ lat: origin.lat, lng: origin.lng });
    setActiveField("dest");
  };

  const chooseDestination = (stop: Stop) => {
    setPicked((value) => ({ ...value, dest: stop }));
    setQueries((value) => ({ ...value, dest: stop.name }));
    if (picked.board) openArrivals(picked.board, stop);
  };

  const resetChoice = (field: "board" | "dest") => {
    setPicked((value) => ({ ...value, [field]: null }));
    setQueries((value) => ({ ...value, [field]: "" }));
    setActiveField(field);
    setVoiceMessage("");
    setVoiceField(null);
    setManualFields((value) => ({ ...value, [field]: false }));
    if (inputMode === "manual") {
      setManualFields((value) => ({ ...value, [field]: true }));
      requestAnimationFrame(() => inputRefs.current[field]?.focus());
    } else {
      listen(field);
    }
  };

  const openManualInput = (field: "board" | "dest") => {
    setPicked((value) => ({ ...value, [field]: null }));
    setQueries((value) => ({ ...value, [field]: "" }));
    setActiveField(field);
    setManualFields((value) => ({ ...value, [field]: true }));
    setVoiceMessage("");
    requestAnimationFrame(() => inputRefs.current[field]?.focus());
  };

  const useManualInput = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListeningField(null);
    setVoiceMessage("");
    setVoiceField(null);
    setInputMode("manual");
    setManualFields({ board: true, dest: true });
    setActiveField("board");
    requestAnimationFrame(() => inputRefs.current.board?.focus());
  };

  if (!hasRequestedOrigin && !requestedBoardId) return (
    <main className="tripview tripview--find" data-safe-preview={safePreview || undefined}>
      <header className="tripview__bar">
        <Link className="tripview__back" to="/app" aria-label="앱 메인으로 돌아가기"><ChevronLeft aria-hidden="true" /><span className="sr-only">메인</span></Link>
        <span aria-hidden="true" />
        <span className="tripview__spacer" aria-hidden="true" />
      </header>
      <section className="tripview__find">
        {(["board", "dest"] as const).map((field) => {
          const choices = visibleMatches.filter((stop) => stop.name !== picked.board?.name);
          const showChoices = activeField === field && !picked[field] && (field === "board" ? Boolean(originCandidate) : choices.length > 0);
          return <div className="tripview__field" key={field} data-active={activeField === field}>
            {showChoices ? <div className="tripview__choice-stage">
              <p className="tripview__choice-prompt">{field === "board" ? "출발 위치를 확인해주세요" : "목적지 정류장을 선택해주세요"}</p>
              <div className="tripview__choices">
                {field === "board" && originCandidate
                  ? <button type="button" onClick={() => chooseOrigin(originCandidate)}><strong>{originCandidate.name}</strong></button>
                  : choices.map((stop) => <button type="button" key={stop.name} onClick={() => chooseDestination(stop)}><strong>{stop.name}</strong></button>)}
              </div>
              <div className="tripview__choice-actions">
                {inputMode === "voice" ? <>
                  <button type="button" onClick={() => resetChoice(field)}>다시 말하기</button>
                  <button type="button" onClick={() => openManualInput(field)}>직접 입력</button>
                </> : <button className="tripview__choice-action-wide" type="button" onClick={() => openManualInput(field)}>다시 입력</button>}
              </div>
            </div> : picked[field] ? <div className="tripview__selected">
              <span>{field === "board" ? "출발 위치" : "목적지 정류장"}</span>
              <strong>{picked[field]?.name}</strong>
              <button type="button" onClick={() => resetChoice(field)}>다시 선택</button>
            </div> : <>
              <label className="tripview__field-label" htmlFor={`trip-${field}`}>{field === "board" ? "어디서 출발하세요?" : "어디로 가세요?"}</label>
              <div className="tripview__field-control">
                {(inputMode === "manual" || manualFields[field]) && <input ref={(node) => { inputRefs.current[field] = node; }} id={`trip-${field}`} value={queries[field]} onFocus={() => setActiveField(field)} onChange={(event) => { setActiveField(field); setPicked((value) => ({ ...value, [field]: null })); setQueries((value) => ({ ...value, [field]: event.target.value })); }} placeholder={field === "board" ? "출발할 장소를 입력해주세요" : "목적지 이름을 입력해주세요"} />}
                {inputMode === "voice" && <button className="tripview__voice" type="button" aria-pressed={listeningField === field} data-listening={listeningField === field} onClick={() => listen(field)}>{listeningField === field ? "● 듣고 있어요 · 누르면 중단" : field === "board" ? "출발지 말하기" : "목적지 말하기"}</button>}
              </div>
              {voiceField === field && voiceMessage && <p className="tripview__voice-message" role="status">{voiceMessage}</p>}
              {voiceField === field && manualAvailable[field] && !manualFields[field] && <button className="tripview__manual" type="button" onClick={() => openManualInput(field)}>직접 쓰기</button>}
            </>}
          </div>;
        })}
        {tripMessage && <p className="tripview__trip-message" role="status">{tripMessage}</p>}
        {inputMode === "voice" && <button className="tripview__input-mode" type="button" onClick={useManualInput}>지금은 말할 수 없어요</button>}
      </section>
    </main>
  );

  if (!requestedDestId || !destStop) return <Navigate to={safePreview ? "/go?safePreview=1" : "/go"} replace />;

  return (
    <main className="tripview" data-safe-preview={safePreview || undefined}>
      <header className="tripview__bar">
        <Link className="tripview__back" to="/app" aria-label="앱 메인으로 돌아가기">
          <ChevronLeft aria-hidden="true" />
          메인
        </Link>
        <h1 className="tripview__title">목적지행 버스</h1>
        <span className="tripview__spacer" aria-hidden="true" />
      </header>

      <section className="tripview__results" aria-live="polite">
            {!routes ? (
              <p className="tripview__msg">경로를 준비하고 있어요…</p>
            ) : options.length === 0 ? (
              <p className="tripview__msg tripview__msg--none">
                이 위치 주변에서 목적지로 가는 버스의 도착정보가 없습니다.
              </p>
            ) : (
              options.map((opt, i) => (
                <TripCard
                  key={`${opt.boardStopId}-${opt.directBus ? "d" : "t"}-${i}`}
                  option={opt}
                  stops={stops}
                  destStop={destStop}
                  fromPos={routeFromPos}
                />
              ))
            )}
      </section>
    </main>
  );
}
