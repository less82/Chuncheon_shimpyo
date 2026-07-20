// 1단계 "조사 검토 순서" 프리셋 바 — 폭염/고령자/이용량 3버튼 + 근거(rationale) + 가중치 슬라이더(보조).
// 규칙: 버튼은 정책 프리셋(사전 정의 가중치 조합)일 뿐 별도 로직 아님. 슬라이더는 직접 조정용 보조 도구.

import { PRESETS, type PresetKey, type SurveyWeights } from "../../types/priority";
import "./PresetBar.css";

interface Props {
  activeKey: PresetKey | null;
  weights: SurveyWeights;
  onSelectPreset: (key: PresetKey) => void;
  onChangeWeights: (w: SurveyWeights) => void;
}

const PRESET_ORDER: PresetKey[] = ["heat", "senior", "usage"];

const WEIGHT_LABEL: Record<keyof SurveyWeights, string> = {
  demand: "한낮 수요 가중치",
  unknown: "미확인 시설 가중치",
  poi: "생활지원시설 인접도 가중치",
};

export default function PresetBar({
  activeKey,
  weights,
  onSelectPreset,
  onChangeWeights,
}: Props) {
  return (
    <div className="presetbar" aria-label="조사 우선순위 프리셋">
      <div className="presetbar-buttons" role="group" aria-label="프리셋 선택">
        {PRESET_ORDER.map((key) => (
          <button
            key={key}
            type="button"
            className="presetbar-btn"
            aria-pressed={activeKey === key}
            onClick={() => onSelectPreset(key)}
          >
            {PRESETS[key].label}
          </button>
        ))}
      </div>

      {activeKey && (
        <p className="presetbar-rationale">{PRESETS[activeKey].rationale}</p>
      )}

      <details className="presetbar-adjust">
        <summary>가중치 직접 조정 (보조)</summary>
        <div className="presetbar-sliders">
          {(Object.keys(weights) as Array<keyof SurveyWeights>).map((k) => (
            <label key={k} className="presetbar-slider">
              <span>{WEIGHT_LABEL[k]}</span>
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={weights[k]}
                aria-label={WEIGHT_LABEL[k]}
                onChange={(e) =>
                  onChangeWeights({ ...weights, [k]: Number(e.target.value) })
                }
              />
              <span className="presetbar-slider-val">{weights[k].toFixed(1)}</span>
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}
