import { useEffect, useMemo, useRef, useState } from "react";
import { Bus, ChevronDown, MapPin, Search } from "lucide-react";
import { Link } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ACCENT_HEX, createVoyagerLayer, dotStyle } from "../map/leafletBase";
import { loadRoutes } from "../../lib/loadRoutes";
import { useStops } from "../../store/useStops";
import { villageZoneOf } from "../../data/busContacts";
import {
  fetchRouteVehicles,
  VEHICLE_EMPTY_TEXT,
  VEHICLE_FAIL_TEXT,
  type Vehicle,
} from "../../lib/vehicles";
import type { RouteInfo } from "../../types/route";
import "./RouteSearch.css";

/** 검색 비교용 정규화 — 공백을 지우고 소문자로 맞춘다. */
function normalize(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}

/** 이름을 찾지 못한 정류장에 쓰는 문구. 임의로 지어내지 않는다. */
const UNKNOWN_STOP_NAME = "이름 미확인";

/** 실시간 갱신 주기(30초). 노선을 접거나 화면을 떠나면 반드시 정리한다. */
const REFRESH_MS = 30000;

/**
 * 차량 한 대의 텍스트 표기. 순번을 모르면(0) 지어내지 않고 정류장만 쓴다.
 * 예: "강원70자1009 · 일성트루엘A (12/124번째)"
 */
function vehicleLabel(vehicle: Vehicle, total: number): string {
  const where = vehicle.nodeNm || "현재 위치 미확인";
  const head = vehicle.vehicleNo ? `${vehicle.vehicleNo} · ${where}` : where;
  if (!vehicle.nodeOrd || !total) return head;
  return `${head} (${vehicle.nodeOrd}/${total}번째)`;
}

/** 실시간 차량 위치 지도. 차량이 있을 때만 그린다(좌표를 지어내지 않는다). */
function VehicleMap({ vehicles }: { vehicles: Vehicle[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: false, attributionControl: false });
    mapRef.current = map;
    createVoyagerLayer(false).addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = [];
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    for (const vehicle of vehicles) {
      const marker = L.circleMarker([vehicle.lat, vehicle.lng], dotStyle(ACCENT_HEX));
      marker.bindTooltip(vehicle.vehicleNo || "버스", { direction: "top", offset: [0, -6] });
      marker.addTo(map);
      markersRef.current.push(marker);
    }
    const bounds = L.latLngBounds(vehicles.map((v) => [v.lat, v.lng] as [number, number]));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
  }, [vehicles]);

  return <div ref={containerRef} className="routesearch-live__map" aria-hidden="true" />;
}

/**
 * 펼친 노선의 본문 — 실시간 차량 + 경유 정류장.
 * 펼칠 때 마운트되므로 접힌 노선은 조회하지 않고, 접으면 언마운트되어 타이머가 정리된다.
 */
