"""Task 1.5 검증: 로드뷰 오버레이 + 배차 캐시 + 최종 stops.json 빌드."""
import json
import os

import pandas as pd

from roadview import ROADVIEW_HEADER, apply_roadview, write_survey_template

_HERE = os.path.dirname(os.path.abspath(__file__))
_STOPS_JSON = os.path.abspath(
    os.path.join(_HERE, "..", "..", "app", "public", "data", "stops.json")
)


def _stop(sid):
    return {
        "id": sid,
        "stopNo": sid,
        "name": f"stop{sid}",
        "lat": 37.88,
        "lng": 127.73,
        "routes": [],
        "facilities": {
            "shade": {"status": "unknown", "source": "none"},
            "seat": {"status": "yes", "source": "bench_registry"},
            "light": {"status": "unknown", "source": "none"},
            "sign": {"status": "unknown", "source": "none"},
        },
    }


def test_roadview_yes_sets_source_and_capturedat():
    master = [_stop("250000001")]
    survey = pd.DataFrame(
        [
            {
                "관리번호": "250000001",
                "정류장명": "stop",
                "그늘": "있음",
                "의자": "미확인",
                "조명": "미확인",
                "도착안내기": "미확인",
                "촬영시점(YYYY.MM)": "2026.03",
                "조사자": "홍길동",
                "비고": "",
            }
        ]
    )
    out = apply_roadview(master, survey)
    shade = out[0]["facilities"]["shade"]
    assert shade["status"] == "yes"
    assert shade["source"] == "roadview"
    assert shade["capturedAt"] == "2026.03"


def test_roadview_unknown_keeps_existing():
    master = [_stop("250000001")]
    survey = pd.DataFrame(
        [
            {
                "관리번호": "250000001",
                "정류장명": "stop",
                "그늘": "미확인",
                "의자": "미확인",
                "조명": "미확인",
                "도착안내기": "미확인",
                "촬영시점(YYYY.MM)": "2026.03",
                "조사자": "x",
                "비고": "",
            }
        ]
    )
    out = apply_roadview(master, survey)
    # 의자는 기존 bench_registry yes 유지
    assert out[0]["facilities"]["seat"] == {"status": "yes", "source": "bench_registry"}


def test_roadview_none_sets_no_only_here():
    """'없음' 조사값만이 status='no'를 만들 수 있는 유일한 경로."""
    master = [_stop("250000001")]
    survey = pd.DataFrame(
        [
            {
                "관리번호": "250000001",
                "정류장명": "stop",
                "그늘": "없음",
                "의자": "없음",
                "조명": "미확인",
                "도착안내기": "미확인",
                "촬영시점(YYYY.MM)": "2026.03",
                "조사자": "x",
                "비고": "",
            }
        ]
    )
    out = apply_roadview(master, survey)
    assert out[0]["facilities"]["shade"] == {
        "status": "no",
        "source": "roadview",
        "capturedAt": "2026.03",
    }
    # 의자도 없음 -> no (기존 yes를 덮어쓴다, 로드뷰가 최우선)
    assert out[0]["facilities"]["seat"]["status"] == "no"


def test_survey_template_header(tmp_path):
    p = tmp_path / "survey.csv"
    write_survey_template([_stop("250000001")], str(p))
    df = pd.read_csv(p, encoding="utf-8-sig", dtype=str)
    assert list(df.columns) == ROADVIEW_HEADER
    assert len(df) == 1


def test_stops_json_built_and_valid_schema():
    # build_stops.py가 만든 산출물 검증. (이 테스트 전에 build_stops.py 실행 필요)
    assert os.path.exists(_STOPS_JSON), "stops.json 미생성 — build_stops.py 먼저 실행"
    with open(_STOPS_JSON, encoding="utf-8") as f:
        data = json.load(f)
    assert set(["generatedAt", "cityCenter", "stops"]).issubset(data)
    assert data["cityCenter"] == {"lat": 37.8813, "lng": 127.73}
    assert len(data["stops"]) == 1890
    valid_status = {"yes", "no", "unknown"}
    valid_source = {
        "roadview",
        "bench_registry",
        "shade_registry",
        "light_registry",
        "none",
    }
    for s in data["stops"]:
        assert set(["id", "stopNo", "name", "lat", "lng", "routes", "facilities"]).issubset(s)
        for kind in ("shade", "seat", "light", "sign"):
            fi = s["facilities"][kind]
            assert fi["status"] in valid_status
            assert fi["source"] in valid_source
            # 근거 없음(none)이면 반드시 unknown
            if fi["source"] == "none":
                assert fi["status"] == "unknown"


def test_no_fabricated_no_without_roadview():
    """로드뷰 없이 'no'가 생기지 않았는지 산출물에서 확인."""
    with open(_STOPS_JSON, encoding="utf-8") as f:
        data = json.load(f)
    for s in data["stops"]:
        for kind in ("shade", "seat", "light", "sign"):
            fi = s["facilities"][kind]
            if fi["status"] == "no":
                assert fi["source"] == "roadview"
