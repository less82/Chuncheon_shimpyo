// 노선 그래프 데이터 계약 — routes.json.
// 파이프라인이 노선별 정류장 순서(관리번호)를 생성한다. 마스터 키 = 관리번호.

export interface RouteInfo {
  routeId: string; // 노선 관리 id
  routeNo: string; // 표출 노선번호 (예: "7")
  stops: string[]; // 관리번호를 정류장순서대로 나열
}

export interface RoutesFile {
  generatedAt: string;
  routes: RouteInfo[];
}
