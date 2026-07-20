// 보호자 대리등록 수신부.
// 앱 로드 시 URL 의 ?fav= 파라미터를 화이트리스트 필터로 검증해 즐겨찾기에 병합하고,
// 큰 즐겨찾기 화면으로 안내한다. 파라미터는 처리 후 주소창에서 제거한다.

import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useStops } from "../../store/useStops";
import { useFavorites } from "../../store/useFavorites";
import { parseShareParam } from "./shareLink";

export default function ImportOnLoad() {
  const stops = useStops((s) => s.stops);
  const loaded = useStops((s) => s.loaded);
  const addMany = useFavorites((s) => s.addMany);
  const navigate = useNavigate();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || !loaded) return;
    const search = window.location.search;
    if (!search.includes("fav=")) {
      done.current = true;
      return;
    }
    const validIds = stops.map((s) => s.id);
    const incoming = parseShareParam(search, validIds);
    done.current = true;
    if (incoming.length === 0) return;

    addMany(incoming);
    const importedNames = incoming
      .map((id) => stops.find((s) => s.id === id)?.name)
      .filter((n): n is string => Boolean(n));
    // 처리한 파라미터 제거 후 큰 즐겨찾기 화면으로 이동 + 등록된 정류장명 전달(확인 배너용).
    navigate("/favorites", { replace: true, state: { importedNames } });
  }, [loaded, stops, addMany, navigate]);

  return null;
}
