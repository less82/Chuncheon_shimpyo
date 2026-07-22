import type { LatLng } from "../../lib/geo";

export interface PlaceResult extends LatLng {
  name: string;
  displayName: string;
}

const API_ORIGIN = import.meta.env.VITE_GEOCODING_API_ORIGIN || "https://nominatim.openstreetmap.org";

export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const params = new URLSearchParams({
    q: `${query}, 춘천시`,
    format: "jsonv2",
    limit: "3",
    countrycodes: "kr",
    viewbox: "127.45,38.10,128.05,37.65",
    bounded: "1",
    "accept-language": "ko",
  });
  const response = await fetch(`${API_ORIGIN}/search?${params}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("geocoding unavailable");
  const data = await response.json() as Array<{ display_name?: string; lat?: string; lon?: string }>;
  return data.flatMap((place) => {
    const lat = Number(place.lat);
    const lng = Number(place.lon);
    if (!place.display_name || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    return [{ name: query.trim(), displayName: place.display_name, lat, lng }];
  });
}

export function osmEmbedUrl(place: LatLng): string {
  const delta = 0.006;
  const bbox = [place.lng - delta, place.lat - delta, place.lng + delta, place.lat + delta].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&marker=${place.lat},${place.lng}`;
}
