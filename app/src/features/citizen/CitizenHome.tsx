import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ImportOnLoad from "../share/ImportOnLoad";
import { useStops } from "../../store/useStops";
import { useFavorites } from "../../store/useFavorites";
import { getArrival, headwayFallback, type Arrival } from "../../lib/arrivals";
import type { Stop } from "../../types/stop";
import type { FavoriteJourney } from "../../store/useFavorites";
import "./CitizenHome.css";

export function FavoriteStopCard({ journey, stops }: { journey: FavoriteJourney; stops: Stop[] }) {
  const board = stops.find((stop) => stop.id === journey.boardStopId) ?? null;
  const destination = stops.find((stop) => stop.id === journey.destinationStopId) ?? null;
  const routeNo = journey.routeNo;
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
    <Link className="apphome-favorite" to={`/go?dest=${encodeURIComponent(journey.destinationStopId)}&board=${encodeURIComponent(journey.boardStopId)}`} aria-label={`${destination?.name ?? "목적지"} 즐겨찾기 버스 정보`}>
      <span className="apphome-favorite__top"><strong>{board?.name ?? "정류장"}</strong><i>→</i><strong>{destination?.name ?? "목적지"}</strong></span>
      <span className="apphome-favorite__direction">{journey.direction}</span>
      <span className="apphome-favorite__arrival" data-live={arrival.live}>
        <b>{routeNo ? `${routeNo}번 · ` : ""}{arrival.text}</b>
      </span>
    </Link>
  );
}

export default function CitizenHome() {
  const stops = useStops((state) => state.stops);
  const journeys = useFavorites((state) => state.journeys);

  return (
    <main className="apphome">
      <ImportOnLoad />

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
          <Link to="/favorites">전체{journeys.length > 0 ? ` ${journeys.length}` : ""}</Link>
        </header>
        {journeys.length > 0 ? (
          <div className="apphome__saved-list">
            {journeys.slice(0, 2).map((journey) => <FavoriteStopCard key={journey.id} journey={journey} stops={stops} />)}
          </div>
        ) : (
          <Link className="apphome__saved-empty" to="/favorites"><strong>즐겨찾기 등록</strong></Link>
        )}
      </section>

    </main>
  );
}
