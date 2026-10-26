"""Reconcile the foundation phase, which nothing checked.

``validate-operational`` reconciles services, inspections, quotations and
invoices, and it does the financial arithmetic properly. It does not look at
the foundation phase at all -- facilities, users, equipment, parts and
modalities are migrated and then never verified. Equipment alone is 7,258
rows and the second-largest table in the system.

Three kinds of check, in increasing order of what they actually tell you:

**Counts.** Every legacy row became a mapped row. This has one wrinkle worth
spelling out: equipment whose facility did not migrate is skipped outright,
with no quarantine row to show for it, so a raw comparison fails for a
perfectly correct import. The expected figure is computed with the same join
the migration applies, and the gap is reported separately rather than hidden.

**Distribution.** Equipment counted per facility, compared between the two
databases. Totals matching proves nothing arrived twice or went missing;
per-facility counts matching proves it arrived at the *right place*. An
import that attaches every asset to the wrong hospital passes a total and
fails this.

**Invariants.** Things that must hold in the target whatever the source said:
no mapped equipment without a facility, no mapped user without a username or
an email, no mapped equipment pointing at a facility that was never mapped.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine


SOURCE_SYSTEM = "legacy"

# Legacy table -> the entity the migration records it under. Taken from the
# writer rather than guessed: each of these is the table a _migrate_* method
# selects from, paired with the name it passes to _record_map.
FOUNDATION_PAIRS: tuple[tuple[str, str, str], ...] = (
    ("facilities", "facility", "SELECT COUNT(*) FROM facilities"),
    ("facility_tiers", "tier", "SELECT COUNT(*) FROM facility_tiers"),
    ("modalities", "modality", "SELECT COUNT(*) FROM modalities"),
    ("sub_modalities", "sub_modality", "SELECT COUNT(*) FROM sub_modalities"),
    # DISTINCT because the source join against model_has_roles returns a row
    # per role, and a user with two roles would otherwise inflate the target.
    ("users", "user", "SELECT COUNT(DISTINCT id) FROM users"),
    ("facility_users", "facility_contact", "SELECT COUNT(*) FROM facility_users"),
    ("parts", "part", "SELECT COUNT(*) FROM parts"),
    # The migration drops any inventory whose facility did not migrate, and
    # records nothing when it does, so the expectation has to carry the same
    # join or this reports a failure for an import that behaved correctly.
    ("inventories", "equipment",
     "SELECT COUNT(*) FROM inventories i JOIN facilities f ON f.id = i.facility_id"),
)


def _scalar(engine: Engine, sql: str, **params: Any) -> int:
    with engine.connect() as connection:
        return int(connection.execute(text(sql), params).scalar() or 0)


def _rows(engine: Engine, sql: str, **params: Any) -> list[tuple[Any, ...]]:
    with engine.connect() as connection:
        return [tuple(row) for row in connection.execute(text(sql), params)]


def _mapped_count(target: Engine, entity: str) -> int:
    return _scalar(
        target,
        "SELECT COUNT(*) FROM legacy_migration.id_map "
        "WHERE source_system = :s AND entity = :e",
        s=SOURCE_SYSTEM, e=entity,
    )


def _equipment_per_facility_legacy(legacy: Engine) -> dict[int, int]:
    return {
        int(facility_id): int(count)
        for facility_id, count in _rows(
            legacy,
            "SELECT i.facility_id, COUNT(*) FROM inventories i "
            "JOIN facilities f ON f.id = i.facility_id GROUP BY i.facility_id",
        )
    }


def _equipment_per_facility_target(target: Engine) -> dict[int, int]:
    """Counted per *legacy* facility id, so the two sides are comparable."""
    return {
        int(legacy_facility_id): int(count)
        for legacy_facility_id, count in _rows(
            target,
            """
            SELECT facility_map.legacy_id, COUNT(*)
            FROM equipment
            JOIN legacy_migration.id_map equipment_map
              ON equipment_map.entity = 'equipment'
             AND equipment_map.source_system = :s
             AND equipment_map.target_id = equipment.id
            JOIN legacy_migration.id_map facility_map
              ON facility_map.entity = 'facility'
             AND facility_map.source_system = :s
             AND facility_map.target_id = equipment.facility_id
            GROUP BY facility_map.legacy_id
            """,
            s=SOURCE_SYSTEM,
        )
    }


def build_foundation_validation(legacy: Engine, target: Engine) -> dict[str, Any]:
    source_counts: dict[str, int] = {}
    target_counts: dict[str, int] = {}
    checks: dict[str, bool] = {}

    for table, entity, sql in FOUNDATION_PAIRS:
        source_counts[table] = _scalar(legacy, sql)
        target_counts[entity] = _mapped_count(target, entity)
        checks["{}_count".format(entity)] = source_counts[table] == target_counts[entity]

    # Reported, never failed: inventories at a facility that never migrated
    # are a known and intended loss, and the number is what somebody needs in
    # order to decide whether it is an acceptable one.
    orphaned_inventories = _scalar(
        legacy,
        "SELECT COUNT(*) FROM inventories i "
        "LEFT JOIN facilities f ON f.id = i.facility_id WHERE f.id IS NULL",
    )

    legacy_spread = _equipment_per_facility_legacy(legacy)
    target_spread = _equipment_per_facility_target(target)
    misplaced = {
        facility_id: {"legacy": count, "target": target_spread.get(facility_id, 0)}
        for facility_id, count in legacy_spread.items()
        if target_spread.get(facility_id, 0) != count
    }
    checks["equipment_sits_at_the_right_facility"] = not misplaced

    invariants = {
        "mapped_equipment_without_a_facility": _scalar(
            target,
            "SELECT COUNT(*) FROM equipment e "
            "JOIN legacy_migration.id_map m ON m.entity='equipment' "
            " AND m.source_system=:s AND m.target_id=e.id "
            "WHERE e.facility_id IS NULL", s=SOURCE_SYSTEM,
        ),
        "mapped_users_missing_a_username_or_email": _scalar(
            target,
            "SELECT COUNT(*) FROM users u "
            "JOIN legacy_migration.id_map m ON m.entity IN ('user','facility_contact') "
            " AND m.source_system=:s AND m.target_id=u.id "
            "WHERE COALESCE(u.username,'')='' OR COALESCE(u.email,'')=''",
            s=SOURCE_SYSTEM,
        ),
        "mapped_equipment_at_an_unmapped_facility": _scalar(
            target,
            """
            SELECT COUNT(*) FROM equipment e
            JOIN legacy_migration.id_map m
              ON m.entity='equipment' AND m.source_system=:s AND m.target_id=e.id
            WHERE NOT EXISTS (
                SELECT 1 FROM legacy_migration.id_map f
                WHERE f.entity='facility' AND f.source_system=:s
                  AND f.target_id = e.facility_id)
            """, s=SOURCE_SYSTEM,
        ),
    }
    for name, count in invariants.items():
        checks["no_" + name] = count == 0

    quarantine = {
        entity: int(count)
        for entity, count in _rows(
            target,
            "SELECT entity, COUNT(*) FROM legacy_migration.quarantine "
            "WHERE source_system=:s GROUP BY entity ORDER BY entity",
            s=SOURCE_SYSTEM,
        )
    }

    return {
        "status": "passed" if all(checks.values()) else "failed",
        "checks": checks,
        "source_counts": source_counts,
        "target_mapped_counts": target_counts,
        "equipment_distribution": {
            "facilities_compared": len(legacy_spread),
            "facilities_with_a_different_count": len(misplaced),
            # Capped: a wholesale failure would otherwise produce a report
            # nobody can read, and the first twenty say the same thing.
            "examples": dict(list(misplaced.items())[:20]),
        },
        "known_losses": {"inventories_at_an_unmigrated_facility": orphaned_inventories},
        "invariant_counts": invariants,
        "quarantine": quarantine,
    }
