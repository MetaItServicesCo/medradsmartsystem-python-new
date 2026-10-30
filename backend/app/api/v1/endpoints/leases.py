"""Lease-to-own for staff: draft, send, track, buy out, cancel.

Guarded the way Sales is: the sales module permission on every route, and
writes limited to Admin and Super Admin, matching who may create and send a
Sales quotation. Customers act through their own link (lease_portal), never
through these routes.

The rules themselves live in app.utils.lease_service; this module turns them
into HTTP and decides who is asking.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app.core.deps import get_current_user
from app.db.base import get_db
from app.models.inventory import InventoryPart
from app.models.lease import LEASE_STATUSES, LeaseAgreement, LeaseInstallment
from app.models.user import User, UserRole
from app.utils import lease_billing
from app.utils import lease_service as svc
from app.utils.lease_math import FREQUENCIES, LeaseTerms, build_schedule, validate_terms
from app.utils.lease_presenter import lease_detail, lease_summary
from app.utils.list_search import contains_ci, normalize_list_search
from app.utils.logging import log_activity
from app.utils.permission_deps import require_module_access

router = APIRouter(dependencies=[Depends(require_module_access("sales"))])

# The roles that may create and send Sales quotations may do the same here.
LEASE_STAFF_ROLES = {UserRole.SUPERADMIN, UserRole.ADMIN}


def _require_staff(user: User) -> None:
    if user.role not in LEASE_STAFF_ROLES:
        raise HTTPException(status_code=403, detail="Only an Admin or Super Admin can manage lease-to-own agreements")


def _raise(exc: svc.LeaseError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=str(exc))


class LeaseIn(BaseModel):
    customer_name: str = Field(min_length=1, max_length=200)
    customer_email: str = Field(min_length=3, max_length=254)
    customer_phone: Optional[str] = Field(None, max_length=40)
    customer_address: Optional[str] = Field(None, max_length=1000)
    facility_id: Optional[int] = None
    customer_user_id: Optional[int] = None
    part_id: int
    quantity: int = Field(1, ge=1, le=1000)
    # No max_digits here: Pydantic 2.5 rejects that constraint on an Optional
    # Decimal, and an import error in this module would stop the whole API
    # from starting. lease_math rounds every amount to the cent regardless.
    unit_cash_price: Optional[Decimal] = Field(None, gt=0)
    markup_percent: Decimal = Field(Decimal("0"), ge=0, max_digits=6, decimal_places=2)
    down_payment: Decimal = Field(Decimal("0"), ge=0, max_digits=12, decimal_places=2)
    installment_count: int = Field(ge=1, le=120)
    frequency: str = "monthly"
    first_due_date: date
    tax_rate_percent: Decimal = Field(svc.DEFAULT_TAX_RATE, ge=0, max_digits=5, decimal_places=2)
    grace_days: int = Field(5, ge=0, le=60)
    late_fee_amount: Decimal = Field(Decimal("25.00"), ge=0, max_digits=10, decimal_places=2)
    default_after_missed: int = Field(3, ge=1, le=24)
    invoice_lead_days: int = Field(7, ge=0, le=30)
    notes: Optional[str] = Field(None, max_length=4000)

    def to_input(self) -> svc.LeaseInput:
        return svc.LeaseInput(**self.model_dump())


class QuoteIn(BaseModel):
    cash_price: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    markup_percent: Decimal = Field(Decimal("0"), ge=0, max_digits=6, decimal_places=2)
    down_payment: Decimal = Field(Decimal("0"), ge=0, max_digits=12, decimal_places=2)
    installment_count: int = Field(ge=1, le=120)
    frequency: str = "monthly"
    first_due_date: date
    tax_rate_percent: Decimal = Field(svc.DEFAULT_TAX_RATE, ge=0, max_digits=5, decimal_places=2)


class CancelIn(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)
    return_stock: bool = True


def _load(db: Session, lease_id: int, *, lock: bool = False) -> LeaseAgreement:
    query = (
        db.query(LeaseAgreement)
        .options(
            selectinload(LeaseAgreement.installments).selectinload(LeaseInstallment.invoice),
            selectinload(LeaseAgreement.installments).selectinload(LeaseInstallment.late_fee_invoice),
            selectinload(LeaseAgreement.authorizations),
        )
        .filter(LeaseAgreement.id == lease_id)
    )
    if lock:
        query = query.with_for_update()
    agreement = query.first()
    if not agreement:
        raise HTTPException(status_code=404, detail="Lease-to-own agreement not found")
    return agreement


@router.get("/products")
def leasable_products(
    search: Optional[str] = Query(None, max_length=120),
    limit: int = Query(25, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Products that can be leased, with what is actually free to commit."""
    _require_staff(current_user)
    query = db.query(InventoryPart).filter(
        InventoryPart.part_type.ilike("sales"), InventoryPart.status == "active")
    term = normalize_list_search(search)
    if term:
        query = query.filter(or_(contains_ci(InventoryPart.part_number, term),
                                 contains_ci(InventoryPart.description, term)))
    parts = query.order_by(InventoryPart.part_number.asc()).limit(limit).all()
    return {"items": [{
        "id": p.id,
        "part_number": p.part_number,
        "description": p.description,
        "unit_price": str(p.unit_price),
        "condition": p.condition,
        "quantity_available": svc._part_available(db, p),
    } for p in parts]}


