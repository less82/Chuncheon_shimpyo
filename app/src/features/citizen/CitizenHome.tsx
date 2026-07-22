import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ImportOnLoad from "../share/ImportOnLoad";
import { useStops } from "../../store/useStops";
import { useFavorites } from "../../store/useFavorites";
import { getArrival, headwayFallback, type Arrival } from "../../lib/arrivals";
import type { Stop } from "../../types/stop";
import "./CitizenHome.css";

export function FavoriteStopCard({ stop }: { stop: Stop }) {
  const [arrival, setArrival] = useState<Arrival>(() => headwayFallback(stop));

  useEffect(() => {
    let alive = true;
    setArrival(headwayFallback(stop));
    getArrival(stop).then((value) => alive && setArrival(value));
    return () => { alive = false; };
  }, [stop]);

  const firstRoute = arrival.byRoute?.[0];

  return (
    <Link className="apphome-favorite" to={`/go?dest=${encodeURIComponent(stop.id)}`} aria-label={`${stop.name} 버스 도착정보`}>
      <span className="apphome-favorite__top"><strong>{stop.name}</strong></span>
      <span className="apphome-favorite__routes">경유 노선 {stop.routes.length > 0 ? stop.routes.slice(0, 4).map((route) => `${route}번`).join(" · ") : "확인 중"}</span>
      <span className="apphome-favorite__arrival" data-live={arrival.live}>
        <b>{firstRoute?.routeNo ? `${firstRoute.routeNo}번 ` : ""}{arrival.text}</b>
      </span>
    </Link>
  );
}

export default function CitizenHome() {
  const stops = useStops((state) => state.stops);
  const favIds = useFavorites((state) => state.ids);
  const favoriteStops = favIds
    .map((id) => stops.find((stop) => stop.id === id))
    .filter((stop): stop is Stop => Boolean(stop));

  return (
    <main className="apphome">
      <ImportOnLoad />

      <section className="apphome__intro">
        <h1>무엇을 도와드릴까요?</h1>
      </section>

      <nav className="apphome__tasks" aria-label="주요 기능">
        <Link className="apphome-task apphome-task--route" to="/go" aria-label="목적지행 버스 도착 예정시간">
          <span className="apphome-task__copy">
            <strong>목적지행 버스</strong>
            <small>도착 예정시간</small>
          </span>
        </Link>
        <Link className="apphome-task apphome-task--report" to="/app/report" aria-label="정류장 상태 알리기">
          <span className="apphome-task__copy">
            <strong>정류장 상태</strong>
            <small>알리기</small>
          </span>
        </Link>
      </nav>

      <section className="apphome__saved" aria-labelledby="saved-title">
        <header>
          <div><span>반복 이용</span><h2 id="saved-title">자주 가는 곳</h2></div>
          <Link to="/favorites">전체{favIds.length > 0 ? ` ${favIds.length}` : ""}</Link>
        </header>
        {favoriteStops.length > 0 ? (
          <div className="apphome__saved-list">
            {favoriteStops.slice(0, 2).map((stop) => <FavoriteStopCard key={stop.id} stop={stop} />)}
          </div>
        ) : (
          <Link className="apphome__saved-empty" to="/favorites"><span><strong>자주 가는 곳 저장</strong><small>다음부터 바로 확인</small></span><b>등록</b></Link>
        )}
      </section>

    </main>
  );
}
