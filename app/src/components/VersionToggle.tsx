import { useViewMode } from "../store/useViewMode";
import "./VersionToggle.css";

// 버전 전환 버튼. 어른용일 때 "일반"으로, 일반일 때 "큰글씨"로 바꾼다.
export default function VersionToggle() {
  const mode = useViewMode((s) => s.mode);
  const toggle = useViewMode((s) => s.toggle);
  const toElder = mode === "normal";
  return (
    <button
      type="button"
      className="vtoggle"
      onClick={toggle}
      aria-label={toElder ? "큰 글씨 화면으로 바꾸기" : "일반 화면으로 바꾸기"}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M3 6h18M5 6v12M9 6v3M14 18l4-9 4 9M15.5 15h5" />
      </svg>
      {toElder ? "큰글씨" : "일반"}
    </button>
  );
}
