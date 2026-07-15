// 즐겨찾기 화면 — 초대형 카드 목록. 보호자가 대신 등록해준 정류장을 한눈에.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Stop } from "../../types/stop";
import { useStops } from "../../store/useStops";
import { useFavorites } from "../../store/useFavorites";
import { useViewMode } from "../../store/useViewMode";
import { facilitySummary, statusColor } from "../../lib/facilityText";
import { getArrival, headwayFallback, type Arrival } from "../../lib/arrivals";
import VersionToggle from "../../components/VersionToggle";
import "./Favorites.css";

function FavoriteBigCard({ stop }: { stop: Stop }) {
  const toggle = useFavorites((s) => s.toggle);
  const [arrival, setArrival] = useState<Arrival>(() => headwayFallback(stop));

  useEffect(() => {
    let alive = true;
    getArrival(stop).then((a) => alive && setArrival(a));
    return () => {
      alive = false;
    };
  }, [stop]);

  const f = stop.facilities;
  const chips: { label: string; status: Stop["facilities"]["shade"]["status"] }[] =
    [
      { label: "그늘", status: f.shade.status },
      { label: "의자", status: f.seat.status },
      { label: "조명", status: f.light.status },
      { label: "도착안내기", status: f.sign.status },
    ];

  return (
    <article className="favcard" aria-label={`${stop.name} ${facilitySummary(stop)}`}>
      <div className="favcard__top">
        <h2 className="favcard__name">{stop.name}</h2>
        <button
          type="button"
          className="favcard__remove"
          aria-label={`${stop.name} 즐겨찾기 해제`}
          onClick={() => toggle(stop.id)}
        >
          해제
        </button>
      </div>

      <p className="favcard__summary">{facilitySummary(stop)}</p>

      <ul className="favcard__chips">
        {chips.map((c) => (
          <li key={c.label} className="favcard__chip" data-color={statusColor(c.status)}>
            <span className="favcard__chip-name">{c.label}</span>
            <span className="favcard__chip-status">
              {c.status === "yes" ? "있음" : c.status === "no" ? "없음" : "미확인"}
            </span>
          </li>
        ))}
      </ul>

      <div className="favcard__bottom">
        <span className="favcard__arrival">🚌 {arrival.text}</span>
        <Link className="favcard__print" to={`/print/${stop.id}`}>
          안내문 인쇄
        </Link>
      </div>
    </article>
  );
}

export default function Favorites() {
  const mode = useViewMode((s) => s.mode);
  const favIds = useFavorites((s) => s.ids);
  const stops = useStops((s) => s.stops);
  const favStops = favIds
    .map((id) => stops.find((s) => s.id === id))
    .filter((s): s is Stop => Boolean(s));

  return (
    <main className="favpage" data-mode={mode}>
      <header className="favpage__bar">
        <Link className="favpage__back" to="/" aria-label="지도로 돌아가기">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          지도
        </Link>
        <h1 className="favpage__title">즐겨찾기</h1>
        <VersionToggle />
      </header>

      {favStops.length === 0 ? (
        <section className="favpage__empty">
          <p className="favpage__empty-title">아직 즐겨찾기한 정류장이 없어요.</p>
          <p className="favpage__empty-sub">
            지도에서 정류장을 고른 뒤 별표를 누르면 여기에 크게 모여요.
          </p>
          <Link className="favpage__cta" to="/">
            지도에서 정류장 고르기
          </Link>
        </section>
      ) : (
        <div className="favpage__list">
          {favStops.map((stop) => (
            <FavoriteBigCard key={stop.id} stop={stop} />
          ))}
        </div>
      )}
    </main>
  );
}
