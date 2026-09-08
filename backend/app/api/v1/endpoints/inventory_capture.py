"""Capture a part now, describe it later.

Intake designed around the moment it happens: someone in a store room with a
phone in one hand and the part in the other. A capture takes a photograph, is
given a code, and asks for nothing else. Fifty items become fifty drafts in a
couple of minutes, and the describing is done afterwards by someone sitting
down.

Everything here is additive. No existing endpoint, query, export or count
changes behaviour, because a capture is not a part: it lives in its own table
and becomes a part only when somebody confirms it. Until then nothing in the
system counts it as stock, which is the point -- a photograph is not an
assertion that you own something.
"""
from __future__ import annotations

import logging
import os
import secrets
import uuid
from datetime import date, datetime
from typing import Any, Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.v1.endpoints.inventory import _validate_references
from app.core.deps import get_current_user
from app.db.base import get_db
from app.models.inventory import InventoryPart
from app.models.inventory_capture import (
    CaptureStatus,
    ExtractionStatus,
    InventoryCapture,
)
from app.models.part_definition import PartDefinition
from app.models.user import User
from app.utils.logging import log_activity
from app.utils.part_vision import (
    EMBEDDING_MODEL,
    embed_image,
    is_confident,
    rank_candidates,
)
from app.utils.facility_access import require_facility_access


logger = logging.getLogger("medrad.inventory_capture")

router = APIRouter()

# Where photographs live. Deliberately not the payment-proof store: that code
# is encrypted, audited and about money, and borrowing it would mean changing
# it.
CAPTURE_SUBTREE = "inventory_captures"
MAX_PHOTO_BYTES = 8 * 1024 * 1024
# One shutter press should not be able to mint ten thousand codes by
# typo. Larger batches are several captures, which is also how anyone
# actually counts a shelf.
MAX_BATCH = 500
ALLOWED_PHOTO_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic"}

# Unambiguous when read aloud or typed from a label: no O/0, no I/1/L.
_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_CODE_PREFIX = "MRP"


# Authorisation here is deliberately whatever the inventory endpoints
# already do: an authenticated user, and facility access checked wherever a
# facility is named. This started out with a module-permission gate of its
# own, which is not a check the rest of the module makes -- so a user the
# inventory screens admit was refused by the capture screen beside them.
# Being stricter than the thing you are extending is still a behaviour
# change, just one that shows up as a locked door rather than a wrong
# number.


def _generate_code(db: Session) -> str:
    """A short code that is unique, and readable by someone holding a label."""
    for _ in range(12):
        body = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(8))
        code = "{}-{}".format(_CODE_PREFIX, body)
        if not db.query(InventoryCapture.id).filter(InventoryCapture.code == code).first():
            return code
    # Thirty-one to the eighth is large; twelve collisions means something is
    # wrong that a thirteenth attempt will not fix.
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Could not allocate a capture code. Please try again.",
    )


def _storage_root() -> str:
    root = os.path.join(os.getcwd(), "uploads", CAPTURE_SUBTREE)
    os.makedirs(root, exist_ok=True)
    return root


def _store_photo(data: bytes, content_type: str) -> str:
    """Write the photograph and return the path recorded against the capture."""
    suffix = {
        "image/jpeg": ".jpg", "image/png": ".png",
        "image/webp": ".webp", "image/heic": ".heic",
    }.get(content_type, ".bin")
    folder = os.path.join(_storage_root(), "{:%Y/%m}".format(datetime.utcnow()))
    os.makedirs(folder, exist_ok=True)
    name = "{}{}".format(uuid.uuid4().hex, suffix)
    path = os.path.join(folder, name)
    with open(path, "wb") as handle:
        handle.write(data)
    return os.path.relpath(path, _storage_root())


