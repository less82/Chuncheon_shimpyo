// 하단 정류장 카드 — 첫 화면에서 선택(최근접 자동)된 정류장을 보여준다.
// 정류장명 + 4시설 3상태 배지 + 도착정보(폴백 즉시) + 즐겨찾기 별 + 안내문 인쇄.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Stop } from "../../types/stop";
import FacilityBadge from "../../components/FacilityBadge";
import FavoriteStar from "../../components/FavoriteStar";
import AltStopHint from "./AltStopHint";
import { getArrival, headwayFallback, type Arrival } from "../../lib/arrivals";
import { getWalkRoute, straightWalk, type Point } from "../../lib/walking";
import { buildShareUrl } from "../share/shareLink";
import { toQrDataUrl } from "../share/qr";
import { useFavorites } from "../../store/useFavorites";
import { CITY_CENTER } from "../../types/stop";
import "./StopCard.css";

interface Props {
  stop: Stop;
  /** 부모가 도보 결과를 넘기면 그대로 표시(테스트·주입용). 없으면 스스로 계산. */
  walkMin?: number;
  walkReal?: boolean;
}

interface Walk {
  min: number;
  real: boolean;
}

/** 도보 시간 문구 — 실경로면 "도보", 직선 폴백이면 "직선거리"로 정직 표기. */
export function walkText(min: number, real: boolean): string {
  return real ? `도보 약 ${min}분` : `직선거리 약 ${min}분`;
}

export default function StopCard({ stop, walkMin, walkReal }: Props) {
  // 폴백 문구로 즉시 초기화 → 무한 스피너 없음. 실시간이 오면 갱신.
  const [arrival, setArrival] = useState<Arrival>(() => headwayFallback(stop));
  const injected = walkMin !== undefined;
  const [walk, setWalk] = useState<Walk | null>(
    injected ? { min: walkMin!, real: walkReal ?? false } : null,
  );
  const favIds = useFavorites((s) => s.ids);
  const [showStopQr, setShowStopQr] = useState(false);
  const [stopQr, setStopQr] = useState<string | null>(null);

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

  // 도보 시간: 부모 주입값이 있으면 그대로. 없으면 현위치(거부 시 춘천시청)에서
  // 직선거리 폴백을 즉시 표시(스피너 금지)하고 실경로가 오면 갱신.
  useEffect(() => {
    if (injected) {
      setWalk({ min: walkMin!, real: walkReal ?? false });
      return;
    }
    let alive = true;
    const to: Point = { lat: stop.lat, lng: stop.lng };
    const run = (from: Point) => {
      const fb = straightWalk(from, to);
      if (alive) setWalk({ min: fb.minutes, real: fb.real });
      getWalkRoute(from, to).then((r) => {
        if (alive) setWalk({ min: r.minutes, real: r.real });
      });
    };
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => run({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => run(CITY_CENTER),
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 },
      );
    } else {
      run(CITY_CENTER);
    }
    return () => {
      alive = false;
    };
  }, [stop, injected, walkMin, walkReal]);

  // 이 정류장 QR: 스캔하면 로그인 없이 바로 즐겨찾기에 등록된다(?fav=id → ImportOnLoad).
  useEffect(() => {
    if (!showStopQr) return;
    let alive = true;
    toQrDataUrl(buildShareUrl([stop.id]))
      .then((d) => alive && setStopQr(d))
      .catch(() => alive && setStopQr(null));
    return () => {
      alive = false;
    };
  }, [showStopQr, stop.id]);

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

      {walk && (
        <div className="stopcard__walk" data-real={walk.real}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="13" cy="4" r="2" />
            <path d="M13 6l-2 5 3 2 1 5M11 11l-3 2-1 4M14 13l3 1" />
          </svg>
          <span>{walkText(walk.min, walk.real)}</span>
        </div>
      )}

      <div className="stopcard__facilities">
        <FacilityBadge kind="shade" info={stop.facilities.shade} />
        <FacilityBadge kind="seat" info={stop.facilities.seat} />
        <FacilityBadge kind="light" info={stop.facilities.light} />
        <FacilityBadge kind="sign" info={stop.facilities.sign} />
      </div>

      <AltStopHint stop={stop} arrival={arrival} />

      <div className="stopcard__actions">
        <button
          type="button"
          className="stopcard__qrbtn"
          aria-expanded={showStopQr}
          onClick={() => setShowStopQr((v) => !v)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <path d="M14 14h3v3M14 20h7M20 14v3M17 20v-3" />
          </svg>
          이 정류장 QR
        </button>
      </div>

      {showStopQr && (
        <div className="stopcard__qr" role="group" aria-label={`${stop.name} 정류장 QR 코드`}>
          <p className="stopcard__qr-hint">
            휴대폰 카메라로 찍으면 이 정류장이 즐겨찾기에 등록돼요.
          </p>
          {stopQr ? (
            <img
              className="stopcard__qr-img"
              src={stopQr}
              alt={`${stop.name} 정류장 QR 코드`}
              width={200}
              height={200}
            />
          ) : (
            <p className="stopcard__qr-hint">QR 을 만드는 중…</p>
          )}
        </div>
      )}

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
