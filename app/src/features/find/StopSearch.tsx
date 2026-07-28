// 정류장 검색 — 찾기 허브(/find)의 "정류장" 탭 조각.
// 이름 또는 4자리 정류장번호로 찾고, 같은 화면 안에서 상세를 펼친다(별도 라우트 없음).
// 시설은 있음/없음/미확인 3상태를 그대로 보여준다. 근거 없는 "없음"을 만들지 않는다.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BusFront, MapPin, MessageCircle, Navigation, Search } from "lucide-react";
import FacilityBadge from "../../components/FacilityBadge";
import { useStops } from "../../store/useStops";
import type { Stop } from "../../types/stop";
import "./StopSearch.css";

const MAX_RESULTS = 20;

/** 검색 비교용 정규화 — 공백 무시, 대소문자 무시. */
function normalize(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}

/** 이름 또는 정류장번호(stopNo)로 거른 결과. 최대 20개. */
export function searchStops(stops: Stop[], query: string): Stop[] {
  const needle = normalize(query);
  if (!needle) return [];
  return stops
    .filter((stop) => normalize(stop.name).includes(needle) || stop.stopNo.includes(needle))
    .slice(0, MAX_RESULTS);
}

export function StopSearch() {
  const stops = useStops((state) => state.stops);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const matches = useMemo(() => searchStops(stops, query), [stops, query]);
  const needle = normalize(query);

  const toggle = (id: string) => setOpenId((current) => (current === id ? null : id));

  return (
    <div className="stopsearch">
      <label className="stopsearch__search">
        <Search aria-hidden="true" />
        <span className="sr-only">정류장 검색</span>
        <input
          value={query}
          onChange={(event) => { setQuery(event.target.value); setOpenId(null); }}
          placeholder="예: 춘천역 또는 1001"
          aria-label="정류장 이름 또는 정류장번호 검색"
        />
      </label>

      <div className="stopsearch__list" aria-live="polite">
        {!needle && (
          <p className="stopsearch__hint">정류장 이름이나 표지판의 4자리 번호를 입력하세요.</p>
        )}
        {needle && matches.length === 0 && (
          <p className="stopsearch__hint">찾는 정류장이 없어요. 이름의 일부만 입력해 보세요.</p>
        )}
        {matches.map((stop) => {
          const open = openId === stop.id;
          return (
            <article className="stopsearch__item" key={stop.id}>
              <button
                type="button"
                className="stopsearch__row"
                aria-expanded={open}
                onClick={() => toggle(stop.id)}
              >
                <MapPin aria-hidden="true" />
                <span className="stopsearch__row-copy">
                  <strong>{stop.name}</strong>
                  <small>
                    {stop.stopNo ? `정류장 ${stop.stopNo}` : "정류장 번호 미확인"} · 경유 노선 {stop.routes.length}개
                  </small>
                </span>
              </button>

              {open && (
                <div className="stopsearch__detail">
                  <dl className="stopsearch__facts">
                    <div><dt>정류장명</dt><dd>{stop.name}</dd></div>
                    <div><dt>정류장번호</dt><dd>{stop.stopNo || "미확인"}</dd></div>
                    <div><dt>관리번호</dt><dd>{stop.id}</dd></div>
                  </dl>

                  <h3 className="stopsearch__subtitle">정류장 시설</h3>
                  <div className="stopsearch__facilities">
                    <FacilityBadge kind="shade" info={stop.facilities.shade} />
                    <FacilityBadge kind="seat" info={stop.facilities.seat} />
                    <FacilityBadge kind="light" info={stop.facilities.light} />
                    <FacilityBadge kind="sign" info={stop.facilities.sign} />
                  </div>

                  <h3 className="stopsearch__subtitle">경유 노선</h3>
                  {stop.routes.length > 0 ? (
                    <ul className="stopsearch__routes" aria-label={`${stop.name} 경유 노선`}>
                      {stop.routes.map((route) => <li key={route}>{route}</li>)}
                    </ul>
                  ) : (
                    <p className="stopsearch__hint">경유 노선 정보가 미확인입니다.</p>
                  )}

                  <div className="stopsearch__actions">
                    <Link
                      className="stopsearch__action stopsearch__action--primary"
                      to={`/go?board=${encodeURIComponent(stop.id)}`}
                      aria-label={`${stop.name}에서 출발해 목적지 고르기`}
                    >
                      <BusFront aria-hidden="true" />이 정류장에서 출발하기
                    </Link>
                    <Link
                      className="stopsearch__action"
                      to={`/app/report?stop=${stop.id}`}
                      aria-label={`${stop.name} 상태 알리기`}
                    >
                      <MessageCircle aria-hidden="true" />이 정류장 상태 알리기
                    </Link>
                  </div>
                </div>
              )}
            </article>
          );
        })}
        {needle && matches.length === MAX_RESULTS && (
          <p className="stopsearch__hint"><Navigation aria-hidden="true" />검색어를 더 입력하면 결과를 좁힐 수 있어요.</p>
        )}
      </div>
    </div>
  );
}
