"""Leads: people and businesses that may become customers.

A module of its own. Who may list, view, add, edit or delete leads is the
"leads" row of the permission matrix (superadmin and admin by default).
"""
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_current_user
from app.db.base import get_db
from app.models.lead import LEAD_SOURCES, LEAD_STATUSES, Lead
from app.models.user import User
from app.schemas.lead import URL_REQUIRED, LeadCreate, LeadListResponse, LeadResponse, LeadUpdate
from app.utils.list_search import contains_ci, normalize_list_search
from app.utils.logging import log_activity
from app.utils.permission_deps import require_module_access

router = APIRouter(dependencies=[Depends(require_module_access("leads"))])

# The fields a search can be limited to; "all" (or anything else) searches every one.
SEARCH_FIELDS = ("name", "company", "email", "phone", "notes", "source_url")
SORTS = {
    "newest": (Lead.created_at.desc(), Lead.id.desc()),
    "oldest": (Lead.created_at.asc(), Lead.id.asc()),
    "name": (func.lower(Lead.name).asc(), Lead.id.asc()),
    "updated": (Lead.updated_at.desc(), Lead.id.desc()),
}


def _response(lead: Lead) -> dict[str, Any]:
    return {
        "id": lead.id,
        "name": lead.name,
        "company": lead.company,
        "email": lead.email,
        "phone": lead.phone,
        "source": lead.source,
        "source_url": lead.source_url,
        "status": lead.status,
        "notes": lead.notes,
        "created_by_id": lead.created_by_id,
        "created_by_name": (lead.created_by.full_name or lead.created_by.username) if lead.created_by else None,
        "created_at": lead.created_at,
        "updated_at": lead.updated_at,
    }


def _choice(value: Optional[str], allowed: tuple[str, ...], label: str) -> Optional[str]:
    if value is None or not value.strip():
        return None
    key = value.strip().lower()
    if key not in allowed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown {label}: {value}")
    return key


def _search_condition(term: str, field: Optional[str]):
    """Every word must appear in the chosen field, or in any field for "all".

    "acme jones" finds the lead named Jones at Acme. Wildcards are literal.
    """
    chosen = (field or "all").strip().lower()
    columns = [getattr(Lead, chosen)] if chosen in SEARCH_FIELDS else [getattr(Lead, name) for name in SEARCH_FIELDS]
    words = term.split()[:8]
    return and_(*(or_(*(contains_ci(column, word) for column in columns)) for word in words))


def _get_lead(db: Session, lead_id: int) -> Lead:
    lead = db.query(Lead).options(joinedload(Lead.created_by)).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    return lead


@router.get("/", response_model=LeadListResponse)
def list_leads(
    search: Optional[str] = Query(None),
    search_field: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    source: Optional[str] = Query(None),
    sort: str = Query("newest"),
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    chosen_status = _choice(status_filter, LEAD_STATUSES, "status")
    chosen_source = _choice(source, LEAD_SOURCES, "source")

    base = db.query(Lead)
    term = normalize_list_search(search)
    if term:
        base = base.filter(_search_condition(term, search_field))
    if chosen_source:
        base = base.filter(Lead.source == chosen_source)

    # Counts per status for the same search and source, before the status filter.
    counted = dict(
        base.with_entities(Lead.status, func.count(Lead.id)).group_by(Lead.status).all()
    )
    status_counts = {key: int(counted.get(key, 0)) for key in LEAD_STATUSES}

    query = base.filter(Lead.status == chosen_status) if chosen_status else base
    total = query.count()
    order = SORTS.get((sort or "newest").strip().lower(), SORTS["newest"])
    leads = (
        query.options(joinedload(Lead.created_by))
        .order_by(*order)
        .offset(skip)
        .limit(limit)
        .all()
    )
    return {"items": [_response(lead) for lead in leads], "total": total, "status_counts": status_counts}


@router.get("/{lead_id}", response_model=LeadResponse)
def get_lead(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    return _response(_get_lead(db, lead_id))


@router.post("/", response_model=LeadResponse, status_code=status.HTTP_201_CREATED)
def create_lead(
    lead_in: LeadCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    now = datetime.utcnow()
    lead = Lead(**lead_in.model_dump(), created_by_id=current_user.id, created_at=now, updated_at=now)
    db.add(lead)
    db.flush()
    log_activity(db, "leads", lead.id, "CREATE", current_user, {"name": lead.name, "source": lead.source, "status": lead.status})
    db.commit()
    return _response(_get_lead(db, lead.id))


@router.put("/{lead_id}", response_model=LeadResponse)
def update_lead(
    lead_id: int,
    lead_in: LeadUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    lead = _get_lead(db, lead_id)
    changes = lead_in.model_dump(exclude_unset=True)
    # The website URL follows the source: kept only for a website lead, and
    # asked for when a lead becomes one (or its URL is cleared). A website
    # lead saved before URLs were kept can still change its status or notes.
    final_source = changes.get("source", lead.source)
    if final_source != "website":
        if lead.source_url is not None or "source_url" in changes:
            changes["source_url"] = None
    elif ("source" in changes and lead.source != "website") or "source_url" in changes:
        if not changes.get("source_url", lead.source_url):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=URL_REQUIRED)
    before: dict[str, Any] = {}
    after: dict[str, Any] = {}
    for field, value in changes.items():
        if getattr(lead, field) != value:
            before[field] = getattr(lead, field)
            after[field] = value
            setattr(lead, field, value)
    if after:
        lead.updated_at = datetime.utcnow()
        log_activity(db, "leads", lead.id, "UPDATE", current_user, {"before": before, "after": after})
        db.commit()
    return _response(_get_lead(db, lead.id))


@router.delete("/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lead(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    lead = _get_lead(db, lead_id)
    log_activity(db, "leads", lead.id, "DELETE", current_user, {"name": lead.name, "company": lead.company, "status": lead.status})
    db.delete(lead)
    db.commit()
