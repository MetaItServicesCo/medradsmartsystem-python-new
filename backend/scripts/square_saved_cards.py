"""Remove saved cards that the connected Square account does not hold.

Cards saved for automatic charging (rentals, lease to own) live in the Square
account that saved them. Every card saved while the system ran on the Square
sandbox belongs to the sandbox, so after switching to production Square would
decline each automatic charge against it. This asks the connected Square
account about every saved card and customer reference:

* Square holds it, enabled: kept.
* Square does not hold it (or the card is disabled): removed, automatic
  charging is turned off, and a history entry says the customer must add a
  card again through their agreement link.
* Square could not be asked (network or other error): left alone and listed.

It also lists card payments still waiting for Square to confirm them. Those
block a new payment on the same invoice; --retire-pending-before closes the
ones started before the switch to production, which were sandbox payments.

Dry run by default; --apply writes, in one transaction. Safe to run again::

    python -m scripts.square_saved_cards
    python -m scripts.square_saved_cards --apply
    python -m scripts.square_saved_cards --apply --retire-pending-before 2026-11-04T09:00
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime
from typing import Any, Callable, Optional

import httpx

import app.models  # noqa: F401  (registers every model)
from app.db.base import SessionLocal
from app.models.lease import LeaseAgreement
from app.models.payment_operation import PaymentOperation
from app.models.rental import Rental
from app.utils.square_payments import _headers, _square_base_url, square_is_configured, square_public_config

PRESENT, MISSING, UNKNOWN = "present", "missing", "unknown"
REMOVED_REASON = ("The saved card was not found in the live Square account (it was saved during testing). "
                  "The customer must add a card again through their agreement link.")


def square_lookup(kind: str, reference: str) -> str:
    """PRESENT, MISSING or UNKNOWN for a card or customer reference."""
    try:
        response = httpx.get(f"{_square_base_url()}/{kind}/{reference}", headers=_headers(), timeout=20)
    except httpx.RequestError:
        return UNKNOWN
    if response.status_code == 404:
        return MISSING
    if response.status_code != 200:
        return UNKNOWN
    if kind == "cards" and not (response.json().get("card") or {}).get("enabled", False):
        return MISSING
    return PRESENT


def review(db, lookup: Callable[[str, str], str], report: dict[str, Any]) -> None:
    """Check every saved reference and clear the ones Square does not hold."""
    for model, label, number in ((Rental, "rental", "rental_number"), (LeaseAgreement, "lease", "agreement_number")):
        rows = db.query(model).filter((model.square_card_id.isnot(None)) | (model.square_customer_id.isnot(None))).all()
        for row in rows:
            name = "{} {}".format(label, getattr(row, number))
            card = lookup("cards", row.square_card_id) if row.square_card_id else None
            customer = lookup("customers", row.square_customer_id) if row.square_customer_id else None
            if UNKNOWN in (card, customer):
                report["unknown"].append(name)
                continue
            if card in (None, PRESENT) and customer in (None, PRESENT):
                report["kept"].append(name)
                continue
            report["removed"].append("{}  (card {}{})".format(
                name, row.square_card_last4 or "—", ", auto-charge was on" if row.auto_charge else ""))
            # A card is attached to its customer, so either one missing means
            # the pair belongs to another Square account: both go.
            row.square_card_id = None
            row.square_customer_id = None
            row.square_card_brand = None
            row.square_card_last4 = None
            row.square_card_exp_month = None
            row.square_card_exp_year = None
            row.auto_charge = False
            history = list(row.history or [])
            history.append({"action": "saved_card_removed", "by": "System (Square go-live)", "user_id": None,
                            "at": datetime.utcnow().isoformat(), "details": {"reason": REMOVED_REASON}})
            row.history = history


def pending_operations(db, retire_before: Optional[datetime], report: dict[str, Any]) -> None:
    rows = (db.query(PaymentOperation)
            .filter(PaymentOperation.status.in_(["processing", "unknown"]), PaymentOperation.provider == "square")
            .order_by(PaymentOperation.created_at).all())
    for operation in rows:
        line = "{:%Y-%m-%d %H:%M}  {} {} {}  invoice {}".format(
            operation.created_at, operation.operation_type, operation.amount, operation.currency, operation.invoice_id or "—")
        if retire_before and operation.created_at < retire_before:
            operation.status = "failed"
            operation.error_message = "Closed at the switch to Square production: a sandbox payment, no money moved."
            operation.completed_at = operation.updated_at = datetime.utcnow()
            report["retired"].append(line)
        else:
            report["pending"].append(line)


def new_report() -> dict[str, Any]:
    return {"kept": [], "removed": [], "unknown": [], "pending": [], "retired": []}


def main(argv: Optional[list[str]] = None, lookup: Callable[[str, str], str] = square_lookup,
         session_factory=SessionLocal) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--apply", action="store_true", help="write the changes (default: dry run)")
    parser.add_argument("--retire-pending-before", type=datetime.fromisoformat, default=None,
                        help="close Square payments still awaiting confirmation that started before this time")
    args = parser.parse_args(argv)
    if not square_is_configured():
        print("Square is not configured: nothing to check against.")
        return 1

    report = new_report()
    db = session_factory()
    try:
        review(db, lookup, report)
        pending_operations(db, args.retire_pending_before, report)
        if args.apply:
            db.commit()
        else:
            db.rollback()
    finally:
        db.close()

    print("Checked against Square {}{}".format(square_public_config()["environment"], "" if args.apply else "  (DRY RUN: nothing written)"))
    for key, title in (("kept", "saved cards Square holds (kept)"),
                       ("removed", "saved cards Square does not hold (removed{})".format("" if args.apply else " with --apply")),
                       ("unknown", "could not be checked (left alone; run again)"),
                       ("retired", "sandbox payments awaiting confirmation (closed{})".format("" if args.apply else " with --apply")),
                       ("pending", "payments still awaiting Square confirmation")):
        print("{}: {}".format(title, len(report[key])))
        for line in report[key]:
            print("    " + line)
    return 1 if report["unknown"] else 0


if __name__ == "__main__":
    sys.exit(main())
