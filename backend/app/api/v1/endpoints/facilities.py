import json
import os
import uuid
import io
import csv
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import crud, schemas
from app.core.deps import get_current_user, get_admin_user, get_facility_admin_user, get_superadmin_user
from app.db.base import get_db
from app.models.user import User
from app.models.facility import Facility
from app.models.facility_tier import FacilityTier
from app.models.facility_document import FacilityDocument
from app.models.equipment import Equipment
from app.models.audit_log import AuditLog
from app.utils.logging import log_activity
from app.utils.facility_access import require_facility_access, scope_query_to_user_facilities

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "..", "uploads", "facility_documents")


def _sync_facility_tiers(db: Session, facility: Facility, tier_ids: Optional[List[int]]) -> None:
    if tier_ids is None:
        return
    unique_ids = []
    for tier_id in tier_ids:
        if tier_id and tier_id not in unique_ids:
            unique_ids.append(tier_id)

    if unique_ids:
        existing_count = db.query(crud.tier.model).filter(crud.tier.model.id.in_(unique_ids)).count()
        if existing_count != len(unique_ids):
            raise HTTPException(status_code=400, detail="One or more selected tiers do not exist")

    db.query(FacilityTier).filter(FacilityTier.facility_id == facility.id).delete()
    for tier_id in unique_ids:
        db.add(FacilityTier(facility_id=facility.id, tier_id=tier_id))
    facility.tier_id = unique_ids[0] if unique_ids else None


def _facility_response(db: Session, facility: Facility) -> dict:
    primary_users = db.query(User).filter(User.facility_id == facility.id).all()
    from app.models.user_facility import UserFacility
    secondary_users = db.query(User).join(UserFacility).filter(UserFacility.facility_id == facility.id).all()
    all_users = {u.id: u for u in primary_users + secondary_users}.values()

    facility_dict = {c.name: getattr(facility, c.name) for c in facility.__table__.columns}
    tiers = [ft.tier for ft in facility.facility_tiers if ft.tier]
    if not tiers and facility.tier:
        tiers = [facility.tier]
    facility_dict["tier_ids"] = [t.id for t in tiers]
    facility_dict["tiers"] = tiers
    facility_dict["assigned_users"] = [
        {
            "id": u.id,
            "full_name": u.full_name,
            "username": u.username,
            "role": u.role.value if hasattr(u.role, "value") else str(u.role),
            "avatar_url": u.avatar_url
        }
        for u in all_users
    ]
    return facility_dict




@router.get("/", response_model=schemas.FacilityListResponse)
def read_facilities(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Retrieve facilities (all authenticated users)."""
    query = scope_query_to_user_facilities(db.query(Facility), Facility.id, db, current_user)
    if search:
        query = query.filter(
            or_(
                Facility.name.ilike(f"%{search}%"),
                Facility.city.ilike(f"%{search}%"),
                Facility.country.ilike(f"%{search}%")
            )
        )
    total = query.count()
    items = query.offset(skip).limit(limit).all()
    
    results = [_facility_response(db, item) for item in items]

    return {"items": results, "total": total, "skip": skip, "limit": limit}



@router.get("/search", response_model=List[schemas.FacilityBrief])
def search_facilities(
    db: Session = Depends(get_db),
    q: str = Query("", min_length=0),
    exclude_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Lightweight facility search for parent/child dropdowns."""
    query = scope_query_to_user_facilities(db.query(Facility), Facility.id, db, current_user)
    if q:
        query = query.filter(Facility.name.ilike(f"%{q}%"))
    if exclude_id:
        query = query.filter(Facility.id != exclude_id)
    return query.limit(50).all()


@router.get("/export-csv")
def export_facilities_csv(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_superadmin_user),
) -> Any:
    """Export all facilities for super admin review."""
    facilities = db.query(Facility).order_by(Facility.name.asc()).all()
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([
        "id", "name", "status", "address", "suite", "city", "state", "zip_code", "country",
        "phone", "email", "contact_person", "timezone", "operating_hours", "tiers",
        "billing_name", "billing_email", "created_at", "updated_at",
    ])
    for facility in facilities:
        tiers = [ft.tier.name for ft in facility.facility_tiers if ft.tier]
        if not tiers and facility.tier:
            tiers = [facility.tier.name]
        writer.writerow([
            facility.id,
            facility.name,
            facility.status,
            facility.address,
            facility.suite,
            facility.city,
            facility.state,
            facility.zip_code,
            facility.country,
            facility.phone,
            facility.email,
            facility.contact_person,
            facility.timezone,
            facility.operating_hours,
            ", ".join(tiers),
            facility.billing_name,
            facility.billing_email,
            facility.created_at,
            facility.updated_at,
        ])

    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="facilities.csv"'},
    )


