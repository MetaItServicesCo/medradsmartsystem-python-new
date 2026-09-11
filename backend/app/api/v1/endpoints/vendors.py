"""Vendors, their contracts, and the credentials that let them on site.

The credential rollup on `Vendor` is maintained here and nowhere else. It is
denormalised so that the dispatch screen can check one boolean instead of
running three joins on every assignment, which means every write path that
touches a credential has to call `refresh_credential_status` — a rollup that is
sometimes stale is worse than no rollup, because it will be trusted.
"""
from typing import Any, List, Optional
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_admin_user
from app.db.base import get_db
from app.models.user import User
from app.models.vendor import (
    CredentialType, Vendor, VendorContact, VendorContract, VendorContractStatus,
    VendorContractAsset, VendorCredential, VendorStatus, VendorType,
)
from app.schemas.vendor import (
    ComplianceWatchlist, ExpiringCredential, Vendor as VendorSchema, VendorContact as VendorContactSchema,
    VendorContactCreate, VendorContactUpdate, VendorContract as VendorContractSchema,
    VendorContractCreate, VendorContractListResponse, VendorContractUpdate,
    VendorCreate, VendorCredential as VendorCredentialSchema, VendorCredentialCreate,
    VendorCredentialUpdate, VendorDetail, VendorListResponse, VendorUpdate,
)
from app.utils.clock import utc_today
from app.utils.facility_access import (
    get_user_facility_ids, is_facility_scoped_user, require_facility_access,
)

router = APIRouter()

# How far ahead the watchlist looks. Sixty days is roughly the notice period a
# broker needs to reissue a certificate of insurance without anybody's work
# being interrupted.
DEFAULT_EXPIRY_HORIZON_DAYS = 60


def _vendor_or_404(db: Session, vendor_id: int) -> Vendor:
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if vendor is None:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return vendor


def refresh_credential_status(db: Session, vendor: Vendor) -> Vendor:
    """Recompute the dispatch gate from the credential rows.

    A vendor with no blocking credentials on file is NOT compliant. That
    asymmetry is deliberate: an empty record means nobody has checked, and
    treating "unknown" as "fine" is exactly the failure an accreditation survey
    is looking for.
    """
    blocking = [c for c in vendor.credentials if c.is_blocking]
    today = utc_today()

    if not blocking:
        vendor.credentials_ok = False
        vendor.earliest_credential_expiry = None
        return vendor

    # A blocking credential with no expiry date is treated as valid — some
    # licences genuinely do not expire — but one that has passed its date is not.
    expiries = [c.expires_on for c in blocking if c.expires_on is not None]
    vendor.earliest_credential_expiry = min(expiries) if expiries else None
    vendor.credentials_ok = all(
        c.expires_on is None or c.expires_on >= today for c in blocking
    )
    return vendor


def _as_schema(vendor: Vendor) -> VendorSchema:
    payload = VendorSchema.model_validate(vendor)
    payload.is_dispatchable = vendor.is_dispatchable
    return payload


# ── Metadata ─────────────────────────────────────────────────────────────────

@router.get("/meta")
def vendor_metadata(current_user: User = Depends(get_current_user)) -> Any:
    return {
        "vendor_types": [{"value": v.value, "label": v.value.replace("_", " ").title()} for v in VendorType],
        "statuses": [{"value": s.value, "label": s.value.title()} for s in VendorStatus],
        "credential_types": [
            {"value": c.value, "label": c.value.replace("_", " ").title()} for c in CredentialType
        ],
        "contract_statuses": [{"value": s.value, "label": s.value.replace("_", " ").title()} for s in VendorContractStatus],
    }


# ── Compliance watchlist ─────────────────────────────────────────────────────

