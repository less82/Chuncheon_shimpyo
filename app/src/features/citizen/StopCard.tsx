// 하단 정류장 카드 — 첫 화면에서 선택(최근접 자동)된 정류장을 보여준다.
// 정류장명 + 4시설 3상태 배지 + 도착정보(폴백 즉시) + 즐겨찾기 별 + 안내문 인쇄.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Stop } from "../../types/stop";
import FacilityBadge from "../../components/FacilityBadge";
import FavoriteStar from "../../components/FavoriteStar";
import { getArrival, headwayFallback, type Arrival } from "../../lib/arrivals";
import { buildShareUrl } from "../share/shareLink";
import { useFavorites } from "../../store/useFavorites";
import "./StopCard.css";

interface Props {
  stop: Stop;
}

export default function StopCard({ stop }: Props) {
  // 폴백 문구로 즉시 초기화 → 무한 스피너 없음. 실시간이 오면 갱신.
  const [arrival, setArrival] = useState<Arrival>(() => headwayFallback(stop));
  const favIds = useFavorites((s) => s.ids);

  useEffect(() => {
    let alive = true;
    setArrival(headwayFallback(stop));
    getArrival(stop).then((a) => {
      if (alive) setArrival(a);
    });
    return () => {
      alive = false;
    };
  }, [stop]);

  const share = async () => {
    const url = buildShareUrl(favIds.length ? favIds : [stop.id]);
    try {
      if (navigator.share) {
        await navigator.share({ title: "쉼표 정류장", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      alert("공유 링크를 복사했어요. 가족에게 붙여넣어 보내세요.");
    } catch {
      /* 사용자가 취소 */
    }
  };

  return (
    <section className="stopcard" aria-label={`${stop.name} 정류장 정보`}>
      <div className="stopcard__grip" aria-hidden="true" />
      <header className="stopcard__head">
        <div className="stopcard__title">
          <h2 className="stopcard__name">{stop.name}</h2>
          {stop.routes.length > 0 && (
            <p className="stopcard__routes">
              <span className="sr-only">경유 노선 </span>
              {stop.routes.slice(0, 6).map((r) => (
                <span key={r} className="stopcard__route">
                  {r}
                </span>
              ))}
            </p>
          )}
        </div>
        <FavoriteStar id={stop.id} name={stop.name} />
      </header>

      <div className="stopcard__arrival" data-live={arrival.live}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 6h9a3 3 0 0 1 3 3v6M4 6v9M2 15h18M6 18a2 2 0 1 0 0 .01M16 18a2 2 0 1 0 0 .01" />
        </svg>
        <span>{arrival.text}</span>
        {arrival.live && <span className="stopcard__livedot">실시간</span>}
      </div>

      <div className="stopcard__facilities">
        <FacilityBadge kind="shade" info={stop.facilities.shade} />
        <FacilityBadge kind="seat" info={stop.facilities.seat} />
        <FacilityBadge kind="light" info={stop.facilities.light} />
        <FacilityBadge kind="sign" info={stop.facilities.sign} />
      </div>

      <div className="stopcard__actions">
        <button type="button" className="stopcard__share" onClick={share}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
          </svg>
          가족에게 공유
        </button>
        <Link className="stopcard__print" to={`/print/${stop.id}`}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M6 14h12v7H6z" />
          </svg>
          안내문 인쇄
        </Link>
      </div>
    </section>
  );
}
