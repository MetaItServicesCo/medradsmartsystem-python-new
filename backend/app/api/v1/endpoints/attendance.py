import os
import uuid
from datetime import date, datetime, time, timedelta
from math import sqrt
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import and_, desc, func, or_
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_current_user, require_roles
from app.utils.permission_deps import require_module_access
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
FACE_MATCH_THRESHOLD = 0.82
FACE_REVIEW_THRESHOLD = 0.72

get_attendance_manager = require_module_access("attendance")


class FaceRecognitionRequest(BaseModel):
    event_type: str = AttendanceEventType.CHECK_IN.value
    facility_id: Optional[int] = None
    device_label: Optional[str] = "Smart Attendance Camera"


class FaceBox(BaseModel):
    x: int
    y: int
    width: int
    height: int
    confidence: float


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


def _event_payload(event: AttendanceEvent) -> dict[str, Any]:
    return {
        "id": event.id,
        "user_id": event.user_id,
        "profile_id": event.profile_id,
        "facility_id": event.facility_id,
        "event_type": event.event_type.value if hasattr(event.event_type, "value") else event.event_type,
        "event_time": event.event_time,
        "timezone": event.timezone,
        "source": event.source.value if hasattr(event.source, "value") else event.source,
        "verification_status": event.verification_status.value if hasattr(event.verification_status, "value") else event.verification_status,
        "confidence": event.confidence,
        "remark": event.remark,
        "device_label": event.device_label,
        "image_url": event.image_url,
        "created_by_id": event.created_by_id,
        "created_at": event.created_at,
        "user": {
            "id": event.user.id,
            "full_name": event.user.full_name,
            "username": event.user.username,
            "email": event.user.email,
            "role": event.user.role.value if hasattr(event.user.role, "value") else event.user.role,
            "avatar_url": event.user.avatar_url,
        } if event.user else None,
        "facility": {
            "id": event.facility.id,
            "name": event.facility.name,
        } if event.facility else None,
    }


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


def _load_cv2():
    try:
        import cv2
    except Exception:
        raise HTTPException(status_code=503, detail="Face recognition engine is unavailable. OpenCV is not installed.")
    return cv2


def _decode_image_bytes(content: bytes):
    cv2 = _load_cv2()
    try:
        import numpy as np
    except Exception:
        raise HTTPException(status_code=503, detail="Face recognition engine is unavailable. NumPy is not installed.")
    arr = np.frombuffer(content, dtype=np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="Uploaded image could not be read")
    return image


def _read_upload_image(file: UploadFile):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Image must be JPEG, PNG, or WebP")
    content = file.file.read()
    if len(content) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail="Image must be 5MB or smaller")
    return _decode_image_bytes(content), content


def _load_stored_image(image_url: str):
    cv2 = _load_cv2()
    image_path = _stored_upload_path(image_url)
    if not os.path.exists(image_path):
        return None
    image = cv2.imread(image_path)
    return image


def _detect_face_regions(image) -> list[dict[str, Any]]:
    cv2 = _load_cv2()
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    cascade_path = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
    detector = cv2.CascadeClassifier(cascade_path)
    faces = detector.detectMultiScale(gray, scaleFactor=1.08, minNeighbors=5, minSize=(70, 70))
    regions: list[dict[str, Any]] = []
    image_area = max(image.shape[0] * image.shape[1], 1)
    for x, y, width, height in faces:
        area_ratio = (width * height) / image_area
        regions.append(
            {
                "x": int(x),
                "y": int(y),
                "width": int(width),
                "height": int(height),
                "confidence": round(float(min(1.0, max(0.1, area_ratio * 4))), 3),
            }
        )
    regions.sort(key=lambda item: item["width"] * item["height"], reverse=True)
    return regions


def _embedding_from_face(image, face_region: dict[str, Any]) -> list[float]:
    cv2 = _load_cv2()
    try:
        import numpy as np
    except Exception:
        raise HTTPException(status_code=503, detail="Face recognition engine is unavailable. NumPy is not installed.")

    x = max(0, int(face_region["x"]))
    y = max(0, int(face_region["y"]))
    width = max(1, int(face_region["width"]))
    height = max(1, int(face_region["height"]))
    face = image[y : y + height, x : x + width]
    if face.size == 0:
        raise HTTPException(status_code=400, detail="Detected face crop is empty")

    gray = cv2.cvtColor(face, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)
    resized = cv2.resize(gray, (32, 32), interpolation=cv2.INTER_AREA).astype("float32") / 255.0
    vector = resized.flatten()
    vector = vector - float(np.mean(vector))
    norm = float(np.linalg.norm(vector)) or 1.0
    vector = vector / norm
    return [round(float(value), 6) for value in vector.tolist()]