@router.post("/quote")
def quote_lease(payload: QuoteIn, current_user: User = Depends(get_current_user)) -> Any:
    """Preview a schedule while drafting. Writes nothing."""
    _require_staff(current_user)
    if payload.frequency not in FREQUENCIES:
        raise HTTPException(status_code=422, detail="Unsupported payment frequency")
    terms = LeaseTerms(**payload.model_dump())
    problems = validate_terms(terms)
    if problems:
        raise HTTPException(status_code=422, detail=" ".join(problems))
    quote = build_schedule(terms)
    return svc._snapshot(quote) | {"final_due_date": quote.final_due_date.isoformat()}


@router.get("")
def list_leases(
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None, max_length=120),
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    _require_staff(current_user)
    query = db.query(LeaseAgreement).options(selectinload(LeaseAgreement.installments))
    if status:
        if status not in LEASE_STATUSES:
            raise HTTPException(status_code=422, detail="Unknown status")
        query = query.filter(LeaseAgreement.status == status)
    term = normalize_list_search(search)
    if term:
        query = query.filter(or_(
            contains_ci(LeaseAgreement.agreement_number, term),
            contains_ci(LeaseAgreement.customer_name, term),
            contains_ci(LeaseAgreement.customer_email, term),
            contains_ci(LeaseAgreement.item_description, term),
        ))
    total = query.count()
    rows = query.order_by(LeaseAgreement.created_at.desc()).offset(skip).limit(limit).all()
    return {"items": [lease_summary(a) for a in rows], "total": total}


@router.post("", status_code=201)
def create_lease(payload: LeaseIn, db: Session = Depends(get_db),
                 current_user: User = Depends(get_current_user)) -> Any:
    _require_staff(current_user)
    try:
        agreement = svc.create_agreement(db, payload.to_input(), current_user)
    except svc.LeaseError as exc:
        db.rollback()
        _raise(exc)
    log_activity(db, "lease_agreements", agreement.id, "LEASE_CREATED", current_user,
                 {"agreement": agreement.agreement_number, "total": str(agreement.total_of_payments)})
    db.commit()
    return lease_detail(_load(db, agreement.id), staff=True)


@router.get("/{lease_id}")
def get_lease(lease_id: int, db: Session = Depends(get_db),
              current_user: User = Depends(get_current_user)) -> Any:
    _require_staff(current_user)
    agreement = _load(db, lease_id, lock=True)
    # Reading is also reconciling: a payment taken anywhere shows here at once.
    svc.reconcile(db, agreement)
    db.commit()
    return lease_detail(_load(db, lease_id), staff=True)


@router.put("/{lease_id}")
def update_lease(lease_id: int, payload: LeaseIn, db: Session = Depends(get_db),
                 current_user: User = Depends(get_current_user)) -> Any:
    _require_staff(current_user)
    agreement = _load(db, lease_id, lock=True)
    try:
        svc.update_draft(db, agreement, payload.to_input(), current_user)
    except svc.LeaseError as exc:
        db.rollback()
        _raise(exc)
    log_activity(db, "lease_agreements", agreement.id, "LEASE_UPDATED", current_user,
                 {"revision": agreement.revision})
    db.commit()
    return lease_detail(_load(db, lease_id), staff=True)


