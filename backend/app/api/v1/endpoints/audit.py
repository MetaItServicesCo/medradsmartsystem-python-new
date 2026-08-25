from datetime import date, datetime, time, timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import String, cast, or_
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.core.deps import require_roles
from app.db.base import get_db
from app.models.audit_log import AuditLog
from app.models.user import User

from app.schemas.audit_log import AuditLogListResponse

router = APIRouter()

# Only superadmins can view audit logs
get_superadmin_user = require_roles("superadmin")

@router.get("/", response_model=AuditLogListResponse)
def read_audit_logs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_superadmin_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    search: Optional[str] = Query(None, max_length=120),
    action: Optional[str] = Query(None, max_length=40),
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
) -> Any:
    """
    Retrieve audit logs. Restricted to superadmins.
    """
    if from_date and to_date and from_date > to_date:
        raise HTTPException(status_code=422, detail="From date cannot be after to date")

    query = db.query(AuditLog)

    normalized_search = (search or "").strip()
    if normalized_search:
        escaped_search = (
            normalized_search
            .replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")
        )
        pattern = f"%{escaped_search}%"
        query = query.filter(
            or_(
                AuditLog.changed_by_username.ilike(pattern, escape="\\"),
                AuditLog.table_name.ilike(pattern, escape="\\"),
                AuditLog.action.ilike(pattern, escape="\\"),
                AuditLog.changes_json.ilike(pattern, escape="\\"),
                cast(AuditLog.record_id, String).ilike(pattern, escape="\\"),
            )
        )

    normalized_action = (action or "").strip()
    if normalized_action:
        action_pattern = f"%{normalized_action.replace('%', '').replace('_', '')}%"
        query = query.filter(AuditLog.action.ilike(action_pattern))

    if from_date:
        query = query.filter(AuditLog.timestamp >= datetime.combine(from_date, time.min))
    if to_date:
        query = query.filter(AuditLog.timestamp < datetime.combine(to_date + timedelta(days=1), time.min))

    total = query.count()
    items = query.order_by(desc(AuditLog.timestamp)).offset(skip).limit(limit).all()
    
    return {
        "items": items,
        "total": total
    }
