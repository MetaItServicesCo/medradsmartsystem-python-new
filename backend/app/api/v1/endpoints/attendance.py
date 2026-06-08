import os
import uuid
from datetime import date, datetime, time, timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import and_, desc, func, or_
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_current_user, require_roles
from app.db.base import get_db
from app.models.attendance import (
    AttendanceEvent,
    AttendanceEventType,
    AttendanceFaceSample,
    AttendanceFaceStatus,
    AttendanceProfile,
    AttendanceSource,
    AttendanceVerificationStatus,
)
from app.models.facility import Facility
from app.models.user import User, UserRole
from app.models.user_facility import UserFacility
from app.schemas.attendance import (
    AttendanceEventCreate,
    AttendanceEventListResponse,
    AttendanceEventResponse,
    AttendanceProfileCreate,
    AttendanceProfileListResponse,
    AttendanceProfileResponse,
    AttendanceProfileUpdate,
    AttendanceSummaryResponse,
)
from app.utils.facility_access import get_user_facility_ids, is_facility_scoped_user, require_facility_access
from app.utils.logging import log_activity


router = APIRouter()

ATTENDANCE_UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..",
    "..",
    "..",
    "..",
    "uploads",
    "attendance_faces",
)
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_SIZE = 5 * 1024 * 1024

get_attendance_manager = require_roles("superadmin", "admin", "hr_manager", "facility_admin", "facility_manager")


def _enum_value(enum_cls, value: str, field: str):
    try:
        return enum_cls(value)
    except ValueError:
        allowed = ", ".join(item.value for item in enum_cls)
        raise HTTPException(status_code=400, detail=f"Invalid {field}. Allowed values: {allowed}")


def _profile_query(db: Session):
    return db.query(AttendanceProfile).options(
        joinedload(AttendanceProfile.user),
        joinedload(AttendanceProfile.facility),
    )


def _event_query(db: Session):
    return db.query(AttendanceEvent).options(
        joinedload(AttendanceEvent.user),
        joinedload(AttendanceEvent.facility),
    )


def _scope_user_query(db: Session, current_user: User):
    query = db.query(User).filter(User.is_active == True)  # noqa: E712
    if current_user.role == UserRole.EMPLOYEE:
        return query.filter(User.id == current_user.id)
    if is_facility_scoped_user(current_user):
        facility_ids = get_user_facility_ids(db, current_user)
        if not facility_ids:
            return query.filter(False)
        return query.filter(or_(User.facility_id.in_(facility_ids), User.user_facilities.any(UserFacility.facility_id.in_(facility_ids))))
    return query


def _apply_facility_scope(query, facility_column, db: Session, current_user: User):
    if is_facility_scoped_user(current_user):
        facility_ids = get_user_facility_ids(db, current_user)
        if not facility_ids:
            return query.filter(False)
        return query.filter(facility_column.in_(facility_ids))
    if current_user.role == UserRole.EMPLOYEE:
        return query.filter(AttendanceEvent.user_id == current_user.id)
    return query


def _get_or_create_profile(db: Session, user: User, facility_id: Optional[int] = None) -> AttendanceProfile:
    profile = db.query(AttendanceProfile).filter(AttendanceProfile.user_id == user.id).first()
    if profile:
        return profile
    profile = AttendanceProfile(
        user_id=user.id,
        facility_id=facility_id or user.facility_id,
        employee_code=str(user.id),
    )
    db.add(profile)
    db.flush()
    return profile


