from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from fastapi import Request
from sqlalchemy.orm import Session

from app.models.invoice import Invoice
from app.models.rental import Rental, RentalPaymentAuthorization
from app.models.user import User
from app.utils.payment_data_security import payment_data_encryption_configured
from app.utils.square_payments import (
    SquareRequestError,
    create_square_card_on_file,
    disable_square_card,
)


CONSENT_VERSION = "rental-autopay-v1"


def vault_replacement_card(
    rental: Rental,
    *,
    source_id: str,
    idempotency_key: str,
) -> tuple[dict[str, Any], bool]:
    """Vault a replacement while preserving the previous reference for cleanup.

    Provider cleanup happens only after the database safely commits the new
    encrypted reference. This ordering prevents a database failure from
    disabling the customer's only usable card.
    """
    if not payment_data_encryption_configured():
        raise SquareRequestError(
            "Secure saved-card storage is not configured",
            status_code=503,
        )
    old_card_id = rental.square_card_id
    result = create_square_card_on_file(
        source_id=source_id,
        idempotency_key=idempotency_key,
        customer_name=rental.customer_name,
        customer_email=rental.customer_email,
        customer_id=rental.square_customer_id,
    )
    return result, bool(old_card_id and old_card_id != result["card_id"])


def _frequency(rental: Rental) -> str:
    value = rental.billing_frequency
    return str(value.value if hasattr(value, "value") else value or "recurring").replace("biweekly", "bi-weekly")


def automatic_payment_consent(rental: Rental) -> str:
    frequency = _frequency(rental)
    return (
        f"I authorize MedRad to securely save this card with Square and automatically charge "
        f"future {frequency} invoices generated under rental agreement {rental.rental_number}, "
        "according to the signed billing schedule, until the agreement ends or I revoke authorization. "
        "Invoice amounts may vary only as allowed by the signed agreement and its accepted amendments."
    )


def card_storage_consent(rental: Rental) -> str:
    return (
        f"I authorize MedRad to securely save this card with Square for rental agreement "
        f"{rental.rental_number}. Saving the card alone does not authorize automatic charges."
    )


def _request_evidence(request: Optional[Request]) -> tuple[Optional[str], Optional[str]]:
    if request is None:
        return None, None
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    ip_address = forwarded or (request.client.host if request.client else None)
    user_agent = request.headers.get("user-agent", "")[:2000] or None
    return ip_address, user_agent


def record_card_event(
    db: Session,
    rental: Rental,
    *,
    event_type: str,
    accepted_by_name: str,
    channel: str,
    authorize_auto_charge: bool = False,
    current_user: Optional[User] = None,
    request: Optional[Request] = None,
    invoice: Optional[Invoice] = None,
    card: Optional[dict[str, Any]] = None,
    provider_cleanup_pending: bool = False,
    provider_card_reference: Optional[str] = None,
    consent_text_override: Optional[str] = None,
) -> RentalPaymentAuthorization:
    ip_address, user_agent = _request_evidence(request)
    if event_type in {"revoked", "removed"}:
        consent_text = (
            f"Automatic card charges for rental agreement {rental.rental_number} were revoked"
            + (" and the saved card was removed." if event_type == "removed" else ".")
        )
    elif authorize_auto_charge:
        consent_text = automatic_payment_consent(rental)
    else:
        consent_text = card_storage_consent(rental)
    if consent_text_override:
        consent_text = consent_text_override.strip()
    evidence = RentalPaymentAuthorization(
        rental_id=rental.id,
        invoice_id=invoice.id if invoice else None,
        event_type=event_type,
        consent_version=CONSENT_VERSION,
        consent_text=consent_text,
        billing_frequency=_frequency(rental),
        agreement_revision=rental.revision or 1,
        accepted_by_name=(accepted_by_name or "Unknown").strip()[:200],
        accepted_by_user_id=current_user.id if current_user else None,
        channel=channel,
        ip_address=ip_address,
        user_agent=user_agent,
        card_brand=(card or {}).get("card_brand") or rental.square_card_brand,
        card_last4=(card or {}).get("last_4") or rental.square_card_last4,
        card_exp_month=(card or {}).get("exp_month") or rental.square_card_exp_month,
        card_exp_year=(card or {}).get("exp_year") or rental.square_card_exp_year,
        provider_cleanup_pending=provider_cleanup_pending,
        provider_card_reference=provider_card_reference,
        created_at=datetime.utcnow(),
    )
    db.add(evidence)
    db.flush()
    if authorize_auto_charge:
        rental.payment_authorization_id = evidence.id
    elif event_type in {"revoked", "removed"}:
        rental.payment_authorization_id = None
    return evidence


