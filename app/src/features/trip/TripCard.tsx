// 목적지 길찾기 결과 한 건 = 큰 카드.
// "○○까지 걸어서 4분 → 7번 (약 3분 후) → 목적지" 형태. 한 화면 한 결정.
// 도보=getWalkRoute(폴백 직선), 도착=getArrival(폴백 배차간격). 무한 스피너 없음.

import { useEffect, useState } from "react";
import { BusFront, Footprints, MapPin, Repeat2 } from "lucide-react";
import type { Stop } from "../../types/stop";
import type { TripLeg, TripOption } from "../../types/trip";
import type { LatLng } from "../../lib/geo";
import { getWalkRoute } from "../../lib/walking";
import { getArrival, headwayFallback, type Arrival } from "../../lib/arrivals";
import { comfortSentence } from "./comfortSort";
import { useFavorites } from "../../store/useFavorites";
import "./TripView.css";

interface Props {
  option: TripOption;
  stops: Stop[];
  destStop: Stop;
  fromPos: LatLng;
}

function routeLabel(leg: TripLeg): string {
  const shown = leg.routeNos.slice(0, 3).join("·");
  const extra = leg.routeNos.length > 3 ? " 외" : "";
  return `${shown}번${extra}`;
}

export default function TripCard({ option, stops, destStop, fromPos }: Props) {
  const byId = (id: string) => stops.find((s) => s.id === id);
  const boardStop = byId(option.boardStopId);
  const boardName = boardStop?.name ?? "정류장";

  // 도보시간: 초기엔 엔진의 직선 추정(option.walkMin) 즉시 표시 → 실경로로 갱신.
  const [walkMin, setWalkMin] = useState(option.walkMin);
  useEffect(() => {
    if (!boardStop) return;
    let alive = true;
    getWalkRoute(fromPos, { lat: boardStop.lat, lng: boardStop.lng }).then(
      (w) => alive && setWalkMin(w.minutes),
    );
    return () => {
      alive = false;
    };
  }, [boardStop, fromPos]);

  // 첫 구간(승차) 버스 도착: 폴백 즉시 표시 후 실시간(있으면) 갱신.
  const firstRouteNo = option.legs[0]?.routeNos[0];
  const saveJourney = useFavorites((s) => s.saveJourney);
  const journeyId = `${option.boardStopId}:${firstRouteNo}:${destStop.id}`;
  const saved = useFavorites((s) => s.journeys.some((item) => item.id === journeyId));
  const firstLeg = option.legs[0];
  const boardIndex = firstLeg ? stops.findIndex((stop) => stop.id === firstLeg.boardStopId) : -1;
  const directionStop = boardIndex >= 0 ? stops.find((stop) => stop.id === firstLeg?.alightStopId) : undefined;
  const [arrival, setArrival] = useState<Arrival>(() =>
    boardStop ? headwayFallback(boardStop) : { text: "", live: false },
  );
  useEffect(() => {
    if (!boardStop) return;
    let alive = true;
    getArrival(boardStop, firstRouteNo).then((a) => alive && setArrival(a));
    return () => {
      alive = false;
    };
  }, [boardStop, firstRouteNo]);

  const transferStop = option.transferStopId
    ? byId(option.transferStopId)
    : undefined;

  return (
    <article
      className="tripcard"
      aria-label={`${boardName}에서 ${destStop.name}까지 ${
        option.directBus ? "직행" : "환승"
      } 경로`}
    >
      <ol className="tripcard__steps">
        <li className="tripcard__step tripcard__step--walk">
          <span className="tripcard__icon" aria-hidden="true"><Footprints /></span>
          <span className="tripcard__text">
            <b className="tripcard__place">{boardName}</b>
            <span className="tripcard__walk">까지 걸어서 {walkMin}분</span>
          </span>
        </li>

        <li className="tripcard__step tripcard__step--bus">
          <span className="tripcard__icon" aria-hidden="true"><BusFront /></span>
          <span className="tripcard__text">
            <b className="tripcard__route">{routeLabel(option.legs[0])}</b> 버스{" "}
            <span className="tripcard__arrival">({arrival.text})</span>
          </span>
        </li>

        {!option.directBus && transferStop && option.legs[1] && (
          <>
            <li className="tripcard__step tripcard__step--transfer">
              <span className="tripcard__icon" aria-hidden="true"><Repeat2 /></span>
              <span className="tripcard__text">
                <b className="tripcard__place">{transferStop.name}</b>에서{" "}
                <b>갈아타기</b>
              </span>
            </li>
            <li className="tripcard__step tripcard__step--bus">
              <span className="tripcard__icon" aria-hidden="true"><BusFront /></span>
              <span className="tripcard__text">
                <b className="tripcard__route">{routeLabel(option.legs[1])}</b>{" "}
                버스
              </span>
            </li>
          </>
        )}

        <li className="tripcard__step tripcard__step--dest">
          <span className="tripcard__icon" aria-hidden="true"><MapPin /></span>
          <span className="tripcard__text">
            <b className="tripcard__place">{destStop.name}</b> 도착
          </span>
        </li>
      </ol>

      <p className="tripcard__tag">
        {option.directBus ? "직접 가는 버스" : "한 번 갈아타는 길"}
      </p>
      {boardStop && (
        <p className="tripcard__comfort">{comfortSentence(boardStop)}</p>
      )}
      {boardStop && firstRouteNo && (
        <button className="tripcard__save" type="button" disabled={saved} onClick={() => saveJourney({
          boardStopId: boardStop.id,
          destinationStopId: destStop.id,
          routeNo: firstRouteNo,
          direction: `${directionStop?.name ?? destStop.name} 방면`,
        })}>{saved ? "즐겨찾기 저장됨" : "이 버스 즐겨찾기"}</button>
      )}
    </article>
  );
}