def _save_upload(file: UploadFile, prefix: str) -> str:
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Image must be JPEG, PNG, or WebP")
    content = file.file.read()
    if len(content) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail="Image must be 5MB or smaller")

    os.makedirs(ATTENDANCE_UPLOAD_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
        ext = ".jpg"
    stored_name = f"{prefix}_{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(ATTENDANCE_UPLOAD_DIR, stored_name)
    with open(file_path, "wb") as f:
        f.write(content)
    return f"/uploads/attendance_faces/{stored_name}"


def _stored_upload_path(image_url: str) -> str:
    uploads_root = os.path.dirname(ATTENDANCE_UPLOAD_DIR)
    relative_path = image_url.split("/uploads/", 1)[-1] if "/uploads/" in image_url else image_url.lstrip("/")
    return os.path.join(uploads_root, relative_path.replace("/", os.sep))


def _evaluate_face_sample(image_url: str) -> tuple[Optional[float], bool, bool]:
    """Return quality score, face-found flag, and whether local CV validation ran."""
    try:
        import cv2
    except Exception:
        return None, False, False

    image_path = _stored_upload_path(image_url)
    if not os.path.exists(image_path):
        return None, False, True

    image = cv2.imread(image_path)
    if image is None:
        return None, False, True

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    cascade_path = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
    detector = cv2.CascadeClassifier(cascade_path)
    faces = detector.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(80, 80))
    if len(faces) == 0:
        return 0.0, False, True

    image_area = max(image.shape[0] * image.shape[1], 1)
    largest_face_area = max(width * height for (_, _, width, height) in faces)
    quality_score = min(1.0, max(0.1, largest_face_area / image_area * 4))
    return round(float(quality_score), 3), True, True


@router.get("/profiles", response_model=AttendanceProfileListResponse)
def read_profiles(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_attendance_manager),
    search: Optional[str] = Query(None),
    facility_id: Optional[int] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
) -> Any:
    user_query = _scope_user_query(db, current_user)
    if search:
        like = f"%{search}%"
        user_query = user_query.filter(or_(User.full_name.ilike(like), User.email.ilike(like), User.username.ilike(like)))
    if facility_id:
        require_facility_access(db, current_user, facility_id)
        user_query = user_query.filter(User.facility_id == facility_id)

    total = user_query.count()
    users = user_query.order_by(User.full_name.asc()).offset(skip).limit(limit).all()
    profiles_by_user_id = {
        profile.user_id: profile
        for profile in _profile_query(db).filter(AttendanceProfile.user_id.in_([user.id for user in users] or [0])).all()
    }

    items = []
    for user in users:
        profile = profiles_by_user_id.get(user.id)
        if not profile:
            profile = AttendanceProfile(
                id=0,
                user_id=user.id,
                facility_id=user.facility_id,
                employee_code=str(user.id),
                face_status=AttendanceFaceStatus.NOT_ENROLLED,
                face_samples_count=0,
                created_at=user.created_at,
                updated_at=user.updated_at,
            )
            profile.user = user
            profile.facility = user.facility
        items.append(profile)
    return {"items": items, "total": total}


