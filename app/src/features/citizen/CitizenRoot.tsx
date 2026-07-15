import { useViewMode } from "../../store/useViewMode";
import CitizenHome from "./CitizenHome";
import ElderHome from "./ElderHome";

// 첫 화면 라우트 — 버전에 따라 어른용/일반 홈을 고른다.
export default function CitizenRoot() {
  const mode = useViewMode((s) => s.mode);
  return mode === "elder" ? <ElderHome /> : <CitizenHome />;
}
