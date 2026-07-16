// 시민 첫 화면 — 켜자마자 지도 + 내 주변 최근접 정류장 카드.
// 화면당 주행동 1개: "가까운 정류장 정보 보기". 검색·메뉴·온보딩 없음.

import { useEffect, useState } from "react";
import { House, Star } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import MapView from "../map/MapView";
import StopCard from "./StopCard";
import ImportOnLoad from "../share/ImportOnLoad";
import { useStops } from "../../store/useStops";
import { useFavorites } from "../../store/useFavorites";
import type { Stop } from "../../types/stop";
import "./CitizenHome.css";

export default function CitizenHome() {
  const [selected, setSelected] = useState<Stop | null>(null);
  const [searchParams] = useSearchParams();
  const loaded = useStops((s) => s.loaded);
  const stops = useStops((s) => s.stops);
  const favCount = useFavorites((s) => s.ids.length);

  useEffect(() => {
    const stopId = searchParams.get("stop");
    if (!stopId) return;
    const stop = stops.find((item) => item.id === stopId);
    if (stop) setSelected(stop);
  }, [searchParams, stops]);

  return (
    <main className="home">
      <ImportOnLoad />

      <header className="home__bar">
        <Link className="home__brand" to="/">
          <House aria-hidden="true" />
          <span className="home__title">홈으로</span>
        </Link>
        <h1 className="home__screen-title">정류장 지도</h1>
        <div className="home__actions">
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
        {selected ? (
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
