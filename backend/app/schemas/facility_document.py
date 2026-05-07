from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel


class FacilityDocumentBase(BaseModel):
    filename: str
    file_type: Optional[str] = None
    file_size: Optional[int] = None


class FacilityDocumentCreate(FacilityDocumentBase):
    facility_id: int
    file_path: str


class FacilityDocumentResponse(FacilityDocumentBase):
    id: int
    facility_id: int
    uploaded_at: datetime

    class Config:
        from_attributes = True


class FacilityDocumentListResponse(BaseModel):
    items: List[FacilityDocumentResponse]
    total: int
