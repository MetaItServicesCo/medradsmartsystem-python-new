"""Permits to work.

The endpoints are ordinary CRUD around a state machine; the value is in
`app.services.permit`, which derives the ICRA class, decides who must sign, and
refuses to let work start when a permit is missing, unsigned or out of window.

One thing worth noting about `POST /`: a utility shutdown permit populates its
affected spaces from the asset dependency graph rather than asking somebody to
list them. That is the impact analysis paying for itself — the person raising
the permit usually does not know that the panel they are isolating also feeds
two theatres.
"""
import os
from typing import Any, List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.base import get_db
from app.models.location import Location
from app.models.permit import (
    ApprovalRole, ConstructionActivityType, ICRAClass, PatientRiskGroup,
    PermitStatus, PermitType, WorkPermit,
)
from app.models.service_request import ServiceRequest
from app.models.user import User
from app.schemas.permit import (
    ApprovalDecision, ICRAPreview, PermitClose, PermitMeta,
    WorkPermit as WorkPermitSchema, WorkPermitCreate, WorkPermitDetail,
    WorkPermitListResponse, WorkPermitUpdate,
)
from app.services import impact as impact_service, permit as permit_service
from app.utils.evidence_upload import resolve_evidence, store_evidence
from app.utils.facility_access import (
    get_user_facility_ids, is_facility_scoped_user, require_facility_access,
    scope_query_to_user_facilities,
)

router = APIRouter()


def _permit_or_404(db: Session, permit_id: int, current_user: User) -> WorkPermit:
    permit = db.query(WorkPermit).filter(WorkPermit.id == permit_id).first()
    if permit is None:
        raise HTTPException(status_code=404, detail="Permit not found")
    require_facility_access(db, current_user, permit.facility_id)
    return permit


def _detail(db: Session, permit: WorkPermit) -> WorkPermitDetail:
    payload = WorkPermitDetail.model_validate(permit)
    payload.is_authorising = permit.is_authorising
    payload.outstanding_approvals = permit.outstanding_approvals
    if permit.location_id:
        row = db.query(Location.code).filter(Location.id == permit.location_id).first()
        payload.location_code = row[0] if row else None
    if permit.work_order_id:
        row = db.query(ServiceRequest.request_number).filter(
            ServiceRequest.id == permit.work_order_id
        ).first()
        payload.work_order_number = row[0] if row else None
    return payload


def _label(value: str) -> str:
    return value.replace("_", " ").title()


@router.get("/meta", response_model=PermitMeta)
def permit_metadata(current_user: User = Depends(get_current_user)) -> Any:
    return PermitMeta(
        permit_types=[{"value": p.value, "label": _label(p.value)} for p in PermitType],
        statuses=[{"value": s.value, "label": _label(s.value)} for s in PermitStatus],
        approval_roles=[{"value": r.value, "label": _label(r.value)} for r in ApprovalRole],
        construction_activity_types=[
            {"value": t.value, "label": _label(t.value)} for t in ConstructionActivityType
        ],
        patient_risk_groups=[
            {"value": g.value, "label": _label(g.value)} for g in PatientRiskGroup
        ],
        icra_classes=[{"value": c.value, "label": _label(c.value)} for c in ICRAClass],
    )


