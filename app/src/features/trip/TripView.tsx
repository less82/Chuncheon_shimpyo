// 목적지행 버스 도착정보 화면 (/go).
// 키보드 0: 즐겨찾기(=목적지)를 탭만으로 고르면 경로 카드가 나온다. 타이핑 불필요.
// 즐겨찾기가 없으면 별표 저장 안내. 결과 없으면 정직하게 "찾지 못했습니다".

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, MapPin, Star } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { Stop } from "../../types/stop";
import type { RoutesFile } from "../../types/route";
import type { LatLng } from "../../lib/geo";
import { useStops } from "../../store/useStops";
import { useFavorites } from "../../store/useFavorites";
import { loadRoutes } from "../../lib/loadRoutes";
import { planTrip } from "./planTrip";
import { sortByComfort, type SortMode } from "./comfortSort";
import TripCard from "./TripCard";
import "./TripView.css";

type SpeechRecognitionConstructor = new () => { lang: string; start: () => void; onstart: () => void; onend: () => void; onresult: (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onerror: (event: { error: string }) => void };

export default function TripView() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const stops = useStops((s) => s.stops);
  const cityCenter = useStops((s) => s.cityCenter);
  const favIds = useFavorites((s) => s.ids);

  const favStops = useMemo(
    () =>
      favIds
        .map((id) => stops.find((s) => s.id === id))
        .filter((s): s is Stop => Boolean(s)),
    [favIds, stops],
  );

  const requestedDestId = searchParams.get("dest");
  const requestedBoardId = searchParams.get("board");
  const [destId, setDestId] = useState<string | null>(requestedDestId);
  const [routes, setRoutes] = useState<RoutesFile | null>(null);
  const [fromPos, setFromPos] = useState<LatLng>(cityCenter);
  const [sortMode, setSortMode] = useState<SortMode>("comfort");
  const [queries, setQueries] = useState({ board: "", dest: "" });
  const [picked, setPicked] = useState<{ board: Stop | null; dest: Stop | null }>({ board: null, dest: null });
  const [activeField, setActiveField] = useState<"board" | "dest">("board");
  const [voiceMessage, setVoiceMessage] = useState("");
  const [voiceField, setVoiceField] = useState<"board" | "dest" | null>(null);
  const [listeningField, setListeningField] = useState<"board" | "dest" | null>(null);
  const stopQuery = queries[activeField];

  const stopMatches = useMemo(() => {
    const needle = stopQuery.replace(/\s+/g, "").toLowerCase();
    if (!needle) return [];
    return stops.filter((stop) => stop.name.replace(/\s+/g, "").toLowerCase().includes(needle) || stop.stopNo.includes(needle)).slice(0, 4);
  }, [stopQuery, stops]);
  const visibleMatches = picked[activeField] ? [] : stopMatches;

  const listen = (field: "board" | "dest") => {
    setVoiceField(field);
    const speechWindow = window as typeof window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) { setVoiceMessage("이 브라우저는 음성 입력을 지원하지 않습니다."); return; }
    const recognition = new Recognition();
    recognition.lang = "ko-KR";
    recognition.onstart = () => { setListeningField(field); setVoiceMessage("듣고 있어요. 정류장 이름을 말해주세요."); };
    recognition.onresult = (event) => { setQueries((value) => ({ ...value, [field]: event.results[0][0].transcript })); setVoiceMessage(""); setListeningField(null); };
    recognition.onerror = (event) => {
      setListeningField(null);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") setVoiceMessage("마이크 권한을 허용해주세요.");
      else if (event.error === "audio-capture") setVoiceMessage("사용할 수 있는 마이크를 확인해주세요.");
      else if (event.error === "no-speech") setVoiceMessage("정류장 이름을 다시 말해주세요.");
      else setVoiceMessage("음성 입력을 시작하지 못했습니다. 다시 눌러주세요.");
    };
    recognition.onend = () => setListeningField(null);
    setActiveField(field);
    setVoiceMessage("마이크 연결 중");
    try { recognition.start(); } catch { setListeningField(null); setVoiceMessage("음성 입력을 시작하지 못했습니다. 다시 눌러주세요."); }
  };

  const stopsById = useMemo(() => {
    const m = new Map<string, Stop>();
    for (const s of stops) m.set(s.id, s);
    return m;
  }, [stops]);

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

  const destStop = stops.find((s) => s.id === destId) ?? null;

  const options = useMemo(() => {
    if (!destStop || !routes) return [];
    const planned = planTrip(fromPos, destStop, stops, routes.routes, requestedBoardId ? { boardStopId: requestedBoardId, walkRadiusM: Number.MAX_SAFE_INTEGER } : undefined);
    return sortByComfort(planned, stopsById, sortMode);
  }, [destStop, routes, fromPos, stops, stopsById, sortMode, requestedBoardId]);

  if (!requestedBoardId) return (
    <main className="tripview tripview--find">
      <header className="tripview__bar">
        <Link className="tripview__back" to="/app" aria-label="앱 메인으로 돌아가기"><ChevronLeft aria-hidden="true" /><span className="sr-only">메인</span></Link>
        <h1 className="tripview__title">버스 도착정보</h1>
        <span className="tripview__spacer" aria-hidden="true" />
      </header>
      <section className="tripview__find">
        <h2>어디서 어디로 가세요?</h2>
        {(["board", "dest"] as const).map((field) => <div className="tripview__field" key={field} data-active={activeField === field}>
          <label className="tripview__field-label" htmlFor={`trip-${field}`}>{field === "board" ? "어디서 타세요?" : "어디로 가세요?"}</label>
          <div className="tripview__field-control"><input id={`trip-${field}`} autoFocus={field === "board"} value={picked[field]?.name ?? queries[field]} onFocus={() => setActiveField(field)} onChange={(event) => { setActiveField(field); setPicked((value) => ({ ...value, [field]: null })); setQueries((value) => ({ ...value, [field]: event.target.value })); }} placeholder="정류장 이름 또는 번호를 입력해주세요" />
            <button className="tripview__voice" type="button" onClick={() => listen(field)}>{listeningField === field ? "듣고 있어요" : field === "board" ? "출발지 말하기" : "목적지 말하기"}</button>
          </div>
          {voiceField === field && voiceMessage && <p className="tripview__voice-message" role="status">{voiceMessage}</p>}
        </div>)}
        <div className="tripview__matches">{visibleMatches.filter((stop) => stop.id !== picked[activeField === "board" ? "dest" : "board"]?.id).map((stop) => <button type="button" key={stop.id} onClick={() => { setPicked((value) => ({ ...value, [activeField]: stop })); setQueries((value) => ({ ...value, [activeField]: stop.name })); if (activeField === "board") setActiveField("dest"); }}><MapPin aria-hidden="true" /><span><strong>{stop.name}</strong><small>{stop.stopNo ? `정류장 ${stop.stopNo}` : "번호 미확인"}</small></span></button>)}</div>
        <button className="tripview__find-submit" type="button" disabled={!picked.board || !picked.dest} onClick={() => picked.board && picked.dest && navigate(`/go?board=${encodeURIComponent(picked.board.id)}&dest=${encodeURIComponent(picked.dest.id)}`)}>도착 예정시간 확인</button>
      </section>
    </main>
  );

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

      {!destStop && favStops.length === 0 ? (
        <section className="tripview__empty">
          <p className="tripview__empty-title">
            먼저 자주 가는 곳을 별표로 저장하세요.
          </p>
          <p className="tripview__empty-sub">
            저장한 곳이 여기 목적지 단추로 나와요. 누르기만 하면 가는 버스를
            찾아드려요.
          </p>
          <Link className="tripview__cta" to="/app">
            지도에서 목적지 별표하기
          </Link>
        </section>
      ) : (
        <>
          {!requestedDestId && <section className="tripview__dests" aria-label="목적지 고르기">
            <p className="tripview__dests-label">어디로 가세요?</p>
            <div className="tripview__dest-list">
              {favStops.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="tripview__dest"
                  aria-pressed={s.id === destId}
                  onClick={() => setDestId(s.id)}
                >
                  <Star className="tripview__dest-star" aria-hidden="true" />
                  {s.name}
                </button>
              ))}
            </div>
          </section>}

          {destStop && (
            <section
              className="tripview__sort"
              aria-label="정렬 기준 선택"
            >
              <p className="tripview__sort-sub">
                확인된 시설이 있는 길을 우선 보여드려요
              </p>
              <div className="tripview__sort-toggle" role="group">
                <button
                  type="button"
                  className="tripview__sort-btn"
                  aria-pressed={sortMode === "comfort"}
                  onClick={() => setSortMode("comfort")}
                >
                  시설 확인된 곳 우선
                </button>
                <button
                  type="button"
                  className="tripview__sort-btn"
                  aria-pressed={sortMode === "nearest"}
                  onClick={() => setSortMode("nearest")}
                >
                  가까운 순
                </button>
              </div>
            </section>
          )}

          <section className="tripview__results" aria-live="polite">
            {!routes ? (
              <p className="tripview__msg">경로를 준비하고 있어요…</p>
            ) : destStop && options.length === 0 ? (
              <p className="tripview__msg tripview__msg--none">
                직접 가는 버스를 찾지 못했습니다.
              </p>
            ) : (
              options.map((opt, i) => (
                <TripCard
                  key={`${opt.boardStopId}-${opt.directBus ? "d" : "t"}-${i}`}
                  option={opt}
                  stops={stops}
                  destStop={destStop!}
                  fromPos={fromPos}
                />
              ))
            )}
          </section>
        </>
      )}
    </main>
  );
}
