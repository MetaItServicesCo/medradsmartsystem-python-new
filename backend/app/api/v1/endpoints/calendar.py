from datetime import datetime, timezone
from typing import Any, Iterable, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import and_, false, or_

from app.core.deps import get_current_user
from app.utils.permission_deps import require_module_access, route_rule
from app.db.base import get_db
from app.models.user import User, UserRole
from app.models.calendar import CalendarEvent, calendar_event_technicians
from app.models.chat import WorkspaceMember
from app.schemas.calendar import (
    CalendarEventCreate,
    CalendarEventUpdate,
    CalendarEventResponse,
    CalendarTechnician,
    ScheduleClash,
    ScheduleClashCheck,
)
from app.utils.logging import log_activity
from app.utils.notifications import create_notifications
from app.utils.permissions import acts_as_technician

# Deleting an event needs calendar.delete, which only full-control roles have.
# The rules below (owner, workspace admin, schedule creator, Admin) still decide
# which event a person may delete; this only lets those with calendar.edit ask.
router = APIRouter(dependencies=[Depends(require_module_access(
    "calendar",
    rules=(route_rule(("calendar", "delete"), ("calendar", "edit"), methods=["DELETE"], contains="/events/"),),
))])


# ── Technician schedules ──────────────────────────────────────────────────────
# An event tagged with technicians is their schedule. It is independent of
# every other module. Super Admins, Admins and technicians (by role or flagged)
# create them and may tag any technician. A schedule is seen by the technicians
# tagged in it, by its creator and by every Admin and Super Admin; it is changed
# or deleted by its creator or an Admin / Super Admin. Tagged technicians are
# told through the bell.

def _is_admin(user: User) -> bool:
    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    return role in (UserRole.SUPERADMIN.value, UserRole.ADMIN.value)


def _can_schedule(user: User) -> bool:
    return _is_admin(user) or acts_as_technician(user)


def _is_tagged(event: CalendarEvent, user: User) -> bool:
    return any(tech.id == user.id for tech in event.technicians or [])


def _can_see_schedule(event: CalendarEvent, user: User) -> bool:
    return _is_admin(user) or event.user_id == user.id or _is_tagged(event, user)


def _can_change_schedule(event: CalendarEvent, user: User) -> bool:
    return event.user_id == user.id or _is_admin(user)


def _workspace_admin(db: Session, event: CalendarEvent, user: User) -> bool:
    if not event.workspace_id:
        return False
    member = db.query(WorkspaceMember).filter(
        WorkspaceMember.workspace_id == event.workspace_id,
        WorkspaceMember.user_id == user.id,
    ).first()
    return bool(member and member.role == "admin")


def _can_edit(db: Session, event: CalendarEvent, user: User) -> bool:
    if event.is_schedule:
        return _can_change_schedule(event, user)
    return event.user_id == user.id or _workspace_admin(db, event, user)


def _event_response(db: Session, event: CalendarEvent, user: User, can_edit: Optional[bool] = None) -> dict[str, Any]:
    return {
        "id": event.id,
        "user_id": event.user_id,
        "workspace_id": event.workspace_id,
        "title": event.title,
        "description": event.description,
        "start_time": _as_utc(event.start_time),
        "end_time": _as_utc(event.end_time),
        "is_meeting": bool(event.is_meeting),
        "color": event.color,
        "created_at": _as_utc(event.created_at),
        "updated_at": _as_utc(event.updated_at),
        "is_schedule": bool(event.is_schedule),
        "all_day": bool(event.all_day),
        "location": event.location,
        "technicians": [
            {"id": tech.id, "full_name": tech.full_name or tech.username}
            for tech in sorted(event.technicians or [], key=lambda t: (t.full_name or t.username or "").lower())
        ],
        "created_by_name": (event.creator.full_name or event.creator.username) if event.creator else None,
        "can_edit": _can_edit(db, event, user) if can_edit is None else can_edit,
    }


def _technician_query(db: Session):
    return db.query(User).filter(
        User.is_active.is_(True),
        or_(
            User.role == UserRole.TECHNICIAN,
            and_(User.is_technician.is_(True), User.role != UserRole.CLIENT),
        ),
    )


