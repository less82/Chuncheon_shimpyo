// 지도 화면 — Leaflet + OpenStreetMap(키 불필요).
// 정류장 마커(그늘 확정=초록/그 외=회색), 위치권한 처리(거부 시 춘천시청),
// 참조 위치의 최근접 정류장 자동선택.

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./MapView.css";
import { useStops } from "../../store/useStops";
import type { Stop } from "../../types/stop";
import { CITY_CENTER } from "../../types/stop";
import { markerColor, MARKER_HEX } from "./markerColor";

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

const baseStyle = (color: "green" | "gray"): L.CircleMarkerOptions => ({
  radius: 9,
  color: "#ffffff",
  weight: 2,
  fillColor: MARKER_HEX[color],
  fillOpacity: 1,
});

const selectedStyle = (color: "green" | "gray"): L.CircleMarkerOptions => ({
  radius: 15,
  color: "#c2410c",
  weight: 4,
  fillColor: MARKER_HEX[color],
  fillOpacity: 1,
});

export default function MapView({ onSelect, selectedId }: Props) {
  const stops = useStops((s) => s.stops);
  const loaded = useStops((s) => s.loaded);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const userMarkerRef = useRef<L.Marker | null>(null);
  const autoSelectedRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // 지도 초기화 + 위치권한 처리 (1회).
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const map = L.map(containerRef.current, {
      center: [CITY_CENTER.lat, CITY_CENTER.lng],
      zoom: 15,
      zoomControl: true,
    });
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap 기여자",
    }).addTo(map);

    const goTo = (lat: number, lng: number, isUser: boolean) => {
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

  // 선택 강조 + 이동.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m, id) => {
      const stop = stops.find((s) => s.id === id);
      const color = stop ? markerColor(stop) : "gray";
      m.setStyle(id === selectedId ? selectedStyle(color) : baseStyle(color));
      if (id === selectedId) {
        m.bringToFront();
        map.panTo(m.getLatLng(), { animate: true });
      }
    });
  }, [selectedId, stops]);

  const locateMe = () => {
    const map = mapRef.current;
    if (!map || !("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      map.setView([lat, lng], 16);
      if (userMarkerRef.current) userMarkerRef.current.setLatLng([lat, lng]);
      const near = useStops.getState().nearest({ lat, lng });
      if (near) onSelectRef.current(near);
    });
  };

  return (
    <div className="mapview">
      <div ref={containerRef} className="mapview__canvas" aria-label="정류장 지도" />
      <button type="button" className="mapview__locate" onClick={locateMe}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
        <span>내 위치</span>
      </button>
    </div>
  );
}