@router.get("/compliance/watchlist", response_model=ComplianceWatchlist)
def compliance_watchlist(
    db: Session = Depends(get_db),
    horizon_days: int = Query(DEFAULT_EXPIRY_HORIZON_DAYS, ge=1, le=365),
    current_user: User = Depends(get_current_user),
) -> Any:
    """What a surveyor will ask about, before they ask.

    Expired and expiring are split because they need different responses: one is
    a vendor who has to stop work today, the other is a phone call this week.
    """
    today = utc_today()
    horizon = today + timedelta(days=horizon_days)

    rows = (
        db.query(VendorCredential, Vendor)
        .join(Vendor, Vendor.id == VendorCredential.vendor_id)
        .filter(
            VendorCredential.expires_on.isnot(None),
            VendorCredential.expires_on <= horizon,
            Vendor.status != VendorStatus.INACTIVE.value,
        )
        .order_by(VendorCredential.expires_on.asc())
        .all()
    )

    expired: List[ExpiringCredential] = []
    expiring: List[ExpiringCredential] = []

    for credential, vendor in rows:
        entry = ExpiringCredential(
            vendor_id=vendor.id,
            vendor_name=vendor.name,
            credential_id=credential.id,
            credential_type=credential.credential_type,
            identifier=credential.identifier,
            expires_on=credential.expires_on,
            days_until_expiry=credential.days_until_expiry,
            is_blocking=credential.is_blocking,
            is_expired=credential.is_expired,
        )
        (expired if credential.is_expired else expiring).append(entry)

    blocked = (
        db.query(func.count(Vendor.id))
        .filter(Vendor.credentials_ok.is_(False), Vendor.status == VendorStatus.ACTIVE.value)
        .scalar() or 0
    )

    return ComplianceWatchlist(
        expired=expired,
        expiring_soon=expiring,
        horizon_days=horizon_days,
        blocked_vendor_count=int(blocked),
    )


# ── Vendors ──────────────────────────────────────────────────────────────────

@router.get("/", response_model=VendorListResponse)
def list_vendors(
    db: Session = Depends(get_db),
    q: Optional[str] = Query(None),
    vendor_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    discipline_id: Optional[int] = Query(None),
    dispatchable_only: bool = Query(False),
    skip: int = 0,
    limit: int = Query(100, le=500),
    current_user: User = Depends(get_current_user),
) -> Any:
    query = db.query(Vendor)

    if q:
        term = f"%{q.strip()}%"
        query = query.filter(or_(Vendor.name.ilike(term), Vendor.code.ilike(term), Vendor.legal_name.ilike(term)))
    if vendor_type:
        query = query.filter(Vendor.vendor_type == vendor_type)
    if status:
        query = query.filter(Vendor.status == status)
    if dispatchable_only:
        query = query.filter(
            Vendor.status == VendorStatus.ACTIVE.value, Vendor.credentials_ok.is_(True),
        )

    total = query.count()
    rows = query.order_by(Vendor.name.asc()).offset(skip).limit(limit).all()

    if discipline_id is not None:
        # JSON containment varies by backend; filtering in Python keeps this
        # portable and the vendor list is small enough that it costs nothing.
        rows = [v for v in rows if v.discipline_ids and discipline_id in v.discipline_ids]
        total = len(rows)

    return {"items": [_as_schema(v) for v in rows], "total": total}


