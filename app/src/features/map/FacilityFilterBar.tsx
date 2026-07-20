// 시설 필터 칩 — 그늘/의자/조명 큰 토글. 켜면 해당 시설이 "있음"인
// 정류장만 지도에서 강조된다(미확인·없음은 제외). 아이콘+한글 병기.

import { Armchair, LampDesk, Umbrella } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { FacilityFilterState } from "./facilityFilter";
import "./FacilityFilter.css";

interface Props {
  active: FacilityFilterState;
  onChange: (next: FacilityFilterState) => void;
}

type Key = keyof FacilityFilterState;

const CHIPS: { key: Key; label: string; Icon: LucideIcon }[] = [
  { key: "shade", label: "그늘", Icon: Umbrella },
  { key: "seat", label: "의자", Icon: Armchair },
  { key: "light", label: "조명", Icon: LampDesk },
];

export default function FacilityFilter({ active, onChange }: Props) {
  const toggle = (key: Key) =>
    onChange({ ...active, [key]: !active[key] });

  return (
    <div className="facfilter" role="group" aria-label="시설로 정류장 강조">
      {CHIPS.map(({ key, label, Icon }) => {
        const on = active[key];
        return (
          <button
            key={key}
            type="button"
            className="facfilter__chip"
            aria-pressed={on}
            onClick={() => toggle(key)}
          >
            <Icon width={24} height={24} aria-hidden="true" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