def _extract_embedding(image) -> tuple[Optional[list[float]], Optional[dict[str, Any]], list[dict[str, Any]]]:
    faces = _detect_face_regions(image)
    if not faces:
        return None, None, faces
    face = faces[0]
    return _embedding_from_face(image, face), face, faces


def _mean_embedding(embeddings: list[list[float]]) -> list[float]:
    if not embeddings:
        return []
    length = len(embeddings[0])
    values = [sum(embedding[index] for embedding in embeddings) / len(embeddings) for index in range(length)]
    norm = sqrt(sum(value * value for value in values)) or 1.0
    return [round(float(value / norm), 6) for value in values]


def _cosine_similarity(first: list[float], second: list[float]) -> float:
    if not first or not second or len(first) != len(second):
        return 0.0
    return round(float(sum(a * b for a, b in zip(first, second))), 4)


def _evaluate_face_sample(image_url: str) -> tuple[Optional[float], bool, bool, Optional[list[float]]]:
    """Return quality score, face-found flag, whether validation ran, and embedding."""
    try:
        image = _load_stored_image(image_url)
    except HTTPException:
        return None, False, False, None
    if image is None:
        return None, False, True, None

    embedding, face, _faces = _extract_embedding(image)
    if not face:
        return 0.0, False, True, None
    return face["confidence"], True, True, embedding


def _profile_candidates(db: Session, current_user: User, facility_id: Optional[int] = None):
    query = _profile_query(db).filter(AttendanceProfile.face_embedding.isnot(None))
    if facility_id:
        require_facility_access(db, current_user, facility_id)
        query = query.filter(AttendanceProfile.facility_id == facility_id)
    elif is_facility_scoped_user(current_user):
        facility_ids = get_user_facility_ids(db, current_user)
        if not facility_ids:
            return []
        query = query.filter(AttendanceProfile.facility_id.in_(facility_ids))
    elif current_user.role == UserRole.EMPLOYEE:
        query = query.filter(AttendanceProfile.user_id == current_user.id)
    return query.all()


def _best_face_match(db: Session, current_user: User, embedding: list[float], facility_id: Optional[int] = None):
    best_profile = None
    best_score = 0.0
    for profile in _profile_candidates(db, current_user, facility_id):
        score = _cosine_similarity(embedding, profile.face_embedding or [])
        if score > best_score:
            best_score = score
            best_profile = profile
    return best_profile, best_score


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
    embeddings = []
    for sample in samples:
        quality_score, has_face, sample_validated, embedding = _evaluate_face_sample(sample.image_url)
        validation_ran = validation_ran or sample_validated
        if quality_score is not None:
            sample.quality_score = quality_score
            quality_scores.append(quality_score)
        if has_face:
            detected_faces += 1
        if embedding:
            sample.embedding = embedding
            embeddings.append(embedding)

    if validation_ran and detected_faces == 0:
        raise HTTPException(
            status_code=400,
            detail="No detectable face found in the uploaded samples. Please add a clearer front-facing image.",
        )
    if not embeddings:
        raise HTTPException(status_code=503, detail="Face embeddings could not be generated from the uploaded samples.")

    profile.face_samples_count = len(samples)
    profile.face_status = AttendanceFaceStatus.ENROLLED
    profile.face_model_version = f"local-cv-{profile.id}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    profile.face_embedding = _mean_embedding(embeddings)
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
            "embedding_size": len(profile.face_embedding or []),
        },
    )
    db.commit()
    return _profile_query(db).filter(AttendanceProfile.id == profile.id).first()


@router.post("/face/detect")
def detect_face(
    file: UploadFile = File(...),
    current_user: User = Depends(get_attendance_manager),
) -> Any:
    image, _content = _read_upload_image(file)
    faces = _detect_face_regions(image)
    return {
        "faces": faces,
        "face_count": len(faces),
    }


