// 고령자가 검색하지 않고, 본인이나 가족이 저장한 목적지를 바로 선택하는 화면.

import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import type { Stop } from "../../types/stop";
import { useStops } from "../../store/useStops";
import { useFavorites } from "../../store/useFavorites";
import "./Favorites.css";

function DestinationCard({ stop }: { stop: Stop }) {
  const toggle = useFavorites((s) => s.toggle);

  return (
    <article className="favcard">
      <h2 className="favcard__name">{stop.name}</h2>
      <Link className="favcard__go" to={`/go?dest=${encodeURIComponent(stop.id)}`}>
        버스 정보
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

/** "○○정류장을 즐겨찾기에 넣었어요" / "○○ 외 N곳을 즐겨찾기에 넣었어요" */
export function importedBannerText(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} 정류장을 즐겨찾기에 넣었어요`;
  return `${names[0]} 외 ${names.length - 1}곳을 즐겨찾기에 넣었어요`;
}

export default function Favorites() {
  const favIds = useFavorites((s) => s.ids);
  const stops = useStops((s) => s.stops);
  const favStops = favIds
    .map((id) => stops.find((s) => s.id === id))
    .filter((s): s is Stop => Boolean(s));

  const location = useLocation();
  const navImportedNames =
    (location.state as { importedNames?: string[] } | null)?.importedNames ?? [];
  const [importedNames, setImportedNames] = useState<string[]>(navImportedNames);

  return (
    <main className="favpage">
      <header className="favpage__bar">
        <Link className="favpage__back" to="/app" aria-label="지도로 돌아가기">
          <ChevronLeft aria-hidden="true" />
          지도
        </Link>
        <h1 className="favpage__title">즐겨찾기</h1>
        <span className="favpage__spacer" aria-hidden="true" />
      </header>

      {importedNames.length > 0 && (
        <div className="favpage__banner" role="status">
          <span>{importedBannerText(importedNames)}</span>
          <button
            type="button"
            className="favpage__banner-close"
            aria-label="알림 닫기"
            onClick={() => setImportedNames([])}
          >
            닫기
          </button>
        </div>
      )}

      {favStops.length === 0 ? (
        <section className="favpage__empty">
          <p className="favpage__empty-title">저장한 목적지가 없습니다.</p>
          <Link className="favpage__cta" to="/app">
            즐겨찾기 등록
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
