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
from app.models.user import User
from app.utils.logging import log_activity
from app.utils.permissions import has_module_permission


logger = logging.getLogger("medrad.inventory_capture")

router = APIRouter()

# Where photographs live. Deliberately not the payment-proof store: that code
# is encrypted, audited and about money, and borrowing it would mean changing
# it.
CAPTURE_SUBTREE = "inventory_captures"
MAX_PHOTO_BYTES = 8 * 1024 * 1024
ALLOWED_PHOTO_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic"}

# Unambiguous when read aloud or typed from a label: no O/0, no I/1/L.
_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_CODE_PREFIX = "MRP"


def _require_inventory(user: User, action: str = "index") -> None:
    if not has_module_permission(user, "inventory", action):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to inventory.",
        )


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
    """The little that must be true before a draft can become a part.

    These three are exactly what InventoryPart requires; everything else on a
    part stays optional and is edited afterwards through the existing screens.
    """

    part_number: str = Field(min_length=1, max_length=255)
    part_type: str = Field(min_length=1, max_length=255)
    description: str = Field(min_length=1)
    facility_id: Optional[int] = None
    quantity_on_hand: int = Field(default=1, ge=0)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_capture(
    photo: Optional[UploadFile] = File(None),
    label: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    facility_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Record that a thing exists, and give it a code.

    Everything is optional except being there. A capture with no photograph and
    no label is still worth having: it is a code someone can attach to a shelf
    and describe later, which is more than the alternative of not capturing it
    because the form was too long.
    """
    _require_inventory(current_user, "create")

    photo_path: Optional[str] = None
    photo_mime: Optional[str] = None
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

    capture = InventoryCapture(
        code=_generate_code(db),
        facility_id=facility_id,
        captured_by_id=current_user.id,
        status=CaptureStatus.DRAFT,
        photo_path=photo_path,
        photo_mime=photo_mime,
        label=(label or "").strip() or None,
        notes=(notes or "").strip() or None,
        # Nothing reads labels yet, so there is nothing pending. When a reader
        # exists it will claim these rather than find them already spoken for.
        extraction_status=(
            ExtractionStatus.PENDING if photo_path else ExtractionStatus.SKIPPED
        ),
    )
    db.add(capture)
    db.flush()
    log_activity(db, "inventory_captures", capture.id, "CREATE", current_user, {
        "code": capture.code, "facility_id": facility_id,
    })
    db.commit()
    db.refresh(capture)
    return _response(capture)


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
    _require_inventory(current_user)

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


@router.get("/{capture_id}")
def get_capture(
    capture_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    _require_inventory(current_user)
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
    _require_inventory(current_user, "update")
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
    deliberately, with the three fields a part actually requires. The capture
    keeps pointing at what it became, so the photograph stays attached to the
    record it produced.
    """
    _require_inventory(current_user, "create")
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

    facility_id = payload.facility_id if payload.facility_id is not None else capture.facility_id
    if facility_id is not None:
        _validate_references(db, facility_id, None, None, None)

    part = InventoryPart(
        facility_id=facility_id,
        part_number=payload.part_number.strip(),
        part_type=payload.part_type.strip(),
        description=payload.description.strip(),
        quantity_on_hand=payload.quantity_on_hand,
        # The code stays with the thing: it is what was written down when
        # somebody was standing in front of it.
        asset_tag=capture.code,
        serial_number=capture.serial_number,
        batch_number=capture.lot,
        expiry_date=capture.expiry_date,
        default_picture_url=None,
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
    _require_inventory(current_user, "delete")
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
