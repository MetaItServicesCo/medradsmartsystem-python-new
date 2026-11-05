"""Employee tracking, merged in from the Tracker app.

Three switches per person, set by a super admin: desktop activity (apps,
window titles, input counts - never content), location (a phone's GPS) and
screen view. Nothing is collected until the person has consented to what is
switched on, and nothing is kept from outside their attendance shift: a block
or a location fix is stored only when it falls between their check-in and
check-out (breaks excluded). Tracking never touches pay - hours come from
attendance alone.

Three kinds of caller:
  * a super admin, who sets the switches and sees and revokes devices;
  * the person, signed in on the web, who reads their own state and consents;
  * a desktop agent or phone app, signed in once with the person's password
    and then using a device token (kept only as a hash) to upload.
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Literal, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from pydantic import AwareDatetime, BaseModel, Field, field_validator, model_validator
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.v1.endpoints.auth import authenticate_credentials
from app.core.config import settings
from app.core.deps import get_current_user, get_superadmin_user, require_roles
from app.core.security import password_token_version
from app.db.base import get_db
from app.models.attendance import AttendanceEvent, AttendanceEventType, AttendanceVerificationStatus
from app.models.tracking import (
    TRACKING_CONSENT_VERSION,
    TRACKING_FEATURES,
    TrackingActivityBlock,
    TrackingDevice,
    TrackingLocationSample,
    TrackingSetting,
)
from app.models.user import User
from app.utils.facility_access import is_facility_scoped_user
from app.utils.logging import log_activity
from app.utils import tracking_live

router = APIRouter()

# A check-in nobody checked out of stops counting as a shift after this long,
# so a forgotten check-out does not leave somebody tracked overnight.
MAX_OPEN_SHIFT = timedelta(hours=16)
# Fixes and blocks stamped this far in the future are a wrong clock, not data.
CLOCK_SKEW = timedelta(minutes=5)
# A desktop agent may resend whole days to correct them; only these recent
# days can be rewritten that way, so older evidence cannot be wiped by a device.
AUTHORITATIVE_DAYS_BACK = 2
MAX_ACTIVE_DEVICES_PER_PERSON = 5
LAST_SEEN_RESOLUTION = timedelta(minutes=1)

MAX_BLOCKS = 2000
MAX_TITLES_PER_BLOCK = 6
MAX_TITLE_LENGTH = 160

FEATURE_LABELS = {
    "desktop_activity": "Desktop activity: which applications and window titles are in use, and counts of key presses, clicks and scrolls. What you type is never recorded.",
    "location": "Location: where your phone is, kept as one point every few minutes.",
    "screen_view": "Screen view: your screen can be viewed live by an administrator. It is not recorded.",
}

OPENING_EVENTS = {AttendanceEventType.CHECK_IN, AttendanceEventType.BREAK_END}
CLOSING_EVENTS = {AttendanceEventType.CHECK_OUT, AttendanceEventType.BREAK_START}


# ---------------------------------------------------------------- helpers


def _utc_naive(value: datetime) -> datetime:
    """Stored times are naive UTC, the same as attendance events."""
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _setting_for(db: Session, user_id: int) -> Optional[TrackingSetting]:
    return db.query(TrackingSetting).filter(TrackingSetting.user_id == user_id).first()


def _enabled_features(setting: Optional[TrackingSetting]) -> list[str]:
    if setting is None:
        return []
    return [feature for feature in TRACKING_FEATURES if getattr(setting, feature)]


def _features_payload(setting: Optional[TrackingSetting]) -> dict[str, bool]:
    return {feature: bool(setting is not None and getattr(setting, feature)) for feature in TRACKING_FEATURES}


def _consent_required(setting: Optional[TrackingSetting]) -> bool:
    """Consent is needed when something is switched on that the person has
    not agreed to - under the current consent text."""
    enabled = _enabled_features(setting)
    if not enabled:
        return False
    if setting.consent_version != TRACKING_CONSENT_VERSION:
        return True
    agreed = set(setting.consent_features or [])
    return not set(enabled).issubset(agreed)


def _has_consented_to(setting: Optional[TrackingSetting], feature: str) -> bool:
    return (
        setting is not None
        and bool(getattr(setting, feature))
        and setting.consent_version == TRACKING_CONSENT_VERSION
        and feature in (setting.consent_features or [])
    )


def _consent_text(features: list[str]) -> str:
    lines = [
        "Your employer has switched on the following tracking for your account:",
        "",
    ]
    lines += [f"- {FEATURE_LABELS[feature]}" for feature in features]
    lines += [
        "",
        "Nothing is collected while you are not checked in: tracking starts at your "
        "attendance check-in and stops at your check-out and during breaks.",
        "Tracking does not affect your pay. Your pay comes only from your attendance hours.",
        f"Activity is kept for {settings.TRACKING_ACTIVITY_RETENTION_DAYS} days and location "
        f"for {settings.TRACKING_LOCATION_RETENTION_DAYS} days, for HR to review, and then deleted.",
    ]
    return "\n".join(lines)


def _shift_intervals(db: Session, user_id: int, start: datetime, end: datetime) -> list[tuple[datetime, datetime]]:
    """The stretches between [start, end] the person was checked in and not on a break.

    Built from the same attendance events that pay is built from; a rejected
    event does not count. A check-in with no check-out is treated as a shift of
    at most MAX_OPEN_SHIFT.
    """
    rows = (
        db.query(AttendanceEvent.event_type, AttendanceEvent.event_time)
        .filter(
            AttendanceEvent.user_id == user_id,
            AttendanceEvent.verification_status != AttendanceVerificationStatus.REJECTED,
            AttendanceEvent.event_time >= start - MAX_OPEN_SHIFT,
            AttendanceEvent.event_time <= end,
        )
        .order_by(AttendanceEvent.event_time, AttendanceEvent.id)
        .all()
    )
    intervals: list[tuple[datetime, datetime]] = []
    opened: Optional[datetime] = None
    for event_type, event_time in rows:
        if event_type in OPENING_EVENTS:
            if opened is None:
                opened = event_time
        elif event_type in CLOSING_EVENTS and opened is not None:
            intervals.append((opened, min(event_time, opened + MAX_OPEN_SHIFT)))
            opened = None
    if opened is not None:
        intervals.append((opened, opened + MAX_OPEN_SHIFT))
    return [(a, b) for a, b in intervals if b >= start and a <= end]


def _within(intervals: list[tuple[datetime, datetime]], moment: datetime) -> bool:
    return any(a <= moment <= b for a, b in intervals)


def _is_on_shift(db: Session, user_id: int, moment: Optional[datetime] = None) -> bool:
    moment = moment or datetime.utcnow()
    return _within(_shift_intervals(db, user_id, moment, moment), moment)


def _require_staff(user: User) -> None:
    if is_facility_scoped_user(user):
        raise HTTPException(status_code=403, detail="Tracking is for staff accounts only")


def _prune_old_evidence(db: Session) -> None:
    """Delete evidence past its retention period, once a day."""
    if not tracking_live.claim_daily_prune():
        return
    activity_cutoff = date.today() - timedelta(days=settings.TRACKING_ACTIVITY_RETENTION_DAYS)
    location_cutoff = datetime.utcnow() - timedelta(days=settings.TRACKING_LOCATION_RETENTION_DAYS)
    db.query(TrackingActivityBlock).filter(TrackingActivityBlock.local_day < activity_cutoff).delete(
        synchronize_session=False
    )
    db.query(TrackingLocationSample).filter(TrackingLocationSample.recorded_at < location_cutoff).delete(
        synchronize_session=False
    )
    db.commit()


# ---------------------------------------------------------------- super admin


class TrackingSwitches(BaseModel):
    desktop_activity: bool = False
    location: bool = False
    screen_view: bool = False


def _person_payload(user: User, setting: Optional[TrackingSetting], active_devices: int) -> dict[str, Any]:
    return {
        "user_id": user.id,
        "full_name": user.full_name,
        "username": user.username,
        "email": user.email,
        "role": user.role.value if user.role else None,
        "is_active": bool(user.is_active),
        **_features_payload(setting),
        "tracked": bool(_enabled_features(setting)),
        "consent_required": _consent_required(setting),
        "consent_at": setting.consent_at if setting else None,
        "consented_features": list(setting.consent_features or []) if setting else [],
        "active_devices": active_devices,
    }


def _active_device_counts(db: Session, user_ids: list[int]) -> dict[int, int]:
    if not user_ids:
        return {}
    rows = (
        db.query(TrackingDevice.user_id, func.count(TrackingDevice.id))
        .filter(TrackingDevice.user_id.in_(user_ids), TrackingDevice.revoked_at.is_(None))
        .group_by(TrackingDevice.user_id)
        .all()
    )
    return {user_id: count for user_id, count in rows}


def _staff_user_or_404(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if is_facility_scoped_user(user):
        raise HTTPException(status_code=400, detail="Only staff accounts can be tracked")
    return user


@router.get("/people")
def read_tracked_people(
    search: Optional[str] = Query(None, max_length=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_superadmin_user),
) -> Any:
    """Staff accounts and what is switched on for each."""
    query = db.query(User)
    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        query = query.filter(or_(
            func.lower(User.full_name).like(term),
            func.lower(User.username).like(term),
            func.lower(User.email).like(term),
        ))
    users = [user for user in query.order_by(User.full_name).limit(1000).all() if not is_facility_scoped_user(user)]
    ids = [user.id for user in users]
    settings_by_user = {
        setting.user_id: setting
        for setting in db.query(TrackingSetting).filter(TrackingSetting.user_id.in_(ids)).all()
    } if ids else {}
    devices = _active_device_counts(db, ids)
    return [_person_payload(user, settings_by_user.get(user.id), devices.get(user.id, 0)) for user in users]


@router.put("/people/{user_id}")
def update_tracking_switches(
    user_id: int,
    switches: TrackingSwitches,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_superadmin_user),
) -> Any:
    user = _staff_user_or_404(db, user_id)
    setting = _setting_for(db, user.id)
    before = _features_payload(setting)
    if setting is None:
        setting = TrackingSetting(user_id=user.id)
        db.add(setting)
    setting.desktop_activity = switches.desktop_activity
    setting.location = switches.location
    setting.screen_view = switches.screen_view
    setting.updated_by_id = current_user.id
    db.flush()
    after = _features_payload(setting)
    if before != after:
        log_activity(db, "tracking_settings", setting.id, "TRACKING_SETTINGS_UPDATED", current_user, {
            "user_id": user.id, "before": before, "after": after,
        })
    db.commit()
    if not setting.location:
        tracking_live.clear_live_location(user.id)
    return _person_payload(user, setting, _active_device_counts(db, [user.id]).get(user.id, 0))


@router.get("/people/{user_id}/devices")
def read_person_devices(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_superadmin_user),
) -> Any:
    _staff_user_or_404(db, user_id)
    devices = (
        db.query(TrackingDevice)
        .filter(TrackingDevice.user_id == user_id)
        .order_by(TrackingDevice.created_at.desc())
        .all()
    )
    return [_device_payload(device) for device in devices]


@router.post("/devices/{device_id}/revoke")
def revoke_device(
    device_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_superadmin_user),
) -> Any:
    device = db.query(TrackingDevice).filter(TrackingDevice.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if device.revoked_at is None:
        device.revoked_at = datetime.utcnow()
        log_activity(db, "tracking_devices", device.id, "TRACKING_DEVICE_REVOKED", current_user, {
            "user_id": device.user_id, "name": device.name, "kind": device.kind,
        })
        db.commit()
    return _device_payload(device)


# ---------------------------------------------------------------- evidence for HR

# Who reviews what was collected: the super admin and HR. Only the super admin
# sets the switches and watches a screen live.
get_tracking_reviewer = require_roles("superadmin", "hr_manager")

# Checked in this long with a device that has not reported is worth flagging.
SILENT_DEVICE_GRACE = timedelta(minutes=30)


def _current_shift_start(db: Session, user_id: int, now: datetime) -> Optional[datetime]:
    for start, end in _shift_intervals(db, user_id, now, now):
        if start <= now <= end:
            return start
    return None


@router.get("/overview")
def tracking_overview(
    day: Optional[date] = Query(None, alias="date"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_tracking_reviewer),
) -> Any:
    """Everyone tracked: on shift or not, what came in on `date`, where they are
    now, and what needs attention - no consent, no device, a device silent
    while they are checked in."""
    day = day or date.today()
    now = datetime.utcnow()
    tracked = (
        db.query(TrackingSetting)
        .filter(or_(TrackingSetting.desktop_activity, TrackingSetting.location, TrackingSetting.screen_view))
        .all()
    )
    users = {
        user.id: user
        for user in db.query(User).filter(User.id.in_([s.user_id for s in tracked])).all()
    } if tracked else {}
    tracked = [s for s in tracked if s.user_id in users and not is_facility_scoped_user(users[s.user_id])]
    ids = [s.user_id for s in tracked]
    if not ids:
        return {"date": day, "people": []}

    devices: dict[tuple[int, str], dict[str, Any]] = {}
    for user_id, kind, count, last_seen in (
        db.query(TrackingDevice.user_id, TrackingDevice.kind, func.count(TrackingDevice.id), func.max(TrackingDevice.last_seen_at))
        .filter(TrackingDevice.user_id.in_(ids), TrackingDevice.revoked_at.is_(None))
        .group_by(TrackingDevice.user_id, TrackingDevice.kind)
        .all()
    ):
        devices[(user_id, kind)] = {"count": count, "last_seen": last_seen}

    totals = {
        row[0]: row
        for row in db.query(
            TrackingActivityBlock.user_id,
            func.sum(TrackingActivityBlock.minutes),
            func.sum(TrackingActivityBlock.keys),
            func.sum(TrackingActivityBlock.clicks),
            func.sum(TrackingActivityBlock.active_samples),
            func.sum(TrackingActivityBlock.samples),
            func.max(TrackingActivityBlock.ended_at),
        )
        .filter(TrackingActivityBlock.user_id.in_(ids), TrackingActivityBlock.local_day == day)
        .group_by(TrackingActivityBlock.user_id)
        .all()
    }
    top_app: dict[int, tuple[str, int]] = {}
    for user_id, app_name, minutes in (
        db.query(TrackingActivityBlock.user_id, TrackingActivityBlock.app, func.sum(TrackingActivityBlock.minutes))
        .filter(TrackingActivityBlock.user_id.in_(ids), TrackingActivityBlock.local_day == day)
        .group_by(TrackingActivityBlock.user_id, TrackingActivityBlock.app)
        .all()
    ):
        if user_id not in top_app or (minutes or 0) > top_app[user_id][1]:
            top_app[user_id] = (app_name, int(minutes or 0))

    location_ids = [s.user_id for s in tracked if _has_consented_to(s, "location")]
    live = tracking_live.live_locations(location_ids)
    screens_live = tracking_live.screens_live([s.user_id for s in tracked if _has_consented_to(s, "screen_view")])
    # Without the tracking Redis, the last saved point stands in for the live one.
    saved = {}
    missing = [user_id for user_id in location_ids if user_id not in live]
    if missing:
        recent = now - timedelta(seconds=settings.TRACKING_LIVE_LOCATION_TTL_SECONDS)
        latest = dict(
            db.query(TrackingLocationSample.user_id, func.max(TrackingLocationSample.recorded_at))
            .filter(TrackingLocationSample.user_id.in_(missing), TrackingLocationSample.recorded_at >= recent)
            .group_by(TrackingLocationSample.user_id)
            .all()
        )
        for sample in (
            db.query(TrackingLocationSample)
            .filter(TrackingLocationSample.user_id.in_(list(latest)), TrackingLocationSample.recorded_at.in_(list(latest.values())))
            .all()
        ) if latest else []:
            if latest.get(sample.user_id) == sample.recorded_at:
                saved[sample.user_id] = {
                    "lat": sample.lat, "lon": sample.lon, "accuracy_m": sample.accuracy_m,
                    "speed_mps": sample.speed_mps, "heading_deg": sample.heading_deg,
                    "recorded_at": sample.recorded_at.isoformat() + "Z",
                }

    people = []
    for setting in sorted(tracked, key=lambda s: (users[s.user_id].full_name or "").lower()):
        user = users[setting.user_id]
        desktop = devices.get((user.id, "desktop"), {"count": 0, "last_seen": None})
        phone = devices.get((user.id, "phone"), {"count": 0, "last_seen": None})
        shift_start = _current_shift_start(db, user.id, now)
        consent_required = _consent_required(setting)
        wants_desktop = setting.desktop_activity or setting.screen_view
        warnings = []
        if consent_required:
            warnings.append("no_consent")
        if wants_desktop and not desktop["count"]:
            warnings.append("no_desktop_device")
        if setting.location and not phone["count"]:
            warnings.append("no_phone_device")
        if shift_start is not None and now - shift_start >= SILENT_DEVICE_GRACE and not consent_required:
            if wants_desktop and desktop["count"] and (desktop["last_seen"] is None or now - desktop["last_seen"] > SILENT_DEVICE_GRACE):
                warnings.append("desktop_silent")
            if setting.location and phone["count"] and (phone["last_seen"] is None or now - phone["last_seen"] > SILENT_DEVICE_GRACE):
                warnings.append("phone_silent")
        total = totals.get(user.id)
        samples = int(total[5] or 0) if total else 0
        people.append({
            "user_id": user.id,
            "full_name": user.full_name,
            "username": user.username,
            "role": user.role.value if user.role else None,
            **_features_payload(setting),
            "consent_required": consent_required,
            "on_shift": shift_start is not None,
            "shift_started_at": shift_start,
            "desktop_devices": desktop["count"],
            "desktop_last_seen_at": desktop["last_seen"],
            "phone_devices": phone["count"],
            "phone_last_seen_at": phone["last_seen"],
            "activity": {
                "minutes": int(total[1] or 0) if total else 0,
                "keys": int(total[2] or 0) if total else 0,
                "clicks": int(total[3] or 0) if total else 0,
                "active_ratio": round(int(total[4] or 0) / samples, 3) if samples else None,
                "last_at": total[6] if total else None,
                "top_app": top_app[user.id][0] if user.id in top_app else None,
            },
            # Where they are now; "location" above is the switch.
            "position": (
                {**live[user.id], "source": "live"} if user.id in live
                else {**saved[user.id], "source": "saved"} if user.id in saved
                else None
            ),
            "screen_live": user.id in screens_live,
            "warnings": warnings,
        })
    return {"date": day, "people": people}


@router.get("/people/{user_id}/day")
def person_day(
    user_id: int,
    day: date = Query(..., alias="date"),
    tz: str = Query("Asia/Karachi", max_length=64),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_tracking_reviewer),
) -> Any:
    """One person's evidence for one day: shifts, apps, a timeline, the route.
    Every look is written to the audit log."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user or is_facility_scoped_user(user):
        raise HTTPException(status_code=404, detail="User not found")
    try:
        zone = ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError):
        raise HTTPException(status_code=400, detail="Unknown time zone")
    start = datetime.combine(day, time.min, tzinfo=zone).astimezone(timezone.utc).replace(tzinfo=None)
    end = datetime.combine(day + timedelta(days=1), time.min, tzinfo=zone).astimezone(timezone.utc).replace(tzinfo=None)

    blocks = (
        db.query(TrackingActivityBlock)
        .filter(TrackingActivityBlock.user_id == user.id, TrackingActivityBlock.local_day == day)
        .order_by(TrackingActivityBlock.started_at, TrackingActivityBlock.id)
        .all()
    )
    points = (
        db.query(TrackingLocationSample)
        .filter(
            TrackingLocationSample.user_id == user.id,
            TrackingLocationSample.recorded_at >= start,
            TrackingLocationSample.recorded_at < end,
        )
        .order_by(TrackingLocationSample.recorded_at)
        .all()
    )
    shifts = [
        {"start": max(a, start), "end": min(b, end), "open": b > datetime.utcnow()}
        for a, b in _shift_intervals(db, user.id, start, end)
    ]

    apps: dict[str, dict[str, int]] = {}
    for block in blocks:
        entry = apps.setdefault(block.app, {"minutes": 0, "keys": 0, "clicks": 0})
        entry["minutes"] += block.minutes or 0
        entry["keys"] += block.keys or 0
        entry["clicks"] += block.clicks or 0
    samples = sum(block.samples or 0 for block in blocks)
    active = sum(block.active_samples or 0 for block in blocks)

    log_activity(db, "users", user.id, "TRACKING_EVIDENCE_VIEWED", current_user, {"date": day.isoformat()})
    db.commit()
    return {
        "user": {"id": user.id, "full_name": user.full_name, "username": user.username},
        "date": day,
        "tz": tz,
        "shifts": shifts,
        "totals": {
            "minutes": sum(block.minutes or 0 for block in blocks),
            "keys": sum(block.keys or 0 for block in blocks),
            "clicks": sum(block.clicks or 0 for block in blocks),
            "scrolls": sum(block.scrolls or 0 for block in blocks),
            "active_ratio": round(active / samples, 3) if samples else None,
            "points": len(points),
        },
        "apps": sorted(
            ({"app": name, **values} for name, values in apps.items()),
            key=lambda item: item["minutes"], reverse=True,
        ),
        "blocks": [
            {
                "started_at": block.started_at, "ended_at": block.ended_at, "app": block.app,
                "titles": block.titles or [], "minutes": block.minutes, "keys": block.keys,
                "clicks": block.clicks, "scrolls": block.scrolls,
                "active_ratio": round(block.active_samples / block.samples, 3) if block.samples else None,
            }
            for block in blocks
        ],
        "points": [
            {"lat": p.lat, "lon": p.lon, "accuracy_m": p.accuracy_m, "speed_mps": p.speed_mps, "recorded_at": p.recorded_at}
            for p in points
        ],
    }


