import { useEffect, useMemo, useState } from "react";
import type { Stop } from "../../types/stop";
import type { TripOption } from "../../types/trip";
import type { LatLng } from "../../lib/geo";
import { arrivalsForRoutes, getArrival, type Arrival } from "../../lib/arrivals";
import { useFavorites } from "../../store/useFavorites";
import { Link } from "react-router-dom";
import "./TripView.css";

interface Props {
  option: TripOption;
  stops: Stop[];
  destStop: Stop;
  destinationLabel?: string;
  arrival?: Arrival;
  fromPos: LatLng;
}

export default function TripCard({ option, stops, destStop, destinationLabel, arrival }: Props) {
  const boardStop = stops.find((stop) => stop.id === option.boardStopId);
  const destinationName = destinationLabel ?? destStop.name;
  const routeNos = useMemo(() => option.legs[0]?.routeNos ?? [], [option.legs]);
  const [fetchedArrival, setFetchedArrival] = useState<Arrival | null>(null);
  const saveJourney = useFavorites((state) => state.saveJourney);
  const savedJourneys = useFavorites((state) => state.journeys);

  useEffect(() => {
    if (!boardStop || arrival) return;
    let alive = true;
    setFetchedArrival(null);
    getArrival(boardStop).then((value) => alive && setFetchedArrival(value));
    return () => { alive = false; };
  }, [arrival, boardStop]);

  if (!boardStop) return null;

  const resolvedArrival = arrival ?? fetchedArrival;
  const matchingArrivals = resolvedArrival ? arrivalsForRoutes(resolvedArrival, routeNos) : [];
  const arrivalState = !resolvedArrival
    ? "loading"
    : resolvedArrival.live && matchingArrivals.length > 0 ? "live" : "unavailable";
  const shownBuses = matchingArrivals.slice(0, 2).map((item) => ({
    routeNo: item.routeNo,
    text: item.min <= 0 ? "곧 도착" : `${item.min}분 후`,
  }));
  const primaryRouteNo = shownBuses[0]?.routeNo ?? routeNos[0];
  const journeyId = primaryRouteNo ? `${boardStop.id}:${primaryRouteNo}:${destStop.id}` : "";
  const saved = savedJourneys.some((item) => item.id === journeyId);

  return (
    <article className="tripcard" aria-label={`${boardStop.name} 출발 ${destinationName} 도착 예정 버스`}>
      <header className="tripcard__heading">
        <strong>{boardStop.name}</strong>
        <span>정류장 {boardStop.stopNo} · {destinationName} 방면</span>
        <b>타는 곳까지 도보 약 {option.walkMin}분</b>
      </header>

      {arrivalState === "loading" ? <p className="tripcard__status" role="status">도착정보를 확인하고 있어요</p>
        : arrivalState === "unavailable" ? <div className="tripcard__status tripcard__status--unavailable" role="status">
          <strong>실시간 도착정보를 불러오지 못했어요</strong>
          <span>{routeNos.slice(0, 3).map((routeNo) => `${routeNo}번`).join(" · ")}</span>
        </div>
        : <ul className="tripcard__arrivals">
          {shownBuses.map((bus) => (
            <li key={bus.routeNo}>
              <strong>{bus.routeNo}번</strong>
              <b>{bus.text}</b>
            </li>
          ))}
        </ul>}

      {primaryRouteNo && (
        <section className="tripcard__favorite" aria-label="즐겨찾기 안내">
          <span>자주 타는 버스라면 다음에 바로 확인하세요.</span>
          <button className="tripcard__save" type="button" disabled={saved} onClick={() => saveJourney({
            boardStopId: boardStop.id,
            destinationStopId: destStop.id,
            destinationName,
            routeNo: primaryRouteNo,
            direction: `${destinationName} 방면`,
          })}>{saved ? "저장됨" : "즐겨찾기"}</button>
        </section>
      )}

      <Link className="tripcard__report" to={`/app/report?stop=${encodeURIComponent(boardStop.id)}`}>정류장 상태 알리기</Link>
    </article>
  );
}
