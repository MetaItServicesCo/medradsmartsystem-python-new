"""Keep the generated knowledge base in step with the deployed code.

The knowledge base describes the application itself, so it goes stale the moment
a route, model or screen changes — and a stale navigation answer is worse than
no answer, because it is confidently wrong. Running this at startup ties
regeneration to deployment, which is exactly when the code changes.

Three properties make it safe to run on every boot:

* hash-gated - documents whose content is unchanged are skipped, so a restart
  that changed nothing performs no writes at all;
* single-flight - a PostgreSQL advisory lock means only one worker refreshes,
  and the others move on immediately rather than duplicating the work;
* non-fatal - any failure is logged and swallowed. The assistant degrades to a
  slightly stale knowledge base; the API must still start.
"""
from __future__ import annotations

import logging
import threading
import time
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import text

from app.core.config import settings


logger = logging.getLogger("medrad.assistant.kb_refresh")

# Namespaced so it cannot collide with other advisory locks in the system.
_LOCK_KEY = "medrad:assistant:kb-refresh"

# Last outcome, surfaced through the assistant status endpoint. Log output from
# a background thread is easy to miss under the server's logging config, and an
# operator needs to be able to confirm the knowledge base is current.
_last_refresh: dict[str, Any] = {"state": "not_run"}


def last_refresh() -> dict[str, Any]:
    return dict(_last_refresh)


def _openapi_spec() -> Optional[dict[str, Any]]:
    try:
        from app.main import app

        return app.openapi()
    except Exception:
        # Operation documents are valuable but not essential; the rest of the
        # knowledge base is still worth regenerating without them.
        logger.warning("Could not build the OpenAPI schema; skipping operation documents")
        return None


def refresh_knowledge_base() -> dict[str, Any]:
    """Regenerate and ingest. Returns a summary; never raises."""
    global _last_refresh
    started = time.perf_counter()
    try:
        from app.assistant.kb.generator import coverage_report, generate_all
        from app.assistant.kb.ingest import ingest_documents
        from app.db.base import SessionLocal

        session = SessionLocal()
        try:
            # Non-blocking: if another worker holds the lock it is already doing
            # this, so there is nothing useful to wait for.
            acquired = session.execute(
                text("SELECT pg_try_advisory_lock(hashtext(:key))"), {"key": _LOCK_KEY}
            ).scalar()
            if not acquired:
                logger.info("Knowledge-base refresh already running elsewhere; skipping")
                _last_refresh = {"state": "skipped_locked"}
                return dict(_last_refresh)

            try:
                documents = generate_all(_openapi_spec())
                summary = ingest_documents(session, documents)
                report = coverage_report(documents)
                elapsed_ms = int((time.perf_counter() - started) * 1000)
                summary.update({
                    "tables_covered": report["tables_covered"],
                    "tables_expected": report["tables_expected"],
                    "elapsed_ms": elapsed_ms,
                })
                if report["missing_tables"]:
                    logger.warning(
                        "Knowledge base is missing tables: %s",
                        ", ".join(report["missing_tables"]),
                    )
                logger.info("Knowledge-base refresh complete %s", summary)
                summary["state"] = "ok"
                summary["at"] = datetime.utcnow().isoformat() + "Z"
                _last_refresh = summary
                return summary
            finally:
                session.execute(
                    text("SELECT pg_advisory_unlock(hashtext(:key))"), {"key": _LOCK_KEY}
                )
                session.commit()
        finally:
            session.close()
    except Exception:
        # A knowledge base that is one deploy out of date is a far smaller
        # problem than an API that will not start.
        logger.exception("Knowledge-base refresh failed; continuing with existing content")
        _last_refresh = {
            "state": "failed",
            "at": datetime.utcnow().isoformat() + "Z",
        }
        return dict(_last_refresh)


def schedule_startup_refresh() -> None:
    """Refresh in the background shortly after boot, if enabled.

    Deliberately off the startup path: the API should accept traffic
    immediately, and this reads every model and route, which takes a moment.
    """
    if not settings.ASSISTANT_ENABLED:
        return
    if not settings.ASSISTANT_KB_AUTO_REFRESH:
        logger.info("Knowledge-base auto-refresh disabled")
        return

    def run() -> None:
        # Let the application finish binding before doing this work.
        time.sleep(settings.ASSISTANT_KB_REFRESH_DELAY_SECONDS)
        refresh_knowledge_base()

    thread = threading.Thread(target=run, name="kb-refresh", daemon=True)
    thread.start()
