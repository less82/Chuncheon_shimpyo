// 지도 화면 — Leaflet + OpenStreetMap(키 불필요).
// 정류장 마커(그늘 확정=초록/그 외=회색), 위치권한 처리(거부 시 춘천시청),
// 참조 위치의 최근접 정류장 자동선택.

import { useEffect, useMemo, useRef, useState } from "react";
import { LocateFixed } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./MapView.css";
import { useStops } from "../../store/useStops";
import type { Stop } from "../../types/stop";
import { CITY_CENTER } from "../../types/stop";
import { markerColor, MARKER_HEX, DIM_OPACITY } from "./markerColor";
import FacilityFilter from "./FacilityFilterBar";
import { filterStopsByFacility, type FacilityFilterState } from "./facilityFilter";
import { WalkLayer } from "./WalkLayer";
import { getWalkRoute, straightWalk, type Point } from "../../lib/walking";

// Leaflet 기본 마커 아이콘 경로 이슈 방어(번들러 환경). 우리는 circleMarker 를
// 쓰지만 어떤 기본 마커가 생겨도 깨지지 않도록 URL 을 명시한다.
import iconRetina from "leaflet/dist/images/marker-icon-2x.png";
import icon from "leaflet/dist/images/marker-icon.png";
import shadow from "leaflet/dist/images/marker-shadow.png";
L.Icon.Default.mergeOptions({
  iconRetinaUrl: iconRetina,
  iconUrl: icon,
  shadowUrl: shadow,
});

interface Props {
  onSelect: (stop: Stop) => void;
  selectedId?: string;
}

const baseStyle = (
  color: "green" | "gray",
  dimmed = false,
): L.CircleMarkerOptions => ({
  radius: dimmed ? 7 : 9,
  color: "#ffffff",
  weight: 2,
  fillColor: MARKER_HEX[color],
  fillOpacity: dimmed ? DIM_OPACITY : 1,
  opacity: dimmed ? DIM_OPACITY : 1,
});

const selectedStyle = (color: "green" | "gray"): L.CircleMarkerOptions => ({
  radius: 15,
  color: "#26344a",
  weight: 4,
  fillColor: MARKER_HEX[color],
  fillOpacity: 1,
  opacity: 1,
});

