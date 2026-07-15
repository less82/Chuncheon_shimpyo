"""Task 1.5 — 로드뷰 조사 오버레이 + 조사 양식.

로드뷰 조사값은 시설 근거의 최우선(source='roadview')이며,
'없음' 조사만이 status='no'를 만들 수 있는 유일한 경로다.
'있음'->yes, '없음'->no, '미확인'->기존 유지.
"""
import csv

# 조사 양식 헤더(고정 계약)
ROADVIEW_HEADER = [
    "관리번호",
    "정류장명",
    "그늘",
    "의자",
    "조명",
    "도착안내기",
    "촬영시점(YYYY.MM)",
    "조사자",
    "비고",
]

# 조사 컬럼명 -> 시설 키
_COL_TO_KIND = {
    "그늘": "shade",
    "의자": "seat",
    "조명": "light",
    "도착안내기": "sign",
}

_VALUE_TO_STATUS = {
    "있음": "yes",
    "없음": "no",  # 로드뷰에서만 'no' 허용
    "미확인": None,  # 기존 유지
}


def apply_roadview(master: list[dict], survey_df) -> list[dict]:
    """조사값으로 시설을 덮어쓴다(우선순위 최상).

    survey_df: ROADVIEW_HEADER 컬럼을 가진 DataFrame.
    관리번호로 master와 매칭. '있음'/'없음'만 반영, '미확인'은 건드리지 않는다.
    """
    by_id = {str(s["id"]): s for s in master}
    for row in survey_df.to_dict("records"):
        sid = str(row.get("관리번호", "")).strip()
        stop = by_id.get(sid)
        if stop is None:
            continue
        captured = str(row.get("촬영시점(YYYY.MM)", "")).strip()
        for col, kind in _COL_TO_KIND.items():
            raw = str(row.get(col, "")).strip()
            status = _VALUE_TO_STATUS.get(raw, None)
            if status is None:
                continue  # 미확인 또는 빈칸 -> 기존 유지
            info = {"status": status, "source": "roadview"}
            if captured:
                info["capturedAt"] = captured
            stop["facilities"][kind] = info
    return master


def write_survey_template(master: list[dict], path: str) -> None:
    """조사자용 빈 양식 CSV(utf-8-sig, 한글 안깨짐). 시설 칸은 비워 둔다."""
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(ROADVIEW_HEADER)
        for s in master:
            w.writerow([s["id"], s["name"], "", "", "", "", "", "", ""])
