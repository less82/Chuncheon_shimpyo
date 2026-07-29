// 지도 공용 베이스 — 타일 레이어와 마커 스타일을 한 벌만 둔다.
// 이전에는 MapView / QrStopMap / RouteSearch 가 같은 타일 URL 과 마커 값을
// 따로 적어 두어 화면마다 조금씩 달라졌다. 여기 한 곳만 고치면 전부 따라온다.

import L from "leaflet";

/** CARTO Voyager — 키 불필요, 도로·라벨 대비가 높아 고령자 가독성이 좋다. */
const TILE_URL = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

/** 출처 표기 문구. attributionControl 을 켠 지도에서만 실제로 보인다. */
export const TILE_ATTRIBUTION = "© OpenStreetMap 기여자 · © CARTO";

/**
 * 공용 타일 레이어. `attribution` 을 넘길지는 지도가 표기 컨트롤을 켰는지로 정한다.
 * 컨트롤을 끈 지도에 문구만 넘기면 아무 데도 표시되지 않아 죽은 값이 되므로 넘기지 않는다.
 */
export function createVoyagerLayer(showAttribution: boolean): L.TileLayer {
  return L.tileLayer(TILE_URL, {
    maxZoom: 20,
    subdomains: "abcd",
    detectRetina: true,
    ...(showAttribution ? { attribution: TILE_ATTRIBUTION } : {}),
  });
}

/** 지도 위 점(정류장·차량) 공통 스타일. 색만 화면별로 다르다. */
export function dotStyle(fillColor: string, radius = 9): L.CircleMarkerOptions {
  return { radius, color: "#ffffff", weight: 2, fillColor, fillOpacity: 1 };
}

/** 강조색(선택된 정류장 테두리, 차량 점). */
export const ACCENT_HEX = "#00a3e0";