@router.post("/", response_model=schemas.Facility, status_code=201)
def create_facility(
    *,
    db: Session = Depends(get_db),
    facility_in: schemas.FacilityCreate,
    current_user: User = Depends(get_admin_user),
) -> Any:
    """Create a new facility — admin/superadmin only."""
    tier_ids = facility_in.tier_ids
    data = facility_in.model_dump(exclude={"tier_ids"})
    if tier_ids is None and data.get("tier_id"):
        tier_ids = [data["tier_id"]]
    facility = Facility(**data)
    db.add(facility)
    db.flush()
    _sync_facility_tiers(db, facility, tier_ids)
    db.commit()
    db.refresh(facility)
    log_activity(db, "facilities", facility.id, "CREATE", current_user, facility_in.model_dump())
    return _facility_response(db, facility)


@router.get("/{id}", response_model=schemas.Facility)
def read_facility(
    *,
    db: Session = Depends(get_db),
    id: int,
    current_user: User = Depends(get_current_user),
) -> Any:
    """Get a single facility by ID."""
    facility = crud.facility.get(db=db, id=id)
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    require_facility_access(db, current_user, facility.id)
    
    return _facility_response(db, facility)



@router.put("/{id}", response_model=schemas.Facility)
def update_facility(
    *,
    db: Session = Depends(get_db),
    id: int,
    facility_in: schemas.FacilityUpdate,
    current_user: User = Depends(get_admin_user),
) -> Any:
    """Update a facility — admin/superadmin only."""
    facility = crud.facility.get(db=db, id=id)
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    require_facility_access(db, current_user, facility.id)
    old_data = {c.name: getattr(facility, c.name) for c in facility.__table__.columns}
    tier_ids = facility_in.tier_ids
    if tier_ids is None and facility_in.tier_id is not None:
        tier_ids = [facility_in.tier_id] if facility_in.tier_id else []
    updated = crud.facility.update(db=db, db_obj=facility, obj_in=facility_in)
    _sync_facility_tiers(db, updated, tier_ids)
    if tier_ids is not None:
        db.commit()
        db.refresh(updated)
    new_data = facility_in.model_dump(exclude_unset=True)
    log_activity(db, "facilities", id, "UPDATE", current_user, {"before": old_data, "after": new_data})
    return _facility_response(db, updated)


@router.delete("/{id}", response_model=schemas.Facility)
def delete_facility(
    *,
    db: Session = Depends(get_db),
    id: int,
    current_user: User = Depends(get_admin_user),
) -> Any:
    """Delete a facility — admin/superadmin only. Blocked if equipment is linked."""
    facility = crud.facility.get(db=db, id=id)
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    require_facility_access(db, current_user, facility.id)

    # AC-5: prevent deletion if linked equipment exists
    equipment_count = db.query(Equipment).filter(Equipment.facility_id == id).count()
    if equipment_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete facility: {equipment_count} equipment item(s) are linked to it.",
        )

    facility_data = {c.name: str(getattr(facility, c.name)) for c in facility.__table__.columns}
    deleted = crud.facility.remove(db=db, id=id)
    log_activity(db, "facilities", id, "DELETE", current_user, facility_data)
    return deleted


# ─── Document endpoints ────────────────────────────────────────────

