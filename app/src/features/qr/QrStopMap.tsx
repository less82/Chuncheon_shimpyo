import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Stop } from "../../types/stop";

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
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      maxZoom: 20,
      subdomains: "abcd",
      detectRetina: true,
    }).addTo(map);
    L.circleMarker([stop.lat, stop.lng], {
      radius: 10,
      color: "#fff",
      weight: 3,
      fillColor: "#26344a",
      fillOpacity: 1,
    }).addTo(map);
    return () => {
      map.remove();
    };
  }, [stop]);

  return <div ref={containerRef} className="qrmain__map" aria-label={`${stop.name} 정류장 지도`} />;
}
