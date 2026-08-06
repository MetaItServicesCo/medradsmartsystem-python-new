from __future__ import annotations

from typing import Any, Optional

from app.models.rental import Rental, RentalExtensionRequest, RentalExtensionStatus


OPEN_EXTENSION_STATUSES = {
    RentalExtensionStatus.REQUESTED.value,
    RentalExtensionStatus.OFFERED.value,
}


def extension_response(extension: Optional[RentalExtensionRequest]) -> Optional[dict[str, Any]]:
    if not extension:
        return None
    return {
        "id": extension.id,
        "sequence": extension.sequence,
        "status": extension.status,
        "requested_end_date": extension.requested_end_date,
        "requested_additional_periods": extension.requested_additional_periods,
        "request_reason": extension.request_reason,
        "requested_by_name": extension.requested_by_name,
        "requested_at": extension.requested_at,
        "original_end_date": extension.original_end_date,
        "original_committed_periods": extension.original_committed_periods,
        "offered_end_date": extension.offered_end_date,
        "offered_total_periods": extension.offered_total_periods,
        "offered_terms": extension.offered_terms,
        "offered_at": extension.offered_at,
        "decision_notes": extension.decision_notes,
        "accepted_by_name": extension.accepted_by_name,
        "signature_name": extension.signature_name,
        "terms_accepted": extension.terms_accepted,
        "continue_auto_charge": extension.continue_auto_charge,
        "accepted_at": extension.accepted_at,
        "activated_at": extension.activated_at,
        "rejected_at": extension.rejected_at,
        "created_at": extension.created_at,
        "updated_at": extension.updated_at,
    }


def current_extension(rental: Rental) -> Optional[RentalExtensionRequest]:
    extensions = list(rental.extensions or [])
    if not extensions:
        return None
    open_item = next((item for item in reversed(extensions) if item.status in OPEN_EXTENSION_STATUSES), None)
    return open_item or extensions[-1]

