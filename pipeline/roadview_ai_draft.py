"""Task A5 — 로드뷰 AI 보조 조사: 판독 프롬프트 + 초안 변환기.

이 모듈은 AI를 직접 호출하지 않는다. 사람이 (1) survey_targets.csv의
로드뷰URL을 열어 캡처하고, (2) READING_PROMPT로 AI(비전 모델 등)에
정류장별 시설 판독을 시키고, (3) 그 결과(JSON)를 ai_json_to_survey_rows로
roadview.py의 ROADVIEW_HEADER 형식 "초안" 행으로 변환한 뒤, (4) 사람이
직접 검수해 확정 CSV(예: data/roadview_survey.csv)를 만들고
roadview.apply_roadview로 반영하는 흐름을 전제로 한다.

⚠️ 이 모듈이 만드는 CSV는 어디까지나 "초안"이다. 사람 검수 전에는
data/의 최종 조사 CSV 위치에 저장해서는 안 된다(write_draft_csv가 가드).
⚠️ 조명(light)은 AI가 "no"를 줘도 무조건 "미확인"으로 강제한다(주간
로드뷰로는 야간 조명 작동 여부를 판별할 수 없다). 사람이 확정본에서
명시적으로 "없음"으로 바꿀 때만 no가 된다.
"""
from __future__ import annotations

import csv
import os

from roadview import ROADVIEW_HEADER

READING_PROMPT = """당신은 버스정류장 로드뷰 사진/영상을 보고 시설 유무를 판독하는 조사원입니다.
아래 시설 각각에 대해 yes(있음) / no(없음) / unclear(미확인) 중 하나로만 답하세요.

판정 기준(반드시 이 3단 기준을 따르세요):
- yes: 영상에서 해당 시설이 명확히 확인될 때만.
- no: 정류장 전체 조사 범위(정류장 표지판 주변, 대기 공간 전체)가 충분히 보이고,
      그 범위 안에 해당 시설이 없음을 부재 확인할 수 있을 때만.
- unclear: 시야가 가리거나, 촬영일이 오래됐거나, 촬영 방향이 부족하거나, 화질이
      낮아서 있음/없음을 확정할 수 없으면 반드시 unclear로 답하세요.
      확신이 없으면 no가 아니라 unclear를 선택하세요.

판독 대상 시설:
- seat(의자): 정류장 대기용 벤치/의자.
- shade(그늘): 지붕, 차양, 그늘막 등 햇빛을 가리는 구조물.
- light(조명): 가로등 등 야간 조명 시설. (주간 로드뷰로는 야간 점등 여부를
  확인할 수 없으므로, 조명이 "없다"고 판정하더라도 최종 반영 시 이 앱은
  이를 자동으로 미확인 처리합니다. 그래도 판독 자체는 최선을 다해 답하세요.)
- sign(도착안내기): 버스 도착 정보 안내 전광판/단말.

정류장별로 다음 JSON 형식으로만 답하세요(설명 문장 없이):
{"관리번호": "...", "정류장명": "...", "seat": "yes|no|unclear", "shade": "yes|no|unclear",
 "light": "yes|no|unclear", "sign": "yes|no|unclear", "capturedAt": "YYYY.MM"}
"""

# AI 판독값 -> 조사 CSV 표기
_VALUE_TO_LABEL = {
    "yes": "있음",
    "no": "없음",
    "unclear": "미확인",
}

_AI_KEY_TO_COL = {
    "seat": "의자",
    "shade": "그늘",
    "light": "조명",
    "sign": "도착안내기",
}


def _label(kind: str, value) -> str:
    v = str(value).strip().lower()
    label = _VALUE_TO_LABEL.get(v, "미확인")
    if kind == "light" and label == "없음":
        # 조명은 AI가 no로 판정해도 절대 "없음"을 만들지 않는다(주간 로드뷰 한계).
        # 사람이 확정본에서 명시적으로만 "없음"으로 바꿀 수 있다.
        return "미확인"
    return label


