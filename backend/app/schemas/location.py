from typing import Any, List, Literal, Optional
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.models.location import LOCATION_TYPES, SPACE_USES, normalise_space_use


class LocationBase(BaseModel):
    facility_id: int
    parent_id: Optional[int] = None
    location_type: str
    code: str = Field(min_length=1, max_length=64)
    name: Optional[str] = None
    description: Optional[str] = None
    department_id: Optional[int] = None
    space_use: Optional[str] = None
    criticality: Optional[str] = None
    electrical_branch: Optional[str] = None
    area_sqft: Optional[Decimal] = None
    ceiling_height_ft: Optional[Decimal] = None
    volume_cuft: Optional[Decimal] = None
    occupancy_status: Optional[str] = None
    external_ref: Optional[str] = None

    @field_validator("location_type")
    @classmethod
    def _known_type(cls, value: str) -> str:
        if value not in LOCATION_TYPES:
            raise ValueError(f"Unknown location type '{value}'. Allowed: {', '.join(LOCATION_TYPES)}")
        return value

    @field_validator("space_use")
    @classmethod
    def _known_use(cls, value: Optional[str]) -> Optional[str]:
        # Any use is accepted; the listed ones carry rules. See normalise_space_use.
        return normalise_space_use(value)

    @field_validator("code")
    @classmethod
    def _trim_code(cls, value: str) -> str:
        # Codes are typed on a phone in a corridor and pasted from
        # spreadsheets. Both bring whitespace, and 'OR-3 ' failing to match
        # 'OR-3' is the kind of bug that costs a survey a day.
        return value.strip()


class LocationCreate(LocationBase):
    # Set by the field capture path when somebody could not find the room in
    # the picker. Real enough to hang a work order on, flagged for reconciling.
    is_provisional: bool = False
    floor_plan_id: Optional[int] = None
    plan_x: Optional[Decimal] = None
    plan_y: Optional[Decimal] = None


class LocationUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    department_id: Optional[int] = None
    space_use: Optional[str] = None
    criticality: Optional[str] = None
    electrical_branch: Optional[str] = None
    area_sqft: Optional[Decimal] = None
    ceiling_height_ft: Optional[Decimal] = None
    volume_cuft: Optional[Decimal] = None
    occupancy_status: Optional[str] = None
    external_ref: Optional[str] = None
    is_provisional: Optional[bool] = None
    is_active: Optional[bool] = None
    floor_plan_id: Optional[int] = None
    plan_x: Optional[Decimal] = None
    plan_y: Optional[Decimal] = None

    @field_validator("space_use")
    @classmethod
    def _known_use(cls, value: Optional[str]) -> Optional[str]:
        return normalise_space_use(value)


class LocationMove(BaseModel):
    """Re-parenting is its own operation, not an update.

    A move rewrites the paths of every descendant, so it is not the same class
    of change as renaming a room and should not be reachable by accident from a
    PATCH that happened to include parent_id.
    """

    new_parent_id: Optional[int] = None


class Location(LocationBase):
    id: int
    path: str
    depth: int
    bed_count: int
    is_provisional: bool
    is_active: bool
    plan_polygon: Optional[List[Any]] = None
    floor_plan_id: Optional[int] = None
    plan_x: Optional[Decimal] = None
    plan_y: Optional[Decimal] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class LocationWithStatus(Location):
    """A location plus its current availability, for the space board."""

    availability: Optional[str] = None
    oos_reason: Optional[str] = None
    status_since: Optional[datetime] = None
    work_order_id: Optional[int] = None
    display_label: Optional[str] = None


class LocationNode(Location):
    """One node with its children inlined, for the tree view."""

    children: List["LocationNode"] = []
    display_label: Optional[str] = None


LocationNode.model_rebuild()


class LocationListResponse(BaseModel):
    items: List[Location]
    total: int


class LocationTreeResponse(BaseModel):
    items: List[LocationNode]
    total: int


class LocationBreadcrumb(BaseModel):
    id: int
    code: str
    name: Optional[str] = None
    location_type: str

    class Config:
        from_attributes = True


class LocationDetail(Location):
    breadcrumbs: List[LocationBreadcrumb] = []
    child_count: int = 0
    descendant_count: int = 0
    availability: Optional[str] = None
    display_label: Optional[str] = None


# ── Floor plans ──────────────────────────────────────────────────────────────

class FloorPlanBase(BaseModel):
    facility_id: int
    location_id: int
    name: str
    page_number: Optional[int] = None


class FloorPlanCreate(FloorPlanBase):
    pass


class FloorPlanUpdate(BaseModel):
    name: Optional[str] = None
    page_number: Optional[int] = None
    rotation_deg: Optional[int] = None
    is_current: Optional[bool] = None
    width_px: Optional[int] = None
    height_px: Optional[int] = None


class FloorPlanCalibrate(BaseModel):
    """Turn the drawing into a measuring instrument.

    The client sends the pixel length of a line the operator drew over a known
    dimension — a three-foot door leaf, or the drawing's own scale bar — and
    the real-world length of that thing. Everything downstream (room area in
    square feet, and therefore volume, and therefore air changes per hour) comes
    from this one number.
    """

    pixel_distance: float = Field(gt=0, description="Length of the drawn line, in pixels")
    real_feet: float = Field(gt=0, description="What that line measures in the real world, in feet")