def _device_payload(device: TrackingDevice) -> dict[str, Any]:
    return {
        "id": device.id,
        "user_id": device.user_id,
        "kind": device.kind,
        "name": device.name,
        "os_name": device.os_name,
        "created_at": device.created_at,
        "last_seen_at": device.last_seen_at,
        "revoked_at": device.revoked_at,
    }


# ---------------------------------------------------------------- the person


class ConsentIn(BaseModel):
    version: str = Field(min_length=1, max_length=32)


def _state_payload(db: Session, user: User, setting: Optional[TrackingSetting]) -> dict[str, Any]:
    enabled = _enabled_features(setting)
    return {
        "features": _features_payload(setting),
        "tracked": bool(enabled),
        "consent_required": _consent_required(setting),
        "consent_version": TRACKING_CONSENT_VERSION,
        "consent_text": _consent_text(enabled) if enabled else None,
        "consent_at": setting.consent_at if setting else None,
        "on_shift": _is_on_shift(db, user.id) if enabled else False,
    }


def _record_consent(db: Session, user: User, body: ConsentIn) -> TrackingSetting:
    setting = _setting_for(db, user.id)
    enabled = _enabled_features(setting)
    if not enabled:
        raise HTTPException(status_code=400, detail="No tracking is switched on for your account")
    if body.version != TRACKING_CONSENT_VERSION:
        raise HTTPException(status_code=409, detail="The tracking notice has changed. Please read it again.")
    setting.consent_version = TRACKING_CONSENT_VERSION
    setting.consent_features = enabled
    setting.consent_at = datetime.utcnow()
    log_activity(db, "tracking_settings", setting.id, "TRACKING_CONSENT_GIVEN", user, {
        "version": TRACKING_CONSENT_VERSION, "features": enabled,
    })
    db.commit()
    return setting


