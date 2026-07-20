// 즐겨찾기 별 토글 — 큰 터치타깃(≥48px), 상태를 색+채움+라벨로 표현.

import { useFavorites } from "../store/useFavorites";
import { Star } from "lucide-react";
import "./FavoriteStar.css";

interface Props {
  id: string;
  name?: string;
}

export default function FavoriteStar({ id, name }: Props) {
  const ids = useFavorites((s) => s.ids);
  const toggle = useFavorites((s) => s.toggle);
  const active = ids.includes(id);

  return (
    <button
      type="button"
      className="favstar"
      data-active={active}
      aria-pressed={active}
      aria-label={
        active
          ? `${name ?? "이 정류장"} 즐겨찾기 해제`
          : `${name ?? "이 정류장"} 즐겨찾기 추가`
      }
      onClick={() => toggle(id)}
    >
      <Star width={30} height={30} fill={active ? "currentColor" : "none"} aria-hidden="true" />
      <span className="favstar__label">{active ? "즐겨찾기" : "즐겨찾기"}</span>
    </button>
  );
}
