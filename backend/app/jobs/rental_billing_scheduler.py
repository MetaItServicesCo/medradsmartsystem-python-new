"""Long-running cron worker for recurring rental billing and receipts."""

from __future__ import annotations

import logging
import signal
import time

from sqlalchemy import inspect

from app.core.config import settings
from app.db.base import SessionLocal, engine
from app.utils.rental_billing_job import run_rental_billing_job


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("rental_billing_scheduler")
_stopping = False


def _request_stop(signum: int, _frame: object) -> None:
    global _stopping
    logger.info("Received signal %s; stopping after the current billing run", signum)
    _stopping = True


def run_once() -> dict[str, object]:
    required_tables = {"payment_receipt_deliveries", "rental_payment_authorizations"}
    available_tables = set(inspect(engine).get_table_names())
    missing = sorted(required_tables - available_tables)
    if missing:
        raise RuntimeError(
            "Database migrations are not current; recurring billing is paused. "
            f"Missing tables: {', '.join(missing)}"
        )
    db = SessionLocal()
    try:
        result = run_rental_billing_job(db)
        logger.info("Recurring rental billing run completed: %s", result)
        return result
    finally:
        db.close()


def main() -> None:
    signal.signal(signal.SIGTERM, _request_stop)
    signal.signal(signal.SIGINT, _request_stop)
    interval = max(60, int(settings.RENTAL_BILLING_INTERVAL_SECONDS))
    logger.info("Rental billing cron worker started; interval=%ss", interval)
    while not _stopping:
        started = time.monotonic()
        failed = False
        try:
            run_once()
        except Exception:
            failed = True
            logger.exception("Recurring rental billing run failed; it will retry")
        delay = 60 if failed else max(5, interval - int(time.monotonic() - started))
        deadline = time.monotonic() + delay
        while not _stopping and time.monotonic() < deadline:
            time.sleep(min(5, max(0, deadline - time.monotonic())))
    logger.info("Rental billing cron worker stopped")


if __name__ == "__main__":
    main()
