// 고령자가 검색하지 않고, 본인이나 가족이 저장한 목적지를 바로 선택하는 화면.

import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useStops } from "../../store/useStops";
import { useFavorites } from "../../store/useFavorites";
import { FavoriteStopCard } from "./CitizenHome";
import "./Favorites.css";

/** "○○정류장을 즐겨찾기에 넣었어요" / "○○ 외 N곳을 즐겨찾기에 넣었어요" */
export function importedBannerText(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} 정류장을 즐겨찾기에 넣었어요`;
  return `${names[0]} 외 ${names.length - 1}곳을 즐겨찾기에 넣었어요`;
}

export default function Favorites() {
  const journeys = useFavorites((s) => s.journeys);
  const removeJourney = useFavorites((s) => s.removeJourney);
  const stops = useStops((s) => s.stops);

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

      {journeys.length === 0 ? (
        <section className="favpage__empty">
          <p className="favpage__empty-title">저장한 목적지가 없습니다.</p>
          <Link className="favpage__cta" to="/app">
            즐겨찾기 등록
          </Link>
        </section>
      ) : (
        <div className="favpage__list">
          {journeys.map((journey) => {
            const destination = stops.find((stop) => stop.id === journey.destinationStopId);
            return <article className="favcard" key={journey.id}>
              <FavoriteStopCard journey={journey} stops={stops} />
              <button type="button" className="favcard__remove" onClick={() => removeJourney(journey.id)} aria-label={`${destination?.name ?? "목적지"} 저장 해제`}>저장 해제</button>
            </article>;
          })}
        </div>
      )}
    </main>
  );
}
