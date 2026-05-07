from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.core.deps import get_current_user, require_roles
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
) -> Any:
    """
    Retrieve audit logs. Restricted to superadmins.
    """
    query = db.query(AuditLog)
    total = query.count()
    items = query.order_by(desc(AuditLog.timestamp)).offset(skip).limit(limit).all()
    
    return {
        "items": items,
        "total": total
    }