def ai_json_to_survey_rows(ai_results: list[dict]) -> list[dict]:
    """AI JSON 판독 결과를 ROADVIEW_HEADER 형식의 초안 행 리스트로 변환한다.

    ai_results 각 원소: {관리번호, 정류장명, seat, shade, light, sign, capturedAt?}
    (seat/shade/light/sign 값은 "yes"|"no"|"unclear")

    반환은 ROADVIEW_HEADER와 동일한 키를 가진 dict 리스트(초안).
    사람 검수 전에는 어디에도 자동 반영되지 않는다.
    """
    rows = []
    for item in ai_results:
        row = {col: "" for col in ROADVIEW_HEADER}
        row["관리번호"] = str(item.get("관리번호", "")).strip()
        row["정류장명"] = str(item.get("정류장명", "")).strip()
        for ai_key, col in _AI_KEY_TO_COL.items():
            row[col] = _label(ai_key, item.get(ai_key, "unclear"))
        row["촬영시점(YYYY.MM)"] = str(item.get("capturedAt", "")).strip()
        row["조사자"] = "AI초안(검수전)"
        row["비고"] = "AI 초안 - 사람 검수 필요"
        rows.append(row)
    return rows


def write_draft_csv(ai_results: list[dict], path: str) -> str:
    """AI 판독 초안을 CSV로 저장한다(utf-8-sig).

    ⚠️ 초안 전용 함수다. 파일명/경로가 최종 조사 CSV로 흔히 쓰이는 형태이면
    ValueError로 거부한다(중단 조건 2 가드). 반드시 "_draft" 표식이 있거나
    data/roadview_captures/ 경로 아래에 저장하도록 강제한다.
    """
    norm = os.path.abspath(path).replace("\\", "/")
    basename = os.path.basename(norm)
    is_marked_draft = "_draft" in basename or "roadview_captures" in norm
    if not is_marked_draft:
        raise ValueError(
            "초안 CSV는 파일명에 '_draft'를 포함하거나 "
            "data/roadview_captures/ 경로 아래에 저장해야 합니다. "
            "사람 검수 없이 최종 조사 CSV 위치에 저장할 수 없습니다."
        )
    rows = ai_json_to_survey_rows(ai_results)
    os.makedirs(os.path.dirname(norm), exist_ok=True)
    with open(norm, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=ROADVIEW_HEADER)
        w.writeheader()
        for row in rows:
            w.writerow(row)
    return norm


def print_batch_instructions() -> None:
    """캡처 -> AI 판독 -> 검수 배치 절차 안내(stdout)."""
    print(
        """
[로드뷰 AI 보조 조사 배치 절차]
1) survey_targets.py 실행 -> data/survey_targets.csv 생성(조사 후보 + 로드뷰URL).
2) 사람이 각 행의 로드뷰URL을 열어 화면을 캡처한다(data/roadview_captures/ 등).
3) 캡처 이미지를 AI(비전 모델)에 READING_PROMPT와 함께 입력해 정류장별
   {seat, shade, light, sign, capturedAt} JSON 판독 결과를 받는다.
4) ai_json_to_survey_rows(ai_results)로 초안 행을 만들고,
   write_draft_csv(ai_results, "data/roadview_captures/_draft_YYYY-MM-DD.csv")로
   저장한다(초안 파일명은 반드시 _draft 포함 또는 roadview_captures/ 경로).
5) 사람이 초안 CSV를 열어 셀 단위로 검수/수정한다. 특히 조명(light)은
   변환기가 항상 "미확인"으로 강제하므로, 실제로 "없음"이 맞다고 판단되면
   사람이 직접 "없음"으로 고친다.
6) 검수 완료본을 ROADVIEW_HEADER 형식의 확정 CSV(예: data/roadview_survey.csv)로
   저장한다.
7) roadview.apply_roadview(master, survey_df)로 stops 마스터에 반영한 뒤
   build_stops.py를 재실행해 stops.json을 갱신한다.
"""
    )


if __name__ == "__main__":
    print(READING_PROMPT)
    print_batch_instructions()
