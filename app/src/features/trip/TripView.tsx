// 목적지행 버스 도착정보 화면 (/go).
// 키보드 0: 즐겨찾기(=목적지)를 탭만으로 고르면 경로 카드가 나온다. 타이핑 불필요.
// 즐겨찾기가 없으면 별표 저장 안내. 결과 없으면 정직하게 "찾지 못했습니다".

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Star } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import type { Stop } from "../../types/stop";
import type { RoutesFile } from "../../types/route";
import type { LatLng } from "../../lib/geo";
import { useStops } from "../../store/useStops";
import { useFavorites } from "../../store/useFavorites";
import { loadRoutes } from "../../lib/loadRoutes";
import { planTrip } from "./planTrip";
import { sortByComfort, type SortMode } from "./comfortSort";
import TripCard from "./TripCard";
import "./TripView.css";

export default function TripView() {
  const [searchParams] = useSearchParams();
  const stops = useStops((s) => s.stops);
  const cityCenter = useStops((s) => s.cityCenter);
  const favIds = useFavorites((s) => s.ids);

  const favStops = useMemo(
    () =>
      favIds
        .map((id) => stops.find((s) => s.id === id))
        .filter((s): s is Stop => Boolean(s)),
    [favIds, stops],
  );

  const requestedDestId = searchParams.get("dest");
  const requestedBoardId = searchParams.get("board");
  const [destId, setDestId] = useState<string | null>(requestedDestId);
  const [routes, setRoutes] = useState<RoutesFile | null>(null);
  const [fromPos, setFromPos] = useState<LatLng>(cityCenter);
  const [sortMode, setSortMode] = useState<SortMode>("comfort");

  const stopsById = useMemo(() => {
    const m = new Map<string, Stop>();
    for (const s of stops) m.set(s.id, s);
    return m;
  }, [stops]);

  // 노선 그래프 로드(로컬 routes.json — 오프라인 동작). 실패해도 화면은 살아있다.
  useEffect(() => {
    let alive = true;
    loadRoutes()
      .then((r) => alive && setRoutes(r))
      .catch(() => alive && setRoutes({ generatedAt: "", routes: [] }));
    return () => {
      alive = false;
    };
  }, []);

  // 현위치. 권한 거부/미지원이면 시청 중심 폴백(무한 대기 없음).
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setFromPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setFromPos(cityCenter),
      { timeout: 4000, maximumAge: 60000 },
    );
  }, [cityCenter]);

  // 첫 즐겨찾기를 기본 선택(탭 한 번 덜 하도록).
  useEffect(() => {
    if (!favStops.some((stop) => stop.id === destId) && favStops.length > 0) {
      setDestId(favStops[0].id);
    }
  }, [destId, favStops]);

  const destStop = favStops.find((s) => s.id === destId) ?? null;

  const options = useMemo(() => {
    if (!destStop || !routes) return [];
    const planned = planTrip(fromPos, destStop, stops, routes.routes, requestedBoardId ? { boardStopId: requestedBoardId, walkRadiusM: Number.MAX_SAFE_INTEGER } : undefined);
    return sortByComfort(planned, stopsById, sortMode);
  }, [destStop, routes, fromPos, stops, stopsById, sortMode, requestedBoardId]);

  return (
    <main className="tripview">
      <header className="tripview__bar">
        <Link className="tripview__back" to="/app" aria-label="앱 메인으로 돌아가기">
          <ChevronLeft aria-hidden="true" />
          메인
        </Link>
        <h1 className="tripview__title">목적지행 버스</h1>
        <span className="tripview__spacer" aria-hidden="true" />
      </header>

      {favStops.length === 0 ? (
        <section className="tripview__empty">
          <p className="tripview__empty-title">
            먼저 자주 가는 곳을 별표로 저장하세요.
          </p>
          <p className="tripview__empty-sub">
            저장한 곳이 여기 목적지 단추로 나와요. 누르기만 하면 가는 버스를
            찾아드려요.
          </p>
          <Link className="tripview__cta" to="/app">
            지도에서 목적지 별표하기
          </Link>
        </section>
      ) : (
        <>
          <section className="tripview__dests" aria-label="목적지 고르기">
            <p className="tripview__dests-label">어디로 가세요?</p>
            <div className="tripview__dest-list">
              {favStops.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="tripview__dest"
                  aria-pressed={s.id === destId}
                  onClick={() => setDestId(s.id)}
                >
                  <Star className="tripview__dest-star" aria-hidden="true" />
                  {s.name}
                </button>
              ))}
            </div>
          </section>

          {destStop && (
            <section
              className="tripview__sort"
              aria-label="정렬 기준 선택"
            >
              <p className="tripview__sort-sub">
                확인된 시설이 있는 길을 우선 보여드려요
              </p>
              <div className="tripview__sort-toggle" role="group">
                <button
                  type="button"
                  className="tripview__sort-btn"
                  aria-pressed={sortMode === "comfort"}
                  onClick={() => setSortMode("comfort")}
                >
                  시설 확인된 곳 우선
                </button>
                <button
                  type="button"
                  className="tripview__sort-btn"
                  aria-pressed={sortMode === "nearest"}
                  onClick={() => setSortMode("nearest")}
                >
                  가까운 순
                </button>
              </div>
            </section>
          )}

          <section className="tripview__results" aria-live="polite">
            {!routes ? (
              <p className="tripview__msg">경로를 준비하고 있어요…</p>
            ) : destStop && options.length === 0 ? (
              <p className="tripview__msg tripview__msg--none">
                직접 가는 버스를 찾지 못했습니다.
              </p>
            ) : (
              options.map((opt, i) => (
                <TripCard
                  key={`${opt.boardStopId}-${opt.directBus ? "d" : "t"}-${i}`}
                  option={opt}
                  stops={stops}
                  destStop={destStop!}
                  fromPos={fromPos}
                />
              ))
            )}
          </section>
        </>
      )}
    </main>
  );
}
