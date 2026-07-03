from __future__ import annotations

from collections import Counter
from typing import Any

from sqlalchemy import Engine, text


ROLE_MAP = {
    "Admin": "admin",
    "Employee": "employee",
    "Technician": "technician",
    "User Facility Admin": "facility_admin",
    "User Facility Manger": "facility_manager",
}


def _rows(engine: Engine, sql: str) -> list[dict[str, Any]]:
    with engine.connect() as connection:
        result = connection.execute(text(sql))
        return [dict(row._mapping) for row in result]


def _mapped_role(user: dict[str, Any]) -> str:
    if user["id"] == 10:
        return "superadmin"

    legacy_role = user.get("legacy_role")
    if legacy_role == "Superadmin":
        return "admin"
    if legacy_role in ROLE_MAP:
        return ROLE_MAP[legacy_role]

    legacy_type = (user.get("type") or "").strip().lower()
    return {
        "admin": "admin",
        "employee": "employee",
        "tech": "technician",
        "client": "client",
    }.get(legacy_type, "client")


def build_foundation_plan(legacy: Engine, target: Engine) -> dict[str, Any]:
    users = _rows(
        legacy,
        """
        SELECT
            u.id,
            u.type,
            u.status,
            u.allowed_login,
            u.deleted_at,
            r.name AS legacy_role
        FROM users u
        LEFT JOIN model_has_roles m
          ON m.model_id = u.id AND m.model_type = 'App\\\\User'
        LEFT JOIN roles r ON r.id = m.role_id
        ORDER BY u.id
        """,
    )
    role_counts = Counter(_mapped_role(user) for user in users)
    active_accounts = sum(
        1
        for user in users
        if user["status"] == 1
        and user["allowed_login"] == 1
        and user["deleted_at"] is None
    )

    facility_quality = _rows(
        legacy,
        """
        SELECT
            COUNT(*) AS records,
            SUM(phone IS NULL OR TRIM(phone) = '') AS missing_phone,
            SUM(email IS NULL OR TRIM(email) = '') AS missing_email,
            SUM(address IS NULL OR TRIM(address) = '') AS missing_address,
            SUM(city IS NULL OR TRIM(city) = '') AS missing_city,
            SUM(state IS NULL OR TRIM(state) = '') AS missing_state,
            SUM(postal IS NULL OR TRIM(postal) = '') AS missing_postal
        FROM facilities
        """,
    )[0]
    asset_quality = _rows(
        legacy,
        """
        SELECT
            COUNT(*) AS records,
            SUM(tag IS NULL OR TRIM(tag) = '') AS generated_asset_tags,
            SUM(make IS NULL OR TRIM(make) = '') AS defaulted_make,
            SUM(model IS NULL OR TRIM(model) = '') AS defaulted_model,
            SUM(serial IS NULL OR TRIM(serial) = '') AS generated_serials,
            SUM(modality_id IS NULL AND sub_modality_id IS NULL) AS unclassified_modality,
            SUM(facility_tier_id IS NULL) AS missing_tier
        FROM inventories
        """,
    )[0]
    contact_quality = _rows(
        legacy,
        """
        SELECT
            COUNT(*) AS records,
            SUM(
                email IS NOT NULL
                AND TRIM(email) <> ''
                AND EXISTS (
                    SELECT 1 FROM users u
                    WHERE LOWER(TRIM(u.email)) = LOWER(TRIM(facility_users.email))
                )
            ) AS matched_existing_users,
            SUM(email IS NULL OR TRIM(email) = '') AS missing_email
        FROM facility_users
        """,
    )[0]
    password_schemes = _rows(
        legacy,
        """
        SELECT
            CASE
                WHEN password LIKE '$2%' THEN 'bcrypt'
                ELSE 'unsupported'
            END AS scheme,
            COUNT(*) AS records
        FROM users
        GROUP BY scheme
        ORDER BY scheme
        """,
    )

    with target.connect() as connection:
        target_counts = {
            table: int(
                connection.execute(text(f'SELECT COUNT(*) FROM "{table}"')).scalar_one()
            )
            for table in (
                "facilities",
                "tiers",
                "modalities",
                "users",
                "equipment",
                "inventory_parts",
            )
        }

    return {
        "mode": "preview_only",
        "writes_performed": False,
        "entities": {
            "facilities": facility_quality["records"],
            "facility_tiers": _rows(
                legacy, "SELECT COUNT(*) AS records FROM facility_tiers"
            )[0]["records"],
            "modalities": _rows(
                legacy,
                "SELECT (SELECT COUNT(*) FROM modalities) + "
                "(SELECT COUNT(*) FROM sub_modalities) AS records",
            )[0]["records"],
            "users": len(users),
            "facility_contacts": contact_quality["records"],
            "facility_assets": asset_quality["records"],
            "parts": _rows(legacy, "SELECT COUNT(*) AS records FROM parts")[0][
                "records"
            ],
        },
        "user_plan": {
            "mapped_roles": dict(sorted(role_counts.items())),
            "active_accounts": active_accounts,
            "password_schemes": password_schemes,
            "duplicate_or_missing_emails": "use deterministic migration aliases",
        },
        "facility_defaults": facility_quality,
        "facility_contact_plan": {
            **contact_quality,
            "unmatched_contacts": int(contact_quality["records"])
            - int(contact_quality["matched_existing_users"] or 0),
            "strategy": "create inactive client contact and assign to facility",
        },
        "asset_defaults": asset_quality,
        "tier_strategy": "preserve every legacy facility tier and its exact pricing",
        "part_strategy": "one registry record classified as sales or rental",
        "target_counts_before_migration": target_counts,
    }