def _response(capture: InventoryCapture) -> dict[str, Any]:
    return {
        "id": capture.id,
        "code": capture.code,
        "status": capture.status,
        "facility_id": capture.facility_id,
        "label": capture.label,
        "notes": capture.notes,
        "has_photo": bool(capture.photo_path),
        "gtin": capture.gtin,
        "lot": capture.lot,
        "expiry_date": capture.expiry_date.isoformat() if capture.expiry_date else None,
        "serial_number": capture.serial_number,
        "extraction_status": capture.extraction_status,
        "part_id": capture.part_id,
        "captured_by_id": capture.captured_by_id,
        "created_at": capture.created_at.isoformat() if capture.created_at else None,
        "updated_at": capture.updated_at.isoformat() if capture.updated_at else None,
    }


# The fields the Add Part form asks for, in the order it asks for them.
# One list, so the definition response, the definition update and the
# part a confirmed capture becomes cannot fall out of step with each
# other -- which is what happens when three places each keep their own
# idea of what a part is made of.
DETAIL_FIELDS = (
    "part_number",
    "part_type",
    "description",
    "make",
    "model",
    "unit_price",
    "condition",
    "supplier_name",
    "supplier_contact",
    "supplier_email",
    "supplier_phone",
    "supplier_address",
    "vendor_name",
    "purchase_location",
    "shipping_method",
    "acquisition_date",
    "warehouse_arrival_date",
    "default_picture_url",
)


def _unit_count(db: Session, definition_id: int) -> int:
    """How many of these exist, which is what the capture screen asks."""
    return int(
        db.query(func.count(InventoryCapture.id))
        .filter(
            InventoryCapture.definition_id == definition_id,
            InventoryCapture.status != CaptureStatus.DISCARDED,
        )
        .scalar()
        or 0
    )


def _definition_response(db: Session, definition: PartDefinition) -> dict[str, Any]:
    return {
        "id": definition.id,
        "name": definition.name,
        "part_number": definition.part_number,
        "part_type": definition.part_type,
        "description": definition.description,
        "make": definition.make,
        "model": definition.model,
        "unit_price": (
            str(definition.unit_price) if definition.unit_price is not None else None
        ),
        "condition": definition.condition,
        "supplier_name": definition.supplier_name,
        "supplier_contact": definition.supplier_contact,
        "supplier_email": definition.supplier_email,
        "supplier_phone": definition.supplier_phone,
        "supplier_address": definition.supplier_address,
        "vendor_name": definition.vendor_name,
        "purchase_location": definition.purchase_location,
        "shipping_method": definition.shipping_method,
        "acquisition_date": (
            definition.acquisition_date.isoformat()
            if definition.acquisition_date else None
        ),
        "warehouse_arrival_date": (
            definition.warehouse_arrival_date.isoformat()
            if definition.warehouse_arrival_date else None
        ),
        "default_picture_url": definition.default_picture_url,
        "gtin": definition.gtin,
        "has_reference_photo": bool(definition.reference_photo_path),
        "unit_count": _unit_count(db, definition.id),
        "created_at": (
            definition.created_at.isoformat() if definition.created_at else None
        ),
    }


class DefinitionUpdate(BaseModel):
    """The description shared by every unit of this kind.

    Edited once. Every unit already points here, so nothing is copied
    outward and nothing can drift apart.
    """

    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    part_number: Optional[str] = Field(default=None, max_length=255)
    part_type: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = None
    make: Optional[str] = Field(default=None, max_length=255)
    model: Optional[str] = Field(default=None, max_length=255)
    unit_price: Optional[float] = Field(default=None, ge=0)
    condition: Optional[str] = Field(default=None, max_length=64)
    supplier_name: Optional[str] = Field(default=None, max_length=255)
    supplier_contact: Optional[str] = Field(default=None, max_length=255)
    supplier_email: Optional[str] = Field(default=None, max_length=255)
    supplier_phone: Optional[str] = Field(default=None, max_length=64)
    supplier_address: Optional[str] = None
    vendor_name: Optional[str] = Field(default=None, max_length=255)
    purchase_location: Optional[str] = Field(default=None, max_length=255)
    shipping_method: Optional[str] = Field(default=None, max_length=255)
    acquisition_date: Optional[date] = None
    warehouse_arrival_date: Optional[date] = None
    # A data URL, the way the existing part form stores an image.
    default_picture_url: Optional[str] = None
    gtin: Optional[str] = Field(default=None, max_length=32)


