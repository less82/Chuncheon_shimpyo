// 쉼표 정류장 — B2G "1단계 조사 검토 순서" 공통 타입.
// UI 표기는 "조사 검토 순서"(설계 §3.1). 코드 상 score/rank는 내부 계산 개념.

import type { Stop } from "./stop";

export type PresetKey = "heat" | "senior" | "usage"; // 폭염/고령자/이용량

export interface SurveyWeights {
  demand: number;
  unknown: number;
  poi: number;
}

export const PRESETS: Record<PresetKey, { label: string; w: SurveyWeights; rationale: string }> = {
  heat: {
    label: "폭염 대응형",
    w: { demand: 1, unknown: 1, poi: 0 },
    rationale: "한낮 수요 많고 그늘 정보 부족한 곳 우선 조사",
  },
  senior: {
    label: "고령자 이동지원형",
    w: { demand: 1, unknown: 1, poi: 1 },
    rationale: "병원·경로당·시장 인접 정류장 가중(생활지원시설 인접도 활성)",
  },
  usage: {
    label: "이용량 중심형",
    w: { demand: 1, unknown: 0, poi: 0 },
    rationale: "순수 이용량(한낮 승차) 기준",
  },
};
// ⚠️ POI 항(w.poi)은 senior에서만 >0. heat·usage는 0(설계 §3.1 — 조사 효율 핵심은 수요+미확인도, POI는 선택적 정책 판단).

export interface SurveyRow {
  // 1단계: 수요 실측 보유 정류장만
  stop: Stop;
  rank: number; // 1부터
  score: number; // [0,1] 활성 항 가중합. B2G 보조 표시용("점수" 아님 — UI는 "조사 검토 순서")
  demandMidday: number; // 한낮(hourWindow) 승차 실측 합
  demandQ: number; // 분위수 정규화 [0,1]
  unknownCount: number; // 미확인 시설 수 (0~4)
  unknownRate: number; // unknownCount / 4  [0,1]
  poi: number | null; // 생활지원시설 인접도. 미확보 시 null(항 비활성)
  leadReason: "demand" | "unknown" | "poi"; // 순위를 가장 크게 끈 항(가중치×값 최대). CSV 선정 사유용
}

export interface NoDemandCandidate {
  stop: Stop;
  unknownCount: number;
} // 수요 미확인 그룹(순위 없음)
