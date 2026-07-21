"""원본 춘천시 CSV 로더. 모두 cp949 인코딩.

컬럼명을 영문/표준 키로 정규화한다(위경도 -> lat/lng 등).
가로등(light) 원본은 배포에 포함되지 않을 수 있으므로 부재 시에도
파이프라인이 죽지 않고 빈 DataFrame(lat/lng 컬럼)을 반환한다.
"""
import glob
import os

import pandas as pd

# pipeline/ 기준 상위의 data/ 폴더
_HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(_HERE, "..", "data"))


def _find(pattern: str) -> str | None:
    """data/ 안에서 glob 패턴에 맞는 첫 파일 경로. 없으면 None."""
    hits = sorted(glob.glob(os.path.join(DATA_DIR, pattern)))
    return hits[0] if hits else None


def _read(pattern: str) -> pd.DataFrame:
    path = _find(pattern)
    if path is None:
        raise FileNotFoundError(f"원본 CSV를 찾지 못함: {pattern} (in {DATA_DIR})")
    return pd.read_csv(path, encoding="cp949", dtype=str)


def load_locations() -> pd.DataFrame:
    """마스터. 관리번호(250xxx) 기준 1890개.

    반환 컬럼: 관리번호, 정류장번호, 정류장명, lat, lng
    """
    df = _read("*버스정류장 위치정보*.csv")
    out = pd.DataFrame(
        {
            "관리번호": df["관리번호"].astype(str).str.strip(),
            "정류장번호": df["정류장 번호"].astype(str).str.strip(),
            "정류장명": df["정류장명"].astype(str).str.strip(),
            "lat": pd.to_numeric(df["위도"], errors="coerce"),
            "lng": pd.to_numeric(df["경도"], errors="coerce"),
        }
    )
    # 좌표 결측은 마스터에서 제외(지도에 못 찍으므로). 실측상 결측 없음.
    out = out.dropna(subset=["lat", "lng"]).reset_index(drop=True)
    return out


def load_routes() -> pd.DataFrame:
    """노선정보. 관리번호(정류장 컬럼)로 위치정보와 조인.

    반환 컬럼: 노선번호, 노선(id), 관리번호, 순서, 정류장명
    """
    from route_number_fix import fix_route_number

    df = _read("*버스정류장 노선정보*.csv")
    out = pd.DataFrame(
        {
            "노선번호": df["노선번호"].map(fix_route_number),
            "노선": df["노선"].astype(str).str.strip(),
            "관리번호": df["정류장"].astype(str).str.strip(),
            "순서": pd.to_numeric(df["정류장순서"], errors="coerce"),
            "정류장명": df["정류장명"].astype(str).str.strip(),
        }
    )
    return out


def load_boarding() -> pd.DataFrame:
    """시간대별 승하차. 정류장아이디(424xxxx)는 위치정보와 직접매칭 불가(실측 0).
    수요 브리지는 정류장명 기준으로 한다.

    반환 컬럼: 정류장아이디, 정류장명, 이용시간대(int 0~23), 승차건수(int), 노선번호(복원)
    """
    from route_number_fix import fix_route_number

    df = _read("*시간대별 승하차 인원*.csv")
    out = pd.DataFrame(
        {
            "정류장아이디": df["정류장아이디"].astype(str).str.strip(),
            "정류장명": df["정류장명"].astype(str).str.strip(),
            "이용시간대": pd.to_numeric(df["이용시간대"], errors="coerce").astype("Int64"),
            "승차건수": pd.to_numeric(df["승차건수"], errors="coerce").fillna(0).astype(int),
            "노선번호": df["노선번호"].map(fix_route_number),
        }
    )
    # 시간대 파싱 실패 행 제거 후 int 확정
    out = out.dropna(subset=["이용시간대"]).reset_index(drop=True)
    out["이용시간대"] = out["이용시간대"].astype(int)
    return out


