from __future__ import annotations

import secrets
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import Engine, MetaData, Table, insert, inspect, select, text, update
from sqlalchemy.engine import Connection

from app.core.security import get_password_hash

from .foundation import _mapped_role


SOURCE_SYSTEM = "admin_medrad"


def _clean(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    cleaned = str(value).strip()
    return cleaned or fallback


def _safe_date(value: Any) -> date | None:
    if value in (None, "", "0000-00-00", "0000-00-00 00:00:00"):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _safe_datetime(value: Any) -> datetime | None:
    if value in (None, "", "0000-00-00", "0000-00-00 00:00:00"):
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value))
    except ValueError:
        return None


def _decimal(value: Any, default: str = "0") -> Decimal:
    try:
        return Decimal(str(value if value is not None else default))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal(default)


def _category(name: str) -> str:
    lowered = name.lower()
    if any(
        word in lowered
        for word in (
            "x-ray",
            "xray",
            "ultrasound",
            "mri",
            "ct ",
            "imaging",
            "radiology",
        )
    ):
        return "IMAGING"
    if any(word in lowered for word in ("monitor", "ecg", "ekg", "vital", "telemetry")):
        return "PATIENT_MONITORING"
    if any(word in lowered for word in ("lab", "analyzer", "centrifuge", "microscope")):
        return "LABORATORY"
    return "TREATMENT"


def _available_values(table: Table, values: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in values.items() if key in table.c}


