import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ImportOnLoad from "../share/ImportOnLoad";
import { useStops } from "../../store/useStops";
import { useFavorites } from "../../store/useFavorites";
import { getArrival, headwayFallback, type Arrival } from "../../lib/arrivals";
import { loadRoutes } from "../../lib/loadRoutes";
import { planTrip } from "../trip/planTrip";
import type { Stop } from "../../types/stop";
import type { RoutesFile } from "../../types/route";
import type { LatLng } from "../../lib/geo";
import "./CitizenHome.css";

function directionName(boardId: string, routeNo: string, routes: RoutesFile, stops: Stop[]): string {
  const route = routes.routes.find((item) => item.routeNo === routeNo && item.stops.includes(boardId));
  const index = route?.stops.indexOf(boardId) ?? -1;
  const nextId = index >= 0 ? route?.stops[index + 1] : undefined;
  const next = stops.find((stop) => stop.id === nextId);
  return next ? `${next.name} 방면` : "방면 미확인";
}

export function FavoriteStopCard({ destination, stops, routes, fromPos }: { destination: Stop; stops: Stop[]; routes: RoutesFile; fromPos: LatLng }) {
  const option = useMemo(() => planTrip(fromPos, destination, stops, routes.routes)[0] ?? null, [fromPos, destination, stops, routes]);
  const board = stops.find((stop) => stop.id === option?.boardStopId) ?? null;
  const routeNo = option?.legs[0]?.routeNos[0] ?? "";
  const [arrival, setArrival] = useState<Arrival>(() => board ? headwayFallback(board) : { text: "도착정보 미확인", live: false });

  useEffect(() => {
    if (!board) {
      setArrival({ text: "도착정보 미확인", live: false });
      return;
    }
    let alive = true;
    setArrival(headwayFallback(board));
    getArrival(board, routeNo).then((value) => alive && setArrival(value));
    return () => { alive = false; };
  }, [board, routeNo]);

  return (
    <Link className="apphome-favorite" to={`/go?dest=${encodeURIComponent(destination.id)}`} aria-label={`${destination.name} 즐겨찾기 버스 정보`}>
      <span className="apphome-favorite__top"><strong>{board ? board.name : "승차 정류장 확인 필요"}</strong></span>
      <span className="apphome-favorite__direction">{board && routeNo ? directionName(board.id, routeNo, routes, stops) : "방면 확인 필요"}</span>
      <span className="apphome-favorite__arrival" data-live={arrival.live}>
        <b>{routeNo ? `${routeNo}번 · ` : ""}{arrival.text}</b>
      </span>
      <span className="apphome-favorite__destination">목적지 {destination.name}</span>
    </Link>
  );
}

export default function CitizenHome() {
  const stops = useStops((state) => state.stops);
  const cityCenter = useStops((state) => state.cityCenter);
  const favIds = useFavorites((state) => state.ids);
  const [routes, setRoutes] = useState<RoutesFile | null>(null);
  const [fromPos, setFromPos] = useState<LatLng>(cityCenter);
  const favoriteStops = favIds
    .map((id) => stops.find((stop) => stop.id === id))
    .filter((stop): stop is Stop => Boolean(stop));

  useEffect(() => {
    let alive = true;
    loadRoutes().then((value) => alive && setRoutes(value)).catch(() => alive && setRoutes({ generatedAt: "", routes: [] }));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setFromPos({ lat: coords.latitude, lng: coords.longitude }),
      () => setFromPos(cityCenter),
      { timeout: 4000, maximumAge: 60_000 },
    );
  }, [cityCenter]);

  return (
    <main className="apphome">
      <ImportOnLoad />

      <section className="apphome__intro">
        <h1>무엇을 도와드릴까요?</h1>
      </section>

      <nav className="apphome__tasks" aria-label="주요 기능">
        <Link className="apphome-task apphome-task--route" to="/go" aria-label="목적지행 버스 도착 예정시간">
          <strong>버스</strong>
        </Link>
        <Link className="apphome-task apphome-task--report" to="/app/report" aria-label="정류장 상태 알리기">
          <strong>정류장</strong>
        </Link>
      </nav>

      <section className="apphome__saved" aria-labelledby="saved-title">
        <header>
          <h2 id="saved-title">즐겨찾기</h2>
          <Link to="/favorites">전체{favIds.length > 0 ? ` ${favIds.length}` : ""}</Link>
        </header>
        {favoriteStops.length > 0 ? (
          routes ? <div className="apphome__saved-list">
            {favoriteStops.slice(0, 2).map((destination) => <FavoriteStopCard key={destination.id} destination={destination} stops={stops} routes={routes} fromPos={fromPos} />)}
          </div> : <div className="apphome__saved-loading">버스 정보 확인 중</div>
        ) : (
          <Link className="apphome__saved-empty" to="/favorites"><strong>즐겨찾기 등록</strong></Link>
        )}
      </section>

    </main>
  );
}
