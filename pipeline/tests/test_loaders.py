"""Task 1.1 검증: 원본 로더 + cp949 + 엑셀 날짜 오염 복원."""
import pandas as pd

from loaders import (
    load_bench,
    load_boarding,
    load_lights,
    load_locations,
    load_routes,
    load_shade,
)
from route_number_fix import fix_route_number


def test_locations_is_master_1890_clean_floats():
    df = load_locations()
    assert len(df) == 1890
    assert set(["관리번호", "정류장번호", "정류장명", "lat", "lng"]).issubset(df.columns)
    assert df["lat"].dtype == float
    assert df["lng"].dtype == float
    assert df["lat"].isna().sum() == 0
    assert df["lng"].isna().sum() == 0
    # 관리번호는 9자리 숫자 마스터 키(250/257/263/265 대역 혼재)
    ids = df["관리번호"].astype(str)
    assert ids.str.fullmatch(r"\d{9}").all()
    assert ids.nunique() == len(df)  # 유일


def test_boarding_timeslot_is_int():
    df = load_boarding()
    assert set(["정류장아이디", "정류장명", "이용시간대", "승차건수", "노선번호"]).issubset(
        df.columns
    )
    assert pd.api.types.is_integer_dtype(df["이용시간대"])
    assert df["이용시간대"].between(0, 23).all()
    # 정류장아이디는 424xxxx 대역
    assert df["정류장아이디"].astype(str).str.startswith("424").mean() > 0.5


def test_routes_columns():
    df = load_routes()
    assert set(["노선번호", "관리번호", "순서", "정류장명"]).issubset(df.columns)
    # 관리번호는 위치정보와 조인 가능한 9자리 숫자 키
    assert df["관리번호"].astype(str).str.fullmatch(r"\d{9}").mean() > 0.9


def test_bench_columns_and_coords():
    df = load_bench()
    assert set(["명칭", "lat", "lng"]).issubset(df.columns)
    assert df["lat"].dtype == float


def test_shade_columns():
    df = load_shade()
    assert set(["설치장소명", "주소"]).issubset(df.columns)


def test_lights_never_crashes():
    # 가로등 원본이 없을 수 있다. 그래도 죽지 않고 lat/lng 컬럼 DataFrame 반환.
    df = load_lights()
    assert set(["lat", "lng"]).issubset(df.columns)


def test_fix_route_number_excel_date_pollution():
    assert fix_route_number("03월 01일") == "3-1"
    assert fix_route_number("05월 15일") == "5-15"
    assert fix_route_number("01월 13일") == "1-13"
    # 정상 노선번호는 그대로 통과
    assert fix_route_number("100-1") == "100-1"
    assert fix_route_number("7") == "7"
    assert fix_route_number("10-S") == "10-S"
