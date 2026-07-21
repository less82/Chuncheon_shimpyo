// 시민 첫 화면 — 켜자마자 지도 + 내 주변 최근접 정류장 카드.
// 화면당 주행동 1개: "가까운 정류장 정보 보기". 검색·메뉴·온보딩 없음.

import { useEffect, useState } from "react";
import { BusFront, ChevronRight, MapPin, MessageCircle, QrCode, Share2, Star, X } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import MapView from "../map/MapView";
import StopCard from "./StopCard";
import ImportOnLoad from "../share/ImportOnLoad";
import ShareSheet from "../share/ShareSheet";
import QrScanner from "../share/QrScanner";
import { useStops } from "../../store/useStops";
import { useFavorites } from "../../store/useFavorites";
import type { Stop } from "../../types/stop";
import "./CitizenHome.css";

export default function CitizenHome() {
  const [selected, setSelected] = useState<Stop | null>(null);
  const [searchParams] = useSearchParams();
  const [sharing, setSharing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const loaded = useStops((s) => s.loaded);
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
          <button type="button" className="home__share" onClick={() => setSharing(true)}>
            <Share2 aria-hidden="true" /><span className="sr-only">즐겨찾기 공유</span>
          </button>
        </div>
      </header>

      <section className="home__favorites" aria-labelledby="favorite-title">
        <div className="home__section-head">
          <div>
            <span className="home__eyebrow"><Star aria-hidden="true" /> 자주 확인하는 정류장</span>
            <h1 id="favorite-title">내 즐겨찾기</h1>
          </div>
          <Link to="/favorites">전체 보기{favCount > 0 && ` ${favCount}`}<ChevronRight aria-hidden="true" /></Link>
        </div>
        {favoriteStops.length > 0 ? (
          <div className="home__favorite-list">
            {favoriteStops.slice(0, 2).map((stop) => (
              <button type="button" key={stop.id} onClick={() => setSelected(stop)}>
                <span className="home__favorite-pin"><MapPin aria-hidden="true" /></span>
                <span className="home__favorite-copy">
                  <strong>{stop.name}</strong>
                  <small>{stop.routes.length > 0 ? `${stop.routes.slice(0, 3).join(" · ")}번` : "노선 정보 확인 중"}</small>
                </span>
                <ChevronRight aria-hidden="true" />
              </button>
            ))}
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
        {selected && !sharing && (
          <div className="home__selected" role="status">
            <span className="home__selected-pin"><MapPin aria-hidden="true" /></span>
            <span><strong>{selected.name}</strong><small>{selected.routes.slice(0, 3).join(" · ") || "노선 확인 중"}</small></span>
            <Link to={`/go?dest=${encodeURIComponent(selected.id)}`}>길찾기</Link>
            <button type="button" onClick={() => setSelected(null)} aria-label="선택한 정류장 닫기"><X aria-hidden="true" /></button>
          </div>
        )}
      </div>

      <div className="home__sheet">
        {sharing ? (
          <ShareSheet
            ids={favIds.length ? favIds : selected ? [selected.id] : []}
            onClose={() => setSharing(false)}
          />
        ) : selected ? (
          <StopCard stop={selected} />
        ) : (
          <section className="home__hint">
            <p>{loaded ? "지도에서 정류장을 눌러 정보를 확인하세요." : "정류장 정보를 불러오는 중…"}</p>
          </section>
        )}
      </div>
    </main>
  );
}
