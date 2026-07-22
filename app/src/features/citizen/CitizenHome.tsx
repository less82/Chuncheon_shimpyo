import { useEffect, useState } from "react";
import { BusFront, ChevronRight, Clock3, MessageCircle, Navigation, QrCode, Star } from "lucide-react";
import { Link } from "react-router-dom";
import ImportOnLoad from "../share/ImportOnLoad";
import QrScanner from "../share/QrScanner";
import { useStops } from "../../store/useStops";
import { useFavorites } from "../../store/useFavorites";
import { getArrival, headwayFallback, type Arrival } from "../../lib/arrivals";
import type { Stop } from "../../types/stop";
import "./CitizenHome.css";

export function FavoriteStopCard({ stop }: { stop: Stop }) {
  const [arrival, setArrival] = useState<Arrival>(() => headwayFallback(stop));

  useEffect(() => {
    let alive = true;
    setArrival(headwayFallback(stop));
    getArrival(stop).then((value) => alive && setArrival(value));
    return () => { alive = false; };
  }, [stop]);

  const firstRoute = arrival.byRoute?.[0];

  return (
    <Link className="apphome-favorite" to={`/go?dest=${encodeURIComponent(stop.id)}`}>
      <span className="apphome-favorite__top"><Star aria-hidden="true" /><strong>{stop.name}</strong></span>
      <span className="apphome-favorite__arrival" data-live={arrival.live}>
        <Clock3 aria-hidden="true" />
        <b>{firstRoute?.routeNo ? `${firstRoute.routeNo}번 ` : ""}{arrival.text}</b>
      </span>
      <span className="apphome-favorite__go">이곳으로 가기<ChevronRight aria-hidden="true" /></span>
    </Link>
  );
}

export default function CitizenHome() {
  const [scanning, setScanning] = useState(false);
  const stops = useStops((state) => state.stops);
  const favIds = useFavorites((state) => state.ids);
  const favoriteStops = favIds
    .map((id) => stops.find((stop) => stop.id === id))
    .filter((stop): stop is Stop => Boolean(stop));

  return (
    <main className="apphome">
      <ImportOnLoad />
      {scanning && <QrScanner onClose={() => setScanning(false)} />}

      <header className="apphome__bar">
        <Link className="apphome__brand" to="/app" aria-label="쉼표 정류장 홈">
          <span><BusFront aria-hidden="true" /></span>
          <b>쉼표 정류장</b>
        </Link>
        <button type="button" onClick={() => setScanning(true)}><QrCode aria-hidden="true" />QR 스캔</button>
      </header>

      <section className="apphome__intro">
        <p>안녕하세요</p>
        <h1>무엇을 도와드릴까요?</h1>
      </section>

      <nav className="apphome__tasks" aria-label="주요 기능">
        <Link className="apphome-task apphome-task--route" to="/go">
          <span className="apphome-task__icon"><Navigation aria-hidden="true" /></span>
          <span className="apphome-task__copy">
            <small>가장 빠른 버스와 타는 곳을 한 번에</small>
            <strong>목적지로 가는 길 찾기</strong>
          </span>
          <ChevronRight aria-hidden="true" />
        </Link>
        <Link className="apphome-task apphome-task--report" to="/app/report">
          <span className="apphome-task__icon"><MessageCircle aria-hidden="true" /></span>
          <span className="apphome-task__copy">
            <small>의자·그늘·조명·안내 화면이 불편할 때</small>
            <strong>정류장 불편 알리기</strong>
          </span>
          <ChevronRight aria-hidden="true" />
        </Link>
      </nav>

      <section className="apphome__saved" aria-labelledby="saved-title">
        <header>
          <div><span>반복 이용</span><h2 id="saved-title">자주 가는 곳</h2></div>
          <Link to="/favorites">전체 보기{favIds.length > 0 ? ` ${favIds.length}` : ""}<ChevronRight aria-hidden="true" /></Link>
        </header>
        {favoriteStops.length > 0 ? (
          <div className="apphome__saved-list">
            {favoriteStops.slice(0, 2).map((stop) => <FavoriteStopCard key={stop.id} stop={stop} />)}
          </div>
        ) : (
          <Link className="apphome__saved-empty" to="/favorites"><Star aria-hidden="true" /><span><strong>자주 가는 곳을 저장하세요</strong><small>다음부터 검색 없이 바로 길을 찾을 수 있어요.</small></span><ChevronRight aria-hidden="true" /></Link>
        )}
      </section>

      <p className="apphome__privacy">로그인 없이 바로 이용할 수 있어요</p>
    </main>
  );
}
