// 어른용 첫 화면 — "내 정류장"(즐겨찾기 우선, 없으면 최근접) 큰 카드 + 근처 목록.
// 지도는 기본 접힘. 정류장 선택은 지도 탭 대신 큰 목록 탭.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import StopCard from "./StopCard";
import MapView from "../map/MapView";
import VersionToggle from "../../components/VersionToggle";
import { useStops } from "../../store/useStops";
import { useFavorites } from "../../store/useFavorites";
import { facilitySummary } from "../../lib/facilityText";
import { haversine, type LatLng } from "../../lib/geo";
import { CITY_CENTER } from "../../types/stop";
import type { Stop } from "../../types/stop";
import { resolvePrimaryStop, nearbyStops } from "./elderHome";
import "./ElderHome.css";

export default function ElderHome() {
  const stops = useStops((s) => s.stops);
  const loaded = useStops((s) => s.loaded);
  const favIds = useFavorites((s) => s.ids);
  const [pos, setPos] = useState<LatLng>(CITY_CENTER);
  const [override, setOverride] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // 현위치(거부/미지원이면 시청 좌표 유지 — 무한대기 없음).
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    let alive = true;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (alive) setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 },
    );
    return () => {
      alive = false;
    };
  }, []);

  const primary = useMemo<Stop | null>(() => {
    if (override) {
      const o = stops.find((s) => s.id === override);
      if (o) return o;
    }
    return resolvePrimaryStop(favIds, stops, pos);
  }, [override, favIds, stops, pos]);

  const nearby = useMemo<Stop[]>(
    () => (primary ? nearbyStops(stops, pos, 5, primary.id) : []),
    [stops, pos, primary],
  );

  // 근처 목록에서 다른 정류장을 고르면 주 카드가 화면 위쪽에 오도록 스크롤(스크롤 위치가 아래여도 변경을 놓치지 않게).
  useEffect(() => {
    if (override) cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [override]);

  return (
    <main className="elderhome">
      <header className="elderhome__bar">
        <div className="elderhome__brand">
          <span className="elderhome__logo" aria-hidden="true">
            ,
          </span>
          <span className="elderhome__title">쉼표 정류장</span>
        </div>
        <VersionToggle />
      </header>

      {!loaded ? (
        <p className="elderhome__msg">정류장 정보를 불러오는 중…</p>
      ) : primary ? (
        <>
          <p className="elderhome__label">
            {favIds.includes(primary.id)
              ? "⭐ 내 정류장"
              : override === primary.id
                ? "선택한 정류장"
                : "가장 가까운 정류장"}
          </p>

          {override && (
            <button
              type="button"
              className="elderhome__reset"
              onClick={() => setOverride(null)}
            >
              ↩ 내 정류장으로 돌아가기
            </button>
          )}

          <div ref={cardRef}>
            <StopCard stop={primary} />
          </div>

          {favIds.length > 0 && (
            <Link className="elderhome__go" to="/go">
              버스 타러 가기 →
            </Link>
          )}

          {nearby.length > 0 && (
            <section className="elderhome__nearby" aria-label="근처 정류장">
              <h2 className="elderhome__nearby-title">근처 다른 정류장</h2>
              <ul className="elderhome__list">
                {nearby.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="elderhome__item"
                      onClick={() => setOverride(s.id)}
                    >
                      <span className="elderhome__item-name">{s.name}</span>
                      <span className="elderhome__item-dist">
                        {Math.round(haversine(pos, { lat: s.lat, lng: s.lng }))}m
                      </span>
                      <span className="elderhome__item-sum">
                        {facilitySummary(s)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <button
            type="button"
            className="elderhome__mapbtn"
            onClick={() => setShowMap((v) => !v)}
            aria-expanded={showMap}
          >
            {showMap ? "지도 접기" : "지도 보기"}
          </button>
          {showMap && (
            <div className="elderhome__map">
              <MapView
                onSelect={(s) => setOverride(s.id)}
                selectedId={primary.id}
                autoSelect={false}
              />
            </div>
          )}
        </>
      ) : (
        <p className="elderhome__msg">정류장 정보를 찾을 수 없어요.</p>
      )}
    </main>
  );
}