@router.post("/face/recognize")
def recognize_face_attendance(
    file: UploadFile = File(...),
    event_type: str = Form(AttendanceEventType.CHECK_IN.value),
    facility_id: Optional[int] = Form(None),
    device_label: Optional[str] = Form("Smart Attendance Camera"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_attendance_manager),
) -> Any:
    image, content = _read_upload_image(file)
    embedding, face, faces = _extract_embedding(image)
    if not face or not embedding:
        return {
            "matched": False,
            "verification_status": AttendanceVerificationStatus.REJECTED.value,
            "confidence": 0,
            "message": "No face detected",
            "faces": faces,
        }

    event_enum = _enum_value(AttendanceEventType, event_type, "event_type")
    best_profile, score = _best_face_match(db, current_user, embedding, facility_id)
    if not best_profile:
        return {
            "matched": False,
            "verification_status": AttendanceVerificationStatus.REJECTED.value,
            "confidence": round(score, 3),
            "message": "No trained face profiles found",
            "faces": faces,
        }

    verification_status = (
        AttendanceVerificationStatus.VERIFIED
        if score >= FACE_MATCH_THRESHOLD
        else AttendanceVerificationStatus.NEEDS_REVIEW
        if score >= FACE_REVIEW_THRESHOLD
        else AttendanceVerificationStatus.REJECTED
    )

    if verification_status == AttendanceVerificationStatus.REJECTED:
        return {
            "matched": False,
            "candidate": {
                "profile_id": best_profile.id,
                "user_id": best_profile.user_id,
                "full_name": best_profile.user.full_name if best_profile.user else None,
            },
            "verification_status": verification_status.value,
            "confidence": round(score, 3),
            "message": "Face confidence is too low",
            "faces": faces,
        }

    recent_cutoff = datetime.utcnow() - timedelta(minutes=3)
    recent = (
        db.query(AttendanceEvent)
        .filter(
            AttendanceEvent.user_id == best_profile.user_id,
            AttendanceEvent.event_type == event_enum,
            AttendanceEvent.source == AttendanceSource.FACE,
            AttendanceEvent.event_time >= recent_cutoff,
        )
        .order_by(AttendanceEvent.event_time.desc())
        .first()
    )
    if recent:
        return {
            "matched": True,
            "duplicate": True,
            "event": _event_payload(_event_query(db).filter(AttendanceEvent.id == recent.id).first()),
            "profile": {
                "profile_id": best_profile.id,
                "user_id": best_profile.user_id,
                "full_name": best_profile.user.full_name if best_profile.user else None,
                "facility_id": best_profile.facility_id,
            },
            "verification_status": recent.verification_status.value if hasattr(recent.verification_status, "value") else recent.verification_status,
            "confidence": round(score, 3),
            "message": "Attendance already marked recently",
            "faces": faces,
        }

    os.makedirs(ATTENDANCE_UPLOAD_DIR, exist_ok=True)
    stored_name = f"face_event_{uuid.uuid4().hex}.jpg"
    file_path = os.path.join(ATTENDANCE_UPLOAD_DIR, stored_name)
    with open(file_path, "wb") as f:
        f.write(content)
    image_url = f"/uploads/attendance_faces/{stored_name}"

    event = AttendanceEvent(
        user_id=best_profile.user_id,
        profile_id=best_profile.id,
        facility_id=best_profile.facility_id,
        event_type=event_enum,
        event_time=datetime.utcnow(),
        timezone="Asia/Karachi",
        source=AttendanceSource.FACE,
        verification_status=verification_status,
        confidence=round(score, 3),
        remark="Marked by face recognition" if verification_status == AttendanceVerificationStatus.VERIFIED else "Face match needs HR review",
        device_label=device_label,
        image_url=image_url,
        created_by_id=current_user.id,
    )
    db.add(event)
    db.flush()
    log_activity(
        db,
        "attendance_events",
        event.id,
        "FACE_ATTENDANCE_RECOGNIZED",
        current_user,
        {
            "matched_user_id": best_profile.user_id,
            "confidence": round(score, 3),
            "verification_status": verification_status.value,
            "event_type": event_enum.value,
        },
    )
    db.commit()

    return {
        "matched": True,
        "duplicate": False,
        "event": _event_payload(_event_query(db).filter(AttendanceEvent.id == event.id).first()),
        "profile": {
            "profile_id": best_profile.id,
            "user_id": best_profile.user_id,
            "full_name": best_profile.user.full_name if best_profile.user else None,
            "facility_id": best_profile.facility_id,
        },
        "verification_status": verification_status.value,
        "confidence": round(score, 3),
        "message": "Attendance marked" if verification_status == AttendanceVerificationStatus.VERIFIED else "Attendance marked for HR review",
        "faces": faces,
    }


@router.get("/events", response_model=AttendanceEventListResponse)
def read_events(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_attendance_manager),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    user_id: Optional[int] = Query(None),
    facility_id: Optional[int] = Query(None),
    verification_status: Optional[str] = Query(None),
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
    if verification_status:
        vs = _enum_value(AttendanceVerificationStatus, verification_status, "verification_status")
        query = query.filter(AttendanceEvent.verification_status == vs)

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


class AttendanceEventReview(BaseModel):
    verification_status: str
    remark: Optional[str] = None


@router.patch("/events/{event_id}/review")
def review_attendance_event(
    event_id: int,
    review: AttendanceEventReview,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_attendance_manager),
) -> Any:
    event = _event_query(db).filter(AttendanceEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    new_status = _enum_value(AttendanceVerificationStatus, review.verification_status, "verification_status")
    event.verification_status = new_status
    if review.remark is not None:
        event.remark = review.remark
    log_activity(db, "attendance_events", event.id, "ATTENDANCE_EVENT_REVIEWED", current_user, {
        "verification_status": review.verification_status,
    })
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