function RouteBody({ route, nameOf }: { route: RouteInfo; nameOf: Map<string, string> }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [live, setLive] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetchRouteVehicles(route.routeId).then((snapshot) => {
        if (!alive) return;
        setVehicles(snapshot.vehicles);
        setLive(snapshot.live);
      });
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [route.routeId]);

  // 버스가 있는 정류장 표시는 API 가 준 정류장 이름만 근거로 삼는다.
  const busAt = useMemo(
    () => new Set(vehicles.map((vehicle) => normalize(vehicle.nodeNm)).filter(Boolean)),
    [vehicles],
  );

  return (
    <>
      <section className="routesearch-live" aria-label={`${route.routeNo} 실시간 버스 위치`}>
        <p className="routesearch-live__title" aria-live="polite">
          {live === null
            ? "실시간 버스 위치를 확인하는 중"
            : !live
              ? VEHICLE_FAIL_TEXT
              : vehicles.length === 0
                ? VEHICLE_EMPTY_TEXT
                : `지금 운행 중인 버스 ${vehicles.length}대`}
        </p>
        {live === true && vehicles.length > 0 && (
          <>
            <VehicleMap vehicles={vehicles} />
            <ul className="routesearch-live__list">
              {vehicles.map((vehicle, index) => (
                <li key={`${vehicle.vehicleNo}-${index}`}>
                  <Bus aria-hidden="true" />
                  <span>{vehicleLabel(vehicle, route.stops.length)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {route.stops.length === 0 ? (
        <p className="routesearch__empty">경유 정류장 정보 미확인</p>
      ) : (
        <ol className="routesearch-item__stops">
          {route.stops.map((stopId, index) => {
            const name = nameOf.get(stopId) ?? UNKNOWN_STOP_NAME;
            const here = busAt.has(normalize(name));
            return (
              <li key={`${stopId}-${index}`} className={here ? "routesearch-item__stop--bus" : undefined}>
                <Link
                  to={`/go?board=${encodeURIComponent(stopId)}`}
                  aria-label={`${index + 1}번째 정류장 ${name}${here ? " 지금 버스 있음" : ""}에서 출발해 목적지 고르기`}
                >
                  <i aria-hidden="true">{index + 1}</i>
                  {here ? <Bus aria-hidden="true" /> : <MapPin aria-hidden="true" />}
                  <span>{name}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}

export function RouteSearch() {
  const stops = useStops((state) => state.stops);
  const [routes, setRoutes] = useState<RouteInfo[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadRoutes()
      .then((file) => alive && setRoutes(file.routes))
      .catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, []);

  // 정류장 이름은 stops.json 이 유일한 근거다. routes.json 은 관리번호만 가진다.
  const nameOf = useMemo(() => new Map(stops.map((stop) => [stop.id, stop.name])), [stops]);

  const matches = useMemo(() => {
    const list = routes ?? [];
    const needle = normalize(query);
    if (!needle) return list;
    return list.filter((route) => normalize(route.routeNo).includes(needle));
  }, [routes, query]);

  const toggle = (routeId: string) => setOpenId((current) => (current === routeId ? null : routeId));

  return (
    <section className="routesearch">
      <label className="routesearch__search">
        <Search aria-hidden="true" />
        <span className="sr-only">노선 검색</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="예: 1, 남산3, 동내"
          aria-label="노선 번호 또는 이름으로 검색"
        />
      </label>

      <p className="routesearch__count" aria-live="polite">
        {failed ? "노선 정보를 불러오지 못했어요" : routes === null ? "노선 정보를 불러오는 중" : `노선 ${matches.length}개`}
      </p>

      <div className="routesearch__list">
        {routes !== null && matches.length === 0 && !failed && (
          <p className="routesearch__empty">검색어와 맞는 노선이 없어요. 노선 번호를 다시 확인해 주세요.</p>
        )}

        {matches.map((route) => {
          const zone = villageZoneOf(route.routeNo);
          const open = openId === route.routeId;
          const panelId = `routesearch-panel-${route.routeId}`;
          return (
            <article className={open ? "routesearch-item routesearch-item--open" : "routesearch-item"} key={route.routeId}>
              <button
                type="button"
                className="routesearch-item__head"
                aria-expanded={open}
                aria-controls={panelId}
                aria-label={`${route.routeNo} 노선 경유 정류장 ${open ? "접기" : "펼치기"}`}
                onClick={() => toggle(route.routeId)}
              >
                <span className={zone ? "routesearch-item__badge routesearch-item__badge--village" : "routesearch-item__badge"}>
                  <Bus aria-hidden="true" />
                  {zone ? `마을 · ${zone}` : "시내버스"}
                </span>
                <span className="routesearch-item__copy">
                  <strong>{route.routeNo}</strong>
                  <small>경유 정류장 {route.stops.length}개</small>
                </span>
                <ChevronDown className="routesearch-item__chevron" aria-hidden="true" />
              </button>

              {open && (
                <div className="routesearch-item__body" id={panelId}>
                  <RouteBody route={route} nameOf={nameOf} />
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default RouteSearch;
