"""Task A1 검증: 데이터 품질 검증 리포트(docs/데이터_검증.md) 생성."""
import os

_HERE = os.path.dirname(os.path.abspath(__file__))
REPORT_PATH = os.path.abspath(os.path.join(_HERE, "..", "..", "docs", "데이터_검증.md"))

REQUIRED_SECTION_HEADERS = [
    "## 1.",
    "## 2.",
    "## 3.",
    "## 4.",
    "## 5.",
    "## 6.",
    "## 7.",
]


def _read_report() -> str:
    with open(REPORT_PATH, encoding="utf-8") as f:
        return f.read()


def test_generate_report_creates_file_with_all_sections():
    from quality_report import generate_report

    generate_report(REPORT_PATH)
    assert os.path.exists(REPORT_PATH)
    text = _read_report()
    for header in REQUIRED_SECTION_HEADERS:
        assert header in text, f"섹션 헤더 누락: {header}"


def test_demand_route_correlation_in_valid_range():
    from quality_report import compute_demand_route_correlation

    corr = compute_demand_route_correlation()
    assert -1.0 <= corr <= 1.0


def test_leave_one_day_out_has_exactly_four_scenarios():
    from quality_report import compute_leave_one_day_out_stability

    result = compute_leave_one_day_out_stability()
    assert len(result) == 4
    for row in result:
        assert "excluded_date" in row
        assert "overlap" in row
        assert 0 <= row["overlap"] <= 20