@router.get("/{id}", response_model=VendorDetail)
def get_vendor(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    vendor = _vendor_or_404(db, id)
    detail = VendorDetail.model_validate(vendor)
    detail.is_dispatchable = vendor.is_dispatchable
    detail.credentials = [
        _credential_schema(credential) for credential in vendor.credentials
    ]
    detail.contracts = [_contract_schema(contract) for contract in vendor.contracts]
    return detail


@router.post("/", response_model=VendorSchema, status_code=201)
def create_vendor(
    payload: VendorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    if db.query(Vendor.id).filter(Vendor.code == payload.code).first():
        raise HTTPException(status_code=409, detail=f"A vendor coded '{payload.code}' already exists")

    vendor = Vendor(**payload.model_dump())
    db.add(vendor)
    db.commit()
    db.refresh(vendor)
    # New vendors start not dispatchable, by design: no credentials on file
    # means nobody has checked, not that everything is in order.
    refresh_credential_status(db, vendor)
    db.commit()
    db.refresh(vendor)
    return _as_schema(vendor)


@router.put("/{id}", response_model=VendorSchema)
def update_vendor(
    id: int,
    payload: VendorUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    vendor = _vendor_or_404(db, id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(vendor, field, value)
    db.commit()
    db.refresh(vendor)
    return _as_schema(vendor)


@router.delete("/{id}")
def delete_vendor(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    """Deactivate rather than delete when there is history.

    A vendor named on a closed work order is part of the evidence that the work
    was done by somebody qualified. Removing the row makes that unanswerable.
    """
    from app.models.service_request import ServiceRequest

    vendor = _vendor_or_404(db, id)
    referenced = (
        db.query(func.count(ServiceRequest.id))
        .filter(ServiceRequest.assigned_vendor_id == vendor.id).scalar() or 0
    )
    if referenced:
        vendor.status = VendorStatus.INACTIVE.value
        db.commit()
        return {
            "detail": f"Vendor marked inactive — {referenced} work order(s) reference it",
            "deactivated": True,
        }

    db.delete(vendor)
    db.commit()
    return {"detail": "Vendor deleted", "deactivated": False}


# ── Contacts ─────────────────────────────────────────────────────────────────

@router.get("/{id}/contacts", response_model=List[VendorContactSchema])
def list_contacts(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    _vendor_or_404(db, id)
    return (
        db.query(VendorContact)
        .filter(VendorContact.vendor_id == id)
        .order_by(
            VendorContact.is_primary.desc(),
            VendorContact.escalation_order.asc().nullslast(),
            VendorContact.full_name.asc(),
        )
        .all()
    )


@router.post("/{id}/contacts", response_model=VendorContactSchema, status_code=201)
def create_contact(
    id: int,
    payload: VendorContactCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    _vendor_or_404(db, id)
    data = payload.model_dump()
    data["vendor_id"] = id

    if data.get("is_primary"):
        # Exactly one primary. Two is the same as none when somebody is trying
        # to find a phone number quickly.
        db.query(VendorContact).filter(
            VendorContact.vendor_id == id, VendorContact.is_primary.is_(True),
        ).update({VendorContact.is_primary: False}, synchronize_session=False)

    contact = VendorContact(**data)
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


@router.put("/contacts/{contact_id}", response_model=VendorContactSchema)
def update_contact(
    contact_id: int,
    payload: VendorContactUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    contact = db.query(VendorContact).filter(VendorContact.id == contact_id).first()
    if contact is None:
        raise HTTPException(status_code=404, detail="Contact not found")

    data = payload.model_dump(exclude_unset=True)
    if data.get("is_primary"):
        db.query(VendorContact).filter(
            VendorContact.vendor_id == contact.vendor_id,
            VendorContact.id != contact.id,
            VendorContact.is_primary.is_(True),
        ).update({VendorContact.is_primary: False}, synchronize_session=False)

    for field, value in data.items():
        setattr(contact, field, value)
    db.commit()
    db.refresh(contact)
    return contact


@router.delete("/contacts/{contact_id}")
def delete_contact(
    contact_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    contact = db.query(VendorContact).filter(VendorContact.id == contact_id).first()
    if contact is None:
        raise HTTPException(status_code=404, detail="Contact not found")
    db.delete(contact)
    db.commit()
    return {"detail": "Contact deleted"}


# ── Credentials ──────────────────────────────────────────────────────────────

def _credential_schema(credential: VendorCredential) -> VendorCredentialSchema:
    payload = VendorCredentialSchema.model_validate(credential)
    payload.is_expired = credential.is_expired
    payload.days_until_expiry = credential.days_until_expiry
    return payload


@router.get("/{id}/credentials", response_model=List[VendorCredentialSchema])
def list_credentials(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    _vendor_or_404(db, id)
    rows = (
        db.query(VendorCredential)
        .filter(VendorCredential.vendor_id == id)
        .order_by(VendorCredential.expires_on.asc().nullslast())
        .all()
    )
    return [_credential_schema(row) for row in rows]


@router.post("/{id}/credentials", response_model=VendorCredentialSchema, status_code=201)
def create_credential(
    id: int,
    payload: VendorCredentialCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    vendor = _vendor_or_404(db, id)
    data = payload.model_dump()
    data["vendor_id"] = id

    credential = VendorCredential(**data)
    db.add(credential)
    db.flush()
    db.refresh(vendor)
    refresh_credential_status(db, vendor)
    db.commit()
    db.refresh(credential)
    return _credential_schema(credential)


@router.put("/credentials/{credential_id}", response_model=VendorCredentialSchema)
def update_credential(
    credential_id: int,
    payload: VendorCredentialUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    credential = db.query(VendorCredential).filter(VendorCredential.id == credential_id).first()
    if credential is None:
        raise HTTPException(status_code=404, detail="Credential not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(credential, field, value)
    db.flush()

    vendor = _vendor_or_404(db, credential.vendor_id)
    db.refresh(vendor)
    refresh_credential_status(db, vendor)
    db.commit()
    db.refresh(credential)
    return _credential_schema(credential)


@router.delete("/credentials/{credential_id}")
def delete_credential(
    credential_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    credential = db.query(VendorCredential).filter(VendorCredential.id == credential_id).first()
    if credential is None:
        raise HTTPException(status_code=404, detail="Credential not found")

    vendor_id = credential.vendor_id
    db.delete(credential)
    db.flush()

    vendor = _vendor_or_404(db, vendor_id)
    db.refresh(vendor)
    refresh_credential_status(db, vendor)
    db.commit()
    return {"detail": "Credential deleted"}


# ── Contracts ────────────────────────────────────────────────────────────────

def _contract_schema(contract: VendorContract) -> VendorContractSchema:
    payload = VendorContractSchema.model_validate(contract)
    payload.is_current = contract.is_current
    payload.covered_equipment_ids = [link.equipment_id for link in contract.covered_assets]
    return payload


@router.get("/contracts/all", response_model=VendorContractListResponse)
def list_contracts(
    db: Session = Depends(get_db),
    vendor_id: Optional[int] = Query(None),
    facility_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    expiring_within_days: Optional[int] = Query(None, ge=1, le=730),
    skip: int = 0,
    limit: int = Query(100, le=500),
    current_user: User = Depends(get_current_user),
) -> Any:
    query = db.query(VendorContract)
    if vendor_id is not None:
        query = query.filter(VendorContract.vendor_id == vendor_id)
    if facility_id is not None:
        require_facility_access(db, current_user, facility_id)
        # A NULL facility means the contract covers every facility, so it has
        # to come back when filtering for any one of them.
        query = query.filter(
            or_(VendorContract.facility_id == facility_id, VendorContract.facility_id.is_(None))
        )
    if is_facility_scoped_user(current_user):
        # The same rule without an explicit filter. A vendor is global — one
        # contractor can serve every hospital — but a contract names the site
        # it covers, and its commercial terms are that site's business.
        query = query.filter(or_(
            VendorContract.facility_id.in_(get_user_facility_ids(db, current_user)),
            VendorContract.facility_id.is_(None),
        ))
    if status:
        query = query.filter(VendorContract.status == status)
    if expiring_within_days is not None:
        cutoff = utc_today() + timedelta(days=expiring_within_days)
        query = query.filter(
            VendorContract.end_date.isnot(None), VendorContract.end_date <= cutoff,
        )

    total = query.count()
    rows = (
        query.order_by(VendorContract.end_date.asc().nullslast())
        .offset(skip).limit(limit).all()
    )
    return {"items": [_contract_schema(row) for row in rows], "total": total}


@router.post("/contracts", response_model=VendorContractSchema, status_code=201)
def create_contract(
    payload: VendorContractCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    _vendor_or_404(db, payload.vendor_id)
    if payload.facility_id is not None:
        require_facility_access(db, current_user, payload.facility_id)
    if db.query(VendorContract.id).filter(
        VendorContract.contract_number == payload.contract_number
    ).first():
        raise HTTPException(
            status_code=409, detail=f"Contract '{payload.contract_number}' already exists",
        )

    data = payload.model_dump()
    equipment_ids = data.pop("covered_equipment_ids", None) or []

    contract = VendorContract(**data)
    db.add(contract)
    db.flush()

    for equipment_id in set(equipment_ids):
        db.add(VendorContractAsset(contract_id=contract.id, equipment_id=equipment_id))

    db.commit()
    db.refresh(contract)
    return _contract_schema(contract)


@router.put("/contracts/{contract_id}", response_model=VendorContractSchema)
def update_contract(
    contract_id: int,
    payload: VendorContractUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    contract = db.query(VendorContract).filter(VendorContract.id == contract_id).first()
    if contract is None:
        raise HTTPException(status_code=404, detail="Contract not found")

    data = payload.model_dump(exclude_unset=True)
    equipment_ids = data.pop("covered_equipment_ids", None)

    for field, value in data.items():
        setattr(contract, field, value)

    if equipment_ids is not None:
        # Replace wholesale. The editing surface is a multi-select, and diffing
        # it client-side is how two admins editing at once produce a union.
        db.query(VendorContractAsset).filter(
            VendorContractAsset.contract_id == contract.id
        ).delete(synchronize_session=False)
        for equipment_id in set(equipment_ids):
            db.add(VendorContractAsset(contract_id=contract.id, equipment_id=equipment_id))

    db.commit()
    db.refresh(contract)
    return _contract_schema(contract)


@router.delete("/contracts/{contract_id}")
def delete_contract(
    contract_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    contract = db.query(VendorContract).filter(VendorContract.id == contract_id).first()
    if contract is None:
        raise HTTPException(status_code=404, detail="Contract not found")
    db.delete(contract)
    db.commit()
    return {"detail": "Contract deleted"}