def load_boarding_daily() -> pd.DataFrame:
    """시간대별 승하차 원본을 날짜(기준일자) 포함으로 읽는다.

    quality_report.py의 "하루 제외" 안정성 분석 전용. load_boarding()과 달리
    날짜 컬럼을 버리지 않는다. load_boarding()의 시그니처·동작은 변경하지 않음.

    반환 컬럼: 기준일자(str, YYYY-MM-DD), 정류장아이디, 정류장명, 이용시간대(int), 승차건수(int)
    """
    df = _read("*시간대별 승하차 인원*.csv")
    out = pd.DataFrame(
        {
            "기준일자": df["수집일자"].astype(str).str.strip(),
            "정류장아이디": df["정류장아이디"].astype(str).str.strip(),
            "정류장명": df["정류장명"].astype(str).str.strip(),
            "이용시간대": pd.to_numeric(df["이용시간대"], errors="coerce").astype("Int64"),
            "승차건수": pd.to_numeric(df["승차건수"], errors="coerce").fillna(0).astype(int),
        }
    )
    out = out.dropna(subset=["이용시간대"]).reset_index(drop=True)
    out["이용시간대"] = out["이용시간대"].astype(int)
    return out


def load_bench() -> pd.DataFrame:
    """벤치 현황(의자 근거). 반환 컬럼: 명칭, lat, lng."""
    df = _read("*벤치 현황*.csv")
    out = pd.DataFrame(
        {
            "명칭": df["명칭"].astype(str).str.strip(),
            "lat": pd.to_numeric(df["위도"], errors="coerce"),
            "lng": pd.to_numeric(df["경도"], errors="coerce"),
        }
    )
    out = out.dropna(subset=["lat", "lng"]).reset_index(drop=True)
    return out


def load_shade() -> pd.DataFrame:
    """폭염 그늘막(그늘 근거). 좌표 없음 -> 빌드 시 지오코딩 필요.

    반환 컬럼: 설치장소명, 주소(도로명 우선, 없으면 지번)
    """
    df = _read("*폭염대비접이식그늘막*.csv")
    road = df["도로명주소"].astype(str).str.strip()
    jibun = df["지번주소"].astype(str).str.strip() if "지번주소" in df.columns else ""
    addr = road.where(road.str.len() > 1, jibun)
    out = pd.DataFrame(
        {
            "설치장소명": df["설치장소명"].astype(str).str.strip(),
            "주소": addr,
        }
    )
    return out


def load_bit() -> pd.DataFrame:
    """버스정보안내단말기(BIT) 현황 = 도착안내기(sign) 근거.

    정류장번호(4자리)로 마스터 stopNo와 정확 매칭한다(공간매칭 아님).
    원본 부재 시 빈 DataFrame(정직성: 도착안내기 전부 unknown 유지).

    반환 컬럼: 정류장번호(str)
    """
    path = _find("*버스정보안내단말기*.csv")
    if path is None:
        return pd.DataFrame({"정류장번호": pd.Series(dtype=str)})
    df = pd.read_csv(path, encoding="cp949", dtype=str)
    col = "정류장 번호" if "정류장 번호" in df.columns else "정류장번호"
    out = pd.DataFrame({"정류장번호": df[col].astype(str).str.strip()})
    out = out[out["정류장번호"] != ""].reset_index(drop=True)
    return out


def load_lights() -> pd.DataFrame:
    """가로등(조명 근거). 원본이 없을 수 있다.

    반환 컬럼: lat, lng. 원본 부재 시 빈 DataFrame(정직성: 조명 전부 unknown).
    """
    path = _find("*가로등*.csv")
    if path is None:
        return pd.DataFrame({"lat": pd.Series(dtype=float), "lng": pd.Series(dtype=float)})
    df = pd.read_csv(path, encoding="cp949", dtype=str)
    lat_col = "위도" if "위도" in df.columns else df.columns[0]
    lng_col = "경도" if "경도" in df.columns else df.columns[1]
    out = pd.DataFrame(
        {
            "lat": pd.to_numeric(df[lat_col], errors="coerce"),
            "lng": pd.to_numeric(df[lng_col], errors="coerce"),
        }
    )
    out = out.dropna(subset=["lat", "lng"]).reset_index(drop=True)
    return out
