// 시민 첫 화면 — 켜자마자 지도 + 내 주변 최근접 정류장 카드.
// 화면당 주행동 1개: "가까운 정류장 정보 보기". 검색·메뉴·온보딩 없음.

import { useState } from "react";
import { Link } from "react-router-dom";
import MapView from "../map/MapView";
import StopCard from "./StopCard";
import ImportOnLoad from "../share/ImportOnLoad";
import { useStops } from "../../store/useStops";
import { useFavorites } from "../../store/useFavorites";
import type { Stop } from "../../types/stop";
import "./CitizenHome.css";

export default function CitizenHome() {
  const [selected, setSelected] = useState<Stop | null>(null);
  const loaded = useStops((s) => s.loaded);
  const favCount = useFavorites((s) => s.ids.length);

  return (
    <main className="home">
      <ImportOnLoad />

      <header className="home__bar">
        <div className="home__brand">
          <span className="home__logo" aria-hidden="true">
            ,
          </span>
          <span className="home__title">쉼표 정류장</span>
        </div>
        <Link className="home__fav" to="/favorites">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 18.8 6.2 21.9l1.1-6.5L2.6 9.8l6.5-.9z" />
          </svg>
          <span>즐겨찾기{favCount > 0 ? ` ${favCount}` : ""}</span>
        </Link>
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
