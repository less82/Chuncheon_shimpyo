"""Task A5 — 로드뷰 AI 보조 조사: 대상 목록 생성기 + AI 판독 변환기 테스트.

모두 픽스처/소형 입력만 사용한다. 실제 AI 호출, data/의 최종 조사 CSV 위치에
쓰기, stops.json 수정은 하지 않는다(중단 조건 2).
"""
from __future__ import annotations

import os

import pandas as pd


def _facility(status="unknown", source="none"):
    return {"status": status, "source": source}


def _make_stop(id_, name, lat, lng, midday_hours=None, facilities=None, no_demand=False):
    facilities = facilities or {
        "shade": _facility(),
        "seat": _facility(),
        "light": _facility(),
        "sign": _facility(),
    }
    stop = {
        "id": id_,
        "name": name,
        "lat": lat,
        "lng": lng,
        "facilities": facilities,
    }
    if not no_demand:
        by_hour = [0] * 24
        if midday_hours:
            for h, cnt in midday_hours.items():
                by_hour[h] = cnt
        stop["demand"] = {
            "byHour": by_hour,
            "total": sum(by_hour),
            "aggregatedBidirectional": True,
            "matchedName": name,
        }
    return stop


def _fixture_stops():
    stops = []
    # 수요 매칭 + 미확인 시설 많음 -> 우선순위 최상위권
    stops.append(
        _make_stop(
            "250001",
            "고우선정류장",
            37.9,
            127.7,
            midday_hours={12: 100, 13: 80},
            facilities={
                "shade": _facility(),
                "seat": _facility(),
                "light": _facility("yes", "light_registry"),
                "sign": _facility(),
            },
        )
    )
    # 수요 매칭 + 시설 대부분 확인됨 -> 우선순위 낮음
    stops.append(
        _make_stop(
            "250002",
            "저우선정류장",
            37.91,
            127.71,
            midday_hours={12: 5},
            facilities={
                "shade": _facility("yes", "shade_geocode"),
                "seat": _facility("yes", "bench_registry"),
                "light": _facility("yes", "light_registry"),
                "sign": _facility("no", "roadview"),
            },
        )
    )
    # 수요 미확인(noDemand) -> 랭킹에서는 제외되지만 목록에 일부 포함돼야 함
    stops.append(
        _make_stop(
            "250003",
            "수요미확인정류장",
            37.92,
            127.72,
            no_demand=True,
        )
    )
    stops.append(
        _make_stop(
            "250004",
            "수요미확인정류장2",
            37.93,
            127.73,
            no_demand=True,
        )
    )
    return stops


# --- (a) survey_targets ---


def test_survey_targets_orders_by_priority_and_includes_columns():
    from survey_targets import survey_targets

    stops = _fixture_stops()
    df = survey_targets(stops, n=1, nodemand_n=1)

    expected_cols = ["관리번호", "정류장명", "lat", "lng", "한낮승차", "미확인시설목록", "로드뷰URL"]
    assert list(df.columns) == expected_cols

    ranked_rows = df[df["관리번호"].isin(["250001", "250002"])]
    assert list(ranked_rows["관리번호"]) == ["250001"]  # n=1 -> 우선순위 최상위 하나만


def test_survey_targets_n_limits_ranked_portion():
    from survey_targets import survey_targets

    stops = _fixture_stops()
    df = survey_targets(stops, n=1, nodemand_n=2)
    ranked_ids = set(df["관리번호"]) & {"250001", "250002"}
    assert len(ranked_ids) == 1


def test_survey_targets_includes_some_no_demand_stops():
    from survey_targets import survey_targets

    stops = _fixture_stops()
    df = survey_targets(stops, n=2, nodemand_n=2)
    nodemand_ids = set(df["관리번호"]) & {"250003", "250004"}
    assert len(nodemand_ids) >= 1


