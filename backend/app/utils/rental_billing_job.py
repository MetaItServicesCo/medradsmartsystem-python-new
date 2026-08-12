"""Concurrency-safe orchestration for the recurring rental billing job."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.utils.payment_receipts import deliver_due_payment_receipts
from app.utils.rental_billing import run_rental_recurring_billing
from app.utils.rental_card_security import retry_pending_card_cleanup


logger = logging.getLogger(__name__)

# Stable signed 64-bit key reserved for the MedRad recurring rental worker.
_RENTAL_BILLING_LOCK_KEY = 684_732_019_2026


def run_rental_billing_job(db: Session) -> dict[str, Any]:
    """Run recurring billing once, with one active runner per PostgreSQL DB.

    A dedicated connection owns the session-level advisory lock while the
    billing Session is free to commit each rental independently. This keeps a
    slow/failed agreement from rolling back successful agreements and prevents
    a manual admin trigger from overlapping the scheduler container.
    """
    engine = db.get_bind()
    lock_connection = None
    acquired = True
    if engine.dialect.name == "postgresql":
        lock_connection = engine.connect()
        acquired = bool(
            lock_connection.execute(
                text("SELECT pg_try_advisory_lock(:lock_key)"),
                {"lock_key": _RENTAL_BILLING_LOCK_KEY},
            ).scalar()
        )
    if not acquired:
        if lock_connection is not None:
            lock_connection.close()
        return {"already_running": 1}

    try:
        cleanup_completed, cleanup_pending = retry_pending_card_cleanup(db)
        db.commit()
        result = run_rental_recurring_billing(db)
        result.update(deliver_due_payment_receipts(db))
        result.update({
            "already_running": 0,
            "saved_card_cleanup_completed": cleanup_completed,
            "saved_card_cleanup_pending": cleanup_pending,
        })
        return result
    except Exception:
        db.rollback()
        logger.exception("Recurring rental billing job failed")
        raise
    finally:
        if lock_connection is not None:
            try:
                lock_connection.execute(
                    text("SELECT pg_advisory_unlock(:lock_key)"),
                    {"lock_key": _RENTAL_BILLING_LOCK_KEY},
                )
                lock_connection.commit()
            finally:
                lock_connection.close()
