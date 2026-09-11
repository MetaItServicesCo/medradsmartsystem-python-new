from typing import List, Optional
from datetime import datetime

from pydantic import BaseModel, Field


class DisciplineBase(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    name: str
    description: Optional[str] = None
    color: Optional[str] = None
    sort_order: int = 100
    is_active: bool = True


class DisciplineCreate(DisciplineBase):
    pass


class DisciplineUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class Discipline(DisciplineBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DisciplineListResponse(BaseModel):
    items: List[Discipline]
    total: int


class UserDisciplineAssign(BaseModel):
    """Which trades a technician holds.

    The whole list is sent on every save rather than individual add/remove
    calls: the editing surface is a set of checkboxes, and diffing them on the
    client is how two admins editing at once end up with a union of both.
    """

    discipline_ids: List[int]
    primary_discipline_id: Optional[int] = None


class UserDiscipline(BaseModel):
    id: int
    user_id: int
    discipline_id: int
    is_primary: bool
    certification_note: Optional[str] = None

    class Config:
        from_attributes = True


class TechnicianCandidate(BaseModel):
    """A technician who could take this job, for the dispatch picker."""

    id: int
    full_name: str
    username: str
    holds_discipline: bool
    is_primary_discipline: bool
    open_work_orders: int = 0
