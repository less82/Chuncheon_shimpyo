// 쉼표 정류장 — 공유 데이터 계약 (단일 진실).
// 파이프라인(stops.json)과 프론트/대시보드가 모두 이 타입을 따른다.
// 절대 규칙: 근거 없이 status:"no" 를 만들지 않는다. 기본은 항상 unknown.

export type Facility = "yes" | "no" | "unknown";

export type Source =
  | "roadview" // 로드뷰 수동 조사 (최우선)
  | "bench_registry" // 춘천시 벤치 대장
  | "shade_registry" // 폭염대비 그늘막 대장
  | "light_registry" // 가로등 대장
  | "sign_registry" // 버스정보안내단말기(BIT) 현황 (도착안내기)
  | "none"; // 근거 없음 (status는 반드시 unknown)

export interface FacilityInfo {
  status: Facility;
  source: Source;
  capturedAt?: string; // roadview 출처일 때만 "YYYY.MM"
}

export interface Demand {
  byHour: number[]; // 길이 24, 시간대별 승차건수 합
  total: number;
  aggregatedBidirectional: boolean; // 항상 true — 양방향 정류장 합산 기준
  matchedName: string; // 브리지에 사용된 정류장명
}

export interface Stop {
  id: string; // 관리번호 250xxx (마스터 키)
  stopNo: string; // 정류장번호 (물리 표지판 번호)
  name: string;
  lat: number;
  lng: number;
  routes: string[]; // 경유 노선번호
  facilities: {
    shade: FacilityInfo; // 그늘
    seat: FacilityInfo; // 의자
    light: FacilityInfo; // 야간조명
    sign: FacilityInfo; // 도착안내기
  };
  demand?: Demand; // 없으면 = 수요 미확인
  headwayMin?: number; // 배차간격(분) 캐시 — TAGO 도착정보 폴백용
  tagoNodeId?: string; // TAGO 정류소 노드ID — 있으면 실시간 도착정보 조회
}

export interface StopsFile {
  generatedAt: string;
  cityCenter: { lat: number; lng: number };
  stops: Stop[];
}

/** 근거 없는 기본 시설 상태. 모든 신규 시설은 여기서 시작한다. */
export function makeUnknown(): FacilityInfo {
  return { status: "unknown", source: "none" };
}

/** 춘천시청 — 위치권한 거부 시 폴백 좌표. */
export const CITY_CENTER = { lat: 37.8813, lng: 127.73 } as const;
