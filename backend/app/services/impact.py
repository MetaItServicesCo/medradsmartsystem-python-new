"""What goes dark if this asset stops.

The question a hospital engineer asks before touching anything: if I open this
breaker, close this valve, or take this air handler down, what stops working
and is any of it clinical?

This is the payoff for keeping medical equipment and plant in one database.
Walking downstream from an electrical panel reaches other panels, then
receptacles, then — because clinical assets live in the same `equipment` table
— the anaesthesia machine plugged into one of them. A facilities system that
does not hold the clinical assets cannot make that last hop, and a biomedical
system that does not hold the panels cannot make the first.

Traversal is breadth-first with an explicit visited set and a depth cap.
Distribution graphs are not trees: ring mains, dual-fed panels and cross-tied
headers all produce cycles, and a naive recursive walk hangs on the first one.
"""
from __future__ import annotations

from collections import deque

from sqlalchemy.orm import Session

from app.models.asset_link import AssetServesAsset, AssetServesLocation
from app.models.equipment import Equipment
from app.models.location import HIGH_ACUITY_USES, Criticality, Location
from app.models.space_status import SpaceStatus

# Distribution rarely nests more than a handful of levels; the cap is a
# guardrail against a mis-wired graph, not a modelling limit.
_MAX_DEPTH = 12


def _redundant_edge(edge: AssetServesAsset) -> bool:
    return bool(edge.is_redundant)


def downstream_assets(
    db: Session,
    equipment_id: int,
    *,
    service_type: str | None = None,
    include_redundant: bool = False,
    max_depth: int = _MAX_DEPTH,
) -> list[dict]:
    """Every asset reachable downstream, with the hop count and the path taken.

    `include_redundant=False` is the honest default: an asset fed from two
    sources does not go down when one of them does, and reporting it as
    impacted trains people to ignore the report. Turning it on gives the
    degraded-but-alive set, which is what a planned shutdown wants to notify.
    """
    visited: set[int] = {equipment_id}
    results: list[dict] = []
    queue: deque[tuple[int, int, list[int]]] = deque([(equipment_id, 0, [])])

    while queue:
        current_id, depth, via = queue.popleft()
        if depth >= max_depth:
            continue

        query = db.query(AssetServesAsset).filter(
            AssetServesAsset.upstream_equipment_id == current_id
        )
        if service_type:
            query = query.filter(AssetServesAsset.service_type == service_type)

        for edge in query.all():
            if not include_redundant and _redundant_edge(edge):
                continue
            child_id = edge.downstream_equipment_id
            if child_id in visited:
                # A cycle, or a second path to the same asset. Either way it is
                # already accounted for at an equal or shorter distance.
                continue
            visited.add(child_id)
            path = via + [current_id]
            results.append({
                "equipment_id": child_id,
                "depth": depth + 1,
                "service_type": edge.service_type,
                "via_equipment_ids": path,
                "connection_ref": edge.connection_ref,
                "is_redundant": bool(edge.is_redundant),
            })
            queue.append((child_id, depth + 1, path))

    return results


def upstream_assets(
    db: Session,
    equipment_id: int,
    *,
    service_type: str | None = None,
    max_depth: int = _MAX_DEPTH,
) -> list[dict]:
    """Everything this asset depends on, nearest first.

    The diagnosis direction. A technician standing at a dead receptacle wants
    the chain back to the panel, and then to the transfer switch, without
    tracing conduit.
    """
    visited: set[int] = {equipment_id}
    results: list[dict] = []
    queue: deque[tuple[int, int]] = deque([(equipment_id, 0)])

    while queue:
        current_id, depth = queue.popleft()
        if depth >= max_depth:
            continue

        query = db.query(AssetServesAsset).filter(
            AssetServesAsset.downstream_equipment_id == current_id
        )
        if service_type:
            query = query.filter(AssetServesAsset.service_type == service_type)

        for edge in query.all():
            parent_id = edge.upstream_equipment_id
            if parent_id in visited:
                continue
            visited.add(parent_id)
            results.append({
                "equipment_id": parent_id,
                "depth": depth + 1,
                "service_type": edge.service_type,
                "connection_ref": edge.connection_ref,
                "is_redundant": bool(edge.is_redundant),
            })
            queue.append((parent_id, depth + 1))

    return results


