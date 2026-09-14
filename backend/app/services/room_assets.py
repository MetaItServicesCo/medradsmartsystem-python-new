"""Assets that belong to a room: created with it, topped up, and taken out with it.

Each item is its own asset with a permanent tag. Twelve chairs are twelve
assets, because a broken, moved or disposed chair is one particular chair. The
room is where the asset is now, recorded as its location; the tag never
mentions the room, so the sticker stays true when the chair is carried next
door.

Make, model and serial number are stored empty rather than invented. Those
columns are required on the asset table and read as text by screens that
predate this, so empty is the one value that is both honest and safe; they are
filled in when somebody records them.
"""
from __future__ import annotations

import re

from sqlalchemy.orm import Session

from app.models.discipline import Discipline
from app.models.equipment import Equipment, EquipmentStatus
from app.models.facility import Facility
from app.models.location import Location
from app.services import asset as asset_service
from app.services import asset_catalog, fixture_catalog
from app.services import depreciation as depreciation_service

# Statuses that mean the asset is still in the room. Retired and inactive ones
# are history: they do not count towards "this room has twelve chairs".
IN_SERVICE = (EquipmentStatus.ACTIVE, EquipmentStatus.IN_MAINTENANCE, EquipmentStatus.RENTED)

TAG_DIGITS = 6


def tag_prefix(facility_name: str) -> str:
    """Initials of the site: "Lahore Office" -> LO, "Mercy" -> MER."""
    words = re.findall(r"[A-Za-z]+", facility_name or "")
    if len(words) >= 2:
        prefix = "".join(w[0] for w in words[:3])
    elif words:
        prefix = words[0][:3]
    else:
        prefix = "AST"
    return prefix.upper()


def next_tags(db: Session, facility: Facility, count: int) -> list[str]:
    """The next `count` tags for a site, continuing the highest already issued.

    The sequence is shared by every site with the same initials, so Hospital A
    and Hillside Annex cannot both issue HA-000001.
    """
    prefix = tag_prefix(facility.name)
    pattern = re.compile(rf"^{re.escape(prefix)}-(\d+)$")
    highest = 0
    for (tag,) in db.query(Equipment.asset_tag).filter(Equipment.asset_tag.like(f"{prefix}-%")):
        match = pattern.match(tag or "")
        if match:
            highest = max(highest, int(match.group(1)))
    return [f"{prefix}-{n:0{TAG_DIGITS}d}" for n in range(highest + 1, highest + 1 + count)]


def _discipline_for(db: Session, asset_type: str, discipline_code: str | None) -> Discipline:
    if asset_type in fixture_catalog.BY_TYPE:
        raise ValueError(
            f"'{asset_type}' is a fixture, part of the room itself. Add it as a fixture."
        )
    entry = asset_catalog.BY_TYPE.get(asset_type)
    code = discipline_code or (entry["discipline"] if entry else None)
    if not code:
        raise ValueError(
            f"'{asset_catalog.label_for(asset_type)}' is not in the catalogue, so say "
            "which trade maintains it."
        )
    discipline = db.query(Discipline).filter(Discipline.code == code).first()
    if discipline is None:
        raise ValueError(f"Unknown trade: {code}")
    return discipline


def create_in_room(
    db: Session,
    *,
    location: Location,
    asset_type: str,
    count: int,
    discipline_code: str | None = None,
) -> list[Equipment]:
    """Add `count` assets of one type to a room, each with its own tag."""
    asset_type = asset_catalog.type_key(asset_type)
    if not asset_type:
        raise ValueError("Say what the asset is.")
    if count <= 0:
        return []
    discipline = _discipline_for(db, asset_type, discipline_code)
    facility = db.get(Facility, location.facility_id)
    criticality = asset_service.inherit_criticality(db, location_id=location.id, explicit=None)
    life = depreciation_service.default_useful_life(discipline.code)

    created: list[Equipment] = []
    for tag in next_tags(db, facility, count):
        asset = Equipment(
            asset_tag=tag,
            make="", model="", serial_number="",
            facility_id=location.facility_id,
            location_id=location.id,
            discipline_id=discipline.id,
            asset_type=asset_type,
            criticality=criticality,
            useful_life_years=life,
            status=EquipmentStatus.ACTIVE,
        )
        db.add(asset)
        created.append(asset)
    db.flush()
    return created


def top_up(
    db: Session,
    *,
    location: Location,
    asset_type: str,
    count: int,
    discipline_code: str | None = None,
) -> list[Equipment]:
    """Add whatever a room is short of `count` assets of one type. Never removes."""
    asset_type = asset_catalog.type_key(asset_type)
    have = (
        db.query(Equipment.id)
        .filter(Equipment.location_id == location.id,
                Equipment.asset_type == asset_type,
                Equipment.status.in_(IN_SERVICE))
        .count()
    )
    if count <= have:
        return []
    return create_in_room(db, location=location, asset_type=asset_type,
                          count=count - have, discipline_code=discipline_code)


def take_out_of_rooms(db: Session, location_ids: list[int]) -> int:
    """Mark the room items in removed spaces inactive.

    Only room items: a CT scanner or a lift registered against a room is not
    retired because somebody corrected a room count. Its location still names
    the removed room, which is visible on the asset and fixable by moving it.
    """
    if not location_ids:
        return 0
    return (
        db.query(Equipment)
        .filter(Equipment.location_id.in_(location_ids),
                Equipment.asset_type.isnot(None),
                Equipment.status.in_((EquipmentStatus.ACTIVE, EquipmentStatus.IN_MAINTENANCE)))
        .update({Equipment.status: EquipmentStatus.INACTIVE}, synchronize_session=False)
    )