def _load_technicians(db: Session, ids: Iterable[int]) -> list[User]:
    wanted = list(dict.fromkeys(int(i) for i in ids))
    if not wanted:
        raise HTTPException(status_code=400, detail="Tag at least one technician")
    found = {user.id: user for user in _technician_query(db).filter(User.id.in_(wanted)).all()}
    missing = [i for i in wanted if i not in found]
    if missing:
        raise HTTPException(status_code=422, detail="Only active technicians can be tagged")
    return [found[i] for i in wanted]


# ── Times ────────────────────────────────────────────────────────────────────
# Calendar times are stored as UTC without a zone. The browser sends them in
# UTC ("...Z"); they are saved as plain UTC whatever zone they arrive in, and
# sent back marked as UTC, so each browser shows them in its own local time.
# Without the mark a browser reads a time as its own local time, and every
# event showed shifted by the viewer's distance from UTC.

def _utc_naive(value: Optional[datetime]) -> Optional[datetime]:
    """A time as stored: in UTC, without a zone."""
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _as_utc(value: Optional[datetime]) -> Optional[datetime]:
    """A stored time as sent to the browser: marked as UTC."""
    if value is None:
        return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _require_valid_times(start: datetime, end: datetime) -> None:
    if end < start:
        raise HTTPException(status_code=400, detail="The end must not be before the start")


def _notify(db: Session, user_ids: Iterable[int], title: str, event: CalendarEvent, actor: User, link: bool = True) -> None:
    recipients = [uid for uid in user_ids if uid != actor.id]
    if not recipients:
        return
    # Times are stored in UTC, so the message does not print one (it would read in
    # the wrong time zone); the link opens the event, where it shows in local time.
    details = " · ".join(part for part in (event.location, "Open the calendar for the date and time") if part)
    create_notifications(
        db,
        user_ids=recipients,
        title=title,
        message=details,
        notification_type="calendar",
        link_url=f"/calendar?event={event.id}" if link else "/calendar",
        actor_id=actor.id,
    )