export default function MapView({ onSelect, selectedId }: Props) {
  const stops = useStops((s) => s.stops);
  const loaded = useStops((s) => s.loaded);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const userMarkerRef = useRef<L.Marker | null>(null);
  const autoSelectedRef = useRef(false);
  const userPosRef = useRef<Point | null>(null);
  const walkLayerRef = useRef<WalkLayer | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // 시설 필터 상태 — 켜진 시설이 "있음"인 정류장만 강조(미확인·없음 제외).
  const [active, setActive] = useState<FacilityFilterState>({
    shade: false,
    seat: false,
    light: false,
  });
  const anyFilter = active.shade || active.seat || active.light;
  const matchSet = useMemo(
    () => filterStopsByFacility(stops, active),
    [stops, active],
  );

  // 지도 초기화 + 위치권한 처리 (1회).
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const map = L.map(containerRef.current, {
      center: [CITY_CENTER.lat, CITY_CENTER.lng],
      zoom: 15,
      zoomControl: false,
    });
    mapRef.current = map;
    walkLayerRef.current = new WalkLayer(map);

    // CARTO Voyager — 키 불필요, 도로·라벨 대비가 높아 고령자 가독성이 좋다.
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      {
        maxZoom: 20,
        subdomains: "abcd",
        detectRetina: true,
        attribution: "© OpenStreetMap 기여자 · © CARTO",
      },
    ).addTo(map);

    const goTo = (lat: number, lng: number, isUser: boolean) => {
      // 도보 경로 출발점(현위치, 거부 시 춘천시청 폴백).
      userPosRef.current = isUser ? { lat, lng } : null;
      map.setView([lat, lng], isUser ? 16 : 15);
      if (isUser) {
        const userIcon = L.divIcon({
          className: "user-dot",
          html: '<span class="user-dot__pulse"></span><span class="user-dot__core"></span>',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        userMarkerRef.current = L.marker([lat, lng], {
          icon: userIcon,
          keyboard: false,
          zIndexOffset: 1000,
        }).addTo(map);
      }
      // 참조 위치의 최근접 정류장 자동선택(1회).
      if (!autoSelectedRef.current) {
        const near = useStops.getState().nearest({ lat, lng });
        if (near) {
          autoSelectedRef.current = true;
          onSelectRef.current(near);
        }
      }
    };

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => goTo(pos.coords.latitude, pos.coords.longitude, true),
        () => goTo(CITY_CENTER.lat, CITY_CENTER.lng, false),
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 },
      );
    } else {
      goTo(CITY_CENTER.lat, CITY_CENTER.lng, false);
    }

    return () => {
      map.remove();
      mapRef.current = null;
      walkLayerRef.current = null;
      markersRef.current.clear();
      userMarkerRef.current = null;
    };
  }, []);

  // 정류장 마커 렌더(데이터 로드 시).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || stops.length === 0) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current.clear();

    for (const stop of stops) {
      const color = markerColor(stop);
      const m = L.circleMarker([stop.lat, stop.lng], baseStyle(color));
      m.on("click", () => onSelectRef.current(stop));
      m.bindTooltip(stop.name, { direction: "top", offset: [0, -6] });
      m.addTo(map);
      markersRef.current.set(stop.id, m);
    }

    // 스토어는 loaded 됐지만 자동선택이 아직이면(위치 콜백보다 데이터가 늦은 경우)
    // 지도 중심 기준 최근접을 선택한다.
    if (!autoSelectedRef.current && loaded) {
      const c = map.getCenter();
      const near = useStops.getState().nearest({ lat: c.lat, lng: c.lng });
      if (near) {
        autoSelectedRef.current = true;
        onSelectRef.current(near);
      }
    }
  }, [stops, loaded]);

  // 선택 강조 + 시설 필터 흐리기 + 이동.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m, id) => {
      const stop = stops.find((s) => s.id === id);
      const color = stop ? markerColor(stop) : "gray";
      const dimmed = anyFilter && !matchSet.has(id);
      m.setStyle(
        id === selectedId ? selectedStyle(color) : baseStyle(color, dimmed),
      );
      if (id === selectedId) {
        m.bringToFront();
        map.panTo(m.getLatLng(), { animate: true });
      }
    });
  }, [selectedId, stops, matchSet, anyFilter]);

  // 선택 정류장에 대한 도보 경로선: 직선 폴백 즉시 → 실경로로 갱신(스피너 없음).
  useEffect(() => {
    const layer = walkLayerRef.current;
    const from = userPosRef.current;
    if (!layer) return;
    if (!selectedId || !from) {
      layer.clear();
      return;
    }
    const stop = stops.find((s) => s.id === selectedId);
    if (!stop) {
      layer.clear();
      return;
    }
    const to: Point = { lat: stop.lat, lng: stop.lng };
    // 즉시 직선 폴백 표시.
    const fb = straightWalk(from, to);
    layer.draw(fb.polyline, fb.real);
    // 실경로 시도(성공 시 갱신).
    let alive = true;
    getWalkRoute(from, to).then((r) => {
      if (alive && walkLayerRef.current === layer) {
        layer.draw(r.polyline, r.real);
      }
    });
    return () => {
      alive = false;
    };
  }, [selectedId, stops]);

  const locateMe = () => {
    const map = mapRef.current;
    if (!map || !("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      userPosRef.current = { lat, lng };
      map.setView([lat, lng], 16);
      if (userMarkerRef.current) userMarkerRef.current.setLatLng([lat, lng]);
      const near = useStops.getState().nearest({ lat, lng });
      if (near) onSelectRef.current(near);
    });
  };

  return (
    <div className="mapview">
      <div ref={containerRef} className="mapview__canvas" aria-label="정류장 지도" />
      <FacilityFilter active={active} onChange={setActive} />
      <button type="button" className="mapview__locate" onClick={locateMe}>
        <LocateFixed aria-hidden="true" />
        <span>내 위치</span>
      </button>
    </div>
  );
}
