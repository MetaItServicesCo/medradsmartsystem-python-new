"""Asset tags: issued per site, permanent, and never shared within a site.

A tag is what goes on the sticker and what somebody reads out over the phone,
so it has two jobs: identify one asset, and stay true for its whole life. It
therefore names the site and a number, never the room, and two assets at the
same site can never carry the same tag.
"""
from __future__ import annotations

import re

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.equipment import Equipment
from app.models.facility import Facility

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
    and Hillside Annex cannot both issue HA-000001. A tag somebody typed in that
    happens to fit the pattern moves the sequence past it.
    """
    prefix = tag_prefix(facility.name)
    pattern = re.compile(rf"^{re.escape(prefix)}-(\d+)$", re.IGNORECASE)
    highest = 0
    for (tag,) in db.query(Equipment.asset_tag).filter(Equipment.asset_tag.ilike(f"{prefix}-%")):
        match = pattern.match(tag or "")
        if match:
            highest = max(highest, int(match.group(1)))
    return [f"{prefix}-{n:0{TAG_DIGITS}d}" for n in range(highest + 1, highest + 1 + count)]


def tag_owner(db: Session, facility_id: int, tag: str,
              exclude_id: int | None = None) -> Equipment | None:
    """The asset at this site already carrying `tag`, ignoring case and spaces."""
    query = db.query(Equipment).filter(
        Equipment.facility_id == facility_id,
        func.lower(func.trim(Equipment.asset_tag)) == tag.strip().lower(),
    )
    if exclude_id is not None:
        query = query.filter(Equipment.id != exclude_id)
    return query.first()


def describe_owner(asset: Equipment) -> str:
    what = asset.type_label or " ".join(p for p in (asset.make, asset.model) if p) or "another asset"
    return f"{asset.asset_tag} is already the tag of {what} at this site"
