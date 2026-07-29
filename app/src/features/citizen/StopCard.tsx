// 하단 정류장 카드 — 첫 화면에서 선택(최근접 자동)된 정류장을 보여준다.
// 정류장명 + 4시설 3상태 배지 + 도착정보(폴백 즉시) + 즐겨찾기 별.

import { useEffect, useState } from "react";
import { BusFront, Footprints, Navigation } from "lucide-react";
import { Link } from "react-router-dom";
import type { Stop } from "../../types/stop";
import FacilityBadge from "../../components/FacilityBadge";
import FavoriteStar from "../../components/FavoriteStar";
import AltStopHint from "./AltStopHint";
import { ARRIVAL_UNAVAILABLE_TEXT, getArrival, headwayFallback, type Arrival } from "../../lib/arrivals";
import { getWalkRoute, straightWalk, type Point } from "../../lib/walking";
import "./StopCard.css";

interface Props {
  stop: Stop;
  /** 부모가 도보 결과를 넘기면 그대로 표시(테스트·주입용). 없으면 스스로 계산. */
  walkMin?: number;
  walkReal?: boolean;
}

interface Walk {
  min: number;
  real: boolean;
}

/** 도보 시간 문구 — 실경로면 "도보", 직선 폴백이면 "직선거리"로 정직 표기. */
export function walkText(min: number, real: boolean): string {
  return real ? `도보 약 ${min}분` : `직선거리 약 ${min}분`;
}

export default function StopCard({ stop, walkMin, walkReal }: Props) {
  // 폴백 문구로 즉시 초기화 → 무한 스피너 없음. 실시간이 오면 갱신.
  const [arrival, setArrival] = useState<Arrival>(() => headwayFallback(stop));
  const injected = walkMin !== undefined;
  const [walk, setWalk] = useState<Walk | null>(
    injected ? { min: walkMin!, real: walkReal ?? false } : null,
  );
  const [locationUnavailable, setLocationUnavailable] = useState(false);

  useEffect(() => {
    let alive = true;
    setArrival(headwayFallback(stop));
    getArrival(stop).then((a) => {
      if (alive) setArrival(a);
    });
    return () => {
      alive = false;
    };
  }, [stop]);

  // 도보 시간: 부모 주입값이 있으면 그대로. 없으면 현위치(거부 시 춘천시청)에서
  // 직선거리 폴백을 즉시 표시(스피너 금지)하고 실경로가 오면 갱신.
  useEffect(() => {
    if (injected) {
      setWalk({ min: walkMin!, real: walkReal ?? false });
      return;
    }
    let alive = true;
    const to: Point = { lat: stop.lat, lng: stop.lng };
    const run = (from: Point) => {
      setLocationUnavailable(false);
      const fb = straightWalk(from, to);
      if (alive) setWalk({ min: fb.minutes, real: fb.real });
      getWalkRoute(from, to).then((r) => {
        if (alive) setWalk({ min: r.minutes, real: r.real });
      });
    };
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => run({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => { setWalk(null); setLocationUnavailable(true); },
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 },
      );
    } else {
      setWalk(null);
      setLocationUnavailable(true);
    }
    return () => {
      alive = false;
    };
  }, [stop, injected, walkMin, walkReal]);

  return (
    <section className="stopcard" aria-label={`${stop.name} 정류장 정보`}>
      <div className="stopcard__grip" aria-hidden="true" />
      <header className="stopcard__head">
        <div className="stopcard__title">
          <h2 className="stopcard__name">{stop.name}</h2>
          {stop.routes.length > 0 && (
            <p className="stopcard__routes">
              <b className="stopcard__routes-label">경유 노선</b>
              {stop.routes.slice(0, 6).map((r) => (
                <span key={r} className="stopcard__route">
                  {r}
                </span>
              ))}
            </p>
          )}
        </div>
        <FavoriteStar id={stop.id} name={stop.name} />
      </header>

      <div className="stopcard__arrival" data-live={arrival.live}>
        <BusFront aria-hidden="true" />
        {/* 실시간이 아니면 폴백 문구(배차간격)를 절대 내보내지 않고 고정 안내만 쓴다. */}
        <span>{arrival.live ? arrival.text : ARRIVAL_UNAVAILABLE_TEXT}</span>
        {arrival.live && <span className="stopcard__livedot">실시간</span>}
      </div>

      {arrival.live && arrival.byRoute && (
        <div className="stopcard__route-arrivals" aria-label="노선별 실시간 도착">
          {arrival.byRoute.slice(0, 4).map((item) => (
            <div key={`${item.routeNo}-${item.min}`}><b>{item.routeNo}번</b><span>{item.min <= 0 ? "곧 도착" : `${item.min}분 후`}</span><small>{item.seq > 0 ? `${item.seq}정류장 전` : "도착 임박"}</small></div>
          ))}
        </div>
      )}

      {walk && (
        <div className="stopcard__walk" data-real={walk.real}>
          <Footprints aria-hidden="true" />
          <span>{walkText(walk.min, walk.real)}</span>
        </div>
      )}
      {locationUnavailable && <div className="stopcard__walk"><Footprints aria-hidden="true" /><span>위치 허용 시 도보 시간 안내</span></div>}

      <div className="stopcard__facilities">
        <FacilityBadge kind="shade" info={stop.facilities.shade} />
        <FacilityBadge kind="seat" info={stop.facilities.seat} />
        <FacilityBadge kind="shelter" info={stop.facilities.shelter} />
        <FacilityBadge kind="sign" info={stop.facilities.sign} />
      </div>

      <AltStopHint stop={stop} arrival={arrival} />

      <div className="stopcard__actions">
        <Link className="stopcard__go" to="/go">
          <Navigation aria-hidden="true" /> 버스로 가기
        </Link>
      </div>
    </section>
  );
}
