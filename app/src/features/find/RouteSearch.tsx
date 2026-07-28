import { useEffect, useMemo, useState } from "react";
import { Bus, ChevronDown, MapPin, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { loadRoutes } from "../../lib/loadRoutes";
import { useStops } from "../../store/useStops";
import { villageZoneOf } from "../../data/busContacts";
import type { RouteInfo } from "../../types/route";
import "./RouteSearch.css";

/** 검색 비교용 정규화 — 공백을 지우고 소문자로 맞춘다. */
function normalize(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}

/** 이름을 찾지 못한 정류장에 쓰는 문구. 임의로 지어내지 않는다. */
const UNKNOWN_STOP_NAME = "이름 미확인";

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
                  {route.stops.length === 0 ? (
                    <p className="routesearch__empty">경유 정류장 정보 미확인</p>
                  ) : (
                    <ol className="routesearch-item__stops">
                      {route.stops.map((stopId, index) => {
                        const name = nameOf.get(stopId) ?? UNKNOWN_STOP_NAME;
                        return (
                          <li key={`${stopId}-${index}`}>
                            <Link to={`/go?board=${encodeURIComponent(stopId)}`} aria-label={`${index + 1}번째 정류장 ${name}에서 출발해 목적지 고르기`}>
                              <i aria-hidden="true">{index + 1}</i>
                              <MapPin aria-hidden="true" />
                              <span>{name}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ol>
                  )}
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
