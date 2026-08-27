"""AI narrative layer for already-calculated dashboard intelligence.

The database remains the authority for every KPI, comparison, and alert. The
model receives aggregated numbers only and may explain them; it cannot alter
records, calculate balances, or make workflow decisions.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any

from app.core.config import settings


logger = logging.getLogger("medrad.dashboard_ai")

_ANALYSIS_TOOL = {
    "name": "record_business_analysis",
    "description": "Record a concise operational analysis of the supplied aggregate metrics.",
    "input_schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "headline": {"type": "string"},
            "summary": {"type": "string"},
            "positives": {"type": "array", "items": {"type": "string"}, "maxItems": 3},
            "risks": {"type": "array", "items": {"type": "string"}, "maxItems": 3},
            "actions": {"type": "array", "items": {"type": "string"}, "maxItems": 3},
        },
        "required": ["headline", "summary", "positives", "risks", "actions"],
    },
}


def _label(metric_key: str) -> str:
    return metric_key.replace("_", " ").title()


def _fallback(intelligence: dict[str, Any]) -> dict[str, Any]:
    trajectory = intelligence.get("trajectory") or {}
    direction = trajectory.get("direction", "stable")
    metrics = intelligence.get("metrics") or {}
    alerts = intelligence.get("alerts") or []
    positives: list[str] = []
    risks: list[str] = []

    for key, value in metrics.items():
        delta = float(value.get("delta") or 0)
        sentence = f"{_label(key)} is {abs(delta):,.2f} {'higher' if delta > 0 else 'lower'} than the comparison period."
        if delta > 0:
            positives.append(sentence)
        elif delta < 0:
            risks.append(sentence)
    risks.extend(f"{item['count']} {item['title'].lower()} require attention." for item in alerts[:3])

    actions = [
        f"Review {item['title'].lower()} and assign an owner."
        for item in alerts[:3]
    ] or ["Continue monitoring the selected period; no urgent operational alerts are active."]
    return {
        "available": False,
        "source": "calculated_fallback",
        "headline": f"Business trajectory is {direction}",
        "summary": "This assessment is calculated from the permission-scoped comparison metrics shown on the dashboard.",
        "positives": positives[:3],
        "risks": risks[:3],
        "actions": actions[:3],
        "generated_at": datetime.utcnow(),
    }


def generate_dashboard_analysis(intelligence: dict[str, Any]) -> dict[str, Any]:
    fallback = _fallback(intelligence)
    if not (settings.AI_EXTRACTION_ENABLED and settings.ANTHROPIC_API_KEY.strip()):
        return fallback

    safe_payload = {
        "period": intelligence.get("period"),
        "comparison": intelligence.get("comparison"),
        "metrics": intelligence.get("metrics"),
        "trajectory": intelligence.get("trajectory"),
        "alerts": [
            {
                "title": alert.get("title"),
                "count": alert.get("count"),
                "severity": alert.get("severity"),
                "detail": alert.get("detail"),
            }
            for alert in intelligence.get("alerts", [])
        ],
    }
    try:
        import anthropic

        client = anthropic.Anthropic(
            api_key=settings.ANTHROPIC_API_KEY,
            timeout=float(settings.AI_EXTRACTION_TIMEOUT_SECONDS),
            max_retries=1,
        )
        message = client.messages.create(
            model=settings.AI_EXTRACTION_MODEL,
            max_tokens=900,
            tools=[_ANALYSIS_TOOL],
            tool_choice={"type": "tool", "name": "record_business_analysis"},
            messages=[{
                "role": "user",
                "content": (
                    "Analyze these already-calculated healthcare operations metrics. "
                    "Do not invent causes or values. Treat higher completed work and net revenue as positive; "
                    "treat critical/overdue/failed-payment alerts as risks. Give concise, practical actions. "
                    f"Aggregate data: {json.dumps(safe_payload, default=str, separators=(',', ':'))}"
                ),
            }],
        )
        for block in message.content:
            if getattr(block, "type", None) == "tool_use" and getattr(block, "name", None) == "record_business_analysis":
                result = dict(block.input or {})
                return {
                    "available": True,
                    "source": f"ai:{settings.AI_EXTRACTION_MODEL}",
                    "headline": result.get("headline") or fallback["headline"],
                    "summary": result.get("summary") or fallback["summary"],
                    "positives": list(result.get("positives") or [])[:3],
                    "risks": list(result.get("risks") or [])[:3],
                    "actions": list(result.get("actions") or [])[:3],
                    "generated_at": datetime.utcnow(),
                }
        raise RuntimeError("AI analysis returned no structured result")
    except Exception:
        logger.exception("Dashboard AI analysis failed; returning calculated fallback")
        return fallback
