// 목적지행 버스 도착정보 화면 (/go).
// 키보드 0: 즐겨찾기(=목적지)를 탭만으로 고르면 경로 카드가 나온다. 타이핑 불필요.
// 즐겨찾기가 없으면 별표 저장 안내. 결과 없으면 정직하게 "찾지 못했습니다".

import { useEffect, useMemo, useRef, useState } from "react";
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
  const [routes, setRoutes] = useState<RoutesFile | null>(null);
  const [fromPos, setFromPos] = useState<LatLng>(cityCenter);
  const [queries, setQueries] = useState({ board: "", dest: "" });
  const [picked, setPicked] = useState<{ board: Stop | null; dest: Stop | null }>({ board: null, dest: null });
  const [activeField, setActiveField] = useState<"board" | "dest">("board");
  const [voiceMessage, setVoiceMessage] = useState("");
  const [voiceField, setVoiceField] = useState<"board" | "dest" | null>(null);
  const [listeningField, setListeningField] = useState<"board" | "dest" | null>(null);
  const [manualFields, setManualFields] = useState({ board: false, dest: false });
  const [manualAvailable, setManualAvailable] = useState({ board: false, dest: false });
  const recognitionRef = useRef<SpeechRecognitionSession | null>(null);
  const inputRefs = useRef<Record<"board" | "dest", HTMLInputElement | null>>({ board: null, dest: null });
  const stopQuery = queries[activeField];

  const stopMatches = useMemo(() => {
    const needle = stopQuery.replace(/\s+/g, "").toLowerCase();
    if (!needle) return [];
    return stops.filter((stop) => stop.name.replace(/\s+/g, "").toLowerCase().includes(needle) || stop.stopNo.includes(needle)).slice(0, 4);
  }, [stopQuery, stops]);
  const visibleMatches = useMemo(() => {
    if (picked[activeField]) return [];
    return Array.from(new Map(stopMatches.map((stop) => [stop.name.replace(/\s+/g, ""), stop])).values());
  }, [activeField, picked, stopMatches]);

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
        setVoiceMessage("춘천시 정류장을 찾지 못했어요. 다시 말해주세요.");
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

  const options = useMemo(() => {
    if (!destStop || !routes) return [];
    return planTrip(fromPos, destStop, stops, routes.routes, requestedBoardId ? {
      boardStopId: requestedBoardId,
      walkRadiusM: Number.MAX_SAFE_INTEGER,
      maxTransfers: 0,
    } : undefined);
  }, [destStop, routes, fromPos, stops, requestedBoardId]);

  const openArrivals = (boardChoice: Stop, destinationChoice: Stop) => {
    const boardCandidates = stops.filter((stop) => stop.name === boardChoice.name);
    const destinationCandidates = stops.filter((stop) => stop.name === destinationChoice.name);
    if (routes) {
      for (const destination of destinationCandidates) {
        for (const board of boardCandidates) {
          const routeExists = planTrip(board, destination, stops, routes.routes, {
            boardStopId: board.id,
            walkRadiusM: Number.MAX_SAFE_INTEGER,
          }).length > 0;
          if (routeExists) {
            navigate(`/go?board=${encodeURIComponent(board.id)}&dest=${encodeURIComponent(destination.id)}`);
            return;
          }
        }
      }
    }
    navigate(`/go?board=${encodeURIComponent(boardChoice.id)}&dest=${encodeURIComponent(destinationChoice.id)}`);
  };

  const chooseStop = (field: "board" | "dest", stop: Stop) => {
    setPicked((value) => ({ ...value, [field]: stop }));
    setQueries((value) => ({ ...value, [field]: stop.name }));
    if (field === "board") {
      setActiveField("dest");
      return;
    }
    if (picked.board) openArrivals(picked.board, stop);
  };

  const resetChoice = (field: "board" | "dest") => {
    setPicked((value) => ({ ...value, [field]: null }));
    setQueries((value) => ({ ...value, [field]: "" }));
    setActiveField(field);
    setVoiceMessage("");
    setVoiceField(null);
    setManualFields((value) => ({ ...value, [field]: false }));
    listen(field);
  };

  const openManualInput = (field: "board" | "dest") => {
    setManualFields((value) => ({ ...value, [field]: true }));
    setVoiceMessage("");
    requestAnimationFrame(() => inputRefs.current[field]?.focus());
  };

  if (!requestedBoardId) return (
    <main className="tripview tripview--find">
      <header className="tripview__bar">
        <Link className="tripview__back" to="/app" aria-label="앱 메인으로 돌아가기"><ChevronLeft aria-hidden="true" /><span className="sr-only">메인</span></Link>
        <span aria-hidden="true" />
        <span className="tripview__spacer" aria-hidden="true" />
      </header>
      <section className="tripview__find">
        {(["board", "dest"] as const).map((field) => {
          const showChoices = activeField === field && !picked[field] && queries[field].replace(/\s+/g, "").length >= 2 && visibleMatches.length > 0;
          const choices = visibleMatches.filter((stop) => stop.name !== picked[field === "board" ? "dest" : "board"]?.name);
          return <div className="tripview__field" key={field} data-active={activeField === field}>
            {showChoices ? <div className="tripview__choice-stage">
              <p className="tripview__choice-prompt">{field === "board" ? "출발 정류장을 선택해주세요" : "목적지 정류장을 선택해주세요"}</p>
              <div className="tripview__choices">
                {choices.map((stop) => <button type="button" key={stop.name} onClick={() => chooseStop(field, stop)}><strong>{stop.name}</strong></button>)}
              </div>
              <div className="tripview__choice-actions">
                <button type="button" onClick={() => resetChoice(field)}>다시 말하기</button>
              </div>
            </div> : <>
              <label className="tripview__field-label" htmlFor={`trip-${field}`}>{field === "board" ? "어디서 타세요?" : "어디로 가세요?"}</label>
              <div className="tripview__field-control">
                {manualFields[field] && <input ref={(node) => { inputRefs.current[field] = node; }} id={`trip-${field}`} value={picked[field]?.name ?? queries[field]} onFocus={() => setActiveField(field)} onChange={(event) => { setActiveField(field); setPicked((value) => ({ ...value, [field]: null })); setQueries((value) => ({ ...value, [field]: event.target.value })); }} placeholder="정류장 이름 또는 번호를 입력해주세요" />}
                <button className="tripview__voice" type="button" data-listening={listeningField === field} onClick={() => listen(field)}>{listeningField === field ? "듣고 있어요" : field === "board" ? "출발지 말하기" : "목적지 말하기"}</button>
              </div>
              {voiceField === field && voiceMessage && <p className="tripview__voice-message" role="status">{voiceMessage}</p>}
              {voiceField === field && manualAvailable[field] && !manualFields[field] && <button className="tripview__manual" type="button" onClick={() => openManualInput(field)}>직접 쓰기</button>}
            </>}
          </div>;
        })}
      </section>
    </main>
  );

  if (!requestedDestId || !destStop) return <Navigate to="/go" replace />;

  return (
    <main className="tripview">
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
                직접 가는 버스를 찾지 못했습니다.
              </p>
            ) : (
              options.map((opt, i) => (
                <TripCard
                  key={`${opt.boardStopId}-${opt.directBus ? "d" : "t"}-${i}`}
                  option={opt}
                  stops={stops}
                  destStop={destStop}
                  fromPos={fromPos}
                />
              ))
            )}
      </section>
    </main>
  );
}
