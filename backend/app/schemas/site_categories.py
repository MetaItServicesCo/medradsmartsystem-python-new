"""Payloads for the categories register and its service and inspection jobs.

Kept deliberately small: every field here is one a person sees on the form.
Written for Pydantic 2.5, which the server pins.
"""
from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field

Condition = Literal["working", "needs_attention", "out_of_service"]
CategoryCode = Literal["electrical", "plumbing", "mechanical", "hvac"]
JobKind = Literal["service", "inspection"]
JobStatus = Literal["open", "in_progress", "done"]
InspectionResult = Literal["pass", "fail"]


class CategoryEquipmentCreate(BaseModel):
    facility_id: int
    name: str = Field(..., min_length=1, max_length=160)
    type: str = Field(..., min_length=1, max_length=80)
    building: str = Field(..., min_length=1, max_length=120)
    floor: Optional[str] = Field(None, max_length=80)
    spot: Optional[str] = Field(None, max_length=255)
    quantity: int = Field(1, ge=1, le=100000)
    condition: Condition = "working"
    make: Optional[str] = Field(None, max_length=120)
    model: Optional[str] = Field(None, max_length=120)
    notes: Optional[str] = Field(None, max_length=4000)


class CategoryEquipmentUpdate(BaseModel):
    category: Optional[CategoryCode] = None
    name: Optional[str] = Field(None, min_length=1, max_length=160)
    type: Optional[str] = Field(None, min_length=1, max_length=80)
    building: Optional[str] = Field(None, min_length=1, max_length=120)
    floor: Optional[str] = Field(None, max_length=80)
    spot: Optional[str] = Field(None, max_length=255)
    quantity: Optional[int] = Field(None, ge=1, le=100000)
    condition: Optional[Condition] = None
    make: Optional[str] = Field(None, max_length=120)
    model: Optional[str] = Field(None, max_length=120)
    notes: Optional[str] = Field(None, max_length=4000)


class EquipmentJobCreate(BaseModel):
    facility_id: int
    kind: JobKind
    equipment_id: int
    title: str = Field(..., min_length=1, max_length=500)
    due_on: Optional[date] = None
    assigned_to_id: Optional[int] = None
    status: JobStatus = "open"
    notes: Optional[str] = Field(None, max_length=4000)
    inspection_result: Optional[InspectionResult] = None
    findings: Optional[str] = Field(None, max_length=4000)


class EquipmentJobUpdate(BaseModel):
    equipment_id: Optional[int] = None
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    due_on: Optional[date] = None
    assigned_to_id: Optional[int] = None
    status: Optional[JobStatus] = None
    notes: Optional[str] = Field(None, max_length=4000)
    inspection_result: Optional[InspectionResult] = None
    findings: Optional[str] = Field(None, max_length=4000)