def affected_locations(
    db: Session,
    equipment_ids: list[int],
    *,
    service_type: str | None = None,
    include_shared: bool = False,
) -> list[Location]:
    """Spaces served by any of these assets, expanded through the tree.

    Edges are attached at the highest wholly-served location — an air handler
    feeding a floor gets one edge to the floor, not ninety to the rooms — so the
    subtree beneath each edge is expanded here. That is what makes a room added
    to that floor next year covered without anybody remembering to wire it up.
    """
    if not equipment_ids:
        return []

    query = db.query(AssetServesLocation).filter(
        AssetServesLocation.equipment_id.in_(equipment_ids)
    )
    if service_type:
        query = query.filter(AssetServesLocation.service_type == service_type)
    if not include_shared:
        query = query.filter(AssetServesLocation.is_sole_source.is_(True))

    anchors = (
        db.query(Location)
        .filter(Location.id.in_([edge.location_id for edge in query.all()] or [-1]))
        .all()
    )
    if not anchors:
        return []

    # One query with an OR of prefix matches rather than one query per anchor.
    # A shutdown touching thirty zone valves should not be thirty round trips.
    clauses = [Location.path.like(f"{anchor.path}%") for anchor in anchors]
    criterion = clauses[0]
    for clause in clauses[1:]:
        criterion = criterion | clause

    return (
        db.query(Location)
        .filter(
            Location.facility_id.in_({a.facility_id for a in anchors}),
            criterion,
            Location.is_active.is_(True),
        )
        .order_by(Location.path.asc())
        .all()
    )


def assess(
    db: Session,
    equipment_id: int,
    *,
    service_type: str | None = None,
    include_redundant: bool = False,
) -> dict:
    """Full impact assessment for taking one asset out of service.

    The clinical summary at the end is the point: not "forty-one assets and
    twenty-two rooms", which nobody can act on, but "two operating theatres and
    an ICU", which changes whether the work happens tonight or at the weekend.
    """
    root = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if root is None:
        return {"equipment_id": equipment_id, "found": False}

    downstream = downstream_assets(
        db, equipment_id, service_type=service_type, include_redundant=include_redundant,
    )
    downstream_ids = [row["equipment_id"] for row in downstream]
    all_ids = [equipment_id] + downstream_ids

    assets = (
        db.query(Equipment).filter(Equipment.id.in_(all_ids)).all() if all_ids else []
    )
    asset_by_id = {a.id: a for a in assets}

    locations = affected_locations(db, all_ids, service_type=service_type)
    location_ids = [loc.id for loc in locations]

    # Which of the affected spaces are already down, so that a shutdown plan
    # does not count a theatre that has been out for a fortnight as a new loss.
    already_down = set()
    if location_ids:
        already_down = {
            row.location_id
            for row in db.query(SpaceStatus)
            .filter(
                SpaceStatus.location_id.in_(location_ids),
                SpaceStatus.availability == "out_of_service",
            )
            .all()
        }

    high_acuity = [loc for loc in locations if loc.space_use in HIGH_ACUITY_USES]
    critical_spaces = [loc for loc in locations if loc.criticality == Criticality.CRITICAL.value]

    # Clinical assets downstream of a plant asset — the cross-domain hop, and
    # the thing no single-domain system can report.
    clinical_downstream = [
        asset_by_id[i] for i in downstream_ids
        if i in asset_by_id and asset_by_id[i].modality_id and not asset_by_id[i].discipline_id
    ]

    bed_count = sum(int(loc.bed_count or 0) for loc in locations)

    return {
        "equipment_id": equipment_id,
        "found": True,
        "service_type": service_type,
        "include_redundant": include_redundant,
        "downstream_asset_count": len(downstream_ids),
        "downstream_assets": [
            {
                "id": row["equipment_id"],
                "depth": row["depth"],
                "service_type": row["service_type"],
                "connection_ref": row["connection_ref"],
                "asset_tag": getattr(asset_by_id.get(row["equipment_id"]), "asset_tag", None),
                "make": getattr(asset_by_id.get(row["equipment_id"]), "make", None),
                "model": getattr(asset_by_id.get(row["equipment_id"]), "model", None),
            }
            for row in downstream
        ],
        "affected_location_count": len(locations),
        "affected_locations": [
            {
                "id": loc.id,
                "code": loc.code,
                "name": loc.name,
                "location_type": loc.location_type,
                "space_use": loc.space_use,
                "criticality": loc.criticality,
                "bed_count": int(loc.bed_count or 0),
                "already_out_of_service": loc.id in already_down,
            }
            for loc in locations
        ],
        "clinical_summary": {
            "high_acuity_space_count": len(high_acuity),
            "critical_space_count": len(critical_spaces),
            "beds_affected": bed_count,
            "clinical_assets_affected": len(clinical_downstream),
            # The sentence somebody actually reads before approving a shutdown.
            "headline": _headline(high_acuity, bed_count, len(clinical_downstream)),
        },
    }


def _headline(high_acuity: list[Location], beds: int, clinical_assets: int) -> str:
    if not high_acuity and not beds and not clinical_assets:
        return "No clinical spaces or equipment affected."

    parts: list[str] = []
    by_use: dict[str, int] = {}
    for loc in high_acuity:
        use = (loc.space_use or "space").replace("_", " ")
        by_use[use] = by_use.get(use, 0) + 1
    for use, count in sorted(by_use.items(), key=lambda kv: -kv[1]):
        parts.append(f"{count} {use}{'s' if count > 1 else ''}")
    if beds:
        parts.append(f"{beds} bed{'s' if beds > 1 else ''}")
    if clinical_assets:
        parts.append(f"{clinical_assets} clinical asset{'s' if clinical_assets > 1 else ''}")

    return "Affects " + ", ".join(parts) + "."
