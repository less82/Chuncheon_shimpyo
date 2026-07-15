import { useViewMode } from "../../store/useViewMode";
import CitizenHome from "./CitizenHome";
import ElderHome from "./ElderHome";
import ImportOnLoad from "../share/ImportOnLoad";

// 첫 화면 라우트 — 버전에 따라 어른용/일반 홈을 고른다.
// ImportOnLoad 는 버전과 무관하게(기본값인 어른용 모드에서도) 공유 링크를 처리해야 하므로 여기서 마운트.
export default function CitizenRoot() {
  const mode = useViewMode((s) => s.mode);
  return (
    <>
      <ImportOnLoad />
      {mode === "elder" ? <ElderHome /> : <CitizenHome />}
    </>
  );
}