@router.get("/icra-preview", response_model=ICRAPreview)
def icra_preview(
    construction_activity_type: str = Query(...),
    location_id: Optional[int] = Query(None),
    patient_risk_group: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """What the assessment would produce, before committing to it.

    The point is that a requester picking Type C work in an ICU sees "Class IV,
    three signatures, anteroom required" while they are still choosing, not a
    day later when the approvals do not arrive.
    """
    location = None
    if location_id is not None:
        location = db.query(Location).filter(Location.id == location_id).first()
        if location is None:
            raise HTTPException(status_code=404, detail="Location not found")
        require_facility_access(db, current_user, location.facility_id)

    risk_group = patient_risk_group or permit_service.risk_group_for_location(location)
    class_value = permit_service.icra_class(construction_activity_type, risk_group)

    # A throwaway instance purely to reuse the approval routing, which depends
    # on the class rather than on anything persisted.
    provisional = WorkPermit(
        permit_type=PermitType.ICRA.value, icra_class=class_value,
    )

    return ICRAPreview(
        construction_activity_type=construction_activity_type,
        patient_risk_group=risk_group,
        icra_class=class_value,
        required_precautions=permit_service.icra_precautions(class_value),
        required_approvals=permit_service.required_approvals(provisional),
    )


@router.get("/", response_model=WorkPermitListResponse)
def list_permits(
    db: Session = Depends(get_db),
    facility_id: Optional[int] = Query(None),
    work_order_id: Optional[int] = Query(None),
    permit_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    open_only: bool = Query(False, description="Anything not closed or cancelled"),
    awaiting_role: Optional[str] = Query(None, description="Pending my signature"),
    skip: int = 0,
    limit: int = Query(100, le=500),
    current_user: User = Depends(get_current_user),
) -> Any:
    query = scope_query_to_user_facilities(
        db.query(WorkPermit), WorkPermit.facility_id, db, current_user,
    )
    if facility_id is not None:
        require_facility_access(db, current_user, facility_id)
        query = query.filter(WorkPermit.facility_id == facility_id)
    if work_order_id is not None:
        query = query.filter(WorkPermit.work_order_id == work_order_id)
    if permit_type:
        query = query.filter(WorkPermit.permit_type == permit_type)
    if status:
        query = query.filter(WorkPermit.status == status)
    if open_only:
        query = query.filter(WorkPermit.status.notin_([
            PermitStatus.CLOSED.value, PermitStatus.CANCELLED.value,
        ]))

    if awaiting_role:
        from app.models.permit import ApprovalStatus, PermitApproval
        query = query.join(PermitApproval, PermitApproval.permit_id == WorkPermit.id).filter(
            PermitApproval.approver_role == awaiting_role,
            PermitApproval.status == ApprovalStatus.PENDING.value,
            WorkPermit.status == PermitStatus.PENDING_APPROVAL.value,
        )

    total = query.count()
    rows = query.order_by(WorkPermit.created_at.desc()).offset(skip).limit(limit).all()
    return {"items": [_detail(db, row) for row in rows], "total": total}


@router.get("/{permit_id}", response_model=WorkPermitDetail)
def get_permit(
    permit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    return _detail(db, _permit_or_404(db, permit_id, current_user))


@router.post("/", response_model=WorkPermitDetail, status_code=201)
def create_permit(
    payload: WorkPermitCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    require_facility_access(db, current_user, payload.facility_id)

    location = None
    if payload.location_id is not None:
        location = db.query(Location).filter(Location.id == payload.location_id).first()
        if location is None:
            raise HTTPException(status_code=404, detail="Location not found")
        if location.facility_id != payload.facility_id:
            raise HTTPException(status_code=400, detail="That location is in a different facility")

    if payload.work_order_id is not None:
        work_order = db.query(ServiceRequest).filter(
            ServiceRequest.id == payload.work_order_id
        ).first()
        if work_order is None:
            raise HTTPException(status_code=404, detail="Work order not found")
        if work_order.facility_id != payload.facility_id:
            raise HTTPException(status_code=400, detail="That work order is in a different facility")
        # Inherit the work order's location when the permit does not name one.
        if location is None and work_order.location_id:
            location = db.query(Location).filter(Location.id == work_order.location_id).first()

    data = payload.model_dump(exclude={"derive_impact_from_equipment_id"})
    data["location_id"] = location.id if location else data.get("location_id")

    permit = WorkPermit(
        **data,
        permit_number=permit_service.next_permit_number(db, payload.permit_type),
        status=PermitStatus.DRAFT.value,
        requested_by_id=current_user.id,
    )

    if permit.valid_from is None and permit.valid_to is None:
        permit.valid_from, permit.valid_to = permit_service.default_window(
            permit.permit_type, datetime.utcnow(),
        )

    # A shutdown permit works out what it affects rather than asking. The person
    # isolating the panel usually does not know it also feeds two theatres.
    if payload.derive_impact_from_equipment_id is not None:
        assessment = impact_service.assess(
            db, payload.derive_impact_from_equipment_id, service_type=payload.service_type,
        )
        if assessment.get("found"):
            permit.affected_location_ids = [
                row["id"] for row in assessment["affected_locations"]
            ]
            permit.affected_summary = assessment["clinical_summary"]["headline"]

    permit_service.assess(db, permit, location)

    db.add(permit)
    db.commit()
    db.refresh(permit)
    return _detail(db, permit)


@router.put("/{permit_id}", response_model=WorkPermitDetail)
def update_permit(
    permit_id: int,
    payload: WorkPermitUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    permit = _permit_or_404(db, permit_id, current_user)

    # An approved permit is a signed document. Editing the scope after the
    # signatures would make those signatures meaningless.
    if permit.status not in {PermitStatus.DRAFT.value, PermitStatus.REJECTED.value}:
        raise HTTPException(
            status_code=409,
            detail=(
                f"A permit in '{permit.status}' cannot be edited. "
                "Cancel it and raise a new one if the scope has changed."
            ),
        )

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(permit, field, value)

    location = (
        db.query(Location).filter(Location.id == permit.location_id).first()
        if permit.location_id else None
    )
    permit_service.assess(db, permit, location)

    db.commit()
    db.refresh(permit)
    return _detail(db, permit)


@router.post("/{permit_id}/submit", response_model=WorkPermitDetail)
def submit_permit(
    permit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Request the signatures this permit needs."""
    permit = _permit_or_404(db, permit_id, current_user)
    permit_service.submit(db, permit)
    db.commit()
    db.refresh(permit)
    return _detail(db, permit)


@router.post("/{permit_id}/decision", response_model=WorkPermitDetail)
def record_decision(
    permit_id: int,
    payload: ApprovalDecision,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Sign or reject one of the required approvals."""
    permit = _permit_or_404(db, permit_id, current_user)

    if permit.status != PermitStatus.PENDING_APPROVAL.value:
        raise HTTPException(
            status_code=409,
            detail=f"A permit in '{permit.status}' is not awaiting approval",
        )
    if not payload.approved and not payload.reason:
        raise HTTPException(status_code=400, detail="A rejection must give a reason")

    permit_service.record_decision(
        db, permit,
        role=payload.role,
        approved=payload.approved,
        user_id=current_user.id,
        user_name=current_user.full_name,
        conditions=payload.conditions,
        reason=payload.reason,
    )
    db.commit()
    db.refresh(permit)
    return _detail(db, permit)


@router.post("/{permit_id}/close", response_model=WorkPermitDetail)
def close_permit(
    permit_id: int,
    payload: PermitClose,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    permit = _permit_or_404(db, permit_id, current_user)
    permit_service.close(
        db, permit,
        user_id=current_user.id,
        controls_removed=payload.controls_removed,
        notes=payload.notes,
    )
    db.commit()
    db.refresh(permit)
    return _detail(db, permit)


@router.post("/{permit_id}/cancel", response_model=WorkPermitDetail)
def cancel_permit(
    permit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    permit = _permit_or_404(db, permit_id, current_user)
    if permit.status == PermitStatus.ACTIVE.value:
        raise HTTPException(
            status_code=409,
            detail="This permit is active — close it out so the controls are confirmed removed",
        )
    permit.status = PermitStatus.CANCELLED.value
    db.commit()
    db.refresh(permit)
    return _detail(db, permit)


@router.post("/expire-stale")
def expire_stale(
    db: Session = Depends(get_db),
    facility_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Expire approved permits whose window has passed unused.

    Intended for a scheduled job. This is what makes the validity window mean
    something rather than being a date nobody enforces.
    """
    if facility_id is not None:
        require_facility_access(db, current_user, facility_id)
        facility_ids = [facility_id]
    elif is_facility_scoped_user(current_user):
        facility_ids = list(get_user_facility_ids(db, current_user))
    else:
        from app.models.facility import Facility
        facility_ids = [row.id for row in db.query(Facility.id).all()]

    if not facility_ids:
        return {"expired": 0}

    count = permit_service.expire_stale(db, facility_ids=facility_ids)
    db.commit()
    return {"expired": count}


# ── Permit documents ─────────────────────────────────────────────────────────

@router.post("/{permit_id}/document", response_model=WorkPermitDetail)
async def upload_permit_document(
    permit_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Attach the signed permit.

    A permit is a document people physically sign and tape to a barrier. The
    record here is the index; this is the evidence a surveyor asks to see.
    """
    permit = _permit_or_404(db, permit_id, current_user)

    stored_path, original_name, _size = await store_evidence(file, "permit_documents")
    permit.document_path = stored_path
    permit.document_filename = original_name

    db.commit()
    db.refresh(permit)
    return _detail(db, permit)


@router.get("/{permit_id}/document")
def download_permit_document(
    permit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    from fastapi.responses import FileResponse

    permit = _permit_or_404(db, permit_id, current_user)
    path = resolve_evidence(permit.document_path, "permit_documents")
    return FileResponse(
        path, filename=permit.document_filename or os.path.basename(path),
    )