class CaptureUpdate(BaseModel):
    """What can be corrected on a draft before it becomes a part."""

    label: Optional[str] = Field(default=None, max_length=255)
    notes: Optional[str] = None
    facility_id: Optional[int] = None
    gtin: Optional[str] = Field(default=None, max_length=32)
    lot: Optional[str] = Field(default=None, max_length=64)
    expiry_date: Optional[date] = None
    serial_number: Optional[str] = Field(default=None, max_length=128)


class CaptureConfirm(BaseModel):
    """What a draft becomes when it turns into a part.

    Everything is optional here because the definition usually already
    holds it -- the details form filled in after the photograph is the
    same form that describes a part, so by the time anyone confirms, the
    answers exist. What is sent overrides what is stored; what is neither
    sent nor stored is refused, because part number, type and description
    are what InventoryPart requires and always has.
    """

    part_number: Optional[str] = Field(default=None, max_length=255)
    part_type: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = None
    make: Optional[str] = Field(default=None, max_length=255)
    model: Optional[str] = Field(default=None, max_length=255)
    unit_price: Optional[float] = Field(default=None, ge=0)
    condition: Optional[str] = Field(default=None, max_length=64)
    supplier_name: Optional[str] = Field(default=None, max_length=255)
    supplier_contact: Optional[str] = Field(default=None, max_length=255)
    supplier_email: Optional[str] = Field(default=None, max_length=255)
    supplier_phone: Optional[str] = Field(default=None, max_length=64)
    supplier_address: Optional[str] = None
    vendor_name: Optional[str] = Field(default=None, max_length=255)
    purchase_location: Optional[str] = Field(default=None, max_length=255)
    shipping_method: Optional[str] = Field(default=None, max_length=255)
    acquisition_date: Optional[date] = None
    warehouse_arrival_date: Optional[date] = None
    default_picture_url: Optional[str] = None
    facility_id: Optional[int] = None
    quantity_on_hand: int = Field(default=1, ge=0)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_capture(
    photo: Optional[UploadFile] = File(None),
    label: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    facility_id: Optional[int] = Form(None),
    quantity: int = Form(1),
    definition_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Record that a thing exists, and give it a code.

    Everything is optional except being there. A capture with no photograph and
    no label is still worth having: it is a code someone can attach to a shelf
    and describe later, which is more than the alternative of not capturing it
    because the form was too long.
    """
    if facility_id is not None:
        require_facility_access(db, current_user, facility_id)
    if quantity < 1 or quantity > MAX_BATCH:
        raise HTTPException(
            status_code=400,
            detail="Quantity must be between 1 and {}.".format(MAX_BATCH),
        )

    definition: Optional[PartDefinition] = None
    if definition_id is not None:
        definition = (
            db.query(PartDefinition)
            .filter(PartDefinition.id == definition_id)
            .first()
        )
        if definition is None:
            raise HTTPException(status_code=404, detail="Part definition not found")

    photo_path: Optional[str] = None
    photo_mime: Optional[str] = None
    photo_vector: Optional[list[float]] = None
    if photo is not None:
        content_type = (photo.content_type or "").lower()
        if content_type not in ALLOWED_PHOTO_TYPES:
            raise HTTPException(
                status_code=400,
                detail="Unsupported image type. Use JPEG, PNG, WEBP or HEIC.",
            )
        data = await photo.read()
        if not data:
            raise HTTPException(status_code=400, detail="The photograph was empty.")
        if len(data) > MAX_PHOTO_BYTES:
            raise HTTPException(status_code=413, detail="The photograph is too large.")
        photo_path = _store_photo(data, content_type)
        photo_mime = content_type
        # Described here rather than in a worker: it takes about twenty
        # milliseconds, and a definition that cannot be recognised until
        # a queue drains is a definition nobody can capture against.
        photo_vector = embed_image(data)

    # A new kind of part, unless the caller says it is one already seen.
    # Created from whatever was typed, which is usually just a name -- the
    # description is written later, once, and reaches every unit.
    if definition is None:
        definition = PartDefinition(
            name=(label or "").strip() or "Unnamed part",
            reference_photo_path=photo_path,
            embedding=photo_vector,
            embedding_model=EMBEDDING_MODEL if photo_vector else None,
            created_by_id=current_user.id,
        )
        db.add(definition)
        db.flush()
    elif definition.reference_photo_path is None and photo_path:
        # The first photograph of a kind becomes what recognition compares
        # against. Later ones are not substituted: replacing a good
        # reference with a worse one silently degrades every future match.
        definition.reference_photo_path = photo_path
        definition.embedding = photo_vector
        definition.embedding_model = EMBEDDING_MODEL if photo_vector else None

    # One row per physical object, each with its own code, all pointing at
    # the one description. Ten pumps are ten codes and one definition.
    captures: list[InventoryCapture] = []
    for _ in range(quantity):
        capture = InventoryCapture(
            code=_generate_code(db),
            definition_id=definition.id,
            facility_id=facility_id,
            captured_by_id=current_user.id,
            status=CaptureStatus.DRAFT,
            photo_path=photo_path,
            photo_mime=photo_mime,
            label=(label or "").strip() or None,
            notes=(notes or "").strip() or None,
            # Nothing reads labels yet, so there is nothing pending. When a
            # reader exists it will claim these rather than find them
            # already spoken for.
            extraction_status=(
                ExtractionStatus.PENDING if photo_path else ExtractionStatus.SKIPPED
            ),
        )
        db.add(capture)
        captures.append(capture)
    db.flush()

    log_activity(db, "part_definitions", definition.id, "CAPTURE", current_user, {
        "quantity": quantity,
        "codes": [c.code for c in captures],
    })
    db.commit()
    for capture in captures:
        db.refresh(capture)
    db.refresh(definition)
    return {
        "definition": _definition_response(db, definition),
        "captured": [_response(c) for c in captures],
    }


@router.get("")
def list_captures(
    status_filter: Optional[str] = Query(None, alias="status"),
    mine: bool = Query(False, description="Only captures this user recorded."),
    facility_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None, description="Code or label, partial match."),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """The review queue: what has been captured and still needs describing."""

    query = db.query(InventoryCapture)
    if status_filter:
        if status_filter not in CaptureStatus.ALL:
            raise HTTPException(
                status_code=400,
                detail="Unknown status. Use one of: {}".format(", ".join(CaptureStatus.ALL)),
            )
        query = query.filter(InventoryCapture.status == status_filter)
    if mine:
        query = query.filter(InventoryCapture.captured_by_id == current_user.id)
    if facility_id is not None:
        query = query.filter(InventoryCapture.facility_id == facility_id)
    if search:
        pattern = "%{}%".format(search.replace("%", "\\%").replace("_", "\\_"))
        query = query.filter(
            func.coalesce(InventoryCapture.label, "").ilike(pattern, escape="\\")
            | InventoryCapture.code.ilike(pattern, escape="\\")
        )

    total = query.with_entities(func.count(InventoryCapture.id)).scalar() or 0
    rows = (
        query.order_by(InventoryCapture.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {"total": int(total), "items": [_response(row) for row in rows]}


# Declared before /{capture_id}: FastAPI matches routes in order, and a
# literal path that sits after a parameterised one is never reached --
# /definitions would be read as a capture id and rejected.
@router.post("/match")
async def match_photo(
    photo: UploadFile = File(...),
    limit: int = Form(5),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """What kind of part is this likely to be?

    Answers with candidates, not a decision. The best one is marked as
    confident when it stands out from the rest, which only means the screen
    may pre-select it -- a person still confirms. Absolute similarity is not
    comparable between photographs, so "stands out" is measured against the
    other candidates for this photograph rather than against a fixed number.

    Nothing is written. Recognising something is not capturing it.
    """
    content_type = (photo.content_type or "").lower()
    if content_type not in ALLOWED_PHOTO_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Unsupported image type. Use JPEG, PNG, WEBP or HEIC.",
        )
    data = await photo.read()
    if not data:
        raise HTTPException(status_code=400, detail="The photograph was empty.")
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=413, detail="The photograph is too large.")

    query = embed_image(data)
    if query is None:
        # Not an error: an unreadable photograph simply matches nothing, and
        # the screen should offer to capture it as something new.
        return {"candidates": [], "confident": False, "readable": False}

    # Only vectors from the current descriptor are comparable. One computed
    # by an older version describes something else and would score as noise.
    known = [
        (row.id, row.embedding)
        for row in db.query(PartDefinition)
        .filter(
            PartDefinition.embedding.isnot(None),
            PartDefinition.embedding_model == EMBEDDING_MODEL,
        )
        .all()
    ]
    ranked = rank_candidates(query, known, limit=max(1, min(limit, 10)))
    if not ranked:
        return {"candidates": [], "confident": False, "readable": True}

    by_id = {
        row.id: row
        for row in db.query(PartDefinition)
        .filter(PartDefinition.id.in_([identifier for identifier, _ in ranked]))
        .all()
    }
    candidates = [
        {**_definition_response(db, by_id[identifier]), "score": round(score, 4)}
        for identifier, score in ranked
        if identifier in by_id
    ]
    return {
        "candidates": candidates,
        "confident": is_confident(ranked),
        "readable": True,
    }


@router.get("/definitions/{definition_id}")
def get_definition(
    definition_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """A kind of part, and how many of them exist.

    This is what recognition opens: "xyz, ten items stored", with whatever
    has been filled in so far ready to be added to.
    """
    definition = db.query(PartDefinition).filter(PartDefinition.id == definition_id).first()
    if definition is None:
        raise HTTPException(status_code=404, detail="Part definition not found")
    return _definition_response(db, definition)


@router.patch("/definitions/{definition_id}")
def update_definition(
    definition_id: int,
    payload: DefinitionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Describe the kind once; every unit of it is described.

    Nothing is written to the units. They already point here, so there is no
    copy to update and no way for one of them to end up saying something
    different from the rest.
    """
    definition = db.query(PartDefinition).filter(PartDefinition.id == definition_id).first()
    if definition is None:
        raise HTTPException(status_code=404, detail="Part definition not found")

    changes = payload.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(definition, field, value)
    # Logged in JSON mode: the activity log stores JSON, and a date
    # object reaches it as something it cannot serialise.
    log_activity(
        db, "part_definitions", definition.id, "UPDATE", current_user,
        payload.model_dump(mode="json", exclude_unset=True),
    )
    db.commit()
    db.refresh(definition)
    return _definition_response(db, definition)


@router.get("/definitions")
def list_definitions(
    search: Optional[str] = Query(None, description="Name or part number."),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Every kind captured so far, with how many of each there are."""
    query = db.query(PartDefinition)
    if search:
        pattern = "%{}%".format(search.replace("%", "\\%").replace("_", "\\_"))
        query = query.filter(
            PartDefinition.name.ilike(pattern, escape="\\")
            | func.coalesce(PartDefinition.part_number, "").ilike(pattern, escape="\\")
        )
    rows = query.order_by(PartDefinition.updated_at.desc()).limit(limit).all()
    return {"items": [_definition_response(db, row) for row in rows]}

@router.get("/{capture_id}")
def get_capture(
    capture_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    capture = db.query(InventoryCapture).filter(InventoryCapture.id == capture_id).first()
    if capture is None:
        raise HTTPException(status_code=404, detail="Capture not found")
    return _response(capture)


@router.patch("/{capture_id}")
def update_capture(
    capture_id: int,
    payload: CaptureUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Correct a draft. Confirmed captures are history and do not change."""
    capture = db.query(InventoryCapture).filter(InventoryCapture.id == capture_id).first()
    if capture is None:
        raise HTTPException(status_code=404, detail="Capture not found")
    if capture.status != CaptureStatus.DRAFT:
        raise HTTPException(
            status_code=400,
            detail="Only a draft can be edited. This capture is {}.".format(capture.status),
        )

    changes = payload.model_dump(exclude_unset=True)
    if "facility_id" in changes and changes["facility_id"] is not None:
        require_facility_access(db, current_user, changes["facility_id"])
        _validate_references(db, changes["facility_id"], None, None, None)
    for field, value in changes.items():
        setattr(capture, field, value)

    log_activity(db, "inventory_captures", capture.id, "UPDATE", current_user, changes)
    db.commit()
    db.refresh(capture)
    return _response(capture)


@router.post("/{capture_id}/confirm")
def confirm_capture(
    capture_id: int,
    payload: CaptureConfirm,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Turn a draft into a real part.

    This is the only place a capture affects inventory, and it happens once,
    deliberately. What the part is made of comes from the definition -- the
    details form filled in after the photograph asks for exactly what the
    register form asks for -- with anything sent here overriding it. The
    capture keeps pointing at what it became, so the photograph stays
    attached to the record it produced.
    """
    capture = db.query(InventoryCapture).filter(InventoryCapture.id == capture_id).first()
    if capture is None:
        raise HTTPException(status_code=404, detail="Capture not found")
    if capture.status == CaptureStatus.CONFIRMED:
        raise HTTPException(
            status_code=400,
            detail="This capture is already part {}.".format(capture.part_id),
        )
    if capture.status == CaptureStatus.DISCARDED:
        raise HTTPException(status_code=400, detail="This capture was discarded.")

    definition = (
        db.query(PartDefinition)
        .filter(PartDefinition.id == capture.definition_id)
        .first()
        if capture.definition_id else None
    )

    facility_id = payload.facility_id if payload.facility_id is not None else capture.facility_id
    if facility_id is not None:
        # This is the moment a part comes into existence, so it is checked
        # exactly as the existing create endpoint checks it.
        require_facility_access(db, current_user, facility_id)
        _validate_references(db, facility_id, None, None, None)

    # Sent wins, stored fills the gaps. Blank strings count as unanswered,
    # so an untouched field on the form does not overwrite a description
    # somebody already wrote.
    sent = payload.model_dump(exclude_unset=True)
    details: dict[str, Any] = {}
    for field in DETAIL_FIELDS:
        value = sent.get(field)
        if isinstance(value, str) and not value.strip():
            value = None
        if value is None and definition is not None:
            value = getattr(definition, field, None)
        # Blank counts as unanswered from either source: a definition
        # saved with an empty part number must not satisfy the check below.
        if isinstance(value, str):
            value = value.strip() or None
        # Columns with their own defaults must not be handed a NULL, so
        # unanswered means absent rather than empty.
        if value is not None:
            details[field] = value

    missing = [f for f in ("part_number", "part_type", "description") if f not in details]
    if missing:
        raise HTTPException(
            status_code=400,
            detail="Describe this part first. Missing: {}.".format(", ".join(missing)),
        )

    part = InventoryPart(
        facility_id=facility_id,
        quantity_on_hand=payload.quantity_on_hand,
        # The code stays with the thing: it is what was written down when
        # somebody was standing in front of it.
        asset_tag=capture.code,
        serial_number=capture.serial_number,
        batch_number=capture.lot,
        expiry_date=capture.expiry_date,
        **details,
    )
    db.add(part)
    db.flush()

    capture.part_id = part.id
    capture.status = CaptureStatus.CONFIRMED
    log_activity(db, "inventory_captures", capture.id, "CONFIRM", current_user, {
        "code": capture.code, "part_id": part.id,
    })
    db.commit()
    db.refresh(capture)
    return {"capture": _response(capture), "part_id": part.id}


@router.post("/{capture_id}/discard")
def discard_capture(
    capture_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Drop a draft. Kept rather than deleted, so a code is never reissued."""
    capture = db.query(InventoryCapture).filter(InventoryCapture.id == capture_id).first()
    if capture is None:
        raise HTTPException(status_code=404, detail="Capture not found")
    if capture.status == CaptureStatus.CONFIRMED:
        raise HTTPException(
            status_code=400,
            detail="This capture became a part and cannot be discarded.",
        )
    capture.status = CaptureStatus.DISCARDED
    log_activity(db, "inventory_captures", capture.id, "DISCARD", current_user, {
        "code": capture.code,
    })
    db.commit()
    return _response(capture)
