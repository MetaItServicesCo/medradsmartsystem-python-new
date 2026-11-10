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
    # The form a new asset of this type gets (a visible form).
    inspection_form_id: Optional[int] = None


class ModalityUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    inspection_frequency_days: Optional[int] = None
    parent_id: Optional[int] = None
    inspection_form_id: Optional[int] = None


class ModalityInDB(ModalityBase):
    id: int

    class Config:
        from_attributes = True


class ModalityResponse(ModalityInDB):
    children: List["ModalityResponse"] = []
    # The old list, kept on existing assets and not offered for new ones.
    is_legacy: bool = False
    inspection_form_id: Optional[int] = None
    inspection_form_name: Optional[str] = None
    inspection_form_hidden: bool = False

    class Config:
        from_attributes = True


ModalityResponse.model_rebuild()


class ModalityListResponse(BaseModel):
    items: List[ModalityResponse]
    total: int
