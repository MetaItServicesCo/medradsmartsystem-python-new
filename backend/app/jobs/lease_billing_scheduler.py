"""Long-running worker for lease-to-own collection.

Its own process and its own advisory lock, beside the rental worker rather
than inside it: a slow or failing lease run can never delay rental billing,
and a change here can never alter how rental customers are charged.

Receipts it queues are delivered by the rental worker's existing receipt
delivery, which sends every due receipt regardless of what raised it.
"""

from __future__ import annotations

import logging
import signal
import time

from sqlalchemy import inspect

from app.core.config import settings
from app.db.base import SessionLocal, engine
from app.utils.lease_billing import run_lease_billing_job


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("lease_billing_scheduler")
_stopping = False

REQUIRED_TABLES = {"lease_agreements", "lease_installments", "lease_payment_authorizations"}


def _request_stop(signum: int, _frame: object) -> None:
    global _stopping
    logger.info("Received signal %s; stopping after the current lease run", signum)
    _stopping = True


def run_once() -> dict[str, object]:
    missing = sorted(REQUIRED_TABLES - set(inspect(engine).get_table_names()))
    if missing:
        # Refuse rather than half-run against a database the migration has
        # not reached yet.
        raise RuntimeError(
            "Database migrations are not current; lease billing is paused. "
            "Missing tables: {}".format(", ".join(missing))
        )
    db = SessionLocal()
    try:
        result = run_lease_billing_job(db)
        logger.info("Lease billing run completed: %s", result)
        return result
    finally:
        db.close()


def main() -> None:
    signal.signal(signal.SIGTERM, _request_stop)
    signal.signal(signal.SIGINT, _request_stop)
    # Same cadence as rental billing unless configured otherwise.
    interval = max(60, int(getattr(settings, "LEASE_BILLING_INTERVAL_SECONDS", None)
                           or settings.RENTAL_BILLING_INTERVAL_SECONDS))
    logger.info("Lease billing worker started; interval=%ss", interval)
    while not _stopping:
        started = time.monotonic()
        failed = False
        try:
            run_once()
        except Exception:
            failed = True
            logger.exception("Lease billing run failed; it will retry")
        delay = 60 if failed else max(5, interval - int(time.monotonic() - started))
        deadline = time.monotonic() + delay
        while not _stopping and time.monotonic() < deadline:
            time.sleep(min(5, max(0, deadline - time.monotonic())))
    logger.info("Lease billing worker stopped")


if __name__ == "__main__":
    main()