@router.post("/profiles", response_model=AttendanceProfileResponse)
def create_profile(
    profile_in: AttendanceProfileCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_attendance_manager),
) -> Any:
    user = db.query(User).filter(User.id == profile_in.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    require_facility_access(db, current_user, profile_in.facility_id or user.facility_id)

    existing = db.query(AttendanceProfile).filter(AttendanceProfile.user_id == user.id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Attendance profile already exists")

    profile = AttendanceProfile(**profile_in.model_dump())
    db.add(profile)
    db.flush()
    log_activity(db, "attendance_profiles", profile.id, "ATTENDANCE_PROFILE_CREATED", current_user, profile_in.model_dump())
    db.commit()
    return _profile_query(db).filter(AttendanceProfile.id == profile.id).first()


@router.put("/profiles/{profile_id}", response_model=AttendanceProfileResponse)
def update_profile(
    profile_id: int,
    profile_in: AttendanceProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_attendance_manager),
) -> Any:
    profile = _profile_query(db).filter(AttendanceProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Attendance profile not found")
    require_facility_access(db, current_user, profile.facility_id)

    update_data = profile_in.model_dump(exclude_unset=True)
    if "face_status" in update_data and update_data["face_status"]:
        update_data["face_status"] = _enum_value(AttendanceFaceStatus, update_data["face_status"], "face_status")
    for field, value in update_data.items():
        setattr(profile, field, value)
    profile.updated_at = datetime.utcnow()

    log_activity(db, "attendance_profiles", profile.id, "ATTENDANCE_PROFILE_UPDATED", current_user, update_data)
    db.commit()
    db.refresh(profile)
    return profile


@router.post("/profiles/{profile_id}/face-samples", response_model=AttendanceProfileResponse)
def upload_face_sample(
    profile_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_attendance_manager),
) -> Any:
    profile = _profile_query(db).filter(AttendanceProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Attendance profile not found")
    require_facility_access(db, current_user, profile.facility_id)

    image_url = _save_upload(file, f"profile_{profile.id}")
    sample = AttendanceFaceSample(profile_id=profile.id, image_url=image_url, captured_by_id=current_user.id)
    db.add(sample)
    profile.face_samples_count = (profile.face_samples_count or 0) + 1
    profile.face_status = AttendanceFaceStatus.ENROLLED
    profile.updated_at = datetime.utcnow()
    log_activity(db, "attendance_profiles", profile.id, "ATTENDANCE_FACE_SAMPLE_ADDED", current_user, {"image_url": image_url})
    db.commit()
    return _profile_query(db).filter(AttendanceProfile.id == profile.id).first()


@router.post("/profiles/{profile_id}/train", response_model=AttendanceProfileResponse)
def train_face_profile(
    profile_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_attendance_manager),
) -> Any:
    profile = _profile_query(db).filter(AttendanceProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Attendance profile not found")
    require_facility_access(db, current_user, profile.facility_id)

    samples = (
        db.query(AttendanceFaceSample)
        .filter(AttendanceFaceSample.profile_id == profile.id)
        .order_by(AttendanceFaceSample.captured_at.asc())
        .all()
    )
    if not samples:
        raise HTTPException(status_code=400, detail="Add at least one face sample before training")

    validation_ran = False
    detected_faces = 0
    quality_scores = []
    for sample in samples:
        quality_score, has_face, sample_validated = _evaluate_face_sample(sample.image_url)
        validation_ran = validation_ran or sample_validated
        if quality_score is not None:
            sample.quality_score = quality_score
            quality_scores.append(quality_score)
        if has_face:
            detected_faces += 1

    if validation_ran and detected_faces == 0:
        raise HTTPException(
            status_code=400,
            detail="No detectable face found in the uploaded samples. Please add a clearer front-facing image.",
        )

    profile.face_samples_count = len(samples)
    profile.face_status = AttendanceFaceStatus.ENROLLED
    profile.face_model_version = f"local-cv-{profile.id}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    profile.updated_at = datetime.utcnow()

    log_activity(
        db,
        "attendance_profiles",
        profile.id,
        "ATTENDANCE_FACE_MODEL_TRAINED",
        current_user,
        {
            "samples": len(samples),
            "detected_faces": detected_faces,
            "validation_ran": validation_ran,
            "average_quality": round(sum(quality_scores) / len(quality_scores), 3) if quality_scores else None,
            "model_version": profile.face_model_version,
        },
    )
    db.commit()
    return _profile_query(db).filter(AttendanceProfile.id == profile.id).first()


@router.get("/events", response_model=AttendanceEventListResponse)
def read_events(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_attendance_manager),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    user_id: Optional[int] = Query(None),
    facility_id: Optional[int] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
) -> Any:
    query = _event_query(db)
    query = _apply_facility_scope(query, AttendanceEvent.facility_id, db, current_user)

    if date_from:
        query = query.filter(AttendanceEvent.event_time >= datetime.combine(date_from, time.min))
    if date_to:
        query = query.filter(AttendanceEvent.event_time <= datetime.combine(date_to, time.max))
    if user_id:
        query = query.filter(AttendanceEvent.user_id == user_id)
    if facility_id:
        require_facility_access(db, current_user, facility_id)
        query = query.filter(AttendanceEvent.facility_id == facility_id)

    total = query.count()
    items = query.order_by(desc(AttendanceEvent.event_time)).offset(skip).limit(limit).all()
    return {"items": items, "total": total}


@router.post("/events", response_model=AttendanceEventResponse)
def create_event(
    event_in: AttendanceEventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    target_user_id = event_in.user_id or current_user.id
    if target_user_id != current_user.id and current_user.role.value not in {"superadmin", "admin", "hr_manager", "facility_admin", "facility_manager"}:
        raise HTTPException(status_code=403, detail="You can only mark your own attendance")

    target_user = db.query(User).filter(User.id == target_user_id, User.is_active == True).first()  # noqa: E712
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    facility_id = event_in.facility_id or target_user.facility_id
    require_facility_access(db, current_user, facility_id)
    event_type = _enum_value(AttendanceEventType, event_in.event_type, "event_type")
    source = _enum_value(AttendanceSource, event_in.source, "source")
    verification_status = _enum_value(AttendanceVerificationStatus, event_in.verification_status, "verification_status")
    profile = _get_or_create_profile(db, target_user, facility_id)

    event = AttendanceEvent(
        user_id=target_user.id,
        profile_id=profile.id,
        facility_id=facility_id,
        event_type=event_type,
        event_time=event_in.event_time or datetime.utcnow(),
        timezone=event_in.timezone,
        source=source,
        verification_status=verification_status,
        confidence=event_in.confidence,
        remark=event_in.remark,
        device_label=event_in.device_label,
        created_by_id=current_user.id,
    )
    db.add(event)
    db.flush()
    log_activity(db, "attendance_events", event.id, "ATTENDANCE_EVENT_CREATED", current_user, event_in.model_dump())
    db.commit()
    return _event_query(db).filter(AttendanceEvent.id == event.id).first()


@router.get("/summary/today", response_model=AttendanceSummaryResponse)
def today_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_attendance_manager),
    target_date: date = Query(default_factory=date.today),
) -> Any:
    start = datetime.combine(target_date, time.min)
    end = datetime.combine(target_date, time.max)

    users_query = _scope_user_query(db, current_user)
    total_employees = users_query.count()
    user_ids = [uid for (uid,) in users_query.with_entities(User.id).all()]

    profiles_query = db.query(AttendanceProfile)
    if user_ids:
        profiles_query = profiles_query.filter(AttendanceProfile.user_id.in_(user_ids))
    enrolled_faces = profiles_query.filter(AttendanceProfile.face_status == AttendanceFaceStatus.ENROLLED).count()

    events_query = _event_query(db).filter(and_(AttendanceEvent.event_time >= start, AttendanceEvent.event_time <= end))
    events_query = _apply_facility_scope(events_query, AttendanceEvent.facility_id, db, current_user)
    events = events_query.all()

    last_by_user: dict[int, AttendanceEvent] = {}
    break_balance: dict[int, int] = {}
    for event in sorted(events, key=lambda item: item.event_time):
        last_by_user[event.user_id] = event
        if event.event_type == AttendanceEventType.BREAK_START:
            break_balance[event.user_id] = break_balance.get(event.user_id, 0) + 1
        elif event.event_type == AttendanceEventType.BREAK_END:
            break_balance[event.user_id] = max(0, break_balance.get(event.user_id, 0) - 1)

    checked_in = sum(1 for event in last_by_user.values() if event.event_type in {AttendanceEventType.CHECK_IN, AttendanceEventType.BREAK_END, AttendanceEventType.BREAK_START})
    checked_out = sum(1 for event in last_by_user.values() if event.event_type == AttendanceEventType.CHECK_OUT)
    on_break = sum(1 for value in break_balance.values() if value > 0)
    needs_review = sum(1 for event in events if event.verification_status == AttendanceVerificationStatus.NEEDS_REVIEW)
    latest_events = events_query.order_by(desc(AttendanceEvent.event_time)).limit(8).all()

    return {
        "date": target_date.isoformat(),
        "total_employees": total_employees,
        "enrolled_faces": enrolled_faces,
        "checked_in": checked_in,
        "checked_out": checked_out,
        "on_break": on_break,
        "needs_review": needs_review,
        "latest_events": latest_events,
    }
