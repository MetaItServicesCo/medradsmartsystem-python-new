from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Engine, inspect, text

from .config import MigrationConfig


CORE_TABLES = (
    "facilities",
    "users",
    "facility_users",
    "facility_tiers",
    "modalities",
    "sub_modalities",
    "inventories",
    "parts",
    "services",
    "service_quotations",
    "inspections",
    "inspection_batch_infos",
    "qoutations",
    "qoutation_items",
    "invoices",
    "partial_payments",
    "refund_payments",
    "sale_and_rentals",
    "sale_and_rental_parts",
)

EXCLUDED_HR_TABLES = (
    "attendances",
    "daily_attendance_summaries",
)


def _scalar(engine: Engine, sql: str, **params: Any) -> int:
    with engine.connect() as connection:
        value = connection.execute(text(sql), params).scalar_one()
    return int(value or 0)


def _rows(engine: Engine, sql: str) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        result = connection.execute(text(sql))
        return [dict(row._mapping) for row in result]


def _table_counts(
    engine: Engine, table_names: tuple[str, ...]
) -> dict[str, int | None]:
    available = set(inspect(engine).get_table_names())
    counts: dict[str, int | None] = {}
    for table_name in table_names:
        if table_name not in available:
            counts[table_name] = None
            continue
        counts[table_name] = _scalar(engine, f"SELECT COUNT(*) FROM `{table_name}`")
    return counts


def build_audit_report(
    config: MigrationConfig, legacy: Engine, target: Engine
) -> dict[str, Any]:
    target_tables = set(inspect(target).get_table_names())
    target_revision = None
    if "alembic_version" in target_tables:
        with target.connect() as connection:
            target_revision = connection.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar_one_or_none()

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "connections": config.safe_summary(),
        "policy": {
            "existing_superadmin": "omarahmadmetait",
            "legacy_superadmin_id": 10,
            "legacy_superadmin_username": "OmarAhmad",
            "other_legacy_superadmins": "map_to_admin",
            "hr_data": "excluded",
            "asset_destination": "facility_inventory",
            "parts_destination": "sales_or_rental_by_legacy_pricing",
        },
        "source_counts": _table_counts(legacy, CORE_TABLES),
        "excluded_hr_counts": _table_counts(legacy, EXCLUDED_HR_TABLES),
        "source_quality": {
            "orphaned_asset_facilities": _scalar(
                legacy,
                """
                SELECT COUNT(*)
                FROM inventories i
                LEFT JOIN facilities f ON f.id = i.facility_id
                WHERE f.id IS NULL
                """,
            ),
            "orphaned_sale_rental_parts": _scalar(
                legacy,
                """
                SELECT COUNT(*)
                FROM sale_and_rental_parts p
                LEFT JOIN sale_and_rentals s ON s.id = p.sale_and_rental_id
                WHERE s.id IS NULL
                """,
            ),
            "missing_user_emails": _scalar(
                legacy,
                "SELECT COUNT(*) FROM users WHERE email IS NULL OR TRIM(email) = ''",
            ),
            "duplicate_email_groups": _scalar(
                legacy,
                """
                SELECT COUNT(*) FROM (
                    SELECT LOWER(TRIM(email))
                    FROM users
                    WHERE email IS NOT NULL AND TRIM(email) <> ''
                    GROUP BY LOWER(TRIM(email))
                    HAVING COUNT(*) > 1
                ) duplicates
                """,
            ),
            "duplicate_usernames": _scalar(
                legacy,
                """
                SELECT COUNT(*) FROM (
                    SELECT LOWER(TRIM(username))
                    FROM users
                    GROUP BY LOWER(TRIM(username))
                    HAVING COUNT(*) > 1
                ) duplicates
                """,
            ),
        },
        "part_classification": _rows(
            legacy,
            """
            SELECT
                CASE
                    WHEN COALESCE(rent_amount, 0) > 0
                      OR COALESCE(rent_per_day, 0) > 0
                      OR NULLIF(TRIM(rent_duration), '') IS NOT NULL
                    THEN 'Rental'
                    ELSE 'Sales'
                END AS classification,
                COUNT(*) AS records
            FROM parts
            GROUP BY classification
            ORDER BY classification
            """,
        ),
        "role_counts": _rows(
            legacy,
            """
            SELECT r.name AS legacy_role, COUNT(DISTINCT m.model_id) AS users
            FROM roles r
            LEFT JOIN model_has_roles m ON m.role_id = r.id
            GROUP BY r.id, r.name
            ORDER BY users DESC, legacy_role
            """,
        ),
        "target": {
            "alembic_revision": target_revision,
            "table_count": len(target_tables),
            "is_empty": all(
                _scalar(target, f'SELECT COUNT(*) FROM "{table_name}"') == 0
                for table_name in ("facilities", "users", "equipment")
                if table_name in target_tables
            ),
        },
    }