class FloorPlan(FloorPlanBase):
    id: int
    source_filename: Optional[str] = None
    source_mime: Optional[str] = None
    image_path: Optional[str] = None
    width_px: Optional[int] = None
    height_px: Optional[int] = None
    scale_ft_per_px: Optional[Decimal] = None
    rotation_deg: int
    version: int
    is_current: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class FloorPlanListResponse(BaseModel):
    items: List[FloorPlan]
    total: int


class PinPlacement(BaseModel):
    """Where a location sits on a plan, as a fraction of the image.

    Fractions rather than pixels so that re-rendering the source PDF at a
    different resolution does not move every pin on the floor.
    """

    location_id: int
    plan_x: float = Field(ge=0, le=1)
    plan_y: float = Field(ge=0, le=1)


class PolygonVertex(BaseModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)


class TraceRoom(BaseModel):
    """A traced room outline, in the same 0..1 fractions as a pin.

    Area is computed server-side from the plan's calibration rather than sent
    by the client: the scale is the server's to know, and a client-computed
    area would silently disagree with it the moment somebody re-calibrates.
    """

    polygon: List[PolygonVertex] = Field(min_length=3)
    # Place the pin at the centroid too, so a traced room still appears on the
    # board and in search without anyone dropping a second marker.
    set_pin_to_centroid: bool = True


class TraceResult(BaseModel):
    location_id: int
    area_sqft: Optional[float] = None
    perimeter_ft: Optional[float] = None
    volume_cuft: Optional[float] = None
    plan_x: Optional[float] = None
    plan_y: Optional[float] = None
    # Set when the plan has no scale yet: the trace is stored, the area is not
    # computable, and the caller should be told why rather than shown a blank.
    message: Optional[str] = None


class PinBatch(BaseModel):
    """Tracing a floor produces pins in bursts; one request per pin would make
    a 400-room floor 400 round trips."""

    pins: List[PinPlacement]


class QuickPin(BaseModel):
    """Create a room and place it in one action — the tracing loop.

    The operator clicks the plan, types the door number, and moves on. Anything
    that makes them fill a form between clicks makes surveying a floor take a
    day instead of an hour.
    """

    code: str = Field(min_length=1, max_length=64)
    name: Optional[str] = None
    location_type: str = "room"
    space_use: Optional[str] = None
    plan_x: float = Field(ge=0, le=1)
    plan_y: float = Field(ge=0, le=1)


class BulkLocationRow(BaseModel):
    """One row of a spreadsheet import.

    Parents are named by code rather than by id because a spreadsheet built by
    a human contains door numbers, never database keys.
    """

    parent_code: Optional[str] = None
    location_type: str
    code: str
    name: Optional[str] = None
    space_use: Optional[str] = None
    criticality: Optional[str] = None
    department_name: Optional[str] = None
    area_sqft: Optional[float] = None
    ceiling_height_ft: Optional[float] = None
    bed_count: Optional[int] = None
    external_ref: Optional[str] = None
    # What each room contains, created with it in the same transaction:
    # chairs and a display in a conference room, sockets and gas outlets in a
    # theatre. Beds are not here — a bed is a space with its own status, and
    # arrives as a child row of type "bed".
    fixtures: Optional[List["BulkFixture"]] = None
    # Chairs, tables, displays: each becomes an asset located in this room.
    assets: Optional[List["BulkAsset"]] = None


class BulkFixture(BaseModel):
    fixture_type: str
    count: int = 1
    label: Optional[str] = None
    # Only for a type the catalogue does not know.
    discipline_code: Optional[str] = None
    code_prefix: Optional[str] = None
    spec: Optional[dict] = None


class BulkAsset(BaseModel):
    asset_type: str
    count: int = Field(default=1, ge=1, le=200)
    # Only for a type the asset catalogue does not know.
    discipline_code: Optional[str] = None
    # Optional, for when the fit-out's costs are already known. Each item.
    cost: Optional[Decimal] = Field(default=None, ge=0, le=Decimal("99999999.99"), decimal_places=2)
    installation_date: Optional[date] = None


BulkLocationRow.model_rebuild()


class ContentFixture(BaseModel):
    fixture_type: str
    count: int = Field(ge=0, le=200)
    discipline_code: Optional[str] = None
    code_prefix: Optional[str] = None


class ContentAsset(BaseModel):
    asset_type: str
    count: int = Field(ge=0, le=200)
    discipline_code: Optional[str] = None
    # Applied to the items a top-up creates, never to ones already in the room.
    cost: Optional[Decimal] = Field(default=None, ge=0, le=Decimal("99999999.99"), decimal_places=2)
    installation_date: Optional[date] = None


class RoomContentsFill(BaseModel):
    """Top existing rooms up to what their room type contains."""

    location_ids: List[int] = Field(min_length=1, max_length=2000)
    fixtures: List[ContentFixture] = Field(default_factory=list, max_length=50)
    assets: List[ContentAsset] = Field(default_factory=list, max_length=50)


class RoomContentsFillResult(BaseModel):
    fixtures_created: int
    assets_created: int
    rooms_changed: int


class BulkLocationImport(BaseModel):
    facility_id: int
    rows: List[BulkLocationRow]
    # Validate and report without writing. An import that half-succeeds on a
    # space register is worse than one that refuses, because nobody can tell
    # which half.
    dry_run: bool = True


class BulkImportIssue(BaseModel):
    row_index: int
    code: Optional[str] = None
    severity: Literal["error", "warning"]
    message: str


class BulkImportResult(BaseModel):
    dry_run: bool
    total_rows: int
    created: int
    updated: int
    skipped: int
    issues: List[BulkImportIssue]
