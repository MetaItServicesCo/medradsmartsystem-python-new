"""Keep open service requests priced at their equipment's current tier.

A request's running Total Cost is hours x its tier's labor rate, stored when
work is saved. When an asset moves to another tier, or a tier's rate is
edited, a request still being worked kept the old figure -- and that figure
became the invoice. Open requests are re-priced at once; completed and
cancelled ones are left exactly as they were (a completed one is re-priced by
reopening it, which updates its invoice).

Every change of an asset's tier, and every edit of a tier's rates, is written
to the audit log with the old and new values, so "why was this billed at
$120/hr?" is answered from the record.
"""
from __future__ import annotations

from typing import Any, Iterable, Optional

from sqlalchemy.orm import Session, joinedload

from app.models.equipment import Equipment
from app.models.service_request import ServiceRequest, ServiceRequestStatus
from app.models.tier import Tier

# Response header telling the screen how many open requests were re-priced.
REPRICED_HEADER = "X-Repriced-Open-Requests"

_CLOSED = (ServiceRequestStatus.COMPLETED, ServiceRequestStatus.CANCELLED)
_RATE_FIELDS = ("labor_rate_per_hour", "service_call_fee", "mileage_rate", "preventive_maintenance_fee")


def tier_summary(tier: Optional[Tier]) -> Optional[dict[str, Any]]:
    if tier is None:
        return None
    return {
        "id": tier.id,
        "tier_code": tier.tier_code,
        "name": tier.name,
        **{field: str(getattr(tier, field)) for field in _RATE_FIELDS},
    }


def tier_rate_snapshot(tier: Tier) -> dict[str, str]:
    return {field: str(getattr(tier, field)) for field in _RATE_FIELDS}


def reprice_open_service_requests(db: Session, equipment_ids: Iterable[int]) -> int:
    """Re-price the open requests on these assets at their current tier.

    Returns how many requests' Total Cost changed. Does not commit.
    """
    # The pricing rule lives with the service requests; imported here so the
    # two can never disagree.
    from app.api.v1.endpoints.service_requests import _calculate_service_cost

    ids = [i for i in set(equipment_ids) if i]
    if not ids:
        return 0
    requests = (
        db.query(ServiceRequest)
        .options(joinedload(ServiceRequest.equipment).joinedload(Equipment.tier))
        .filter(ServiceRequest.equipment_id.in_(ids), ServiceRequest.status.notin_(_CLOSED))
        .all()
    )
    changed = 0
    for sr in requests:
        cost = _calculate_service_cost(sr)
        current = sr.total_cost if sr.total_cost is not None else 0
        if cost != current:
            sr.total_cost = cost
            changed += 1
    return changed


def equipment_on_tier(db: Session, tier_id: int) -> list[int]:
    return [row.id for row in db.query(Equipment.id).filter(Equipment.tier_id == tier_id).all()]
