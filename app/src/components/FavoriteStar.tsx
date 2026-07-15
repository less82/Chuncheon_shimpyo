// 즐겨찾기 별 토글 — 큰 터치타깃(≥48px), 상태를 색+채움+라벨로 표현.

import { useFavorites } from "../store/useFavorites";
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
      <svg width="30" height="30" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 18.8 6.2 21.9l1.1-6.5L2.6 9.8l6.5-.9z" />
      </svg>
      <span className="favstar__label">{active ? "즐겨찾기" : "즐겨찾기"}</span>
    </button>
  );
}
