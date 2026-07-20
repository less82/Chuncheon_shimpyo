import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { BusFront, Mic, Search } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useStops } from "../../store/useStops";
import type { Stop } from "../../types/stop";
import type { RoutesFile } from "../../types/route";
import type { TripOption } from "../../types/trip";
import { getArrival, headwayFallback, type Arrival } from "../../lib/arrivals";
import { loadRoutes } from "../../lib/loadRoutes";
import { planTrip } from "../trip/planTrip";
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

function normalized(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
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
  const [params] = useSearchParams();
  const stops = useStops((state) => state.stops);
  const loaded = useStops((state) => state.loaded);
  const start = stops.find((stop) => stop.id === params.get("from")) ?? null;
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [routes, setRoutes] = useState<RoutesFile | null>(null);
  const [arrival, setArrival] = useState<Arrival | null>(null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

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

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    setSubmitted(query.trim());
  };

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
      setSubmitted(transcript);
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

  if (!start) {
    return (
      <main className="qrmain">
        <section className="qrmain__error">
          <h1>정류장 QR을 확인할 수 없습니다</h1>
          <p>손상되었거나 오래된 QR입니다. 정류장에 부착된 QR을 다시 촬영해 주세요.</p>
          <Link to="/">시민 메인으로 이동</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="qrmain">
      <header className="qrmain__stop">
        <span>현재 출발 정류장</span>
        <h1>{start.name}</h1>
        <p>{start.routes.length ? `${start.routes.slice(0, 6).join(" · ")}번 운행` : "운행 노선 확인 중"}</p>
      </header>

      <section className="qrmain__ask">
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
      </section>

      {submitted && (
        <section className="qrmain__results" aria-live="polite">
          <h2>갈 수 있는 버스</h2>
          {!routes ? (
            <p className="qrmain__state">버스 노선을 확인하는 중…</p>
          ) : results.length === 0 ? (
            <p className="qrmain__state">“{submitted}”까지 가는 노선을 찾지 못했습니다. 정류장 이름을 다시 말씀해 주세요.</p>
          ) : (
            results.map(({ destination, option }, index) => {
              const firstLeg = option.legs[0];
              const routeArrivals = firstLeg.routeNos.map((routeNo) => ({
                routeNo,
                text: arrival?.byRoute?.find((item) => item.routeNo === routeNo)
                  ? `${arrival.byRoute.find((item) => item.routeNo === routeNo)!.min}분 후`
                  : arrival?.text ?? "도착정보 확인 중",
              }));
              return (
                <article className="qrmain__route" key={`${destination.id}-${index}`}>
                  <div>
                    <strong>{destination.name} 방면</strong>
                    <span>{option.directBus ? "직행" : `${option.transferStopId ? "1회 환승" : "환승"}`}</span>
                  </div>
                  {routeArrivals.map((item) => (
                    <p key={item.routeNo}>
                      <BusFront aria-hidden="true" />
                      <b>{item.routeNo}번</b>
                      <em>{item.text}</em>
                    </p>
                  ))}
                </article>
              );
            })
          )}
        </section>
      )}
    </main>
  );
}
