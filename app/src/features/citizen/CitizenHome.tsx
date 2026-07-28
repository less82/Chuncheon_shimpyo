import { useEffect, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import ImportOnLoad from "../share/ImportOnLoad";
import { useStops } from "../../store/useStops";
import { useFavorites } from "../../store/useFavorites";
import { getArrival, type Arrival } from "../../lib/arrivals";
import type { Stop } from "../../types/stop";
import type { FavoriteJourney } from "../../store/useFavorites";
import "./CitizenHome.css";

/** 실시간 조회가 실패했을 때 쓰는 고정 문구(docs/현재/01_제품_화면.md). */
export const ARRIVAL_UNAVAILABLE = "실시간 도착정보를 불러오지 못했어요";

export function FavoriteStopCard({ journey, stops }: { journey: FavoriteJourney; stops: Stop[] }) {
  const board = stops.find((stop) => stop.id === journey.boardStopId) ?? null;
  const destination = stops.find((stop) => stop.id === journey.destinationStopId) ?? null;
  const destinationName = journey.destinationName ?? destination?.name ?? "목적지";
  const routeNo = journey.routeNo;
  const [arrival, setArrival] = useState<Arrival>(() => ({ text: "도착정보 확인 중", live: false }));

  useEffect(() => {
    if (!board) {
      setArrival({ text: "도착정보 미확인", live: false });
      return;
    }
    let alive = true;
    setArrival({ text: "도착정보 확인 중", live: false });
    // 실시간(live)이 아니면 조회 실패·키 미설정이라 배차간격 폴백이 돌아온다.
    // 배차간격을 도착예정처럼 쓰지 않고, "버스가 없다"고 단정하지도 않는다.
    getArrival(board, routeNo).then((value) => alive && setArrival(value.live ? value : { text: ARRIVAL_UNAVAILABLE, live: false }));
    return () => { alive = false; };
  }, [board, routeNo]);

  return (
    <Link className="apphome-favorite" to={`/go?dest=${encodeURIComponent(journey.destinationStopId)}&board=${encodeURIComponent(journey.boardStopId)}&to=${encodeURIComponent(destinationName)}`} aria-label={`${destinationName} 즐겨찾기 버스 정보`}>
      <span className="apphome-favorite__top"><strong>{board?.name ?? "정류장"}</strong><i>→</i><strong>{destinationName}</strong></span>
      <span className="apphome-favorite__direction">{journey.direction}</span>
      <span className="apphome-favorite__arrival" data-live={arrival.live}>
        <b>{routeNo ? `${routeNo}번 · ` : ""}{arrival.text}</b>
      </span>
    </Link>
  );
}

export default function CitizenHome() {
  const [searchParams] = useSearchParams();
  const safePreview = searchParams.get("safePreview") === "1" || window.self !== window.top;
  const stops = useStops((state) => state.stops);
  const journeys = useFavorites((state) => state.journeys);

  return (
    <main className="apphome" data-safe-preview={safePreview || undefined}>
      <ImportOnLoad />

      <nav className="apphome__tasks" aria-label="주요 기능">
        <Link className="apphome-task apphome-task--route" to={safePreview ? "/go?safePreview=1" : "/go"} aria-label="버스 도착 예정시간 확인">
          <strong>버스</strong>
        </Link>
        <Link className="apphome-task apphome-task--report" to="/app/report" aria-label="정류장 상태 알리기">
          <strong>정류장</strong>
        </Link>
        <Link className="apphome-task apphome-task--coco" to="/maeng-coco" aria-label="maeng_coco 정류장 파손 검사">
          <strong>maeng_coco</strong>
          <small>사진으로 파손 검사</small>
        </Link>
        {/* 주요 과업 셋(버스·정류장·maeng_coco) 아래 붙는 보조 이동 줄.
            기존 타일과 경쟁하지 않도록 색을 쓰지 않는다. */}
        <Link className="apphome-find" to="/find" aria-label="정류장·노선 찾기">
          <Search aria-hidden="true" />
          <strong>정류장·노선 찾기</strong>
          <ChevronRight aria-hidden="true" />
        </Link>
      </nav>

      <section className="apphome__saved" aria-labelledby="saved-title">
        <header>
          <h2 id="saved-title">즐겨찾기</h2>
          <Link to="/favorites">전체{journeys.length > 0 ? ` ${journeys.length}` : ""}</Link>
        </header>
        {journeys.length > 0 ? (
          <div className="apphome__saved-list">
            {journeys.slice(0, 2).map((journey) => <FavoriteStopCard key={journey.id} journey={journey} stops={stops} />)}
          </div>
        ) : null}
      </section>

    </main>
  );
}
