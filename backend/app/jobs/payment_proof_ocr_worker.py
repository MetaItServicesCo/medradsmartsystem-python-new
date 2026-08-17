"""Long-running worker for asynchronous payment-proof OCR."""

from __future__ import annotations

import logging
import signal
import time

from sqlalchemy import inspect

from app.core.config import settings
from app.db.base import engine
from app.utils.payment_proof_processing import run_payment_proof_ocr_batch


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("payment_proof_ocr_worker")
_stopping = False


def _request_stop(signum: int, _frame: object) -> None:
    global _stopping
    logger.info("Received signal %s; stopping after the current OCR job", signum)
    _stopping = True


def main() -> None:
    signal.signal(signal.SIGTERM, _request_stop)
    signal.signal(signal.SIGINT, _request_stop)
    if "payment_proofs" not in set(inspect(engine).get_table_names()):
        raise RuntimeError("Database migrations are not current; payment_proofs table is missing")
    poll_seconds = max(1, int(settings.PAYMENT_PROOF_OCR_POLL_SECONDS))
    logger.info(
        "Payment proof OCR worker started; poll=%ss batch=%s storage=%s",
        poll_seconds,
        settings.PAYMENT_PROOF_OCR_BATCH_SIZE,
        settings.PAYMENT_PROOF_STORAGE_BACKEND,
    )
    while not _stopping:
        try:
            result = run_payment_proof_ocr_batch()
            if result["claimed"]:
                logger.info("Payment proof OCR batch completed: %s", result)
            if result["claimed"] >= max(1, settings.PAYMENT_PROOF_OCR_BATCH_SIZE):
                continue
        except Exception:
            logger.exception("Payment proof OCR batch failed; processing will retry")
        deadline = time.monotonic() + poll_seconds
        while not _stopping and time.monotonic() < deadline:
            time.sleep(min(1, max(0, deadline - time.monotonic())))
    logger.info("Payment proof OCR worker stopped")


if __name__ == "__main__":
    main()
