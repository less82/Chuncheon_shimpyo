// 시설 필터 칩 — 그늘/의자/조명 큰 토글. 켜면 해당 시설이 "있음"인
// 정류장만 지도에서 강조된다(미확인·없음은 제외). 아이콘+한글 병기.

import type { ReactElement } from "react";
import type { FacilityFilterState } from "./facilityFilter";
import "./FacilityFilter.css";

interface Props {
  active: FacilityFilterState;
  onChange: (next: FacilityFilterState) => void;
}

type Key = keyof FacilityFilterState;

const CHIPS: { key: Key; label: string; icon: ReactElement }[] = [
  {
    key: "shade",
    label: "그늘",
    icon: (
      <path d="M12 3a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7zM12 10v11M8 21h8" />
    ),
  },
  {
    key: "seat",
    label: "의자",
    icon: <path d="M5 11V5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v6h8V5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v6M4 11h16v3H4zM6 14v6M18 14v6" />,
  },
  {
    key: "light",
    label: "조명",
    icon: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.4 1 2.5h6c0-1.1.4-1.9 1-2.5A6 6 0 0 0 12 3z" />,
  },
];

export default function FacilityFilter({ active, onChange }: Props) {
  const toggle = (key: Key) =>
    onChange({ ...active, [key]: !active[key] });

  return (
    <div className="facfilter" role="group" aria-label="시설로 정류장 강조">
      {CHIPS.map(({ key, label, icon }) => {
        const on = active[key];
        return (
          <button
            key={key}
            type="button"
            className="facfilter__chip"
            aria-pressed={on}
            onClick={() => toggle(key)}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {icon}
            </svg>
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