@router.get("/me")
def read_my_tracking(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """What is switched on for me, and whether I still need to consent."""
    setting = None if is_facility_scoped_user(current_user) else _setting_for(db, current_user.id)
    return _state_payload(db, current_user, setting)


@router.post("/me/consent")
def give_my_consent(
    body: ConsentIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    _require_staff(current_user)
    setting = _record_consent(db, current_user, body)
    return _state_payload(db, current_user, setting)


# ---------------------------------------------------------------- devices


class DeviceLoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=1024)
    kind: Literal["desktop", "phone"]
    name: str = Field(min_length=1, max_length=255)
    os_name: Optional[str] = Field(default=None, max_length=64)


def _device_features(kind: str) -> tuple[str, ...]:
    return ("desktop_activity", "screen_view") if kind == "desktop" else ("location",)


def device_from_authorization(db: Session, authorization: Optional[str]) -> Optional[TrackingDevice]:
    """The device behind a "Bearer <device token>" header, or None once it is
    revoked, the person is deactivated or locked, or their password has
    changed since it signed in."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    raw = authorization[7:].strip()
    if not raw or len(raw) > 256:
        return None
    device = db.query(TrackingDevice).filter(TrackingDevice.token_hash == _hash_token(raw)).first()
    if device is None:
        return None
    user = db.query(User).filter(User.id == device.user_id).first()
    if not device_is_valid(device, user):
        return None
    device.user = user
    return device


def device_is_valid(device: TrackingDevice, user: Optional[User]) -> bool:
    return (
        device.revoked_at is None
        and user is not None
        and bool(user.is_active)
        and not user.is_locked
        and not is_facility_scoped_user(user)
        and device.password_version == password_token_version(user.hashed_password)
    )


def get_current_device(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> TrackingDevice:
    device = device_from_authorization(db, authorization)
    if device is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This device is signed out. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = device.user
    now = datetime.utcnow()
    if device.last_seen_at is None or now - device.last_seen_at >= LAST_SEEN_RESOLUTION:
        device.last_seen_at = now
        db.commit()
    device.user = user
    return device


def _device_state(db: Session, device: TrackingDevice) -> dict[str, Any]:
    setting = _setting_for(db, device.user_id)
    state = _state_payload(db, device.user, setting)
    relevant = [feature for feature in _device_features(device.kind) if _has_consented_to(setting, feature)]
    state.update({
        "device_id": device.id,
        "kind": device.kind,
        "should_track": bool(relevant) and state["on_shift"],
        "upload_interval_sec": settings.TRACKING_UPLOAD_INTERVAL_SECONDS,
        "location_sample_minutes": settings.TRACKING_LOCATION_SAMPLE_MINUTES,
    })
    return state


@router.post("/device/login")
def device_login(
    request: Request,
    body: DeviceLoginIn,
    db: Session = Depends(get_db),
) -> Any:
    """A desktop agent or phone app signs in once with the person's password.
    The token it gets back is shown only now and kept only as a hash."""
    user = authenticate_credentials(request, db, body.username, body.password)
    if is_facility_scoped_user(user):
        db.commit()
        raise HTTPException(status_code=403, detail="Tracking is for staff accounts only")
    setting = _setting_for(db, user.id)
    if not any(setting is not None and getattr(setting, f) for f in _device_features(body.kind)):
        db.commit()
        raise HTTPException(status_code=403, detail="Tracking is not switched on for your account")

    # Keep the newest few devices; signing in on a sixth retires the oldest.
    active = (
        db.query(TrackingDevice)
        .filter(TrackingDevice.user_id == user.id, TrackingDevice.revoked_at.is_(None))
        .order_by(TrackingDevice.created_at.desc(), TrackingDevice.id.desc())
        .all()
    )
    now = datetime.utcnow()
    for old in active[MAX_ACTIVE_DEVICES_PER_PERSON - 1:]:
        old.revoked_at = now

    raw = "trk_" + secrets.token_urlsafe(32)
    device = TrackingDevice(
        user_id=user.id,
        kind=body.kind,
        name=body.name.strip()[:255] or body.kind,
        os_name=(body.os_name or "").strip()[:64] or None,
        token_hash=_hash_token(raw),
        password_version=password_token_version(user.hashed_password),
        created_at=now,
        last_seen_at=now,
    )
    db.add(device)
    db.flush()
    log_activity(db, "tracking_devices", device.id, "TRACKING_DEVICE_LOGIN", user, {
        "kind": device.kind, "name": device.name, "os_name": device.os_name,
    })
    db.commit()
    device.user = user
    return {"device_token": raw, **_device_state(db, device)}


@router.get("/device/state")
def device_state(
    db: Session = Depends(get_db),
    device: TrackingDevice = Depends(get_current_device),
) -> Any:
    return _device_state(db, device)


@router.post("/device/consent")
def device_consent(
    body: ConsentIn,
    db: Session = Depends(get_db),
    device: TrackingDevice = Depends(get_current_device),
) -> Any:
    _record_consent(db, device.user, body)
    return _device_state(db, device)


@router.post("/device/logout")
def device_logout(
    db: Session = Depends(get_db),
    device: TrackingDevice = Depends(get_current_device),
) -> Any:
    device.revoked_at = datetime.utcnow()
    db.commit()
    return {"signed_out": True}


def _require_feature(db: Session, device: TrackingDevice, kind: str, feature: str) -> TrackingSetting:
    if device.kind != kind:
        raise HTTPException(status_code=400, detail=f"Only a {kind} device sends this")
    setting = _setting_for(db, device.user_id)
    if setting is None or not getattr(setting, feature):
        raise HTTPException(status_code=403, detail="This tracking is not switched on for your account")
    if not _has_consented_to(setting, feature):
        raise HTTPException(status_code=403, detail="Consent is needed before anything is collected")
    return setting


# ---- desktop activity


class BlockIn(BaseModel):
    started_at: AwareDatetime
    ended_at: AwareDatetime
    app: str = Field(min_length=1, max_length=128)
    titles: list[str] = Field(default_factory=list, max_length=MAX_TITLES_PER_BLOCK)
    minutes: int = Field(ge=0, le=24 * 60)
    tz: Optional[str] = Field(default=None, max_length=64)
    local_day: date
    keys: int = Field(default=0, ge=0)
    clicks: int = Field(default=0, ge=0)
    scrolls: int = Field(default=0, ge=0)
    mouse_px: int = Field(default=0, ge=0)
    active_samples: int = Field(default=0, ge=0)
    samples: int = Field(default=0, ge=0)

    @field_validator("titles")
    @classmethod
    def _truncate_titles(cls, titles: list[str]) -> list[str]:
        return [title[:MAX_TITLE_LENGTH] for title in titles]

    @model_validator(mode="after")
    def _check(self) -> "BlockIn":
        if self.ended_at < self.started_at:
            raise ValueError("ended_at is before started_at")
        utc_day = self.started_at.astimezone(timezone.utc).date()
        if abs((self.local_day - utc_day).days) > 1:
            raise ValueError("local_day is not within one day of started_at")
        if self.active_samples > self.samples:
            raise ValueError("active_samples cannot exceed samples")
        return self


class BlockBatch(BaseModel):
    blocks: list[BlockIn] = Field(max_length=MAX_BLOCKS)
    # Days this payload is the complete view of: blocks no longer reported for
    # them are removed, so a re-segmented day converges.
    days: list[date] = Field(default_factory=list, max_length=32)
    work_session_id: Optional[int] = None  # sent by the Tracker agent; not used


@router.post("/device/activity")
def upload_activity(
    batch: BlockBatch,
    db: Session = Depends(get_db),
    device: TrackingDevice = Depends(get_current_device),
) -> Any:
    _require_feature(db, device, "desktop", "desktop_activity")
    now = datetime.utcnow()
    oldest_day = date.today() - timedelta(days=settings.TRACKING_ACTIVITY_RETENTION_DAYS)

    incoming: dict[tuple[date, datetime, str], BlockIn] = {}
    for block in batch.blocks:
        started = _utc_naive(block.started_at)
        if started > now + CLOCK_SKEW or block.local_day < oldest_day:
            continue
        incoming[(block.local_day, started, block.app)] = block

    skipped_off_shift = 0
    kept: dict[tuple[date, datetime, str], BlockIn] = {}
    if incoming:
        starts = [key[1] for key in incoming]
        ends = [_utc_naive(block.ended_at) for block in incoming.values()]
        intervals = _shift_intervals(db, device.user_id, min(starts), max(ends))
        for key, block in incoming.items():
            started = key[1]
            midpoint = started + (_utc_naive(block.ended_at) - started) / 2
            if _within(intervals, midpoint):
                kept[key] = block
            else:
                skipped_off_shift += 1

    stored = updated = removed = 0
    days = set(key[0] for key in kept)
    today = date.today()
    authoritative = {
        day for day in batch.days
        if timedelta(0) <= today - day <= timedelta(days=AUTHORITATIVE_DAYS_BACK)
        or day == today + timedelta(days=1)
    }
    days |= authoritative
    existing: dict[tuple[date, datetime, str], TrackingActivityBlock] = {}
    if days:
        for row in (
            db.query(TrackingActivityBlock)
            .filter(TrackingActivityBlock.user_id == device.user_id, TrackingActivityBlock.local_day.in_(days))
            .all()
        ):
            existing[(row.local_day, row.started_at, row.app)] = row

    for key, block in kept.items():
        values = {
            "ended_at": _utc_naive(block.ended_at),
            "titles": block.titles,
            "minutes": block.minutes,
            "tz": block.tz,
            "keys": block.keys,
            "clicks": block.clicks,
            "scrolls": block.scrolls,
            "mouse_px": block.mouse_px,
            "active_samples": block.active_samples,
            "samples": block.samples,
        }
        row = existing.get(key)
        if row is None:
            db.add(TrackingActivityBlock(
                user_id=device.user_id, device_id=device.id,
                local_day=key[0], started_at=key[1], app=key[2], **values,
            ))
            stored += 1
        else:
            changed = any(getattr(row, field) != value for field, value in values.items())
            if changed:
                for field, value in values.items():
                    setattr(row, field, value)
                row.device_id = device.id
                updated += 1

    for key, row in existing.items():
        # Only this device's own blocks: a second laptop's day is not this one's to rewrite.
        if key[0] in authoritative and key not in kept and row.device_id == device.id:
            db.delete(row)
            removed += 1

    db.commit()
    _prune_old_evidence(db)
    return {
        "received": len(batch.blocks),
        "stored": stored,
        "updated": updated,
        "removed": removed,
        "skipped_off_shift": skipped_off_shift,
    }


# ---- location


class LocationPingIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    accuracy_m: Optional[float] = Field(default=None, ge=0)
    speed_mps: Optional[float] = Field(default=None, ge=0)
    heading_deg: Optional[float] = Field(default=None, ge=0, le=360)
    recorded_at: AwareDatetime


class LocationBatch(BaseModel):
    pings: list[LocationPingIn] = Field(max_length=500)


@router.post("/device/location")
def upload_location(
    batch: LocationBatch,
    db: Session = Depends(get_db),
    device: TrackingDevice = Depends(get_current_device),
) -> Any:
    _require_feature(db, device, "phone", "location")
    now = datetime.utcnow()
    oldest = now - timedelta(days=settings.TRACKING_LOCATION_RETENTION_DAYS)
    pings = sorted(
        (
            (moment, ping)
            for ping in batch.pings
            for moment in [_utc_naive(ping.recorded_at)]
            if oldest <= moment <= now + CLOCK_SKEW
        ),
        key=lambda item: item[0],
    )

    on_shift: list[tuple[datetime, LocationPingIn]] = []
    skipped_off_shift = 0
    if pings:
        intervals = _shift_intervals(db, device.user_id, pings[0][0], pings[-1][0])
        for moment, ping in pings:
            if _within(intervals, moment):
                on_shift.append((moment, ping))
            else:
                skipped_off_shift += 1

    stored = 0
    if on_shift:
        # Evidence is thinned to one point per few minutes: the next point is
        # kept only once enough time has passed since the last one kept.
        # Points already kept around this batch count too, so a resent batch
        # adds nothing.
        spacing = timedelta(minutes=settings.TRACKING_LOCATION_SAMPLE_MINUTES)
        kept_times = [
            moment for (moment,) in db.query(TrackingLocationSample.recorded_at)
            .filter(
                TrackingLocationSample.user_id == device.user_id,
                TrackingLocationSample.recorded_at > on_shift[0][0] - spacing,
                TrackingLocationSample.recorded_at < on_shift[-1][0] + spacing,
            )
            .all()
        ]
        for moment, ping in on_shift:
            if any(abs(moment - kept) < spacing for kept in kept_times):
                continue
            db.add(TrackingLocationSample(
                user_id=device.user_id, device_id=device.id,
                lat=ping.lat, lon=ping.lon, accuracy_m=ping.accuracy_m,
                speed_mps=ping.speed_mps, heading_deg=ping.heading_deg,
                recorded_at=moment, received_at=now,
            ))
            kept_times.append(moment)
            stored += 1

        latest_moment, latest = on_shift[-1]
        if now - latest_moment <= timedelta(seconds=settings.TRACKING_LIVE_LOCATION_TTL_SECONDS):
            tracking_live.set_live_location(device.user_id, {
                "lat": latest.lat, "lon": latest.lon, "accuracy_m": latest.accuracy_m,
                "speed_mps": latest.speed_mps, "heading_deg": latest.heading_deg,
                "recorded_at": latest_moment.isoformat() + "Z",
            })

    db.commit()
    _prune_old_evidence(db)
    return {
        "received": len(batch.pings),
        "stored": stored,
        "skipped_off_shift": skipped_off_shift,
    }