def complete_provider_card_cleanup(db: Session, evidence: RentalPaymentAuthorization) -> bool:
    """Attempt provider cleanup and retain an encrypted retry record on failure."""
    if not evidence.provider_cleanup_pending or not evidence.provider_card_reference:
        return True
    try:
        disable_square_card(evidence.provider_card_reference)
    except SquareRequestError:
        return False
    evidence.provider_cleanup_pending = False
    evidence.provider_card_reference = None
    db.flush()
    return True


def retry_pending_card_cleanup(db: Session, *, limit: int = 50) -> tuple[int, int]:
    pending = (
        db.query(RentalPaymentAuthorization)
        .filter(
            RentalPaymentAuthorization.provider_cleanup_pending.is_(True),
            RentalPaymentAuthorization.provider_card_reference.isnot(None),
        )
        .order_by(RentalPaymentAuthorization.id.asc())
        .limit(limit)
        .all()
    )
    completed = 0
    for evidence in pending:
        if complete_provider_card_cleanup(db, evidence):
            completed += 1
            # A revoke/remove is effective locally before the provider call so
            # recurring billing stops immediately. Once the deferred provider
            # cleanup succeeds, remove the now-disabled reference and restore
            # any conditional pricing that requires a saved card.
            if evidence.event_type in {"revoked", "removed"} and evidence.rental:
                rental = evidence.rental
                clear_saved_card(rental)
                evidence.event_type = "removed"
                from app.utils.rental_billing import reprice_unpaid_rental_invoice

                for invoice in (
                    db.query(Invoice)
                    .filter(Invoice.rental_id == rental.id)
                    .all()
                ):
                    reprice_unpaid_rental_invoice(invoice, rental)
    return completed, len(pending) - completed


def store_saved_card(
    rental: Rental,
    card: dict[str, Any],
    *,
    authorize_auto_charge: bool,
    authorized_by: str,
) -> None:
    rental.square_card_id = card["card_id"]
    rental.square_customer_id = card["customer_id"]
    rental.square_card_brand = card.get("card_brand")
    rental.square_card_last4 = card.get("last_4")
    rental.square_card_exp_month = card.get("exp_month")
    rental.square_card_exp_year = card.get("exp_year")
    rental.failed_charge_count = 0
    if authorize_auto_charge:
        rental.auto_charge = True
        rental.auto_charge_authorized_at = datetime.utcnow()
        rental.auto_charge_authorized_by = authorized_by
    else:
        rental.auto_charge = False
        rental.auto_charge_authorized_at = None
        rental.auto_charge_authorized_by = None
        rental.payment_authorization_id = None


def revoke_auto_charge(rental: Rental) -> None:
    rental.auto_charge = False
    rental.auto_charge_authorized_at = None
    rental.auto_charge_authorized_by = None
    rental.payment_authorization_id = None


def clear_saved_card(rental: Rental) -> None:
    revoke_auto_charge(rental)
    rental.square_card_id = None
    rental.square_customer_id = None
    rental.square_card_brand = None
    rental.square_card_last4 = None
    rental.square_card_exp_month = None
    rental.square_card_exp_year = None
    rental.failed_charge_count = 0
