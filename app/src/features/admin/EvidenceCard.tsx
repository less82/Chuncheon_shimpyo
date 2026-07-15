// 근거 카드 — TOP N 행 클릭 시 후보 사유를 한 장으로 보여준다.
// 승차 순위·시설 미비 내역·로드뷰 캡처 자리. 합성 점수는 표시하지 않는다.

import FacilityBadge from "../../components/FacilityBadge";
import { KIND_LABEL, type FacilityKind } from "../../lib/facilityText";
import { middayBoarding, type FilterCriteria } from "./filters";
import type { Stop } from "../../types/stop";
import "./EvidenceCard.css";

interface Props {
  stop: Stop;
  criteria: FilterCriteria;
  /** 한낮 승차 순위(전체 demand 모집단 중). demand 없으면 null. */
  rank: number | null;
  population: number;
  evidence: string;
  onClose: () => void;
}

const KINDS: FacilityKind[] = ["shade", "seat", "light", "sign"];

export default function EvidenceCard({
  stop,
  rank,
  population,
  evidence,
  onClose,
}: Props) {
  const midday = middayBoarding(stop);
  // 확인되지 않았거나(미확인) 없는(없음) 시설 = 설치 검토 대상.
  const missing = KINDS.filter(
    (k) => stop.facilities[k].status !== "yes",
  );

  return (
    <div
      className="ev-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${stop.name} 후보 근거`}
      onClick={onClose}
    >
      <div className="ev-card" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="ev-close"
          aria-label="닫기"
          onClick={onClose}
        >
          ✕
        </button>

        <header className="ev-head">
          <h2 className="ev-name">{stop.name}</h2>
          <span className="ev-id">정류장 ID {stop.id}</span>
        </header>

        {/* 승차 순위 (실측) */}
        <section className="ev-block">
          <h3 className="ev-h3">한낮 승차 순위</h3>
          {rank !== null && midday !== null ? (
            <p className="ev-rank">
              한낮(11~16시) 승차{" "}
              <strong>{population.toLocaleString()}개</strong> 정류장 중{" "}
              <strong className="ev-rank-num">{rank}위</strong>
              <span className="ev-rank-count">
                {midday.toLocaleString()}회 · 양방향 합산 기준
              </span>
            </p>
          ) : (
            <p className="ev-rank ev-muted">
              승차 데이터 미확인 (양방향 합산 자료 없음)
            </p>
          )}
        </section>

        {/* 시설 미비 내역 */}
        <section className="ev-block">
          <h3 className="ev-h3">시설 미비 내역</h3>
          {missing.length === 0 ? (
            <p className="ev-muted">네 시설 모두 확인됨(있음).</p>
          ) : (
            <>
              <p className="ev-missing-note">
                아직 <strong>있음</strong>으로 확인되지 않은 시설
                {missing.length}종 — 설치·조사 검토 대상:
              </p>
              <div className="ev-badges">
                {missing.map((k) => (
                  <FacilityBadge key={k} kind={k} info={stop.facilities[k]} />
                ))}
              </div>
              <p className="ev-hint">
                {missing.map((k) => KIND_LABEL[k]).join(" · ")} — “미확인”은
                없음이 아니라 아직 조사되지 않았음을 뜻합니다.
              </p>
            </>
          )}
        </section>

        {/* 근거 요약 */}
        <section className="ev-block">
          <h3 className="ev-h3">후보 사유 (조건)</h3>
          <p className="ev-evidence">{evidence}</p>
        </section>

        {/* 로드뷰 캡처 자리 */}
        <section className="ev-block">
          <h3 className="ev-h3">현장 로드뷰</h3>
          <div className="ev-roadview" aria-label="로드뷰 캡처 자리">
            <span>로드뷰 캡처 자리</span>
            <small>
              위경도 {stop.lat.toFixed(5)}, {stop.lng.toFixed(5)}
            </small>
          </div>
        </section>
      </div>
    </div>
  );
}
