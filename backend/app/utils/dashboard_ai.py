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

_SYSTEM_PROMPT = (
    "You are a senior operations analyst for a medical-equipment service business "
    "(inspections, service requests, rentals, sales, and billing). You brief an "
    "executive on a dashboard whose KPIs, deltas, and alerts are already computed.\n\n"
    "Rules:\n"
    "- Use only the numbers provided. Never invent metrics, currency, causes, or "
    "trends that are not in the data. If a cause is unknown, describe the movement "
    "without speculating why.\n"
    "- Be specific and quantitative: cite the actual figures and their "
    "period-over-period change. No vague filler such as 'things look strong'.\n"
    "- Treat more completed work and higher net revenue as positive; treat "
    "critical, overdue, failed-payment, and low-stock alerts as risks.\n"
    "- Executive tone: direct, concrete, concise. No preamble, no restating the "
    "request, no markdown, no emojis.\n"
    "- Every action must be a concrete next step an operations lead can assign today."
)

_ANALYSIS_TOOL = {
    "name": "record_business_analysis",
    "description": "Record a precise, executive-ready analysis of the supplied aggregate metrics.",
    "input_schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "headline": {
                "type": "string",
                "description": "One crisp sentence (max ~90 characters) stating the single most important takeaway for the period, anchored to the key figure.",
            },
            "summary": {
                "type": "string",
                "description": "Two to three sentences (max ~65 words) explaining the overall trajectory, naming the specific metrics and deltas that drive it.",
            },
            "positives": {
                "type": "array",
                "items": {"type": "string"},
                "maxItems": 3,
                "description": "Up to 3 short bullets, each naming a metric and its favourable movement with the number (e.g. 'Net revenue up $12,400 vs prior period').",
            },
            "risks": {
                "type": "array",
                "items": {"type": "string"},
                "maxItems": 3,
                "description": "Up to 3 short bullets, each naming a specific risk or alert and its magnitude (e.g. '7 overdue inspections').",
            },
            "actions": {
                "type": "array",
                "items": {"type": "string"},
                "maxItems": 3,
                "description": "Up to 3 concrete next steps (each max ~12 words), most impactful first, that an operations lead can assign today.",
            },
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
    model = settings.DASHBOARD_AI_MODEL.strip() or settings.AI_EXTRACTION_MODEL
    try:
        import anthropic

        client = anthropic.Anthropic(
            api_key=settings.ANTHROPIC_API_KEY,
            # A dashboard blurb should never hold a worker for a minute; keep the
            # timeout tight so a slow model degrades quickly to the fallback.
            timeout=float(settings.DASHBOARD_AI_TIMEOUT_SECONDS),
            max_retries=1,
        )
        message = client.messages.create(
            model=model,
            max_tokens=900,
            # The instructions are stable across requests, so cache them to cut
            # latency and cost on repeated analyses.
            system=[{
                "type": "text",
                "text": _SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }],
            tools=[_ANALYSIS_TOOL],
            tool_choice={"type": "tool", "name": "record_business_analysis"},
            messages=[{
                "role": "user",
                "content": (
                    "Analyse the selected period for the executive. Aggregate, "
                    "already-computed data (numbers are authoritative):\n"
                    f"{json.dumps(safe_payload, default=str, separators=(',', ':'))}"
                ),
            }],
        )
        usage = getattr(message, "usage", None)
        if usage is not None:
            logger.info(
                "dashboard_ai model=%s input_tokens=%s output_tokens=%s",
                model,
                getattr(usage, "input_tokens", "?"),
                getattr(usage, "output_tokens", "?"),
            )
        for block in message.content:
            if getattr(block, "type", None) == "tool_use" and getattr(block, "name", None) == "record_business_analysis":
                result = dict(block.input or {})
                return {
                    "available": True,
                    "source": f"ai:{model}",
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
