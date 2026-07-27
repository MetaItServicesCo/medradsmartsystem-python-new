from datetime import date, datetime

from sqlalchemy import column
from sqlalchemy.dialects import postgresql

from app.utils.list_search import (
    contains_ci,
    normalize_list_search,
    parsed_date_bounds,
    parsed_date_value,
)


def test_normalize_list_search_collapses_and_caps_input():
    assert normalize_list_search("  Health   Care \n Center  ") == "Health Care Center"
    assert len(normalize_list_search("x" * 500)) == 160


def test_contains_search_treats_sql_wildcards_as_literal_text():
    predicate = contains_ci(column("name"), r"50%_off")
    compiled = predicate.compile(
        dialect=postgresql.dialect(),
    )
    assert list(compiled.params.values()) == [r"%50\%\_off%"]
    assert "ESCAPE" in str(compiled)


def test_displayed_us_and_iso_dates_are_parsed_as_exact_days():
    start, end = parsed_date_bounds("Jul 5, 2026")
    assert start == datetime(2026, 7, 5)
    assert end == datetime(2026, 7, 6)
    assert parsed_date_value("07/05/2026") == date(2026, 7, 5)
    assert parsed_date_value("2026-07-05") == date(2026, 7, 5)


def test_invalid_date_is_not_treated_as_a_date():
    assert parsed_date_bounds("facility 205") is None