@router.post("/{lease_id}/send")
def send_lease(lease_id: int, db: Session = Depends(get_db),
               current_user: User = Depends(get_current_user),
               email_customer: bool = Query(True, description="False shares the link without emailing anyone"),) -> Any:
    _require_staff(current_user)
    agreement = _load(db, lease_id, lock=True)
    try:
        token = svc.send_agreement(db, agreement, current_user, email=email_customer)
    except svc.LeaseError as exc:
        db.rollback()
        _raise(exc)
    log_activity(db, "lease_agreements", agreement.id, "LEASE_SENT", current_user,
                 {"to": agreement.customer_email, "channel": "email" if email_customer else "link"})
    db.commit()
    # The customer link, so staff can also share it by text or chat, as Sales
    # and Rentals do. Only its hash is stored, so this is the one moment it
    # exists to return; sending again issues a new one and retires this.
    return {**lease_detail(_load(db, lease_id), staff=True), "share_url": svc.portal_url(token),
            "emailed": email_customer}


@router.post("/{lease_id}/buyout")
def start_lease_buyout(lease_id: int, db: Session = Depends(get_db),
                       current_user: User = Depends(get_current_user)) -> Any:
    _require_staff(current_user)
    agreement = _load(db, lease_id, lock=True)
    svc.reconcile(db, agreement)
    try:
        invoice = svc.start_buyout(db, agreement, current_user)
    except svc.LeaseError as exc:
        db.rollback()
        _raise(exc)
    log_activity(db, "lease_agreements", agreement.id, "LEASE_BUYOUT_STARTED", current_user,
                 {"invoice": invoice.invoice_number, "total": str(invoice.total_amount)})
    db.commit()
    return lease_detail(_load(db, lease_id), staff=True)


@router.post("/{lease_id}/buyout/cancel")
def cancel_lease_buyout(lease_id: int, db: Session = Depends(get_db),
                        current_user: User = Depends(get_current_user)) -> Any:
    _require_staff(current_user)
    agreement = _load(db, lease_id, lock=True)
    try:
        svc.cancel_buyout(db, agreement, current_user)
    except svc.LeaseError as exc:
        db.rollback()
        _raise(exc)
    log_activity(db, "lease_agreements", agreement.id, "LEASE_BUYOUT_WITHDRAWN", current_user, {})
    db.commit()
    return lease_detail(_load(db, lease_id), staff=True)


@router.post("/{lease_id}/collect")
def collect_now(lease_id: int, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)) -> Any:
    """Run this one agreement's billing pass now, rather than waiting for the job.

    The same pass the scheduler runs, so it raises, charges and reconciles by
    exactly the same rules. Useful once a customer has saved a new card.
    """
    _require_staff(current_user)
    agreement = _load(db, lease_id, lock=True)
    if agreement.status not in ("sent", "active", "in_default"):
        raise HTTPException(status_code=409, detail="This agreement has nothing to collect")
    results = {key: 0 for key in ("invoiced", "late_fees", "emailed", "charged", "declined",
                                   "exhausted", "cards_cleaned")}
    lease_billing.bill_agreement(db, agreement, date.today(), results)
    log_activity(db, "lease_agreements", lease_id, "LEASE_COLLECTED", current_user, results)
    db.commit()
    return {"results": results, "lease": lease_detail(_load(db, lease_id), staff=True)}


@router.post("/{lease_id}/cancel")
def cancel_lease(lease_id: int, payload: CancelIn, db: Session = Depends(get_db),
                 current_user: User = Depends(get_current_user)) -> Any:
    _require_staff(current_user)
    agreement = _load(db, lease_id, lock=True)
    svc.reconcile(db, agreement)
    try:
        svc.cancel_agreement(db, agreement, reason=payload.reason,
                             return_stock=payload.return_stock, actor=current_user)
    except svc.LeaseError as exc:
        db.rollback()
        _raise(exc)
    log_activity(db, "lease_agreements", agreement.id, "LEASE_CANCELLED", current_user,
                 {"reason": payload.reason, "stock_returned": agreement.stock_returned})
    db.commit()
    return lease_detail(_load(db, lease_id), staff=True)