@router.get("/{id}/documents", response_model=schemas.FacilityDocumentListResponse)
def list_facility_documents(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """List all documents for a facility."""
    facility = crud.facility.get(db=db, id=id)
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    require_facility_access(db, current_user, facility.id)
    docs = db.query(FacilityDocument).filter(FacilityDocument.facility_id == id).all()
    return {"items": docs, "total": len(docs)}


@router.post("/{id}/documents", response_model=schemas.FacilityDocumentResponse, status_code=201)
async def upload_facility_document(
    id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    """Upload a document to a facility."""
    facility = crud.facility.get(db=db, id=id)
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    file_ext = os.path.splitext(file.filename or "file")[1]
    stored_name = f"{uuid.uuid4().hex}{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, stored_name)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    doc = FacilityDocument(
        facility_id=id,
        filename=file.filename or "untitled",
        file_path=file_path,
        file_type=file.content_type,
        file_size=len(content),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@router.delete("/{facility_id}/documents/{doc_id}")
def delete_facility_document(
    facility_id: int,
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    """Delete a specific document from a facility."""
    doc = db.query(FacilityDocument).filter(
        FacilityDocument.id == doc_id,
        FacilityDocument.facility_id == facility_id,
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Remove file from disk
    if os.path.exists(doc.file_path):
        os.remove(doc.file_path)

    db.delete(doc)
    db.commit()
    return {"detail": "Document deleted"}


@router.get("/{id}/export-pdf")
def export_facility_pdf(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Export full facility data as a PDF."""
    facility = crud.facility.get(db=db, id=id)
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    require_facility_access(db, current_user, facility.id)

    # Build PDF using basic reportlab-like approach with simple text
    # We'll generate a lightweight HTML-to-text PDF using minimal approach
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.units import inch
        from reportlab.pdfgen import canvas as pdf_canvas

        buffer = io.BytesIO()
        c = pdf_canvas.Canvas(buffer, pagesize=letter)
        width, height = letter
        y = height - 60

        def write_line(text: str, font_size=11, bold=False):
            nonlocal y
            if y < 60:
                c.showPage()
                y = height - 60
            c.setFont("Helvetica-Bold" if bold else "Helvetica", font_size)
            c.drawString(50, y, text)
            y -= font_size + 6

        def write_section(title: str):
            nonlocal y
            y -= 10
            write_line(title, 14, bold=True)
            y -= 4

        # Title
        c.setFont("Helvetica-Bold", 20)
        c.drawString(50, y, f"Facility Report: {facility.name}")
        y -= 30
        c.setStrokeColorRGB(0.486, 0.227, 0.929)
        c.setLineWidth(2)
        c.line(50, y, width - 50, y)
        y -= 20

        # General Information
        write_section("General Information")
        write_line(f"Name: {facility.name}")
        write_line(f"Contact Person: {facility.contact_person or '—'}")
        write_line(f"Phone: {facility.phone}")
        write_line(f"Email: {facility.email}")
        write_line(f"Address: {facility.address}")
        write_line(f"Suite: {facility.suite or '—'}")
        write_line(f"City: {facility.city}")
        write_line(f"State/Province: {facility.state}")
        write_line(f"Zip Code: {facility.zip_code}")
        write_line(f"Country: {facility.country}")
        write_line(f"Website: {facility.website or '—'}")
        write_line(f"Timezone: {facility.timezone}")
        write_line(f"Operating Hours: {facility.operating_hours or '—'}")

        # Facility Details
        write_section("Facility Details")
        parent_name = "—"
        if facility.parent_facility_id:
            parent = crud.facility.get(db=db, id=facility.parent_facility_id)
            parent_name = parent.name if parent else f"ID #{facility.parent_facility_id}"
        write_line(f"Parent Facility: {parent_name}")
        write_line(f"Status: {facility.status or '—'}")
        write_line(f"Tier: {facility.tier.name if facility.tier else '—'}")

        # Children
        children = db.query(Facility).filter(Facility.parent_facility_id == facility.id).all()
        if children:
            write_line(f"Child Facilities: {', '.join([ch.name for ch in children])}")
        else:
            write_line("Child Facilities: —")

        # Billing
        write_section("Billing Information")
        write_line(f"Name: {facility.billing_name or '—'}")
        write_line(f"Email: {facility.billing_email or '—'}")
        write_line(f"Street: {facility.billing_street or '—'}")
        write_line(f"Suite: {facility.billing_suite or '—'}")
        write_line(f"City: {facility.billing_city or '—'}")
        write_line(f"State: {facility.billing_state or '—'}")
        write_line(f"Zip Code: {facility.billing_zip_code or '—'}")

        # Other Settings
        write_section("Other Settings")
        write_line(f"Tax Exemption: {'Yes' if facility.tax_exemption else 'No'}")
        write_line(f"Inheritance: {facility.inheritance or '—'}")
        write_line(f"Installment Type: {facility.installment_type or '—'}")
        write_line(f"Payment Method: {facility.payment_method or '—'}")
        write_line(f"Delivery Email: {facility.delivery_email or '—'}")

        # Documents list
        docs = db.query(FacilityDocument).filter(FacilityDocument.facility_id == id).all()
        if docs:
            write_section("Attached Documents")
            for doc in docs:
                write_line(f"• {doc.filename} ({doc.file_type or 'unknown'}, {doc.file_size or 0} bytes)")

        # Footer
        y -= 20
        c.setFont("Helvetica-Oblique", 8)
        c.drawString(50, 30, f"Generated on {facility.updated_at.strftime('%Y-%m-%d %H:%M') if facility.updated_at else '—'} | Medrad Admin Panel")

        c.save()
        buffer.seek(0)

        return StreamingResponse(
            buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="facility_{facility.id}_{facility.name}.pdf"'},
        )

    except ImportError:
        # Fallback: return JSON if reportlab not installed
        raise HTTPException(
            status_code=501,
            detail="PDF generation requires the 'reportlab' package. Install it with: pip install reportlab"
        )
