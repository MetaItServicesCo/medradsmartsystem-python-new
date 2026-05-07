from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel


class ModalityBase(BaseModel):
    name: str
    category: str
    description: Optional[str] = None
    inspection_frequency_days: Optional[int] = None
    parent_id: Optional[int] = None


class ModalityCreate(ModalityBase):
    pass


class ModalityUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    inspection_frequency_days: Optional[int] = None
    parent_id: Optional[int] = None


class ModalityInDB(ModalityBase):
    id: int

    class Config:
        from_attributes = True


class ModalityResponse(ModalityInDB):
    children: List["ModalityResponse"] = []

    class Config:
        from_attributes = True


ModalityResponse.model_rebuild()


class ModalityListResponse(BaseModel):
    items: List[ModalityResponse]
    total: int
