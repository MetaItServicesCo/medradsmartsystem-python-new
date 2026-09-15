"""The asset register's filters, in one place.

Shared by the Assets page's list, its bulk change and the assistant, so "all
340 matching", the 340 a bulk change touches and the 340 the assistant reports
are the same 340.
"""
from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.equipment import Equipment
from app.models.location import Location
from app.models.user import User
from app.services import location_tree
from app.utils.facility_access import require_facility_access, scope_query_to_user_facilities


def register_query(
    db: Session, current_user: User, *, facility_id: Optional[int], search: Optional[str],
    location_id: Optional[int], kind: Optional[str], asset_type: Optional[str],
    discipline_id: Optional[int],
):
    """The register's filters, shared by the list and by bulk changes.

    One definition, so "select all 340 matching" in the browser and the 340 a
    bulk change touches cannot drift apart.
    """
    query = scope_query_to_user_facilities(db.query(Equipment), Equipment.facility_id, db, current_user)
    if facility_id is not None:
        require_facility_access(db, current_user, facility_id)
        query = query.filter(Equipment.facility_id == facility_id)
    if location_id is not None:
        anchor = db.get(Location, location_id)
        if anchor is None:
            raise HTTPException(status_code=404, detail="Location not found")
        require_facility_access(db, current_user, anchor.facility_id)
        inside = db.query(Location.id).filter(location_tree.subtree_filter(anchor))
        query = query.filter(or_(Equipment.location_id == anchor.id,
                                 Equipment.location_id.in_(inside)))
    if kind == "room_items":
        query = query.filter(Equipment.asset_type.isnot(None))
    elif kind == "equipment":
        query = query.filter(Equipment.asset_type.is_(None))
    if asset_type:
        query = query.filter(Equipment.asset_type == asset_type)
    if discipline_id is not None:
        query = query.filter(Equipment.discipline_id == discipline_id)
    if search and search.strip():
        like = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Equipment.asset_tag.ilike(like),
                Equipment.make.ilike(like),
                Equipment.model.ilike(like),
                Equipment.serial_number.ilike(like),
                Equipment.description.ilike(like),
                Equipment.location.ilike(like),
                Equipment.department.ilike(like),
                Equipment.asset_type.ilike(like.replace(" ", "_")),
                Equipment.name.ilike(like),
                Equipment.equipment_type.ilike(like),
                Equipment.building.ilike(like),
            )
        )
    return query
