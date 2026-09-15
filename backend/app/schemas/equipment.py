from typing import Any, Optional, List
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, Field, model_validator

from app.schemas.money import Money


class EquipmentBase(BaseModel):
    # Blank on create means "issue the next tag for this site".
    asset_tag: str = ""
    # Required for clinical equipment only (see EquipmentCreate). A chair or a
    # newly surveyed pump often has none yet; they are stored empty, not invented.
    make: str = ""
    model: str = ""
    serial_number: str = ""
    modality_id: Optional[int] = None
    facility_id: int
    tier_id: Optional[int] = None
    inspection_form_id: Optional[int] = None
    default_picture_url: Optional[str] = None
    description: Optional[str] = None
    risk_priority: Optional[str] = None
    risk_name: Optional[str] = None
    location: Optional[str] = None
    inventory_date: Optional[date] = None
    acquisition_authorized_by: Optional[str] = None
    department: Optional[str] = None
    po_no: Optional[str] = None
    requester_first_name: Optional[str] = None
    requester_last_name: Optional[str] = None
    requester_phone: Optional[str] = None
    requester_fax: Optional[str] = None
    requester_mailing_address: Optional[str] = None
    requester_email: Optional[str] = None
    owning_department: Optional[str] = None
    acquisition_method: Optional[str] = None
    acquired_company_name: Optional[str] = None
    acquired_account_number: Optional[str] = None
    acquired_sales_person: Optional[str] = None
    acquired_phone: Optional[str] = None
    acquired_email: Optional[str] = None
    acquired_mailing_address: Optional[str] = None
    cost: Optional[Decimal] = None
    acquisition_date: Optional[date] = None
    capital_equipment: Optional[str] = None
    warranty_duration: Optional[str] = None
    parts_duration: Optional[str] = None
    labor_duration: Optional[str] = None
    coverage_start_date: Optional[date] = None
    coverage_type: Optional[str] = None
    part_warranty_end_date: Optional[date] = None
    labor_warranty_end_date: Optional[date] = None
    pm_scheduling: Optional[str] = None
    installation_date: Optional[date] = None
    last_pm_date: Optional[date] = None
    next_generated_pm_date: Optional[date] = None
    purchase_date: Optional[date] = None
    warranty_expiration: Optional[date] = None
    status: str = "active"

    # ── Facilities / MEP ────────────────────────────────────────────────────
    # All optional, so every existing caller keeps working unchanged. Without
    # these an MEP asset cannot be created through the API at all: the columns
    # exist on the model but nothing can set them.
    #
    # `location` above stays as it is — the legacy free-text string, still the
    # fallback display for an asset that has not been placed in the tree.
    discipline_id: Optional[int] = None
    location_id: Optional[int] = None
    parent_equipment_id: Optional[int] = None
    criticality: Optional[str] = None
    electrical_branch: Optional[str] = None
    service_vendor_id: Optional[int] = None
    # Set for items that belong to a room (chair, display); empty for plant.
    asset_type: Optional[str] = None

    # ── Depreciation ────────────────────────────────────────────────────────
    depreciation_method: Optional[str] = None
    salvage_value: Optional[Decimal] = None
    useful_life_years: Optional[Decimal] = None
    total_expected_units: Optional[Decimal] = None


class RoomAssetsCreate(BaseModel):
    """Add several of one item to a room, each as its own asset."""

    location_id: int
    asset_type: str
    count: int = Field(default=1, ge=1, le=200)
    # Only for a type the catalogue does not know: which trade maintains it.
    discipline_code: Optional[str] = None
    # Only for a single item: the tag already on it, and its serial.
    asset_tag: Optional[str] = None
    serial_number: Optional[str] = None
    # Shared by every item added together.
    make: Optional[str] = None
    model: Optional[str] = None
    cost: Optional[Decimal] = None
    installation_date: Optional[date] = None
    description: Optional[str] = None


class AssetSelection(BaseModel):
    """Which assets a bulk change applies to: ticked ones, or everything a filter matches.

    The filter mirrors the register's, so "select all 340 matching" means the
    same 340 the list said, not just the hundred loaded on screen. A filter
    must name a site: a bulk change never spans hospitals.
    """

    ids: Optional[List[int]] = Field(default=None, max_length=5000)
    facility_id: Optional[int] = None
    search: Optional[str] = None
    location_id: Optional[int] = None
    kind: Optional[str] = Field(default=None, pattern="^(room_items|equipment)$")
    asset_type: Optional[str] = None
    discipline_id: Optional[int] = None

    @model_validator(mode="after")
    def one_way_of_choosing(self):
        if self.ids is not None and self.facility_id is not None:
            raise ValueError("Choose assets either by ticking them or by filter, not both")
        if self.ids is None and self.facility_id is None:
            raise ValueError("Say which assets: tick them, or filter within a site")
        if self.ids is not None and not self.ids:
            raise ValueError("No assets are selected")
        return self


class AssetBulkChanges(BaseModel):
    """The details to set. Anything left out or blank is left as it is."""

    cost: Optional[Money] = None
    installation_date: Optional[date] = None
    make: Optional[str] = Field(default=None, max_length=200)
    model: Optional[str] = Field(default=None, max_length=200)
    discipline_id: Optional[int] = None


class AssetBulkUpdate(BaseModel):
    selection: AssetSelection
    changes: AssetBulkChanges
    # Preview by default: the caller has to ask for the change to happen.
    dry_run: bool = True


class BulkSkipped(BaseModel):
    id: int
    asset_tag: str
    reason: str


