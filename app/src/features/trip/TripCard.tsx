import { useEffect, useMemo, useState } from "react";
import type { Stop } from "../../types/stop";
import type { TripOption } from "../../types/trip";
import type { LatLng } from "../../lib/geo";
import { getArrival, headwayFallback, type RouteArrival } from "../../lib/arrivals";
import { useFavorites } from "../../store/useFavorites";
import "./TripView.css";

interface Props {
  option: TripOption;
  stops: Stop[];
  destStop: Stop;
  fromPos: LatLng;
}

export default function TripCard({ option, stops, destStop }: Props) {
  const boardStop = stops.find((stop) => stop.id === option.boardStopId);
  const routeNos = useMemo(() => option.legs[0]?.routeNos ?? [], [option.legs]);
  const [arrivals, setArrivals] = useState<RouteArrival[]>([]);
  const [fallbackText, setFallbackText] = useState(boardStop ? headwayFallback(boardStop).text : "도착정보 없음");
  const saveJourney = useFavorites((state) => state.saveJourney);
  const savedJourneys = useFavorites((state) => state.journeys);

  useEffect(() => {
    if (!boardStop) return;
    let alive = true;
    getArrival(boardStop).then((arrival) => {
      if (!alive) return;
      const allowed = new Set(routeNos);
      setArrivals((arrival.byRoute ?? []).filter((item) => allowed.has(item.routeNo)).sort((a, b) => a.min - b.min));
      setFallbackText(arrival.text);
    });
    return () => { alive = false; };
  }, [boardStop, routeNos]);

  if (!boardStop) return null;

  const shownBuses = arrivals.length > 0
    ? arrivals.map((arrival) => ({ routeNo: arrival.routeNo, text: arrival.min <= 0 ? "곧 도착" : `${arrival.min}분 후 도착` }))
    : routeNos.map((routeNo) => ({ routeNo, text: fallbackText }));
  const primaryRouteNo = shownBuses[0]?.routeNo;
  const journeyId = primaryRouteNo ? `${boardStop.id}:${primaryRouteNo}:${destStop.id}` : "";
  const saved = savedJourneys.some((item) => item.id === journeyId);

  return (
    <article className="tripcard" aria-label={`${boardStop.name} 출발 ${destStop.name} 도착 예정 버스`}>
      <header className="tripcard__heading">
        <strong>{boardStop.name}</strong>
        <span>출발 · {destStop.name} 도착</span>
      </header>

      <ul className="tripcard__arrivals">
        {shownBuses.map((bus) => (
          <li key={bus.routeNo}>
            <strong>{bus.routeNo}번</strong>
            <b>{bus.text}</b>
          </li>
        ))}
      </ul>

      {primaryRouteNo && (
        <section className="tripcard__favorite" aria-label="즐겨찾기 안내">
          <strong>자주 타시는 노선인가요?</strong>
          <span>즐겨찾기하면 다음에도 빠르게 확인할 수 있어요.</span>
          <button className="tripcard__save" type="button" disabled={saved} onClick={() => saveJourney({
            boardStopId: boardStop.id,
            destinationStopId: destStop.id,
            routeNo: primaryRouteNo,
            direction: `${destStop.name} 방면`,
          })}>{saved ? "즐겨찾기 저장됨" : "즐겨찾기"}</button>
        </section>
      )}
    </article>
  );
}
