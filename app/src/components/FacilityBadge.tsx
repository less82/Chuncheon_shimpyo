// 시설 3상태 배지 — 전 화면 공통.
// 접근성: 색만으로 구분하지 않는다. [시설 아이콘 + 한글] + [상태 아이콘 + 한글] + 출처.

import type { FacilityInfo } from "../types/stop";
import { Armchair, Check, CircleHelp, LampDesk, Monitor, Umbrella, X } from "lucide-react";
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

function KindIcon({ kind }: { kind: FacilityKind }) {
  const Icon = { shade: Umbrella, seat: Armchair, light: LampDesk, sign: Monitor }[kind];
  return <Icon width={26} height={26} strokeWidth={2} aria-hidden="true" />;
}

// ---- 상태 아이콘 (색 비의존 보조) ----
function StatusIcon({ color }: { color: "green" | "red" | "gray" }) {
  const Icon = color === "green" ? Check : color === "red" ? X : CircleHelp;
  return <Icon width={20} height={20} strokeWidth={2.6} aria-hidden="true" />;
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
