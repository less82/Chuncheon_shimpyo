import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Stop } from "../../types/stop";
import { ACCENT_HEX, createVoyagerLayer, dotStyle } from "../map/leafletBase";

export default function QrStopMap({ stop }: { stop: Stop }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, {
      center: [stop.lat, stop.lng],
      zoom: 18,
      zoomControl: false,
      attributionControl: false,
    });
    createVoyagerLayer(false).addTo(map);
    L.circleMarker([stop.lat, stop.lng], dotStyle(ACCENT_HEX, 10)).addTo(map);
    return () => {
      map.remove();
    };
  }, [stop]);

  return <div ref={containerRef} className="qrmain__map" aria-label={`${stop.name} 정류장 지도`} />;
}
