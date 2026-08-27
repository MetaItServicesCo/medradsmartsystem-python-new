from datetime import date

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.dashboard import _date_window, _metric, _trend_label
from app.utils.dashboard_ai import _fallback


def test_previous_period_window_is_inclusive_and_equal_length() -> None:
    assert _date_window(date(2026, 8, 1), date(2026, 8, 10), "previous_period") == (
        date(2026, 8, 1),
        date(2026, 8, 10),
        date(2026, 7, 22),
        date(2026, 7, 31),
    )


def test_previous_year_window_handles_leap_day() -> None:
    assert _date_window(date(2024, 2, 29), date(2024, 3, 2), "previous_year") == (
        date(2024, 2, 29),
        date(2024, 3, 2),
        date(2023, 2, 28),
        date(2023, 3, 2),
    )


def test_custom_comparison_window_is_used_exactly() -> None:
    assert _date_window(
        date(2026, 8, 1),
        date(2026, 8, 10),
        "custom",
        date(2026, 5, 1),
        date(2026, 5, 15),
    )[2:] == (date(2026, 5, 1), date(2026, 5, 15))

    with pytest.raises(HTTPException):
        _date_window(date(2026, 8, 1), date(2026, 8, 10), "custom")


def test_invalid_dashboard_window_is_rejected() -> None:
    with pytest.raises(HTTPException) as error:
        _date_window(date(2026, 8, 10), date(2026, 8, 1), "previous_period")
    assert error.value.status_code == 422


def test_metric_comparison_and_trajectory_thresholds_are_deterministic() -> None:
    assert _metric(125, 100) == {
        "current": 125.0,
        "previous": 100.0,
        "delta": 25.0,
        "change_percent": 25.0,
        "direction": "up",
    }
    assert _metric(10, 0)["change_percent"] is None
    assert _trend_label(0.15) == "upward"
    assert _trend_label(-0.15) == "downward"
    assert _trend_label(0.14) == "stable"


def test_ai_fallback_uses_only_supplied_aggregate_dashboard_data() -> None:
    result = _fallback({
        "trajectory": {"direction": "upward"},
        "metrics": {
            "completed_inspections": {"delta": 4},
            "net_revenue": {"delta": -25},
        },
        "alerts": [{"title": "Overdue inspections", "count": 2}],
    })

    assert result["available"] is False
    assert result["source"] == "calculated_fallback"
    assert result["headline"] == "Business trajectory is upward"
    assert any("Completed Inspections" in item for item in result["positives"])
    assert any("Overdue inspections" in item for item in result["actions"])
