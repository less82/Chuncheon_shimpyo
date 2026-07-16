// 고령자가 검색하지 않고, 본인이나 가족이 저장한 목적지를 바로 선택하는 화면.

import { ChevronLeft, Navigation, Users } from "lucide-react";
import { Link } from "react-router-dom";
import type { Stop } from "../../types/stop";
import { useStops } from "../../store/useStops";
import { useFavorites } from "../../store/useFavorites";
import "./Favorites.css";

function DestinationCard({ stop }: { stop: Stop }) {
  const toggle = useFavorites((s) => s.toggle);

  return (
    <article className="favcard">
      <p className="favcard__eyebrow">저장한 목적지</p>
      <h2 className="favcard__name">{stop.name}</h2>
      <p className="favcard__direction">
        경유 노선 {stop.routes.length > 0 ? stop.routes.slice(0, 4).join(" · ") : "정보 확인 중"}
      </p>
      <Link className="favcard__go" to={`/go?dest=${encodeURIComponent(stop.id)}`}>
        <Navigation aria-hidden="true" />
        이곳으로 가기
      </Link>
      <button
        type="button"
        className="favcard__remove"
        onClick={() => toggle(stop.id)}
        aria-label={`${stop.name} 저장 해제`}
      >
        저장 해제
      </button>
    </article>
  );
}

export default function Favorites() {
  const favIds = useFavorites((s) => s.ids);
  const stops = useStops((s) => s.stops);
  const favStops = favIds
    .map((id) => stops.find((s) => s.id === id))
    .filter((s): s is Stop => Boolean(s));

  return (
    <main className="favpage">
      <header className="favpage__bar">
        <Link className="favpage__back" to="/app" aria-label="지도로 돌아가기">
          <ChevronLeft aria-hidden="true" />
          지도
        </Link>
        <h1 className="favpage__title">자주 가는 곳</h1>
        <span className="favpage__spacer" aria-hidden="true" />
      </header>

      <section className="favpage__intro">
        <Users aria-hidden="true" />
        <div>
          <strong>검색 없이 목적지를 고르세요</strong>
          <p>가족이 보내 준 정류장도 여기에 저장됩니다.</p>
        </div>
      </section>

      {favStops.length === 0 ? (
        <section className="favpage__empty">
          <p className="favpage__empty-title">저장한 목적지가 없습니다.</p>
          <p className="favpage__empty-sub">
            지도에서 자주 가는 병원이나 시장 근처 정류장을 저장해 두세요.
          </p>
          <Link className="favpage__cta" to="/app">
            지도에서 목적지 고르기
          </Link>
        </section>
      ) : (
        <div className="favpage__list">
          {favStops.map((stop) => <DestinationCard key={stop.id} stop={stop} />)}
        </div>
      )}
    </main>
  );
}
