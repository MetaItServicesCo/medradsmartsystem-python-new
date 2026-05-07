from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel

class AuditLogItem(BaseModel):
    id: int
    table_name: str
    record_id: int
    action: str
    changed_by_id: Optional[int]
    changed_by_username: Optional[str]
    changes_json: Optional[str]
    timestamp: datetime

    class Config:
        from_attributes = True

class AuditLogListResponse(BaseModel):
    items: List[AuditLogItem]
    total: int
