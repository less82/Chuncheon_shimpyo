"""시설이미지 라벨링 CSV 2종 병합 (두 조사자가 반씩 나눠 조사한 결과 합치기).

입력: data/춘천시_버스정류장_시설이미지_라벨링.csv
      data/춘천시_버스정류장_시설이미지_라벨링2.csv
출력: data/춘천시_버스정류장_시설이미지_라벨링_병합.csv
      data/춘천시_버스정류장_시설이미지_라벨링_충돌.csv  (충돌 있을 때만)

병합 규칙 — 정직성 규칙(`docs/데이터_현황.md`)을 셀 단위로 적용한다:

| A | B | 결과 | 이유 |
|---|---|---|---|
| 빈칸 | 값 | 값 | 빈칸은 '없음'이 아니라 **미조사**다. 조사한 쪽을 취한다 |
| 값 | 같은 값 | 그 값 | 합의 |
| 있음 | 미확인 | **있음** | 한쪽이 실제로 봤으면 양성 증거가 이긴다 |
| 없음 | 미확인 | **미확인** | '없음'은 전체 조사범위가 보일 때만 성립. 한쪽이 확신 못 하면 미확인으로 후퇴 |
| 있음 | 없음 | **미확인** + 충돌기록 | 정면 충돌. 자동 판정하지 않고 사람에게 회부 |

⚠️ 어떤 경우에도 빈칸/불일치를 '없음'으로 승격시키지 않는다.
   근거 없는 '없음'은 이 프로젝트가 금지하는 데이터 오염이다.

사용:
    python merge_facility_labeling.py
    python merge_facility_labeling.py --check   # 쓰지 않고 충돌만 보고
"""
from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

# 윈도우 콘솔 기본 코드페이지(cp949)에서 '—'·'⚠' 출력이 죽는 걸 막는다
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REPO = Path(__file__).resolve().parent.parent
DATA = REPO / "data"
SRC_A = DATA / "춘천시_버스정류장_시설이미지_라벨링.csv"
SRC_B = DATA / "춘천시_버스정류장_시설이미지_라벨링2.csv"
OUT = DATA / "춘천시_버스정류장_시설이미지_라벨링_병합.csv"
CONFLICT_OUT = DATA / "춘천시_버스정류장_시설이미지_라벨링_충돌.csv"

KEY = "정류장 번호"
FACILITY_COLS = ["그늘", "의자", "도착안내기", "쉘터형"]
NOTE_COL = "비고"
ENC = "utf-8-sig"


def read_rows(path: Path) -> tuple[list[str], dict[str, dict[str, str]]]:
    with path.open(encoding=ENC, newline="") as fh:
        reader = csv.DictReader(fh)
        header = reader.fieldnames or []
        rows = {}
        for row in reader:
            key = (row.get(KEY) or "").strip()
            if not key:  # 파일 끝 빈 줄
                continue
            rows[key] = {k: (v or "").strip() for k, v in row.items()}
    return header, rows


def merge_cell(a: str, b: str) -> tuple[str, str | None]:
    """(병합값, 충돌사유 or None)."""
    if a == b:
        return a, None
    if not a:
        return b, None
    if not b:
        return a, None
    pair = {a, b}
    if pair == {"있음", "미확인"}:
        return "있음", None  # 한쪽이 실제로 봤다
    if pair == {"없음", "미확인"}:
        return "미확인", None  # '없음'은 확신 있을 때만
    if pair == {"있음", "없음"}:
        return "미확인", f"있음/없음 정면 충돌 (A={a}, B={b})"
    return "미확인", f"예상 밖 값 (A={a!r}, B={b!r})"


def merge_note(a: str, b: str) -> str:
    parts = [p for p in (a, b) if p]
    if len(parts) == 2 and parts[0] == parts[1]:
        return parts[0]
    return " / ".join(parts)


def main() -> None:
    ap = argparse.ArgumentParser(description="시설이미지 라벨링 CSV 병합")
    ap.add_argument("--check", action="store_true", help="파일을 쓰지 않고 충돌만 보고")
    args = ap.parse_args()

    header_a, rows_a = read_rows(SRC_A)
    header_b, rows_b = read_rows(SRC_B)
    if header_a != header_b:
        raise SystemExit(f"헤더 불일치:\n  A={header_a}\n  B={header_b}")

    only_a = sorted(set(rows_a) - set(rows_b))
    only_b = sorted(set(rows_b) - set(rows_a))
    if only_a or only_b:
        print(f"⚠️ 한쪽에만 있는 정류장 — A만 {only_a}, B만 {only_b}")

    keys = list(rows_a) + [k for k in rows_b if k not in rows_a]  # A 순서 보존
    merged, conflicts = [], []
    filled_by = {"A만": 0, "B만": 0, "양쪽합의": 0, "충돌": 0, "둘다빈칸": 0}

    for key in keys:
        a = rows_a.get(key, {})
        b = rows_b.get(key, {})
        out = {KEY: key, "카카오 로드뷰 URL": a.get("카카오 로드뷰 URL") or b.get("카카오 로드뷰 URL", "")}
        for col in FACILITY_COLS:
            va, vb = a.get(col, ""), b.get(col, "")
            value, why = merge_cell(va, vb)
            out[col] = value
            if why:
                filled_by["충돌"] += 1
                conflicts.append(
                    {KEY: key, "항목": col, "A": va, "B": vb, "병합결과": value, "사유": why}
                )
            elif va and vb:
                filled_by["양쪽합의"] += 1
            elif va:
                filled_by["A만"] += 1
            elif vb:
                filled_by["B만"] += 1
            else:
                filled_by["둘다빈칸"] += 1
        out[NOTE_COL] = merge_note(a.get(NOTE_COL, ""), b.get(NOTE_COL, ""))
        merged.append(out)

    # ── 보고 ────────────────────────────────────────────────────────────
    print(f"정류장 {len(merged)}개, 시설 셀 {len(merged) * len(FACILITY_COLS)}개")
    for k, v in filled_by.items():
        print(f"  {k:6s} {v:5d}")
    counts = {c: {} for c in FACILITY_COLS}
    for row in merged:
        for c in FACILITY_COLS:
            label = row[c] or "(빈칸=미조사)"
            counts[c][label] = counts[c].get(label, 0) + 1
    print("\n항목별 분포")
    for c in FACILITY_COLS:
        detail = "  ".join(f"{k} {v}" for k, v in sorted(counts[c].items()))
        print(f"  {c:6s} {detail}")

    if conflicts:
        print(f"\n⚠️ 충돌 {len(conflicts)}건 — 사람이 판정해야 함 (병합본에는 '미확인'으로 넣음)")
        for c in conflicts[:20]:
            print(f"  {c[KEY]:>6s} {c['항목']}: A={c['A']} / B={c['B']}")
    else:
        print("\n충돌 없음 — 두 조사가 겹치는 셀에서 모순이 나오지 않았습니다.")

    if args.check:
        print("\n(--check: 파일을 쓰지 않았습니다)")
        return

    with OUT.open("w", encoding=ENC, newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=header_a)
        writer.writeheader()
        writer.writerows(merged)
    print(f"\n병합본 → {OUT}")

    if conflicts:
        with CONFLICT_OUT.open("w", encoding=ENC, newline="") as fh:
            writer = csv.DictWriter(fh, fieldnames=[KEY, "항목", "A", "B", "병합결과", "사유"])
            writer.writeheader()
            writer.writerows(conflicts)
        print(f"충돌목록 → {CONFLICT_OUT}")


if __name__ == "__main__":
    main()
