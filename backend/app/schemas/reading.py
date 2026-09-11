from typing import List, Optional
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.models.reading import UNIT_LABELS, UNITS


class ReadingPointBase(BaseModel):
    facility_id: int
    equipment_id: Optional[int] = None
    location_id: Optional[int] = None
    code: str = Field(min_length=1, max_length=64)
    name: str
    kind: str = "environmental"
    # Required, never inferred. ASHRAE 170 asks an operating room for
    # 0.01 in. w.c. positive; the same requirement in pascals is about 2.5, and
    # a value stored without its unit cannot tell the two apart.
    unit: str
    min_spec: Optional[Decimal] = None
    max_spec: Optional[Decimal] = None
    target: Optional[Decimal] = None
    spec_reference: Optional[str] = None
    frequency_days: Optional[int] = None
    gates_space_availability: bool = False
    notes: Optional[str] = None

    @field_validator("unit")
    @classmethod
    def _known_unit(cls, value: str) -> str:
        if value not in UNITS:
            raise ValueError(f"Unknown unit '{value}'. Allowed: {', '.join(UNITS)}")
        return value


class ReadingPointCreate(ReadingPointBase):
    pass


class ReadingPointUpdate(BaseModel):
    name: Optional[str] = None
    kind: Optional[str] = None
    min_spec: Optional[Decimal] = None
    max_spec: Optional[Decimal] = None
    target: Optional[Decimal] = None
    spec_reference: Optional[str] = None
    frequency_days: Optional[int] = None
    gates_space_availability: Optional[bool] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None
    # `unit` is deliberately absent. Changing it would reinterpret every reading
    # ever taken against this point; retire the point and make a new one.


class ReadingPoint(ReadingPointBase):
    id: int
    is_active: bool
    last_reading_at: Optional[datetime] = None
    next_due_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ReadingPointWithState(ReadingPoint):
    unit_label: Optional[str] = None
    last_value: Optional[Decimal] = None
    last_in_spec: Optional[bool] = None
    is_overdue: bool = False
    location_code: Optional[str] = None
    equipment_tag: Optional[str] = None


class ReadingPointListResponse(BaseModel):
    items: List[ReadingPointWithState]
    total: int


class ReadingCreate(BaseModel):
    value: Decimal
    # Optional: defaults to the point's unit. Supplied when a meter or a
    # vendor's report was in something else, so the conversion is explicit and
    # recorded rather than assumed.
    unit: Optional[str] = None
    recorded_at: Optional[datetime] = None
    work_order_id: Optional[int] = None
    inspection_id: Optional[int] = None
    source: str = "manual"
    notes: Optional[str] = None

    @field_validator("unit")
    @classmethod
    def _known_unit(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and value not in UNITS:
            raise ValueError(f"Unknown unit '{value}'")
        return value


class Reading(BaseModel):
    id: int
    point_id: int
    facility_id: int
    value: Decimal
    unit: str
    in_spec: bool
    recorded_at: datetime
    recorded_by_id: Optional[int] = None
    work_order_id: Optional[int] = None
    inspection_id: Optional[int] = None
    source: str
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class ReadingWithContext(Reading):
    unit_label: Optional[str] = None
    point_code: Optional[str] = None
    point_name: Optional[str] = None
    min_spec: Optional[Decimal] = None
    max_spec: Optional[Decimal] = None


class ReadingListResponse(BaseModel):
    items: List[ReadingWithContext]
    total: int


class ReadingResult(BaseModel):
    """What happened when a reading landed.

    `space_taken_out_of_service` is the part worth surfacing: an isolation room
    that loses negative pressure stops being usable for the patient it was built
    for, and the technician who took the reading should be told that their entry
    just changed the room's availability.
    """

    reading: Reading
    in_spec: bool
    converted_from: Optional[str] = None
    space_taken_out_of_service: bool = False
    message: Optional[str] = None


class UnitOption(BaseModel):
    value: str
    label: str


class ReadingMeta(BaseModel):
    units: List[UnitOption]
    kinds: List[UnitOption]


def unit_label(unit: str) -> str:
    return UNIT_LABELS.get(unit, unit)