def test_survey_targets_unknown_facility_list_and_url():
    from survey_targets import survey_targets

    stops = _fixture_stops()
    df = survey_targets(stops, n=2, nodemand_n=0)
    row = df[df["관리번호"] == "250001"].iloc[0]
    assert row["미확인시설목록"] == "그늘,의자,도착안내기"
    assert row["로드뷰URL"] == "https://map.kakao.com/link/roadview/37.9,127.7"

    row2 = df[df["관리번호"] == "250002"].iloc[0]
    # sign은 no(로드뷰 확정)이므로 미확인 목록에 없어야 함
    assert "도착안내기" not in row2["미확인시설목록"]
    assert row2["미확인시설목록"] == ""


def test_write_survey_targets_csv(tmp_path):
    from survey_targets import survey_targets, write_survey_targets_csv

    stops = _fixture_stops()
    df = survey_targets(stops, n=2, nodemand_n=1)
    out = tmp_path / "survey_targets.csv"
    write_survey_targets_csv(df, str(out))
    assert out.exists()
    text = out.read_text(encoding="utf-8-sig")
    assert "관리번호" in text


# --- (b)(c) 변환기 ---


def test_ai_json_to_survey_rows_maps_yes_no_unclear():
    from roadview_ai_draft import ai_json_to_survey_rows

    ai_results = [
        {
            "관리번호": "250001",
            "정류장명": "고우선정류장",
            "seat": "yes",
            "shade": "no",
            "light": "unclear",
            "sign": "unclear",
            "capturedAt": "2026.07",
        }
    ]
    rows = ai_json_to_survey_rows(ai_results)
    assert len(rows) == 1
    row = rows[0]
    assert row["의자"] == "있음"
    assert row["그늘"] == "없음"
    assert row["조명"] == "미확인"
    assert row["도착안내기"] == "미확인"
    assert row["관리번호"] == "250001"
    assert row["촬영시점(YYYY.MM)"] == "2026.07"


def test_ai_json_to_survey_rows_uses_roadview_header_columns():
    from roadview import ROADVIEW_HEADER
    from roadview_ai_draft import ai_json_to_survey_rows

    ai_results = [
        {"관리번호": "250002", "정류장명": "저우선정류장", "seat": "no", "shade": "no", "light": "no", "sign": "no"}
    ]
    rows = ai_json_to_survey_rows(ai_results)
    assert set(rows[0].keys()) == set(ROADVIEW_HEADER)


# --- (c) 조명 강제 ---


def test_light_no_forced_to_unknown_even_when_ai_says_no():
    from roadview_ai_draft import ai_json_to_survey_rows

    ai_results = [
        {"관리번호": "250009", "정류장명": "테스트", "seat": "no", "shade": "no", "light": "no", "sign": "no"}
    ]
    rows = ai_json_to_survey_rows(ai_results)
    assert rows[0]["조명"] == "미확인"
    assert rows[0]["조명"] != "없음"


# --- (d) 프롬프트 3단 기준 ---


def test_reading_prompt_has_three_tier_criteria():
    from roadview_ai_draft import READING_PROMPT

    assert "yes" in READING_PROMPT
    assert "no" in READING_PROMPT
    assert "unclear" in READING_PROMPT
    assert "명확" in READING_PROMPT  # yes 기준: 명확히 확인
    assert "부재" in READING_PROMPT  # no 기준: 부재 확인


# --- (e) 최종 조사 CSV 경로에 자동으로 쓰지 않음 ---


def test_draft_writer_never_targets_final_survey_csv_path(tmp_path):
    from roadview_ai_draft import write_draft_csv

    ai_results = [
        {"관리번호": "250001", "정류장명": "고우선정류장", "seat": "yes", "shade": "no", "light": "no", "sign": "unclear"}
    ]
    out = tmp_path / "_draft_2026-07-16.csv"
    returned_path = write_draft_csv(ai_results, str(out))
    assert os.path.exists(returned_path)
    assert "_draft" in os.path.basename(returned_path) or "roadview_captures" in returned_path.replace("\\", "/")

    # 최종 조사 CSV로 흔히 쓰이는 경로/이름에는 절대 쓰지 않는다(가드).
    import pytest

    with pytest.raises(ValueError):
        write_draft_csv(ai_results, str(tmp_path / "data" / "roadview_survey.csv"))
