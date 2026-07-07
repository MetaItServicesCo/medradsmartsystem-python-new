from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.deps import get_current_user
from app.utils.permission_deps import require_module_access
from app.db.base import get_db
from app.models.user import User
from app.models.calendar import CalendarEvent
from app.models.chat import WorkspaceMember
from app.schemas.calendar import CalendarEventCreate, CalendarEventUpdate, CalendarEventResponse
from app.utils.logging import log_activity

router = APIRouter(dependencies=[Depends(require_module_access("calendar"))])

@router.get("/events", response_model=List[CalendarEventResponse])
def get_events(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Get all events for the current user (personal + shared workspace events)."""
    # Get user's workspaces
    workspace_ids = [m.workspace_id for m in db.query(WorkspaceMember).filter(WorkspaceMember.user_id == current_user.id).all()]
    
    events = db.query(CalendarEvent).filter(
        or_(
            CalendarEvent.user_id == current_user.id,
            CalendarEvent.workspace_id.in_(workspace_ids) if workspace_ids else False
        )
    ).all()
    return events

@router.post("/events", response_model=CalendarEventResponse)
def create_event(
    *,
    db: Session = Depends(get_db),
    event_in: CalendarEventCreate,
    current_user: User = Depends(get_current_user),
) -> Any:
    """Create a new calendar event."""
    # If workspace_id is provided, verify membership
    if event_in.workspace_id:
        member = db.query(WorkspaceMember).filter(
            WorkspaceMember.workspace_id == event_in.workspace_id,
            WorkspaceMember.user_id == current_user.id
        ).first()
        if not member:
            raise HTTPException(status_code=403, detail="Not a member of this workspace")

    db_obj = CalendarEvent(
        **event_in.model_dump(),
        user_id=current_user.id
    )
    db.add(db_obj)
    db.flush()
    
    log_activity(db, "calendar_events", db_obj.id, "CALENDAR_EVENT_CREATED", current_user, event_in.model_dump())
    db.commit()
    db.refresh(db_obj)
    return db_obj

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
    
    if db_obj.user_id != current_user.id:
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
    old_data = {c.name: getattr(db_obj, c.name) for c in db_obj.__table__.columns}
    for field, value in update_data.items():
        setattr(db_obj, field, value)
    
    log_activity(db, "calendar_events", event_id, "CALENDAR_EVENT_UPDATED", current_user, {"before": old_data, "after": update_data})
    db.commit()
    db.refresh(db_obj)
    return db_obj

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
    
    if db_obj.user_id != current_user.id:
        if db_obj.workspace_id:
            member = db.query(WorkspaceMember).filter(
                WorkspaceMember.workspace_id == db_obj.workspace_id,
                WorkspaceMember.user_id == current_user.id
            ).first()
            if not member or member.role != "admin":
                raise HTTPException(status_code=403, detail="Permission denied")
        else:
            raise HTTPException(status_code=403, detail="Permission denied")

    event_data = {c.name: str(getattr(db_obj, c.name)) for c in db_obj.__table__.columns}
    db.delete(db_obj)
    
    log_activity(db, "calendar_events", event_id, "CALENDAR_EVENT_DELETED", current_user, event_data)
    db.commit()
    return db_obj
