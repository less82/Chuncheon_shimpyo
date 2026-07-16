// 근거 카드 — TOP N 행 클릭 시 후보 사유를 한 장으로 보여준다.
// 승차 순위·시설 미비 내역·로드뷰 캡처 자리. 합성 점수는 표시하지 않는다.

import FacilityBadge from "../../components/FacilityBadge";
import { KIND_LABEL, type FacilityKind } from "../../lib/facilityText";
import { middayBoarding, type FilterCriteria } from "./filters";
import { LEAD_REASON_LABEL } from "./exportCsv";
import type { Stop } from "../../types/stop";
import type { InstallRow, SurveyRow } from "../../types/priority";
import "./EvidenceCard.css";

interface Props {
  stop: Stop;
  criteria: FilterCriteria;
  /** 한낮 승차 순위(전체 demand 모집단 중). demand 없으면 null. */
  rank: number | null;
  population: number;
  evidence: string;
  onClose: () => void;
  /** 1단계 "조사 검토 순서"에서 선택된 경우 — 산식 항별 분해를 함께 보여준다. */
  surveyRow?: SurveyRow;
  /** 2단계 "설치 검토 우선순위"에서 선택된 경우. */
  installRow?: InstallRow;
}

const KINDS: FacilityKind[] = ["shade", "seat", "light", "sign"];

export default function EvidenceCard({
  stop,
  rank,
  population,
  evidence,
  onClose,
  surveyRow,
  installRow,
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

        {/* 승차 순위 (실측) — 2단계 설치 검토(installRow)에서는 이 카드에 별도
            "설치 검토 근거" 섹션이 실측 승차를 보여주므로, 여기서 "미확인"을
            중복 표시하면 한 카드 안에서 미확인과 실측이 동시에 나타나
            정직성 규칙에 위배된다. installRow가 있을 때는 이 섹션을 숨긴다. */}
        {!installRow && (
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
        )}

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

        {/* 1단계 조사 검토 순서 — 산식 + 항별 분해 */}
        {surveyRow && (
          <section className="ev-block">
            <h3 className="ev-h3">조사 검토 지수 산식</h3>
            <p className="ev-formula">
              지수 = ( 가중치×수요분위수 + 가중치×미확인비율 [+ 가중치×인접도] ) / Σ가중치
            </p>
            <ul className="ev-breakdown">
              <li>
                한낮 승차(실측) <strong>{surveyRow.demandMidday.toLocaleString()}건</strong> →
                수요 분위수 정규화 <strong>{surveyRow.demandQ.toFixed(2)}</strong>
              </li>
              <li>
                미확인 시설 <strong>{surveyRow.unknownCount}종</strong>(4종 중) → 미확인비율
                정규화 <strong>{surveyRow.unknownRate.toFixed(2)}</strong>
              </li>
              {surveyRow.poi !== null && (
                <li>
                  생활지원시설 인접도 정규화 <strong>{surveyRow.poi.toFixed(2)}</strong>
                </li>
              )}
            </ul>
            <p className="ev-lead">
              선정 사유: <strong>{LEAD_REASON_LABEL[surveyRow.leadReason]}</strong>
            </p>
          </section>
        )}

        {/* 2단계 설치 검토 우선순위 */}
        {installRow && (
          <section className="ev-block">
            <h3 className="ev-h3">설치 검토 근거</h3>
            <ul className="ev-breakdown">
              <li>
                시설 <strong>{KIND_LABEL[installRow.facility]}</strong>
              </li>
              <li>
                한낮 승차(실측){" "}
                {installRow.demandMidday !== null ? (
                  <strong>{installRow.demandMidday.toLocaleString()}건</strong>
                ) : (
                  <span className="ev-muted">수요 미확인</span>
                )}
              </li>
              {installRow.poi !== null && (
                <li>
                  생활지원시설 인접도 <strong>{installRow.poi.toFixed(2)}</strong>
                </li>
              )}
            </ul>
          </section>
        )}

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