class BulkFieldOutcome(BaseModel):
    field: str
    label: str
    value: Any
    will_change: int
    unchanged: int
    skipped_count: int
    skipped: List[BulkSkipped]


class AssetBulkResult(BaseModel):
    dry_run: bool
    matched: int
    assets_changed: int
    fields: List[BulkFieldOutcome]


class ServesSpace(BaseModel):
    """One space an asset supplies, and with what."""

    location_id: int
    service_type: str


class ServesLink(BaseModel):
    id: int
    location_id: int
    code: str
    name: Optional[str] = None
    location_type: str
    criticality: Optional[str] = None
    service_type: str


class EquipmentCreate(EquipmentBase):
    # The spaces it supplies: an air handler in a roof plant room serving the
    # theatres. Also decides its criticality when none is given.
    serves: List[ServesSpace] = []

    @model_validator(mode="before")
    @classmethod
    def blanks_not_nulls(cls, data):
        if isinstance(data, dict):
            for key in ("asset_tag", "make", "model", "serial_number"):
                if data.get(key) is None:
                    data[key] = ""
        return data

    @model_validator(mode="after")
    def clinical_equipment_is_identified(self):
        """Make, model and serial are how a recall reaches a device."""
        if self.modality_id is not None:
            missing = [label for label, value in (
                ("make", self.make), ("model", self.model), ("serial number", self.serial_number),
            ) if not value.strip()]
            if missing:
                raise ValueError(
                    f"Clinical equipment needs its {', '.join(missing)}: recalls and "
                    "safety notices are tracked by them."
                )
        return self

    @model_validator(mode="after")
    def needs_a_classification(self):
        """One of modality or discipline, not both and not neither.

        A ventilator is classified clinically; a lift is classified by trade.
        Leaving both empty produces an asset that no maintenance programme,
        dispatch rule or depreciation default can reason about, which is worse
        than refusing it.
        """
        if self.modality_id is None and self.discipline_id is None:
            raise ValueError(
                "Give the asset either a modality (clinical equipment) or a "
                "discipline (plant and MEP)."
            )
        return self


class EquipmentUpdate(BaseModel):
    asset_tag: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    modality_id: Optional[int] = None
    facility_id: Optional[int] = None
    tier_id: Optional[int] = None
    inspection_form_id: Optional[int] = None
    default_picture_url: Optional[str] = None
    description: Optional[str] = None
    risk_priority: Optional[str] = None
    risk_name: Optional[str] = None
    location: Optional[str] = None
    inventory_date: Optional[date] = None
    acquisition_authorized_by: Optional[str] = None
    department: Optional[str] = None
    po_no: Optional[str] = None
    requester_first_name: Optional[str] = None
    requester_last_name: Optional[str] = None
    requester_phone: Optional[str] = None
    requester_fax: Optional[str] = None
    requester_mailing_address: Optional[str] = None
    requester_email: Optional[str] = None
    owning_department: Optional[str] = None
    acquisition_method: Optional[str] = None
    acquired_company_name: Optional[str] = None
    acquired_account_number: Optional[str] = None
    acquired_sales_person: Optional[str] = None
    acquired_phone: Optional[str] = None
    acquired_email: Optional[str] = None
    acquired_mailing_address: Optional[str] = None
    cost: Optional[Decimal] = None
    acquisition_date: Optional[date] = None
    capital_equipment: Optional[str] = None
    warranty_duration: Optional[str] = None
    parts_duration: Optional[str] = None
    labor_duration: Optional[str] = None
    coverage_start_date: Optional[date] = None
    coverage_type: Optional[str] = None
    part_warranty_end_date: Optional[date] = None
    labor_warranty_end_date: Optional[date] = None
    pm_scheduling: Optional[str] = None
    installation_date: Optional[date] = None
    last_pm_date: Optional[date] = None
    next_generated_pm_date: Optional[date] = None
    purchase_date: Optional[date] = None
    warranty_expiration: Optional[date] = None
    status: Optional[str] = None

    # ── Facilities / MEP ────────────────────────────────────────────────────
    # All optional, so every existing caller keeps working unchanged. Without
    # these an MEP asset cannot be created through the API at all: the columns
    # exist on the model but nothing can set them.
    #
    # `location` above stays as it is — the legacy free-text string, still the
    # fallback display for an asset that has not been placed in the tree.
    discipline_id: Optional[int] = None
    location_id: Optional[int] = None
    parent_equipment_id: Optional[int] = None
    criticality: Optional[str] = None
    electrical_branch: Optional[str] = None
    service_vendor_id: Optional[int] = None
    asset_type: Optional[str] = None

    # ── Depreciation ────────────────────────────────────────────────────────
    depreciation_method: Optional[str] = None
    salvage_value: Optional[Decimal] = None
    useful_life_years: Optional[Decimal] = None
    total_expected_units: Optional[Decimal] = None


class Equipment(EquipmentBase):
    id: int
    created_at: datetime
    updated_at: datetime
    # "Chair", "Ceiling speaker": what a room item is, for lists that would
    # otherwise show an empty make and model.
    type_label: Optional[str] = None
    # Set on equipment in the Facility Categories (see app/services/site_categories.py),
    # so the register can show it by name and where exactly it is.
    name: Optional[str] = None
    equipment_type: Optional[str] = None
    quantity: Optional[int] = None
    building: Optional[str] = None
    floor: Optional[str] = None
    condition: Optional[str] = None

    class Config:
        from_attributes = True


class EquipmentListResponse(BaseModel):
    items: List[Equipment]
    total: int
