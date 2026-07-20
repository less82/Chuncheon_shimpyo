// 시민 첫 화면 — 켜자마자 지도 + 내 주변 최근접 정류장 카드.
// 화면당 주행동 1개: "가까운 정류장 정보 보기". 검색·메뉴·온보딩 없음.

import { useEffect, useState } from "react";
import { House, Star } from "lucide-react";
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
        <Link className="home__brand" to="/">
          <House aria-hidden="true" />
          <span className="home__title">홈으로</span>
        </Link>
        <h1 className="home__screen-title">정류장 지도</h1>
        <div className="home__actions">
          <button
            type="button"
            className="home__scan"
            onClick={() => setScanning(true)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
              <path d="M7 12h10" />
            </svg>
            <span>QR 스캔</span>
          </button>
          <Link className="home__go" to="/go">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M4 16V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-1 1.73V19a1 1 0 0 1-2 0v-1H7v1a1 1 0 0 1-2 0v-1.27A2 2 0 0 1 4 16zm2-1h12V6H6v9zm1.5 2.5a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5zm9 0a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5z" />
            </svg>
            <span>버스로 가기</span>
          </Link>
          <button
            type="button"
            className="home__share"
            onClick={() => setSharing(true)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18 16.08a2.9 2.9 0 0 0-1.95.77l-7.1-4.13c.05-.24.05-.49 0-.73l7.02-4.09A3 3 0 1 0 15 5.5c0 .24.02.47.07.7L8.05 10.3a3 3 0 1 0 0 3.4l7.09 4.14a3 3 0 1 0 2.86-2.76z" />
            </svg>
            <span>공유</span>
          </button>
          <Link className="home__fav" to="/favorites">
            <Star aria-hidden="true" />
            <span>즐겨찾기{favCount > 0 ? ` ${favCount}` : ""}</span>
          </Link>
        </div>
      </header>

      <div className="home__map">
        <MapView onSelect={setSelected} selectedId={selected?.id} />
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
