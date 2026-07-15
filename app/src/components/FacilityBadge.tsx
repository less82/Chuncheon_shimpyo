// 시설 3상태 배지 — 전 화면 공통.
// 접근성: 색만으로 구분하지 않는다. [시설 아이콘 + 한글] + [상태 아이콘 + 한글] + 출처.

import type { FacilityInfo } from "../types/stop";
import {
  facilityLabel,
  sourceBadge,
  statusColor,
  KIND_LABEL,
  type FacilityKind,
} from "../lib/facilityText";
import "./FacilityBadge.css";

interface Props {
  kind: FacilityKind;
  info: FacilityInfo;
  /** true면 출처 배지를 숨긴다(초대형 요약 목록 등). */
  hideSource?: boolean;
}

// ---- 시설 종류 아이콘 (인라인 SVG, currentColor) ----
function KindIcon({ kind }: { kind: FacilityKind }) {
  const common = {
    width: 26,
    height: 26,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (kind) {
    case "shade": // 파라솔(그늘)
      return (
        <svg {...common}>
          <path d="M12 3v18" />
          <path d="M3 11a9 9 0 0 1 18 0z" />
          <path d="M12 21a2.2 2.2 0 0 0 3-2" />
        </svg>
      );
    case "seat": // 벤치(의자)
      return (
        <svg {...common}>
          <path d="M3 10h18" />
          <path d="M4 10V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2" />
          <path d="M4 14h16" />
          <path d="M6 14v4M18 14v4" />
        </svg>
      );
    case "light": // 야간조명(전구)
      return (
        <svg {...common}>
          <path d="M9 18h6" />
          <path d="M10 21h4" />
          <path d="M12 3a6 6 0 0 1 4 10.5c-.6.6-1 1.3-1 2.1H9c0-.8-.4-1.5-1-2.1A6 6 0 0 1 12 3z" />
        </svg>
      );
    case "sign": // 도착안내 전광판
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d="M7 9h6M7 12h4" />
          <path d="M12 16v4M8 20h8" />
        </svg>
      );
  }
}

// ---- 상태 아이콘 (색 비의존 보조) ----
function StatusIcon({ color }: { color: "green" | "red" | "gray" }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (color === "green")
    return (
      <svg {...common}>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    ); // 체크(있음)
  if (color === "red")
    return (
      <svg {...common}>
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    ); // 엑스(없음)
  return (
    <svg {...common}>
      <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4" />
      <path d="M12 17h.01" />
    </svg>
  ); // 물음표(미확인)
}

export default function FacilityBadge({ kind, info, hideSource }: Props) {
  const color = statusColor(info.status);
  const statusLabel = facilityLabel(info);
  const source = sourceBadge(info);
  const kindLabel = KIND_LABEL[kind];

  return (
    <div
      className="fbadge"
      data-color={color}
      role="group"
      aria-label={`${kindLabel} ${statusLabel}${source ? `, ${source}` : ""}`}
    >
      <div className="fbadge__kind">
        <KindIcon kind={kind} />
        <span className="fbadge__kind-label">{kindLabel}</span>
      </div>
      <div className="fbadge__status">
        <StatusIcon color={color} />
        <span className="fbadge__status-label">{statusLabel}</span>
      </div>
      {!hideSource && source && <div className="fbadge__source">{source}</div>}
    </div>
  );
}
