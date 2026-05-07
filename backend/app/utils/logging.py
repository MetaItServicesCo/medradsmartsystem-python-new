import json
from sqlalchemy.orm import Session
from app.models.audit_log import AuditLog
from app.models.user import User

def log_activity(db: Session, table: str, record_id: int, action: str, user: User, changes: dict = None):
    """
    Log a user activity to the audit_logs table.
    action: CREATE, UPDATE, DELETE, LOGIN, IMPERSONATE, etc.
    """
    log = AuditLog(
        table_name=table,
        record_id=record_id,
        action=action,
        changed_by_id=user.id if user else None,
        changed_by_username=user.username if user else "system",
        changes_json=json.dumps(changes, default=str) if changes else None,
    )
    db.add(log)
    db.flush()
    return log
