import os
import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.db.base import get_db
from app.models.test_equipment import TestEquipment
from app.models.user import User
from app.schemas.test_equipment import TestEquipmentListResponse, TestEquipmentResponse
from app.utils.logging import log_activity
from app.utils.permission_deps import require_module_access
from app.core.deps import get_current_user


router = APIRouter(dependencies=[Depends(require_module_access("test-equipment"))])

UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..",
    "..",
    "..",
    "..",
    "uploads",
    "test_equipment",
)
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
MAX_IMAGE_SIZE = 5 * 1024 * 1024
VALID_STATUSES = {"active", "inactive", "maintenance"}


def _response(item: TestEquipment) -> dict[str, Any]:
    data = {c.name: getattr(item, c.name) for c in item.__table__.columns}
    data["technician_name"] = item.technician.full_name if item.technician else None
    return data


def _normalize(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = value.strip()
    return value or None


def _validate_status(value: str) -> str:
    normalized = (value or "active").strip().lower()
    if normalized not in VALID_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status. Use one of: {', '.join(sorted(VALID_STATUSES))}",
        )
    return normalized


def _validate_technician(db: Session, technician_id: Optional[int]) -> None:
    if technician_id is None:
        return
    technician = db.query(User).filter(User.id == technician_id, User.is_active.is_(True)).first()
    if not technician:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Technician not found")


async def _save_image(file: Optional[UploadFile]) -> Optional[str]:
    if file is None:
        return None
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only JPEG, PNG, GIF, and WebP images are allowed")
    content = await file.read()
    if len(content) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image must be 5MB or smaller")
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    _, ext = os.path.splitext(file.filename or "")
    stored_name = f"{uuid.uuid4().hex}{ext.lower() or '.jpg'}"
    path = os.path.join(UPLOAD_DIR, stored_name)
    with open(path, "wb") as out:
        out.write(content)
    return f"/uploads/test_equipment/{stored_name}"


def _delete_local_image(image_url: Optional[str]) -> None:
    if not image_url or not image_url.startswith("/uploads/test_equipment/"):
        return
    path = os.path.join(UPLOAD_DIR, os.path.basename(image_url))
    try:
        if os.path.exists(path):
            os.remove(path)
    except OSError:
        pass


@router.get("/", response_model=TestEquipmentListResponse)
def list_test_equipment(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    search: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    technician_id: Optional[int] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
) -> Any:
    query = db.query(TestEquipment).options(joinedload(TestEquipment.technician))
    if status_filter:
        query = query.filter(TestEquipment.status == _validate_status(status_filter))
    if technician_id is not None:
        query = query.filter(TestEquipment.technician_id == technician_id)
    if search and search.strip():
        like = f"%{search.strip()}%"
        query = query.filter(
            or_(
                TestEquipment.tem.ilike(like),
                TestEquipment.mrf.ilike(like),
                TestEquipment.model.ilike(like),
                TestEquipment.serial_number.ilike(like),
                TestEquipment.asset.ilike(like),
                TestEquipment.description.ilike(like),
            )
        )
    total = query.count()
    items = (
        query.order_by(TestEquipment.created_at.desc(), TestEquipment.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return {"items": [_response(item) for item in items], "total": total}


@router.get("/active-options", response_model=TestEquipmentListResponse)
def list_active_test_equipment_options(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    search: Optional[str] = Query(None),
    limit: int = Query(500, ge=1, le=500),
) -> Any:
    return list_test_equipment(
        db=db,
        current_user=current_user,
        search=search,
        status_filter="active",
        technician_id=None,
        skip=0,
        limit=limit,
    )


@router.get("/{item_id}", response_model=TestEquipmentResponse)
def get_test_equipment(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    item = (
        db.query(TestEquipment)
        .options(joinedload(TestEquipment.technician))
        .filter(TestEquipment.id == item_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test equipment not found")
    return _response(item)


@router.post("/", response_model=TestEquipmentResponse, status_code=status.HTTP_201_CREATED)
async def create_test_equipment(
    tem: str = Form(...),
    mrf: Optional[str] = Form(None),
    model: Optional[str] = Form(None),
    serial_number: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    asset: Optional[str] = Form(None),
    technician_id: Optional[int] = Form(None),
    status_value: str = Form("active", alias="status"),
    image: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    tem_value = _normalize(tem)
    if not tem_value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="TEM is required")
    _validate_technician(db, technician_id)
    image_url = await _save_image(image)
    item = TestEquipment(
        tem=tem_value,
        mrf=_normalize(mrf),
        model=_normalize(model),
        serial_number=_normalize(serial_number),
        description=_normalize(description),
        asset=_normalize(asset),
        technician_id=technician_id,
        status=_validate_status(status_value),
        image_url=image_url,
        created_by_id=current_user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    log_activity(db, "test-equipment", item.id, "CREATE", current_user, {"tem": item.tem})
    db.commit()
    return _response(item)


@router.put("/{item_id}", response_model=TestEquipmentResponse)
async def update_test_equipment(
    item_id: int,
    tem: Optional[str] = Form(None),
    mrf: Optional[str] = Form(None),
    model: Optional[str] = Form(None),
    serial_number: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    asset: Optional[str] = Form(None),
    technician_id: Optional[int] = Form(None),
    status_value: Optional[str] = Form(None, alias="status"),
    remove_image: bool = Form(False),
    image: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    item = db.query(TestEquipment).filter(TestEquipment.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test equipment not found")

    if tem is not None:
        tem_value = _normalize(tem)
        if not tem_value:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="TEM is required")
        item.tem = tem_value
    for field_name, value in {
        "mrf": mrf,
        "model": model,
        "serial_number": serial_number,
        "description": description,
        "asset": asset,
    }.items():
        if value is not None:
            setattr(item, field_name, _normalize(value))
    if technician_id is not None:
        _validate_technician(db, technician_id)
        item.technician_id = technician_id
    if status_value is not None:
        item.status = _validate_status(status_value)
    if remove_image:
        _delete_local_image(item.image_url)
        item.image_url = None
    new_image_url = await _save_image(image)
    if new_image_url:
        _delete_local_image(item.image_url)
        item.image_url = new_image_url

    db.commit()
    db.refresh(item)
    log_activity(db, "test-equipment", item.id, "UPDATE", current_user, {"tem": item.tem})
    db.commit()
    return _response(item)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_test_equipment(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    item = db.query(TestEquipment).filter(TestEquipment.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test equipment not found")
    image_url = item.image_url
    log_activity(db, "test-equipment", item_id, "DELETE", current_user, {"tem": item.tem})
    db.delete(item)
    db.commit()
    _delete_local_image(image_url)
