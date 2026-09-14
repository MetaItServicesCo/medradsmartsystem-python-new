"""Request and response shapes for the fixture register."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class FixtureBase(BaseModel):
    fixture_type: str
    label: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    spec: Optional[dict[str, Any]] = None
    circuit_ref: Optional[str] = None
    served_by_equipment_id: Optional[int] = None
    quantity: int = 1
    installed_on: Optional[date] = None
    warranty_expires_on: Optional[date] = None
    last_tested_on: Optional[date] = None
    plan_x: Optional[str] = None
    plan_y: Optional[str] = None
    notes: Optional[str] = None


class FixtureCreate(FixtureBase):
    location_id: int
    code: Optional[str] = None


class FixtureBulkCreate(BaseModel):
    """Inventory a room in one action rather than one form per socket."""

    location_id: int
    fixture_type: str
    count: int = Field(default=1, ge=1, le=200)
    label: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    # Positional: the nth serial belongs to the nth fixture created. Shorter
    # than `count` is fine — the remainder are left blank rather than refused,
    # because a register with eight of twelve serials beats no register.
    serial_numbers: Optional[list[str]] = None
    spec: Optional[dict[str, Any]] = None
    circuit_ref: Optional[str] = None
    served_by_equipment_id: Optional[int] = None
    # Only for a type the catalogue does not know: the trade that maintains it
    # (which routes its faults) and the code prefix its fixtures are numbered by.
    discipline_code: Optional[str] = None
    code_prefix: Optional[str] = None


class FixtureFillItem(BaseModel):
    fixture_type: str
    # How many each room should have. Zero is allowed and does nothing.
    count: int = Field(ge=0, le=200)
    discipline_code: Optional[str] = None
    code_prefix: Optional[str] = None


class FixtureFill(BaseModel):
    """Top up existing rooms to what their room type contains."""

    location_ids: list[int] = Field(min_length=1, max_length=2000)
    items: list[FixtureFillItem] = Field(min_length=1, max_length=50)


class FixtureFillResponse(BaseModel):
    created: int
    rooms_changed: int


class FixtureUpdate(BaseModel):
    label: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    spec: Optional[dict[str, Any]] = None
    circuit_ref: Optional[str] = None
    served_by_equipment_id: Optional[int] = None
    status: Optional[str] = None
    installed_on: Optional[date] = None
    warranty_expires_on: Optional[date] = None
    last_tested_on: Optional[date] = None
    plan_x: Optional[str] = None
    plan_y: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class FixtureResponse(FixtureBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    facility_id: int
    location_id: int
    discipline_id: Optional[int] = None
    code: str
    status: str
    work_order_id: Optional[int] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    # Derived, so a list row can read "20 A critical receptacle" without the
    # browser reimplementing the catalogue.
    summary: Optional[str] = None
    discipline_code: Optional[str] = None
    type_label: Optional[str] = None


class FixtureListResponse(BaseModel):
    items: list[FixtureResponse]
    total: int


class FixtureTypeSummary(BaseModel):
    """One line of "what is in this room", per type."""

    fixture_type: str
    label: str
    discipline: Optional[str] = None
    total: int
    working: int
    faulty: int
    isolated: int


class ReportFaultRequest(BaseModel):
    description: str = Field(min_length=3)
    priority: Optional[str] = None
    # One dead socket of twelve does not close a theatre; the reporter decides.
    takes_out_of_service: bool = False


class ReportFaultResponse(BaseModel):
    work_order_id: int
    request_number: str
    fixture_id: int
    fixture_status: str
