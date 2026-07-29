// 실시간 차량 위치 — TAGO 노선별 버스위치 조회(BusLcInfoInqireService).
// 도착정보(arrivals.ts)와 같은 계약을 따른다: 키가 없거나 실패·타임아웃·파싱실패면
// live:false 로 즉시 돌려주고 절대 값을 지어내지 않는다(무한 스피너 금지).

export interface Vehicle {
  vehicleNo: string; // 차량번호 (예: 강원70자1009)
  lat: number; // gpslati
  lng: number; // gpslong
  nodeId: string; // 현재 정류장 TAGO id
  nodeNm: string; // 현재 정류장 이름
  nodeOrd: number; // 노선 내 정류장 순번
  routeNo: string; // 표출 노선번호
}

export interface VehicleSnapshot {
  vehicles: Vehicle[];
  live: boolean;
}

/**
 * 차량위치 API는 도착정보 API보다 훨씬 느리다.
 * 브라우저에서 실측한 응답시간: 도착정보 0.2초, 차량위치 2.0~4.8초.
 * 2.5초로 두면 API가 정상인데도 대부분 실패로 처리돼 화면이 늘 "불러오지 못했어요"가 된다.
 * 무한 대기는 여전히 금지이므로 상한을 8초로 둔다.
 */
export const VEHICLE_TIMEOUT_MS = 8000;

/** 실시간 조회 실패 문구. 배차간격 등 다른 값으로 대체하지 않는다. */
export const VEHICLE_FAIL_TEXT = "실시간 도착정보를 불러오지 못했어요";

/** 실시간은 살아 있는데 운행 차량이 0대인 경우. 실패와 구분해서 쓴다. */
export const VEHICLE_EMPTY_TEXT = "지금 운행 중인 버스가 없어요";

const FAILED: VehicleSnapshot = { vehicles: [], live: false };

function firstTag(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m ? m[1].trim() : null;
}

/** 앱 routeId 를 TAGO 노선 id 로 바꾼다. 이미 CCB 로 시작하면 그대로 쓴다. */
export function tagoRouteId(routeId: string): string {
  const id = routeId.trim();
  return id.startsWith("CCB") ? id : `CCB${id}`;
}

/**
 * TAGO 차량위치 XML 파싱. <item> 블록에서 좌표가 유효한 차량만 남긴다.
 * 좌표가 없거나 숫자가 아니면 추정하지 않고 버린다.
 */
export function parseTagoVehicles(xml: string): Vehicle[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g);
  if (!items) return [];

  const vehicles: Vehicle[] = [];
  for (const block of items) {
    const lat = Number(firstTag(block, "gpslati"));
    const lng = Number(firstTag(block, "gpslong"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat === 0 && lng === 0) continue;

    const ord = Number(firstTag(block, "nodeord"));
    vehicles.push({
      vehicleNo: firstTag(block, "vehicleno") ?? "",
      lat,
      lng,
      nodeId: firstTag(block, "nodeid") ?? "",
      nodeNm: firstTag(block, "nodenm") ?? "",
      nodeOrd: Number.isFinite(ord) ? ord : 0,
      routeNo: firstTag(block, "routenm") ?? "",
    });
  }
  vehicles.sort((a, b) => a.nodeOrd - b.nodeOrd);
  return vehicles;
}

/**
 * 노선 실시간 차량 위치. 키가 없거나 실패/타임아웃(2.5초)/파싱실패면
 * `{ vehicles: [], live: false }` 를 준다. live:true 인데 vehicles 가 비면
 * 실제로 운행 중인 차량이 없는 것이다(두 경우를 화면에서 구분해야 한다).
 */
export async function fetchRouteVehicles(
  routeId: string,
): Promise<VehicleSnapshot> {
  const key = import.meta.env.VITE_TAGO_KEY as string | undefined;
  if (!key || !routeId) return FAILED;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VEHICLE_TIMEOUT_MS);
  try {
    const url =
      "https://apis.data.go.kr/1613000/BusLcInfoInqireService/getRouteAcctoBusLcList" +
      `?serviceKey=${encodeURIComponent(key)}` +
      "&_type=xml&numOfRows=50&cityCode=32010" +
      `&routeId=${encodeURIComponent(tagoRouteId(routeId))}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return FAILED;
    const body = await res.text();
    // 정상 응답인지 확인한다(오류 응답에도 200 이 오는 경우가 있다).
    const code = firstTag(body, "resultCode");
    if (code !== null && code !== "00") return FAILED;
    return { vehicles: parseTagoVehicles(body), live: true };
  } catch {
    return FAILED;
  } finally {
    clearTimeout(timer);
  }
}
