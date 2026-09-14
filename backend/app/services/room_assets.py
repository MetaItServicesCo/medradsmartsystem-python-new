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

from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.discipline import Discipline
from app.models.equipment import Equipment, EquipmentStatus
from app.models.facility import Facility
from app.models.location import Location
from app.services import asset as asset_service
from app.services import asset_catalog, fixture_catalog
from app.services.asset_tags import describe_owner, next_tags, tag_owner, tag_prefix  # noqa: F401
from app.services import depreciation as depreciation_service

# Statuses that mean the asset is still in the room. Retired and inactive ones
# are history: they do not count towards "this room has twelve chairs".
IN_SERVICE = (EquipmentStatus.ACTIVE, EquipmentStatus.IN_MAINTENANCE, EquipmentStatus.RENTED)


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
    asset_tag: str | None = None,
    make: str | None = None,
    model: str | None = None,
    serial_number: str | None = None,
    cost: Decimal | None = None,
    installation_date: date | None = None,
    description: str | None = None,
) -> list[Equipment]:
    """Add `count` assets of one type to a room, each with its own tag.

    An existing tag, or a serial number, can only be given for a single item:
    twelve chairs cannot share one sticker. Make, model, cost and date apply to
    every item, because twelve chairs bought together share those.
    """
    asset_type = asset_catalog.type_key(asset_type)
    if not asset_type:
        raise ValueError("Say what the asset is.")
    if count <= 0:
        return []
    tag = (asset_tag or "").strip()
    if tag and count != 1:
        raise ValueError("An existing tag belongs to one item. Add them one at a time, or let tags be issued.")
    if (serial_number or "").strip() and count != 1:
        raise ValueError("A serial number belongs to one item. Add them one at a time.")
    if tag:
        owner = tag_owner(db, location.facility_id, tag)
        if owner is not None:
            raise ValueError(describe_owner(owner))
    discipline = _discipline_for(db, asset_type, discipline_code)
    facility = db.get(Facility, location.facility_id)
    criticality = asset_service.inherit_criticality(db, location_id=location.id, explicit=None)
    life = depreciation_service.default_useful_life(discipline.code)

    created: list[Equipment] = []
    for issued in ([tag] if tag else next_tags(db, facility, count)):
        asset = Equipment(
            asset_tag=issued,
            make=(make or "").strip(), model=(model or "").strip(),
            serial_number=(serial_number or "").strip(),
            facility_id=location.facility_id,
            location_id=location.id,
            discipline_id=discipline.id,
            asset_type=asset_type,
            criticality=criticality,
            useful_life_years=life,
            cost=cost,
            installation_date=installation_date,
            description=description or None,
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