@router.get("/technicians", response_model=List[CalendarTechnician])
def list_schedule_technicians(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """The technicians a schedule can be for, for those who create schedules."""
    if not _can_schedule(current_user):
        raise HTTPException(status_code=403, detail="Only Admins, Super Admins and technicians create schedules")
    users = _technician_query(db).all()
    return sorted(
        ({"id": user.id, "full_name": user.full_name or user.username} for user in users),
        key=lambda item: item["full_name"].lower(),
    )


@router.post("/schedule/clashes", response_model=List[ScheduleClash])
def schedule_clashes(
    payload: ScheduleClashCheck,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Schedules the tagged technicians already have at that time. A warning only."""
    if not _can_schedule(current_user):
        raise HTTPException(status_code=403, detail="Only Admins, Super Admins and technicians create schedules")
    start, end = _utc_naive(payload.start_time), _utc_naive(payload.end_time)
    if not payload.technician_ids or end < start:
        return []
    rows = (
        db.query(CalendarEvent, calendar_event_technicians.c.user_id)
        .join(calendar_event_technicians, calendar_event_technicians.c.event_id == CalendarEvent.id)
        .filter(
            CalendarEvent.is_schedule.is_(True),
            calendar_event_technicians.c.user_id.in_(payload.technician_ids),
            CalendarEvent.start_time < end,
            CalendarEvent.end_time > start,
        )
    )
    if payload.exclude_event_id:
        rows = rows.filter(CalendarEvent.id != payload.exclude_event_id)
    clashes = []
    for event, technician_id in rows.order_by(CalendarEvent.start_time).all():
        technician = next((t for t in event.technicians if t.id == technician_id), None)
        clashes.append({
            "technician_id": technician_id,
            "technician_name": (technician.full_name or technician.username) if technician else "Technician",
            "event_id": event.id,
            # Someone who cannot see that schedule learns only that the time is taken.
            "title": event.title if _can_see_schedule(event, current_user) else "Another booking",
            "start_time": _as_utc(event.start_time),
            "end_time": _as_utc(event.end_time),
        })
    return clashes


@router.get("/events", response_model=List[CalendarEventResponse])
def get_events(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Get all events for the current user (personal + shared workspace events),
    and the technician schedules they may see."""
    # Get user's workspaces
    workspace_ids = [m.workspace_id for m in db.query(WorkspaceMember).filter(WorkspaceMember.user_id == current_user.id).all()]

    # Admins and Super Admins see every schedule; others the ones they are tagged in
    # (and, through the first condition, the ones they created).
    if _is_admin(current_user):
        schedules_seen = CalendarEvent.is_schedule.is_(True)
    else:
        schedules_seen = and_(
            CalendarEvent.is_schedule.is_(True),
            CalendarEvent.technicians.any(User.id == current_user.id),
        )
    events = db.query(CalendarEvent).filter(
        or_(
            CalendarEvent.user_id == current_user.id,
            CalendarEvent.workspace_id.in_(workspace_ids) if workspace_ids else false(),
            schedules_seen,
        )
    ).all()
    return [_event_response(db, event, current_user) for event in events]


@router.post("/events", response_model=CalendarEventResponse)
def create_event(
    *,
    db: Session = Depends(get_db),
    event_in: CalendarEventCreate,
    current_user: User = Depends(get_current_user),
) -> Any:
    """Create a new calendar event, or a technician schedule when technicians are tagged."""
    event_in.start_time = _utc_naive(event_in.start_time)
    event_in.end_time = _utc_naive(event_in.end_time)
    data = event_in.model_dump(exclude={"technician_ids"})
    technicians: list[User] = []
    if event_in.technician_ids:
        if not _can_schedule(current_user):
            raise HTTPException(status_code=403, detail="Only Admins, Super Admins and technicians create schedules")
        if event_in.workspace_id:
            raise HTTPException(status_code=400, detail="A technician schedule is not a workspace event")
        _require_valid_times(event_in.start_time, event_in.end_time)
        technicians = _load_technicians(db, event_in.technician_ids)
        data["is_meeting"] = False
        data["is_schedule"] = True

    # If workspace_id is provided, verify membership
    if event_in.workspace_id:
        member = db.query(WorkspaceMember).filter(
            WorkspaceMember.workspace_id == event_in.workspace_id,
            WorkspaceMember.user_id == current_user.id
        ).first()
        if not member:
            raise HTTPException(status_code=403, detail="Not a member of this workspace")

    db_obj = CalendarEvent(
        **data,
        user_id=current_user.id
    )
    db_obj.technicians = technicians
    db.add(db_obj)
    db.flush()

    log_activity(db, "calendar_events", db_obj.id, "CALENDAR_EVENT_CREATED", current_user,
                 {**event_in.model_dump(), "technician_ids": [t.id for t in technicians]})
    if technicians:
        _notify(db, [t.id for t in technicians], f"Scheduled: {db_obj.title}", db_obj, current_user)
    db.commit()
    db.refresh(db_obj)
    return _event_response(db, db_obj, current_user)

@router.put("/events/{event_id}", response_model=CalendarEventResponse)
def update_event(
    *,
    db: Session = Depends(get_db),
    event_id: int,
    event_in: CalendarEventUpdate,
    current_user: User = Depends(get_current_user),
) -> Any:
    """Update a calendar event."""
    db_obj = db.query(CalendarEvent).filter(CalendarEvent.id == event_id).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Event not found")

    if db_obj.is_schedule:
        if not _can_see_schedule(db_obj, current_user):
            raise HTTPException(status_code=404, detail="Event not found")
        if not _can_change_schedule(db_obj, current_user):
            raise HTTPException(status_code=403, detail="Only the person who created this schedule, or an Admin, can change it")
    elif db_obj.user_id != current_user.id:
        # Check if they are admin of the workspace if it's a shared event
        if db_obj.workspace_id:
            member = db.query(WorkspaceMember).filter(
                WorkspaceMember.workspace_id == db_obj.workspace_id,
                WorkspaceMember.user_id == current_user.id
            ).first()
            if not member or member.role != "admin":
                raise HTTPException(status_code=403, detail="Permission denied")
        else:
            raise HTTPException(status_code=403, detail="Permission denied")

    update_data = event_in.model_dump(exclude_unset=True)
    for field in ("start_time", "end_time"):
        if field in update_data:
            update_data[field] = _utc_naive(update_data[field])
    technician_ids = update_data.pop("technician_ids", None)
    old_data = {c.name: getattr(db_obj, c.name) for c in db_obj.__table__.columns}
    before_ids = [t.id for t in db_obj.technicians or []]

    new_technicians: Optional[list[User]] = None
    if db_obj.is_schedule:
        if technician_ids is not None:
            new_technicians = _load_technicians(db, technician_ids)
        update_data.pop("is_meeting", None)
    elif technician_ids:
        # A personal event of one's own becomes a schedule when technicians are tagged.
        if not _can_schedule(current_user) or db_obj.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Only Admins, Super Admins and technicians create schedules")
        if db_obj.workspace_id:
            raise HTTPException(status_code=400, detail="A technician schedule is not a workspace event")
        new_technicians = _load_technicians(db, technician_ids)
        db_obj.is_schedule = True
        db_obj.is_meeting = False
        update_data.pop("is_meeting", None)

    for field, value in update_data.items():
        setattr(db_obj, field, value)
    if db_obj.is_schedule:
        _require_valid_times(db_obj.start_time, db_obj.end_time)
    if new_technicians is not None:
        db_obj.technicians = new_technicians

    after_ids = [t.id for t in db_obj.technicians or []]
    log_activity(db, "calendar_events", event_id, "CALENDAR_EVENT_UPDATED", current_user,
                 {"before": {**old_data, "technician_ids": before_ids}, "after": {**update_data, "technician_ids": after_ids}})
    if db_obj.is_schedule:
        added = [i for i in after_ids if i not in before_ids]
        removed = [i for i in before_ids if i not in after_ids]
        kept = [i for i in after_ids if i in before_ids]
        details_changed = any(
            old_data.get(field) != getattr(db_obj, field)
            for field in ("title", "description", "start_time", "end_time", "all_day", "location")
        )
        _notify(db, added, f"Scheduled: {db_obj.title}", db_obj, current_user)
        _notify(db, removed, f"Removed from schedule: {db_obj.title}", db_obj, current_user, link=False)
        if details_changed:
            _notify(db, kept, f"Schedule changed: {db_obj.title}", db_obj, current_user)
    db.commit()
    db.refresh(db_obj)
    return _event_response(db, db_obj, current_user)

@router.delete("/events/{event_id}", response_model=CalendarEventResponse)
def delete_event(
    *,
    db: Session = Depends(get_db),
    event_id: int,
    current_user: User = Depends(get_current_user),
) -> Any:
    """Delete a calendar event."""
    db_obj = db.query(CalendarEvent).filter(CalendarEvent.id == event_id).first()
    if not db_obj:
        raise HTTPException(status_code=404, detail="Event not found")

    if db_obj.is_schedule:
        if not _can_see_schedule(db_obj, current_user):
            raise HTTPException(status_code=404, detail="Event not found")
        if not _can_change_schedule(db_obj, current_user):
            raise HTTPException(status_code=403, detail="Only the person who created this schedule, or an Admin, can delete it")
    elif db_obj.user_id != current_user.id:
        if db_obj.workspace_id:
            member = db.query(WorkspaceMember).filter(
                WorkspaceMember.workspace_id == db_obj.workspace_id,
                WorkspaceMember.user_id == current_user.id
            ).first()
            if not member or member.role != "admin":
                raise HTTPException(status_code=403, detail="Permission denied")
        else:
            raise HTTPException(status_code=403, detail="Permission denied")

    response = _event_response(db, db_obj, current_user, can_edit=False)
    technician_ids = [t.id for t in db_obj.technicians or []]
    event_data = {c.name: str(getattr(db_obj, c.name)) for c in db_obj.__table__.columns}
    event_data["technician_ids"] = technician_ids
    if db_obj.is_schedule:
        _notify(db, technician_ids, f"Schedule cancelled: {db_obj.title}", db_obj, current_user, link=False)
    db.delete(db_obj)

    log_activity(db, "calendar_events", event_id, "CALENDAR_EVENT_DELETED", current_user, event_data)
    db.commit()
    return response
