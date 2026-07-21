// 시민 첫 화면 — 켜자마자 지도 + 내 주변 최근접 정류장 카드.
// 화면당 주행동 1개: "가까운 정류장 정보 보기". 검색·메뉴·온보딩 없음.

import { useEffect, useState } from "react";
import { BusFront, ChevronRight, Clock3, MapPin, MessageCircle, QrCode, Star, X } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import MapView from "../map/MapView";
import ImportOnLoad from "../share/ImportOnLoad";
import QrScanner from "../share/QrScanner";
import { useStops } from "../../store/useStops";
import { useFavorites } from "../../store/useFavorites";
import { getArrival, headwayFallback, type Arrival } from "../../lib/arrivals";
import type { Stop } from "../../types/stop";
import "./CitizenHome.css";

export function FavoriteStopCard({ stop, onSelect }: { stop: Stop; onSelect: () => void }) {
  const [arrival, setArrival] = useState<Arrival>(() => headwayFallback(stop));

  useEffect(() => {
    let alive = true;
    setArrival(headwayFallback(stop));
    getArrival(stop).then((value) => alive && setArrival(value));
    return () => { alive = false; };
  }, [stop]);

  const firstRoute = arrival.byRoute?.[0];

  return (
    <article className="homefav">
      <button type="button" className="homefav__stop" onClick={onSelect} aria-label={`${stop.name} 지도에서 보기`}>
        <span className="homefav__name"><MapPin aria-hidden="true" />{stop.name}</span>
        <span className="homefav__arrival" data-live={arrival.live}>
          <Clock3 aria-hidden="true" />
          <strong>{firstRoute?.routeNo ? `${firstRoute.routeNo}번 ` : ""}{arrival.text}</strong>
          <small>{arrival.live ? "실시간" : "운행 간격"}</small>
        </span>
      </button>
      <Link to={`/go?dest=${encodeURIComponent(stop.id)}`}>이곳으로 가기<ChevronRight aria-hidden="true" /></Link>
    </article>
  );
}

export default function CitizenHome() {
  const [selected, setSelected] = useState<Stop | null>(null);
  const [searchParams] = useSearchParams();
  const [scanning, setScanning] = useState(false);
  const stops = useStops((s) => s.stops);
  const favCount = useFavorites((s) => s.ids.length);
  const favIds = useFavorites((s) => s.ids);
  const favoriteStops = favIds
    .map((id) => stops.find((stop) => stop.id === id))
    .filter((stop): stop is Stop => Boolean(stop));

  useEffect(() => {
    const stopId = searchParams.get("stop");
    if (!stopId) return;
    const stop = stops.find((item) => item.id === stopId);
    if (stop) setSelected(stop);
  }, [searchParams, stops]);

  return (
    <main className="home">
      <ImportOnLoad />
      {scanning && <QrScanner onClose={() => setScanning(false)} />}

      <header className="home__bar">
        <Link className="home__brand" to="/app" aria-label="쉼표 정류장 홈">
          <span className="home__brand-icon"><BusFront aria-hidden="true" /></span>
          <span><b>쉼표 정류장</b><small>춘천 버스 생활 도우미</small></span>
        </Link>
        <div className="home__actions">
          <button type="button" className="home__scan" onClick={() => setScanning(true)}>
            <QrCode aria-hidden="true" /><span>QR</span>
          </button>
        </div>
      </header>

      <section className="home__favorites" aria-labelledby="favorite-title">
        <div className="home__section-head">
          <div>
            <span className="home__eyebrow"><Star aria-hidden="true" /> 매일 바로 확인</span>
            <h1 id="favorite-title">자주 타는 정류장</h1>
          </div>
          <Link to="/favorites">전체 보기{favCount > 0 && ` ${favCount}`}<ChevronRight aria-hidden="true" /></Link>
        </div>
        {favoriteStops.length > 0 ? (
          <div className="home__favorite-list">
            {favoriteStops.slice(0, 2).map((stop) => <FavoriteStopCard key={stop.id} stop={stop} onSelect={() => setSelected(stop)} />)}
          </div>
        ) : (
          <Link className="home__favorite-empty" to="/favorites">
            <span className="home__favorite-pin"><Star aria-hidden="true" /></span>
            <span><strong>저장한 정류장이 없어요</strong><small>자주 타는 정류장을 별표로 저장해 보세요.</small></span>
            <ChevronRight aria-hidden="true" />
          </Link>
        )}
      </section>

      <div className="home__main-actions" aria-label="주요 기능">
        <Link className="home__main-action home__main-action--route" to="/go">
          <BusFront aria-hidden="true" /><span><small>목적지로</small><strong>길찾기</strong></span><ChevronRight aria-hidden="true" />
        </Link>
        <Link className="home__main-action home__main-action--report" to="/app/report">
          <MessageCircle aria-hidden="true" /><span><small>고장·불편</small><strong>알리기</strong></span><ChevronRight aria-hidden="true" />
        </Link>
      </div>

      <div className="home__map-head"><span>주변 정류장</span><small>지도의 정류장을 눌러보세요</small></div>

      <div className="home__map">
        <MapView onSelect={setSelected} selectedId={selected?.id} />
        {selected && (
          <div className="home__selected" role="status">
            <span className="home__selected-pin"><MapPin aria-hidden="true" /></span>
            <span><strong>{selected.name}</strong><small>{selected.routes.slice(0, 3).join(" · ") || "노선 확인 중"}</small></span>
            <Link to={`/go?dest=${encodeURIComponent(selected.id)}`}>길찾기</Link>
            <button type="button" onClick={() => setSelected(null)} aria-label="선택한 정류장 닫기"><X aria-hidden="true" /></button>
          </div>
        )}
      </div>

    </main>
  );
}
