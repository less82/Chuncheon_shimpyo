// 목적지 길찾기 결과 계약. planTrip 이 생성, TripView 가 소비.

export interface TripLeg {
  routeNos: string[]; // 이 구간을 함께 태울 수 있는 노선번호들
  boardStopId: string; // 승차 정류장(관리번호)
  alightStopId: string; // 하차 정류장(관리번호)
}

export interface TripOption {
  boardStopId: string; // 최초 승차 정류장 = 걸어갈 정류장
  walkMin: number; // 현위치 → boardStop 도보(분)
  walkReal: boolean; // 도보시간 실측 여부(현재는 직선 기준 false)
  legs: TripLeg[]; // 1개=직행, 2개=1환승
  transferStopId?: string; // 환승 정류장(관리번호) — legs 2개일 때만
  directBus: boolean; // 직행(환승 없음) 여부
}