class FoundationWriter:
    def __init__(self, legacy: Engine, target: Engine) -> None:
        self.legacy = legacy
        self.target = target
        self.maps: dict[str, dict[int, int]] = defaultdict(dict)
        self.counts: CounterLike = defaultdict(int)
        self.alias_email_count = 0
        self.alias_username_count = 0

    def run(self) -> dict[str, Any]:
        with self.legacy.connect() as source, self.target.begin() as target:
            self._prepare_audit_tables(target)
            metadata = MetaData()
            available_tables = set(inspect(target).get_table_names())
            table_names = (
                "facilities",
                "tiers",
                "facility_tiers",
                "modalities",
                "users",
                "equipment",
                "inventory_parts",
            )
            tables = {
                name: Table(name, metadata, autoload_with=target)
                for name in table_names
            }
            for optional_name in ("user_facilities", "equipment_facilities"):
                if optional_name in available_tables:
                    tables[optional_name] = Table(
                        optional_name, metadata, autoload_with=target
                    )
            self._load_existing_maps(target)
            self._migrate_facilities(source, target, tables)
            self._migrate_tiers(source, target, tables)
            self._migrate_modalities(source, target, tables)
            self._migrate_users(source, target, tables)
            self._migrate_facility_contacts(source, target, tables)
            self._migrate_equipment(source, target, tables)
            self._migrate_parts(source, target, tables)

        return {
            "status": "completed",
            "transactional": True,
            "counts": dict(sorted(self.counts.items())),
            "email_aliases_created": self.alias_email_count,
            "username_aliases_created": self.alias_username_count,
            "hr_records_migrated": 0,
        }

    def _prepare_audit_tables(self, target: Connection) -> None:
        target.execute(text("CREATE SCHEMA IF NOT EXISTS legacy_migration"))
        target.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS legacy_migration.id_map (
                    source_system VARCHAR NOT NULL,
                    entity VARCHAR NOT NULL,
                    legacy_id BIGINT NOT NULL,
                    target_id BIGINT NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (source_system, entity, legacy_id)
                )
                """
            )
        )

    def _load_existing_maps(self, target: Connection) -> None:
        rows = target.execute(
            text(
                "SELECT entity, legacy_id, target_id FROM legacy_migration.id_map "
                "WHERE source_system = :source_system"
            ),
            {"source_system": SOURCE_SYSTEM},
        )
        for row in rows:
            self.maps[row.entity][int(row.legacy_id)] = int(row.target_id)

    def _record_map(
        self,
        target: Connection,
        entity: str,
        legacy_id: int,
        target_id: int,
    ) -> None:
        self.maps[entity][legacy_id] = target_id
        target.execute(
            text(
                """
                INSERT INTO legacy_migration.id_map
                    (source_system, entity, legacy_id, target_id)
                VALUES (:source_system, :entity, :legacy_id, :target_id)
                ON CONFLICT (source_system, entity, legacy_id)
                DO UPDATE SET target_id = EXCLUDED.target_id
                """
            ),
            {
                "source_system": SOURCE_SYSTEM,
                "entity": entity,
                "legacy_id": legacy_id,
                "target_id": target_id,
            },
        )

    def _insert(
        self,
        target: Connection,
        table: Table,
        values: dict[str, Any],
    ) -> int:
        return int(
            target.execute(
                insert(table)
                .values(**_available_values(table, values))
                .returning(table.c.id)
            ).scalar_one()
        )

    def _source_rows(self, source: Connection, sql: str) -> list[dict[str, Any]]:
        return [dict(row._mapping) for row in source.execute(text(sql))]

    def _by_inventory(
        self, source: Connection, table_name: str
    ) -> dict[int, dict[str, Any]]:
        """First row of a per-asset satellite table, keyed by legacy inventory id."""
        result: dict[int, dict[str, Any]] = {}
        for row in self._source_rows(
            source, f"SELECT * FROM {table_name} ORDER BY id"
        ):
            inventory_id = row.get("inventory_id")
            if inventory_id is None:
                continue
            result.setdefault(int(inventory_id), row)
        return result

    def _asset_detail_values(
        self,
        legacy_id: int,
        authorized: dict[int, dict[str, Any]],
        acquired: dict[int, dict[str, Any]],
        warranty: dict[int, dict[str, Any]],
        maintenance: dict[int, dict[str, Any]],
    ) -> dict[str, Any]:
        """Map the legacy per-asset satellite tables onto existing equipment columns.

        Closes the biggest legacy migration gap: authorized_by, acquired_froms,
        cost_warrenties and service_mentenances are 1:1 with inventories but were
        never carried onto the target equipment record.
        """
        values: dict[str, Any] = {}

        auth = authorized.get(legacy_id)
        if auth:
            authorizer = " ".join(
                part
                for part in (_clean(auth.get("first")), _clean(auth.get("last")))
                if part
            )
            values.update(
                {
                    "acquisition_authorized_by": authorizer or None,
                    "department": _clean(auth.get("depart")) or None,
                    "po_no": _clean(auth.get("po_no")) or None,
                    "requester_first_name": _clean(auth.get("first")) or None,
                    "requester_last_name": _clean(auth.get("last")) or None,
                    "requester_phone": _clean(auth.get("phone")) or None,
                    "requester_fax": _clean(auth.get("fax")) or None,
                    "requester_mailing_address": _clean(auth.get("mailing")) or None,
                    "requester_email": _clean(auth.get("email")) or None,
                    "owning_department": _clean(auth.get("own_depart")) or None,
                    "acquisition_method": _clean(auth.get("acq_method")) or None,
                }
            )

        acq = acquired.get(legacy_id)
        if acq:
            values.update(
                {
                    "acquired_company_name": _clean(acq.get("acq_company")) or None,
                    "acquired_account_number": _clean(acq.get("acq_account")) or None,
                    "acquired_sales_person": _clean(acq.get("sale_person")) or None,
                    "acquired_phone": _clean(acq.get("acq_phone")) or None,
                    "acquired_email": _clean(acq.get("acq_email")) or None,
                    "acquired_mailing_address": _clean(acq.get("acq_mailing")) or None,
                }
            )

        war = warranty.get(legacy_id)
        if war:
            cost = _decimal(war.get("cost"))
            values.update(
                {
                    "cost": cost if cost > 0 else None,
                    "capital_equipment": _clean(war.get("capital_eqp")) or None,
                    "warranty_duration": _clean(war.get("warranty")) or None,
                    "parts_duration": _clean(war.get("parts")) or None,
                    "labor_duration": _clean(war.get("labour")) or None,
                    "coverage_type": _clean(war.get("cw_type")) or None,
                    "acquisition_date": _safe_date(war.get("acq_date")),
                    "part_warranty_end_date": _safe_date(war.get("pwe_date")),
                    "labor_warranty_end_date": _safe_date(war.get("lwe_date")),
                    "coverage_start_date": _safe_date(war.get("cw_date")),
                }
            )

        pm = maintenance.get(legacy_id)
        if pm:
            values.update(
                {
                    "pm_scheduling": _clean(pm.get("pm_schedule")) or None,
                    "last_pm_date": _safe_date(pm.get("ls_pm_date")),
                    "next_generated_pm_date": _safe_date(pm.get("nxt_g_date")),
                }
            )

        return values

    @staticmethod
    def _facility_billing_values(billing: dict[str, Any] | None) -> dict[str, Any]:
        """Map the legacy facility_billings row onto existing facility columns."""
        if not billing:
            return {}
        return {
            "tax_exemption": bool(int(billing.get("tax_exempt") or 0)),
            "inheritance": "Full" if int(billing.get("inherit") or 0) == 1 else "None",
            "billing_email": _clean(billing.get("person1_email")) or None,
            "delivery_email": _clean(billing.get("person2_email")) or None,
        }

    def _migrate_facilities(
        self, source: Connection, target: Connection, tables: dict[str, Table]
    ) -> None:
        table = tables["facilities"]
        billings: dict[int, dict[str, Any]] = {}
        for billing in self._source_rows(
            source, "SELECT * FROM facility_billings ORDER BY id"
        ):
            facility_key = billing.get("facility_id")
            if facility_key is not None:
                billings.setdefault(int(facility_key), billing)
        for row in self._source_rows(source, "SELECT * FROM facilities ORDER BY id"):
            legacy_id = int(row["id"])
            if legacy_id in self.maps["facility"]:
                continue
            contact = (
                " ".join(
                    part
                    for part in (_clean(row.get("first")), _clean(row.get("last")))
                    if part
                )
                or None
            )
            values = {
                "name": _clean(
                    row.get("facility_name"), f"Legacy Facility {legacy_id}"
                ),
                "contact_person": contact,
                "phone": _clean(row.get("phone"), "Not provided"),
                "email": _clean(
                    row.get("email"),
                    f"legacy-facility-{legacy_id}@migration.invalid",
                ).lower(),
                "address": _clean(row.get("address"), "Not provided"),
                "city": _clean(row.get("city"), "Not provided"),
                "state": _clean(row.get("state"), "Not provided"),
                "zip_code": _clean(row.get("postal"), "Not provided"),
                "country": "United States",
                "timezone": "UTC",
                "status": "active" if row.get("status") == 1 else "inactive",
                "created_at": _safe_datetime(row.get("created_at")),
                "updated_at": _safe_datetime(row.get("updated_at")),
            }
            values.update(self._facility_billing_values(billings.get(legacy_id)))
            target_id = self._insert(target, table, values)
            self._record_map(target, "facility", legacy_id, target_id)
            self.counts["facilities"] += 1

        if "parent_facility_id" in table.c:
            relations = self._source_rows(
                source, "SELECT child_id, parent_id FROM facility_relations ORDER BY id"
            )
            for relation in relations:
                child_id = (
                    self.maps["facility"].get(int(relation["child_id"]))
                    if relation.get("child_id")
                    else None
                )
                parent_id = (
                    self.maps["facility"].get(int(relation["parent_id"]))
                    if relation.get("parent_id")
                    else None
                )
                if child_id and parent_id and child_id != parent_id:
                    target.execute(
                        update(table)
                        .where(table.c.id == child_id)
                        .values(parent_facility_id=parent_id)
                    )

    def _migrate_tiers(
        self, source: Connection, target: Connection, tables: dict[str, Table]
    ) -> None:
        tier_table = tables["tiers"]
        assignment_table = tables["facility_tiers"]
        rows = self._source_rows(source, "SELECT * FROM facility_tiers ORDER BY id")
        default_tiers: dict[int, int] = {}
        for row in rows:
            legacy_id = int(row["id"])
            facility_id = self.maps["facility"].get(int(row["facility_id"]))
            if not facility_id:
                continue
            target_id = self.maps["tier"].get(legacy_id)
            if not target_id:
                label = _clean(row.get("tier_unique"), "Tier")
                target_id = self._insert(
                    target,
                    tier_table,
                    {
                        "tier_code": f"LEGACY-TIER-{legacy_id}",
                        "name": f"{label} [Legacy {legacy_id}]",
                        "description": f"Imported legacy facility tier {legacy_id}",
                        "response_time_hours": None,
                        "labor_rate_per_hour": _decimal(row.get("labour_fee")),
                        "service_call_fee": _decimal(row.get("service_fee")),
                        "preventive_maintenance_fee": _decimal(row.get("pm_cost")),
                        "mileage_rate": _decimal(row.get("mileage_cost")),
                        "status": "active" if row.get("status") == 1 else "inactive",
                        "created_at": _safe_datetime(row.get("created_at")),
                        "updated_at": _safe_datetime(row.get("updated_at")),
                    },
                )
                self._record_map(target, "tier", legacy_id, target_id)
                self.counts["tiers"] += 1
            if legacy_id not in self.maps["facility_tier_assignment"]:
                existing_assignment = target.execute(
                    select(assignment_table.c.id).where(
                        assignment_table.c.facility_id == facility_id,
                        assignment_table.c.tier_id == target_id,
                    )
                ).scalar_one_or_none()
                assignment_id = existing_assignment or self._insert(
                    target,
                    assignment_table,
                    {
                        "facility_id": facility_id,
                        "tier_id": target_id,
                        "usage_context": "service",
                        "assigned_at": _safe_datetime(row.get("created_at"))
                        or datetime.utcnow(),
                    },
                )
                self._record_map(
                    target,
                    "facility_tier_assignment",
                    legacy_id,
                    int(assignment_id),
                )
                self.counts["facility_tier_assignments"] += 1
            if row.get("status") == 1 and facility_id not in default_tiers:
                default_tiers[facility_id] = target_id

        facility_table = tables["facilities"]
        for facility_id, tier_id in default_tiers.items():
            target.execute(
                update(facility_table)
                .where(facility_table.c.id == facility_id)
                .values(tier_id=tier_id)
            )

    def _unique_name(self, base: str, legacy_id: int, used: set[str]) -> str:
        candidate = base
        if candidate.lower() in used:
            candidate = f"{base} [Legacy {legacy_id}]"
        used.add(candidate.lower())
        return candidate

    def _migrate_modalities(
        self, source: Connection, target: Connection, tables: dict[str, Table]
    ) -> None:
        table = tables["modalities"]
        used = {
            str(value).lower()
            for value in target.execute(select(table.c.name)).scalars()
        }
        for row in self._source_rows(source, "SELECT * FROM modalities ORDER BY id"):
            legacy_id = int(row["id"])
            if legacy_id in self.maps["modality"]:
                continue
            name = self._unique_name(
                _clean(row.get("title"), f"Legacy Modality {legacy_id}"),
                legacy_id,
                used,
            )
            target_id = self._insert(
                target,
                table,
                {
                    "name": name,
                    "category": _category(name),
                    "description": f"Legacy code: {_clean(row.get('unique_modality'))}",
                    "inspection_frequency_days": None,
                    "parent_id": None,
                },
            )
            self._record_map(target, "modality", legacy_id, target_id)
            self.counts["modalities"] += 1

        for row in self._source_rows(
            source, "SELECT * FROM sub_modalities ORDER BY id"
        ):
            legacy_id = int(row["id"])
            if legacy_id in self.maps["sub_modality"]:
                continue
            parent_id = self.maps["modality"].get(int(row["modality_id"]))
            name = self._unique_name(
                _clean(row.get("title"), f"Legacy Sub-modality {legacy_id}"),
                legacy_id,
                used,
            )
            target_id = self._insert(
                target,
                table,
                {
                    "name": name,
                    "category": _category(name),
                    "description": f"Legacy code: {_clean(row.get('unqiue_sub_modality'))}",
                    "inspection_frequency_days": None,
                    "parent_id": parent_id,
                },
            )
            self._record_map(target, "sub_modality", legacy_id, target_id)
            self.counts["sub_modalities"] += 1

        if 0 not in self.maps["fallback_modality"]:
            fallback_id = self._insert(
                target,
                table,
                {
                    "name": self._unique_name("Legacy Unclassified", 0, used),
                    "category": "TREATMENT",
                    "description": "Fallback for legacy assets without modality data",
                    "parent_id": None,
                },
            )
            self._record_map(target, "fallback_modality", 0, fallback_id)

    def _user_role_rows(self, source: Connection) -> list[dict[str, Any]]:
        return self._source_rows(
            source,
            """
            SELECT u.*, r.name AS legacy_role
            FROM users u
            LEFT JOIN model_has_roles m
              ON m.model_id = u.id AND m.model_type = 'App\\\\User'
            LEFT JOIN roles r ON r.id = m.role_id
            ORDER BY u.id
            """,
        )

    def _unique_identity(
        self,
        value: str,
        legacy_id: int,
        used: set[str],
        kind: str,
    ) -> str:
        candidate = value.strip()
        if kind == "email":
            candidate = candidate.lower()
        normalized = candidate.lower()
        if not candidate or normalized in used:
            if kind == "email":
                candidate = f"legacy-user-{legacy_id}@migration.invalid"
                self.alias_email_count += 1
            else:
                candidate = f"legacy-user-{legacy_id}"
                self.alias_username_count += 1
        suffix = 1
        base = candidate
        while candidate.lower() in used:
            candidate = f"{base}-{suffix}"
            suffix += 1
        used.add(candidate.lower())
        return candidate

    def _migrate_users(
        self, source: Connection, target: Connection, tables: dict[str, Table]
    ) -> None:
        table = tables["users"]
        used_usernames = {
            str(value).lower()
            for value in target.execute(select(table.c.username)).scalars()
        }
        used_emails = {
            str(value).lower()
            for value in target.execute(select(table.c.email)).scalars()
        }
        for row in self._user_role_rows(source):
            legacy_id = int(row["id"])
            if legacy_id in self.maps["user"]:
                continue
            role = _mapped_role(row)
            username = self._unique_identity(
                _clean(row.get("username")), legacy_id, used_usernames, "username"
            )
            email = self._unique_identity(
                _clean(row.get("email")), legacy_id, used_emails, "email"
            )
            full_name = " ".join(
                part
                for part in (
                    _clean(row.get("first")),
                    _clean(row.get("middle")),
                    _clean(row.get("last")),
                )
                if part
            ) or _clean(row.get("name"), username)
            active = (
                row.get("status") == 1
                and row.get("allowed_login") == 1
                and row.get("deleted_at") is None
            )
            target_id = self._insert(
                target,
                table,
                {
                    "username": username,
                    "email": email,
                    "full_name": full_name,
                    "hashed_password": row["password"],
                    "phone": _clean(row.get("phone") or row.get("mobile_no")) or None,
                    "avatar_url": row.get("profile_image")
                    or row.get("image")
                    or row.get("avatar"),
                    "user_type": "CLIENT" if role == "client" else "EMPLOYEE",
                    "role": role.upper(),
                    "is_active": active,
                    "is_locked": not active,
                    "failed_login_attempts": 0,
                    "last_login": _safe_datetime(row.get("last_seen_at")),
                    "facility_id": self.maps["facility"].get(int(row["facility_id"]))
                    if row.get("facility_id")
                    else None,
                    "permissions": None,
                    "created_at": _safe_datetime(row.get("created_at")),
                    "updated_at": _safe_datetime(row.get("updated_at")),
                },
            )
            self._record_map(target, "user", legacy_id, target_id)
            self.counts["users"] += 1

    def _migrate_facility_contacts(
        self, source: Connection, target: Connection, tables: dict[str, Table]
    ) -> None:
        user_table = tables["users"]
        assignment_table = tables.get("user_facilities")
        source_users = self._source_rows(
            source, "SELECT id, email FROM users ORDER BY id"
        )
        source_email_map: dict[str, int] = {}
        for row in source_users:
            email = _clean(row.get("email")).lower()
            if email and email not in source_email_map:
                source_email_map[email] = int(row["id"])

        used_usernames = {
            str(value).lower()
            for value in target.execute(select(user_table.c.username)).scalars()
        }
        used_emails = {
            str(value).lower()
            for value in target.execute(select(user_table.c.email)).scalars()
        }
        disabled_hash = get_password_hash(secrets.token_urlsafe(48))
        assigned: set[tuple[int, int]] = set()

        for row in self._source_rows(
            source, "SELECT * FROM facility_users ORDER BY id"
        ):
            legacy_id = int(row["id"])
            facility_id = self.maps["facility"].get(int(row["facility_id"]))
            if not facility_id:
                continue
            email = _clean(row.get("email")).lower()
            source_user_id = source_email_map.get(email)
            target_user_id = (
                self.maps["user"].get(source_user_id) if source_user_id else None
            )
            if not target_user_id:
                target_user_id = self.maps["facility_contact"].get(legacy_id)
            if not target_user_id:
                username = self._unique_identity(
                    f"legacy-contact-{legacy_id}", legacy_id, used_usernames, "username"
                )
                target_email = self._unique_identity(
                    email, 10_000_000 + legacy_id, used_emails, "email"
                )
                full_name = (
                    " ".join(
                        part
                        for part in (_clean(row.get("first")), _clean(row.get("last")))
                        if part
                    )
                    or username
                )
                target_user_id = self._insert(
                    target,
                    user_table,
                    {
                        "username": username,
                        "email": target_email,
                        "full_name": full_name,
                        "hashed_password": disabled_hash,
                        "phone": _clean(row.get("phone")) or None,
                        "user_type": "CLIENT",
                        "role": "CLIENT",
                        "is_active": False,
                        "is_locked": True,
                        "failed_login_attempts": 0,
                        "facility_id": facility_id,
                        "created_at": _safe_datetime(row.get("created_at")),
                        "updated_at": _safe_datetime(row.get("updated_at")),
                    },
                )
                self._record_map(target, "facility_contact", legacy_id, target_user_id)
                self.counts["facility_contact_users"] += 1

            key = (target_user_id, facility_id)
            if key in assigned:
                continue
            role_value = target.execute(
                select(user_table.c.role).where(user_table.c.id == target_user_id)
            ).scalar_one()
            role_at_facility = str(role_value).lower()
            if assignment_table is not None:
                target.execute(
                    insert(assignment_table).values(
                        user_id=target_user_id,
                        facility_id=facility_id,
                        role_at_facility=role_at_facility,
                        assigned_at=_safe_datetime(row.get("created_at"))
                        or datetime.utcnow(),
                    )
                )
            assigned.add(key)
            self.counts["user_facility_assignments"] += 1

    def _migrate_equipment(
        self, source: Connection, target: Connection, tables: dict[str, Table]
    ) -> None:
        table = tables["equipment"]
        assignment_table = tables.get("equipment_facilities")
        fallback_modality = self.maps["fallback_modality"][0]
        authorized = self._by_inventory(source, "authorized_by")
        acquired = self._by_inventory(source, "acquired_froms")
        warranty = self._by_inventory(source, "cost_warrenties")
        maintenance = self._by_inventory(source, "service_mentenances")
        for row in self._source_rows(source, "SELECT * FROM inventories ORDER BY id"):
            legacy_id = int(row["id"])
            if legacy_id in self.maps["equipment"]:
                continue
            facility_id = self.maps["facility"].get(int(row["facility_id"]))
            if not facility_id:
                continue
            modality_id = None
            if row.get("sub_modality_id"):
                modality_id = self.maps["sub_modality"].get(int(row["sub_modality_id"]))
            if not modality_id and row.get("modality_id"):
                modality_id = self.maps["modality"].get(int(row["modality_id"]))
            modality_id = modality_id or fallback_modality
            values = {
                "asset_tag": _clean(row.get("tag"), f"LEGACY-ASSET-{legacy_id}"),
                "make": _clean(row.get("make"), "Unknown"),
                "model": _clean(row.get("model"), "Unknown"),
                "serial_number": _clean(
                    row.get("serial"), f"LEGACY-SERIAL-{legacy_id}"
                ),
                "modality_id": modality_id,
                "facility_id": facility_id,
                "tier_id": self.maps["tier"].get(int(row["facility_tier_id"]))
                if row.get("facility_tier_id")
                else None,
                "default_picture_url": row.get("image"),
                "description": row.get("desc"),
                "risk_priority": row.get("risk_p"),
                "risk_name": row.get("risk_name"),
                "location": row.get("location"),
                "inventory_date": _safe_date(row.get("date")),
                "status": "ACTIVE" if row.get("status") == 1 else "INACTIVE",
                "created_at": _safe_datetime(row.get("created_at"))
                or datetime.utcnow(),
                "updated_at": _safe_datetime(row.get("updated_at"))
                or datetime.utcnow(),
            }
            values.update(
                self._asset_detail_values(
                    legacy_id, authorized, acquired, warranty, maintenance
                )
            )
            target_id = self._insert(target, table, values)
            self._record_map(target, "equipment", legacy_id, target_id)
            if assignment_table is not None:
                target.execute(
                    insert(assignment_table).values(
                        equipment_id=target_id,
                        facility_id=facility_id,
                        status="active" if row.get("status") == 1 else "retired",
                        assigned_at=_safe_datetime(row.get("created_at"))
                        or datetime.utcnow(),
                    )
                )
            self.counts["equipment"] += 1

    def _migrate_parts(
        self, source: Connection, target: Connection, tables: dict[str, Table]
    ) -> None:
        table = tables["inventory_parts"]
        for row in self._source_rows(source, "SELECT * FROM parts ORDER BY id"):
            legacy_id = int(row["id"])
            if legacy_id in self.maps["part"]:
                continue
            is_rental = (
                _decimal(row.get("rent_amount")) > 0
                or _decimal(row.get("rent_per_day")) > 0
                or bool(_clean(row.get("rent_duration")))
            )
            unit_price = (
                _decimal(row.get("rent_per_day"))
                if _decimal(row.get("rent_per_day")) > 0
                else _decimal(row.get("rent_amount"))
                if is_rental and _decimal(row.get("rent_amount")) > 0
                else _decimal(row.get("amount"))
            )
            target_id = self._insert(
                target,
                table,
                {
                    "part_number": _clean(
                        row.get("part_number"), f"LEGACY-PART-{legacy_id}"
                    ),
                    "part_type": "rental" if is_rental else "sales",
                    "description": _clean(row.get("part_desc"), "Legacy part"),
                    "make": row.get("make"),
                    "model": row.get("model"),
                    "default_picture_url": row.get("image"),
                    "unit_price": unit_price,
                    "condition": _clean(row.get("part_condition"), "new").lower(),
                    "supplier_name": row.get("company"),
                    "supplier_contact": row.get("contact"),
                    "supplier_email": row.get("email"),
                    "supplier_phone": row.get("phone"),
                    "supplier_address": row.get("address"),
                    "technical_specs": {
                        "legacy_part_id": legacy_id,
                        "legacy_sale_amount": str(_decimal(row.get("amount"))),
                        "legacy_rent_amount": str(_decimal(row.get("rent_amount"))),
                        "legacy_rent_per_day": str(_decimal(row.get("rent_per_day"))),
                        "legacy_rent_duration": row.get("rent_duration"),
                    },
                    "is_critical": False,
                    "quantity_on_hand": 1,
                    "reorder_level": 0,
                    "status": "active" if row.get("status") == 1 else "inactive",
                    "created_at": _safe_datetime(row.get("created_at"))
                    or datetime.utcnow(),
                    "updated_at": _safe_datetime(row.get("updated_at"))
                    or datetime.utcnow(),
                },
            )
            self._record_map(target, "part", legacy_id, target_id)
            self.counts["parts"] += 1


CounterLike = dict[str, int]
