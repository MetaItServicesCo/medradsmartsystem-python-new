from __future__ import annotations

import json
import re
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Engine,
    MetaData,
    Table,
    delete,
    insert,
    inspect,
    select,
    text,
    update,
)
from sqlalchemy.engine import Connection

from .writer import (
    SOURCE_SYSTEM,
    _available_values,
    _clean,
    _decimal,
    _safe_date,
    _safe_datetime,
)


def _json_value(value: Any) -> Any:
    if isinstance(value, (date, datetime, time)):
        return value.isoformat()
    if isinstance(value, timedelta):
        return str(value)
    if isinstance(value, Decimal):
        return str(value)
    return value


def _json_dict(row: dict[str, Any]) -> dict[str, Any]:
    return {key: _json_value(value) for key, value in row.items()}


def _money(value: Any) -> Decimal:
    return max(_decimal(value), Decimal("0"))


def _hours(value: Any) -> Decimal:
    if value in (None, ""):
        return Decimal("0")
    if isinstance(value, time):
        return Decimal(value.hour) + Decimal(value.minute) / Decimal(60)
    if isinstance(value, timedelta):
        return Decimal(str(value.total_seconds())) / Decimal(3600)
    match = re.search(r"-?\d+(?:\.\d+)?", str(value))
    return max(Decimal(match.group()) if match else Decimal("0"), Decimal("0"))


def _date_time(day: Any, clock: Any) -> datetime | None:
    parsed_day = _safe_date(day)
    if not parsed_day:
        return None
    if isinstance(clock, time):
        return datetime.combine(parsed_day, clock)
    if isinstance(clock, timedelta):
        return datetime.combine(parsed_day, time.min) + clock
    try:
        return datetime.combine(parsed_day, time.fromisoformat(str(clock)))
    except (TypeError, ValueError):
        return datetime.combine(parsed_day, time.min)


class OperationalWriter:
    """Migrate operational/financial data after the foundation phase."""

    REQUIRED_TABLES = (
        "facilities",
        "users",
        "equipment",
        "inventory_parts",
        "service_requests",
        "service_request_quotations",
        "quotation_line_items",
        "inspection_forms",
        "inspection_batches",
        "inspections",
        "sales_quotations",
        "sales_quotation_line_items",
        "rentals",
        "invoices",
        "invoice_transactions",
    )

    def __init__(self, legacy: Engine, target: Engine) -> None:
        self.legacy = legacy
        self.target = target
        self.maps: dict[str, dict[int, int]] = defaultdict(dict)
        self.counts: dict[str, int] = defaultdict(int)
        self.quarantined: dict[str, int] = defaultdict(int)
        self.tables: dict[str, Table] = {}
        self.default_user_id = 0
        self.default_form_id = 0
        self.part_prices: dict[int, Decimal] = {}
        self.inspection_by_work_order: dict[str, int] = {}
        self.customer_cache: dict[int, dict[str, str]] = {}

    def run(self) -> dict[str, Any]:
        with self.legacy.connect() as source, self.target.begin() as target:
            self._prepare(target)
            self._load_tables(target)
            self._load_maps(target)
            self._require_foundation()
            self._load_part_prices(source)
            self._ensure_default_form(target)
            self._migrate_services(source, target)
            self._sync_service_histories(source, target)
            self._migrate_service_quotations(source, target)
            self._migrate_inspections(source, target)
            self._attach_inspection_quotations(source, target)
            self._migrate_sales_and_rentals(source, target)
            self._migrate_invoices(source, target)
            self._sync_legacy_invoice_financials(source, target)
            self._migrate_quotation_invoices(source, target)
            self._create_commerce_invoices(source, target)
            self._reset_sequences(target)
        return {
            "status": "completed",
            "transactional": True,
            "counts": dict(sorted(self.counts.items())),
            "quarantined": dict(sorted(self.quarantined.items())),
            "hr_records_migrated": 0,
            "payment_gateway_credentials_migrated": False,
        }

    def _prepare(self, target: Connection) -> None:
        target.execute(text("CREATE SCHEMA IF NOT EXISTS legacy_migration"))
        target.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS legacy_migration.quarantine (
                    id BIGSERIAL PRIMARY KEY,
                    source_system VARCHAR NOT NULL,
                    entity VARCHAR NOT NULL,
                    legacy_id BIGINT NOT NULL,
                    reason TEXT NOT NULL,
                    payload JSONB,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE (source_system, entity, legacy_id, reason)
                )
                """
            )
        )

    def _load_tables(self, target: Connection) -> None:
        available = set(inspect(target).get_table_names())
        missing = sorted(set(self.REQUIRED_TABLES) - available)
        if missing:
            raise RuntimeError(f"Target schema is missing required tables: {missing}")
        metadata = MetaData()
        self.tables = {
            name: Table(name, metadata, autoload_with=target)
            for name in self.REQUIRED_TABLES
        }

    def _load_maps(self, target: Connection) -> None:
        rows = target.execute(
            text(
                "SELECT entity, legacy_id, target_id FROM legacy_migration.id_map "
                "WHERE source_system=:source"
            ),
            {"source": SOURCE_SYSTEM},
        )
        for row in rows:
            self.maps[row.entity][int(row.legacy_id)] = int(row.target_id)
        self.default_user_id = self.maps["user"].get(10, 0)

    def _require_foundation(self) -> None:
        for entity in ("facility", "user", "equipment", "part"):
            if not self.maps[entity]:
                raise RuntimeError(f"Foundation map is missing: {entity}")
        if not self.default_user_id:
            self.default_user_id = next(iter(self.maps["user"].values()))

    def _rows(self, source: Connection, sql: str) -> list[dict[str, Any]]:
        return [dict(row._mapping) for row in source.execute(text(sql))]

    def _insert(self, target: Connection, table: Table, values: dict[str, Any]) -> int:
        result = target.execute(
            insert(table)
            .values(**_available_values(table, values))
            .returning(table.c.id)
        )
        return int(result.scalar_one())

    def _map(
        self, target: Connection, entity: str, legacy_id: int, target_id: int
    ) -> None:
        self.maps[entity][legacy_id] = target_id
        target.execute(
            text(
                """
                INSERT INTO legacy_migration.id_map
                    (source_system, entity, legacy_id, target_id)
                VALUES (:source, :entity, :legacy_id, :target_id)
                ON CONFLICT (source_system, entity, legacy_id)
                DO UPDATE SET target_id=EXCLUDED.target_id
                """
            ),
            {
                "source": SOURCE_SYSTEM,
                "entity": entity,
                "legacy_id": legacy_id,
                "target_id": target_id,
            },
        )

    def _quarantine(
        self,
        target: Connection,
        entity: str,
        legacy_id: int,
        reason: str,
        payload: dict[str, Any],
    ) -> None:
        target.execute(
            text(
                """
                INSERT INTO legacy_migration.quarantine
                    (source_system, entity, legacy_id, reason, payload)
                VALUES (:source, :entity, :legacy_id, :reason, CAST(:payload AS JSONB))
                ON CONFLICT (source_system, entity, legacy_id, reason) DO NOTHING
                """
            ),
            {
                "source": SOURCE_SYSTEM,
                "entity": entity,
                "legacy_id": legacy_id,
                "reason": reason,
                "payload": json.dumps(_json_dict(payload), default=str),
            },
        )
        self.quarantined[entity] += 1

    def _load_part_prices(self, source: Connection) -> None:
        for row in self._rows(
            source, "SELECT id, amount, rent_amount, rent_per_day FROM parts"
        ):
            self.part_prices[int(row["id"])] = max(
                _decimal(row.get("amount")),
                _decimal(row.get("rent_amount")),
                _decimal(row.get("rent_per_day")),
            )

    def _ensure_default_form(self, target: Connection) -> None:
        table = self.tables["inspection_forms"]
        existing = target.execute(
            select(table.c.id).where(
                table.c.name == "Legacy Clinical Engineering Report"
            )
        ).scalar_one_or_none()
        if existing:
            self.default_form_id = int(existing)
            return
        now = datetime.utcnow()
        self.default_form_id = self._insert(
            target,
            table,
            {
                "name": "Legacy Clinical Engineering Report",
                "description": "Imported report template for legacy facility asset inspections.",
                "schema": {
                    "version": 1,
                    "source": SOURCE_SYSTEM,
                    "sections": [
                        "tests",
                        "observations",
                        "corrective_actions",
                        "recommendations",
                        "billing",
                    ],
                },
                "created_at": now,
                "updated_at": now,
            },
        )
        self.counts["inspection_forms"] += 1

    @staticmethod
    def _service_status(value: Any) -> str:
        return {
            "created": "NEW",
            "technician assigned": "ASSIGNED",
            "waiting on parts": "IN_PROGRESS",
            "completed": "COMPLETED",
        }.get(_clean(value).lower(), "IN_PROGRESS")

    @staticmethod
    def _inspection_status(value: Any) -> str:
        return {
            "created": "UPCOMING",
            "hold": "UPCOMING",
            "in progress": "IN_PROGRESS",
            "completed": "COMPLETED",
        }.get(_clean(value).lower(), "UPCOMING")

    def _service_history(
        self,
        service: dict[str, Any],
        reports: list[dict[str, Any]],
        activities: list[dict[str, Any]],
        sessions: list[dict[str, Any]],
    ) -> tuple[list[dict[str, Any]], Decimal]:
        history: list[dict[str, Any]] = []
        total = Decimal("0")
        for activity in activities:
            duration = _decimal(activity.get("labor_hours")) or _hours(
                activity.get("total_time")
            )
            total += duration
            clock_in = _date_time(activity.get("date"), activity.get("check_in"))
            clock_out = _date_time(activity.get("date"), activity.get("check_out"))
            history.append(
                {
                    "action": "technician_clock_out",
                    "user": _clean(
                        activity.get("technician"),
                        _clean(service.get("user_name"), "Legacy Technician"),
                    ),
                    "timestamp": _json_value(
                        clock_out
                        or activity.get("updated_at")
                        or service.get("updated_at")
                    ),
                    "changes": {
                        "session_id": f"legacy-activity-{activity['id']}",
                        "clocked_in_at": _json_value(clock_in),
                        "clocked_out_at": _json_value(clock_out),
                        "duration_hours": float(duration),
                        "diagnosis": activity.get("diagnose"),
                        "work_done": activity.get("action_taken"),
                        "notes": activity.get("comments"),
                        "location": activity.get("current_location"),
                    },
                }
            )
        if not activities:
            for report in reports:
                duration = _hours(report.get("worked_hours") or report.get("hours"))
                total += duration
                history.append(
                    {
                        "action": "technician_clock_out",
                        "user": _clean(
                            report.get("technician"),
                            _clean(service.get("user_name"), "Legacy Technician"),
                        ),
                        "timestamp": _json_value(
                            report.get("updated_at") or report.get("created_at")
                        ),
                        "changes": {
                            "session_id": f"legacy-report-{report['id']}",
                            "duration_hours": float(duration),
                            "diagnosis": report.get("fault"),
                            "work_done": report.get("action"),
                            "notes": report.get("date"),
                            "legacy_report_file": report.get("file"),
                            "po": report.get("po"),
                            "trips": report.get("trips"),
                            "trip_price": report.get("trip_price"),
                        },
                    }
                )
        else:
            for report in reports:
                history.append(
                    {
                        "action": "legacy_service_report",
                        "user": _clean(
                            report.get("technician"),
                            _clean(service.get("user_name"), "Legacy Technician"),
                        ),
                        "timestamp": _json_value(
                            report.get("updated_at") or report.get("created_at")
                        ),
                        "changes": {
                            "legacy_report_id": int(report["id"]),
                            "diagnosis": report.get("fault"),
                            "work_done": report.get("action"),
                            "worked_hours": report.get("worked_hours"),
                            "legacy_report_file": report.get("file"),
                            "po": report.get("po"),
                            "trips": report.get("trips"),
                            "trip_price": report.get("trip_price"),
                            "mileage_amount": _json_value(report.get("milage_amount")),
                            "fixed_amount": _json_value(report.get("fixed_amount")),
                        },
                    }
                )
        for session in sessions:
            history.append(
                {
                    "action": "legacy_clock_session",
                    "user": _clean(service.get("user_name"), "Legacy Technician"),
                    "timestamp": _json_value(
                        session.get("updated_at") or session.get("created_at")
                    ),
                    "changes": _json_dict(session),
                }
            )
        return history, total

    def _migrate_services(self, source: Connection, target: Connection) -> None:
        reports: dict[int, list[dict[str, Any]]] = defaultdict(list)
        activities: dict[int, list[dict[str, Any]]] = defaultdict(list)
        sessions: dict[int, list[dict[str, Any]]] = defaultdict(list)
        charges: dict[int, dict[str, Any]] = {}
        for row in self._rows(source, "SELECT * FROM service_reports ORDER BY id"):
            reports[int(row["service_id"])].append(row)
        for row in self._rows(source, "SELECT * FROM service_activities ORDER BY id"):
            activities[int(row["service_id"])].append(row)
        for row in self._rows(source, "SELECT * FROM service_times ORDER BY id"):
            sessions[int(row["service_id"])].append(row)
        for row in self._rows(source, "SELECT * FROM service_charges ORDER BY id"):
            charges[int(row["service_id"])] = row

        table = self.tables["service_requests"]
        used_request_numbers = {
            str(value)
            for value in target.execute(select(table.c.request_number)).scalars()
        }
        for row in self._rows(source, "SELECT * FROM services ORDER BY id"):
            legacy_id = int(row["id"])
            if legacy_id in self.maps["service_request"]:
                continue
            facility_id = self.maps["facility"].get(int(row["facility_id"]))
            equipment_id = self.maps["equipment"].get(int(row["inventory_id"]))
            if not facility_id or not equipment_id:
                self._quarantine(
                    target,
                    "service",
                    legacy_id,
                    "missing facility or equipment mapping",
                    row,
                )
                continue
            legacy_user = int(row["user_id"]) if row.get("user_id") else 0
            technician_id = self.maps["user"].get(legacy_user)
            status = self._service_status(row.get("status"))
            history, total_hours = self._service_history(
                row, reports[legacy_id], activities[legacy_id], sessions[legacy_id]
            )
            latest_report = reports[legacy_id][-1] if reports[legacy_id] else {}
            charge = charges.get(legacy_id, {})
            created_at = _safe_datetime(row.get("created_at")) or datetime.utcnow()
            request_number = _clean(row.get("work_order"), f"LEGACY-SR-{legacy_id}")
            if request_number in used_request_numbers:
                request_number = f"{request_number}-L{legacy_id}"
            used_request_numbers.add(request_number)
            target_id = self._insert(
                target,
                table,
                {
                    "request_number": request_number,
                    "facility_id": facility_id,
                    "equipment_id": equipment_id,
                    "requester_id": technician_id or self.default_user_id,
                    "assigned_technician_id": technician_id,
                    "problem_description": _clean(
                        row.get("fault"),
                        _clean(row.get("notes"), "Legacy service request"),
                    ),
                    "service_required": row.get("notes") or row.get("fault"),
                    "preferred_datetime": _safe_datetime(row.get("p_deadline")),
                    "requested_by_name": row.get("person") or row.get("user_name"),
                    "reference_number": row.get("po_ref"),
                    "request_image_url": row.get("image"),
                    "priority": "MEDIUM",
                    "status": status,
                    "resolution_description": latest_report.get("action")
                    or latest_report.get("fault"),
                    "time_spent_hours": total_hours,
                    "total_cost": _money(charge.get("net_charges")),
                    "assigned_at": created_at if technician_id else None,
                    "started_at": created_at
                    if status in {"IN_PROGRESS", "COMPLETED"}
                    else None,
                    "completed_at": (
                        _safe_datetime(row.get("a_deadline"))
                        or _safe_datetime(row.get("updated_at"))
                    )
                    if status == "COMPLETED"
                    else None,
                    "billing_status": "approved"
                    if row.get("billing_approval") == 1
                    else "pending",
                    "cc_auth_requested": False,
                    "invoice_deleted": row.get("is_deleted") == "1",
                    "history": history,
                    "created_at": created_at,
                    "updated_at": _safe_datetime(row.get("updated_at")) or created_at,
                },
            )
            self._map(target, "service_request", legacy_id, target_id)
            self.counts["service_requests"] += 1
            self.counts["service_reports"] += len(reports[legacy_id])
            self.counts["service_activities"] += len(activities[legacy_id])

    def _sync_service_histories(self, source: Connection, target: Connection) -> None:
        reports: dict[int, list[dict[str, Any]]] = defaultdict(list)
        activities: dict[int, list[dict[str, Any]]] = defaultdict(list)
        sessions: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for row in self._rows(source, "SELECT * FROM service_reports ORDER BY id"):
            reports[int(row["service_id"])].append(row)
        for row in self._rows(source, "SELECT * FROM service_activities ORDER BY id"):
            activities[int(row["service_id"])].append(row)
        for row in self._rows(source, "SELECT * FROM service_times ORDER BY id"):
            sessions[int(row["service_id"])].append(row)
        table = self.tables["service_requests"]
        for service in self._rows(source, "SELECT * FROM services ORDER BY id"):
            legacy_id = int(service["id"])
            target_id = self.maps["service_request"].get(legacy_id)
            if not target_id:
                continue
            history, total_hours = self._service_history(
                service,
                reports[legacy_id],
                activities[legacy_id],
                sessions[legacy_id],
            )
            target.execute(
                update(table)
                .where(table.c.id == target_id)
                .values(history=history, time_spent_hours=total_hours)
            )
        self.counts["service_histories_synchronized"] = len(
            self.maps["service_request"]
        )

    def _migrate_service_quotations(
        self, source: Connection, target: Connection
    ) -> None:
        grouped: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for row in self._rows(source, "SELECT * FROM service_quotations ORDER BY id"):
            grouped[int(row["service_id"])].append(row)
        quote_table = self.tables["service_request_quotations"]
        item_table = self.tables["quotation_line_items"]
        for service_id, rows in grouped.items():
            request_id = self.maps["service_request"].get(service_id)
            legacy_quote_id = min(int(row["id"]) for row in rows)
            if not request_id:
                for row in rows:
                    self._quarantine(
                        target,
                        "service_quotation",
                        int(row["id"]),
                        "missing service mapping",
                        row,
                    )
                continue
            if legacy_quote_id in self.maps["service_quotation"]:
                continue
            created_at = min(
                _safe_datetime(row.get("created_at")) or datetime.utcnow()
                for row in rows
            )
            quote_id = self._insert(
                target,
                quote_table,
                {
                    "service_request_id": request_id,
                    "created_by_id": self.default_user_id,
                    "quotation_number": f"LEGACY-SQ-{service_id:06d}",
                    "amount": 0,
                    "description": "Imported legacy service parts quotation",
                    "status": "approved"
                    if all(str(row.get("status")) == "1" for row in rows)
                    else "draft",
                    "revision_history": [
                        {
                            "source": SOURCE_SYSTEM,
                            "legacy_ids": [int(row["id"]) for row in rows],
                        }
                    ],
                    "created_at": created_at,
                    "updated_at": max(
                        _safe_datetime(row.get("updated_at")) or created_at
                        for row in rows
                    ),
                },
            )
            self._map(target, "service_quotation", legacy_quote_id, quote_id)
            amount = Decimal("0")
            for row in rows:
                legacy_part = int(row["part_id"]) if row.get("part_id") else 0
                quantity = max(int(row.get("quantity") or 1), 1)
                unit_price = self.part_prices.get(legacy_part, Decimal("0"))
                line_total = unit_price * quantity
                amount += line_total
                line_id = self._insert(
                    target,
                    item_table,
                    {
                        "quotation_id": quote_id,
                        "item_type": "part",
                        "description": (
                            f"Legacy part {legacy_part} "
                            f"({_clean(row.get('part_usage'), 'condition not recorded')})"
                        ),
                        "quantity": quantity,
                        "unit_price": unit_price,
                        "total": line_total,
                        "created_at": _safe_datetime(row.get("created_at"))
                        or created_at,
                    },
                )
                self._map(target, "service_quotation_item", int(row["id"]), line_id)
                self.counts["service_quotation_items"] += 1
            target.execute(
                update(quote_table)
                .where(quote_table.c.id == quote_id)
                .values(amount=amount)
            )
            self.counts["service_quotations"] += 1

    @staticmethod
    def _inspection_result(value: Any, status: str) -> str:
        normalized = _clean(value).lower()
        if normalized in {"pass", "passed"}:
            return "PASS"
        if normalized in {"fail", "failed"}:
            return "FAIL"
        return "PASS" if status == "COMPLETED" else "PENDING"

    def _migrate_inspections(self, source: Connection, target: Connection) -> None:
        reports: dict[int, dict[str, Any]] = {}
        charges: dict[int, dict[str, Any]] = {}
        batch_info: dict[str, dict[str, Any]] = {}
        for row in self._rows(source, "SELECT * FROM inspection_reports ORDER BY id"):
            reports[int(row["inspection_id"])] = row
        for row in self._rows(source, "SELECT * FROM inspection_charges ORDER BY id"):
            charges[int(row["inspection_id"])] = row
        for row in self._rows(
            source, "SELECT * FROM inspection_batch_infos ORDER BY id"
        ):
            batch_info[_clean(row.get("work_order"))] = row
        for row in self._rows(
            source,
            """
            SELECT report.* FROM inspection_reports report
            LEFT JOIN inspections inspection ON inspection.id=report.inspection_id
            WHERE inspection.id IS NULL ORDER BY report.id
            """,
        ):
            self._quarantine(
                target,
                "inspection_report",
                int(row["id"]),
                "inspection record was deleted or is missing",
                row,
            )

        grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in self._rows(
            source, "SELECT * FROM inspections ORDER BY work_order, id"
        ):
            grouped[_clean(row.get("work_order"), f"LEGACY-INSP-{row['id']}")].append(
                row
            )

        batch_table = self.tables["inspection_batches"]
        inspection_table = self.tables["inspections"]
        for work_order, rows in grouped.items():
            info = batch_info.get(work_order, {})
            legacy_batch_id = int(info.get("id") or rows[0]["id"])
            facility_id = self.maps["facility"].get(int(rows[0]["facility_id"]))
            if not facility_id:
                for row in rows:
                    self._quarantine(
                        target,
                        "inspection",
                        int(row["id"]),
                        "missing facility mapping",
                        row,
                    )
                continue
            source_inspector = info.get("user_id") or rows[0].get("user_id")
            inspector_id = (
                self.maps["user"].get(int(source_inspector))
                if source_inspector
                else None
            )
            statuses = [self._inspection_status(row.get("status")) for row in rows]
            batch_status = (
                "COMPLETED"
                if all(status == "COMPLETED" for status in statuses)
                else "IN_PROGRESS"
                if any(status == "IN_PROGRESS" for status in statuses)
                else "UPCOMING"
            )
            scheduled = min(
                _safe_datetime(row.get("a_date"))
                or _safe_datetime(row.get("created_at"))
                or datetime.utcnow()
                for row in rows
            )
            batch_id = self.maps["inspection_batch"].get(legacy_batch_id)
            if not batch_id:
                batch_id = self._insert(
                    target,
                    batch_table,
                    {
                        "batch_number": work_order,
                        "facility_id": facility_id,
                        "inspector_id": inspector_id,
                        "form_template_id": self.default_form_id,
                        "status": batch_status,
                        "scheduled_date": scheduled,
                        "started_at": _safe_datetime(info.get("start_date")),
                        "completed_at": _safe_datetime(info.get("end_date"))
                        if batch_status == "COMPLETED"
                        else None,
                        "inspection_frequency": "legacy",
                        "inspection_scope": "facility_assets",
                        "notes": "\n".join(
                            filter(
                                None,
                                [
                                    info.get("visit_info"),
                                    info.get("recommendation"),
                                    info.get("conclusion"),
                                    info.get("remarks"),
                                ],
                            )
                        ),
                        "is_instant": False,
                        "created_at": _safe_datetime(info.get("created_at"))
                        or scheduled,
                        "updated_at": _safe_datetime(info.get("updated_at"))
                        or scheduled,
                    },
                )
                self._map(target, "inspection_batch", legacy_batch_id, batch_id)
                self.counts["inspection_batches"] += 1
            for row in rows:
                legacy_id = int(row["id"])
                if legacy_id in self.maps["inspection"]:
                    if work_order not in self.inspection_by_work_order:
                        self.inspection_by_work_order[work_order] = self.maps[
                            "inspection"
                        ][legacy_id]
                    continue
                equipment_id = self.maps["equipment"].get(int(row["inventory_id"]))
                if not equipment_id:
                    self._quarantine(
                        target,
                        "inspection",
                        legacy_id,
                        "missing equipment mapping",
                        row,
                    )
                    continue
                status = self._inspection_status(row.get("status"))
                report = reports.get(legacy_id, {})
                charge = charges.get(legacy_id, {})
                created_at = _safe_datetime(row.get("created_at")) or scheduled
                inspection_id = self._insert(
                    target,
                    inspection_table,
                    {
                        "inspection_number": f"{work_order}-{legacy_id:05d}",
                        "batch_id": batch_id,
                        "equipment_id": equipment_id,
                        "facility_id": facility_id,
                        "inspector_id": self.maps["user"].get(int(row["user_id"]))
                        if row.get("user_id")
                        else inspector_id,
                        "form_template_id": self.default_form_id,
                        "status": status,
                        "result": self._inspection_result(row.get("result"), status),
                        "scheduled_date": _safe_datetime(row.get("a_date"))
                        or scheduled,
                        "started_at": created_at
                        if status in {"IN_PROGRESS", "COMPLETED"}
                        else None,
                        "completed_at": _safe_datetime(row.get("updated_at"))
                        if status == "COMPLETED"
                        else None,
                        "form_data": {
                            "source": SOURCE_SYSTEM,
                            "legacy_inspection_id": legacy_id,
                            "legacy_report": _json_dict(report) if report else None,
                            "billing": {
                                key: _json_value(charge.get(source_key))
                                for key, source_key in {
                                    "parts": "parts",
                                    "discount": "discount",
                                    "tax": "tax",
                                    "labor": "labour",
                                    "service": "service",
                                    "travel": "travel",
                                    "other": "other",
                                    "net_charges": "net_charges",
                                }.items()
                            },
                        },
                        "corrective_actions": report.get("action")
                        or report.get("f_fault"),
                        "inspection_scope": "facility_inventory",
                        "inspection_frequency": "legacy",
                        "compliance_requirement": report.get("tests"),
                        "is_instant": False,
                        "created_at": created_at,
                        "updated_at": _safe_datetime(row.get("updated_at"))
                        or created_at,
                    },
                )
                self._map(target, "inspection", legacy_id, inspection_id)
                self.inspection_by_work_order.setdefault(work_order, inspection_id)
                self.counts["inspections"] += 1
                if report:
                    self.counts["inspection_reports"] += 1

    def _attach_inspection_quotations(
        self, source: Connection, target: Connection
    ) -> None:
        items: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for row in self._rows(source, "SELECT * FROM qoutation_items ORDER BY id"):
            items[int(row["qoutation_id"])].append(row)
        table = self.tables["inspections"]
        for row in self._rows(source, "SELECT * FROM qoutations ORDER BY id"):
            legacy_id = int(row["id"])
            if legacy_id in self.maps["inspection_quotation"]:
                continue
            inspection_id = self.inspection_by_work_order.get(
                _clean(row.get("reference"))
            )
            if not inspection_id:
                self._quarantine(
                    target,
                    "inspection_quotation",
                    legacy_id,
                    "no inspection matches quotation reference",
                    row,
                )
                continue
            current = (
                target.execute(
                    select(table.c.form_data).where(table.c.id == inspection_id)
                ).scalar_one()
                or {}
            )
            current = dict(current)
            current.setdefault("legacy_quotations", []).append(
                {
                    "legacy_quotation_id": legacy_id,
                    "reference": row.get("reference"),
                    "title": row.get("title"),
                    "subject": row.get("subject"),
                    "object": row.get("object"),
                    "estimated_cost": _json_value(row.get("est_cost")),
                    "estimated_discount": _json_value(row.get("est_discount")),
                    "estimated_tax": _json_value(row.get("est_tax")),
                    "completion": _json_value(row.get("completion")),
                    "expiry": _json_value(row.get("expiry")),
                    "approved": bool(row.get("approval")),
                    "items": [_json_dict(item) for item in items[legacy_id]],
                }
            )
            target.execute(
                update(table)
                .where(table.c.id == inspection_id)
                .values(
                    form_data=current,
                    quotation_notes=row.get("subject") or row.get("title"),
                )
            )
            self._map(target, "inspection_quotation", legacy_id, inspection_id)
            self.counts["inspection_quotations"] += 1

    def _customer(self, target: Connection, facility_id: int | None) -> dict[str, str]:
        if not facility_id:
            return {
                "name": "Legacy Customer",
                "email": "legacy-customer@migration.invalid",
                "phone": "Not provided",
                "address": "Not provided",
            }
        if facility_id in self.customer_cache:
            return self.customer_cache[facility_id]
        facility = (
            target.execute(
                select(self.tables["facilities"]).where(
                    self.tables["facilities"].c.id == facility_id
                )
            )
            .mappings()
            .one()
        )
        customer = {
            "name": facility.get("billing_name") or facility["name"],
            "email": facility.get("billing_email") or facility["email"],
            "phone": facility.get("phone") or "Not provided",
            "address": ", ".join(
                filter(
                    None,
                    [
                        facility.get("address"),
                        facility.get("city"),
                        facility.get("state"),
                        facility.get("zip_code"),
                    ],
                )
            )
            or "Not provided",
        }
        self.customer_cache[facility_id] = customer
        return customer

    @staticmethod
    def _sales_status(row: dict[str, Any]) -> str:
        if row.get("deleted_at"):
            return "rejected"
        if _clean(row.get("page")).lower() == "invoice":
            return "in_progress"
        return {"0": "pending", "1": "approved", "2": "pending"}.get(
            str(row.get("quotation_status")), "pending"
        )

    def _migrate_sales_and_rentals(
        self, source: Connection, target: Connection
    ) -> None:
        children: dict[int, list[dict[str, Any]]] = defaultdict(list)
        all_children = self._rows(
            source, "SELECT * FROM sale_and_rental_parts ORDER BY id"
        )
        for row in all_children:
            children[int(row["sale_and_rental_id"])].append(row)
        parent_ids = {
            int(row["id"])
            for row in self._rows(source, "SELECT id FROM sale_and_rentals")
        }
        for row in all_children:
            if int(row["sale_and_rental_id"]) not in parent_ids:
                self._quarantine(
                    target,
                    "sale_rental_line_item",
                    int(row["id"]),
                    "orphaned sale/rental parent",
                    row,
                )

        sales_table = self.tables["sales_quotations"]
        line_table = self.tables["sales_quotation_line_items"]
        rental_table = self.tables["rentals"]
        used_work_orders = {
            str(value)
            for value in target.execute(select(sales_table.c.work_order)).scalars()
        }
        for row in self._rows(source, "SELECT * FROM sale_and_rentals ORDER BY id"):
            legacy_id = int(row["id"])
            facility_id = (
                self.maps["facility"].get(int(row["facility_id"]))
                if row.get("facility_id")
                else None
            )
            customer = self._customer(target, facility_id)
            creator_id = (
                self.maps["user"].get(int(row["created_by"]))
                if row.get("created_by")
                else self.default_user_id
            ) or self.default_user_id
            if _clean(row.get("type")).lower() == "sale":
                if legacy_id in self.maps["sales_quotation"]:
                    continue
                created_at = _safe_datetime(row.get("created_at")) or datetime.utcnow()
                work_order = _clean(
                    row.get("work_order"), f"LEGACY-SALE-{legacy_id:06d}"
                )
                if work_order in used_work_orders:
                    work_order = f"{work_order}-L{legacy_id}"
                used_work_orders.add(work_order)
                quote_id = self._insert(
                    target,
                    sales_table,
                    {
                        "quotation_number": f"LEGACY-SQ-{legacy_id:06d}",
                        "work_order": work_order,
                        "facility_id": facility_id,
                        "created_by_id": creator_id,
                        "customer_name": customer["name"],
                        "customer_email": customer["email"],
                        "customer_phone": customer["phone"],
                        "customer_address": customer["address"],
                        "quotation_type": _clean(row.get("option"), "standard"),
                        "status": self._sales_status(row),
                        "paid_status": "paid"
                        if _clean(row.get("is_paid")).lower() == "paid"
                        else "unpaid",
                        "requested_date": _safe_date(
                            row.get("quotation_response_datetime")
                        )
                        or _safe_date(created_at),
                        "notes": f"Imported legacy sales record {legacy_id}",
                        "worked_hours": _decimal(row.get("worked_hours")),
                        "setup_fee": _decimal(row.get("setup_fee")),
                        "service_fee": _decimal(row.get("service_fee")),
                        "shipping_fee": _decimal(row.get("shipping_fee")),
                        "application_fee": _decimal(row.get("application_fee")),
                        "tax_rate": _decimal(row.get("tax_charges")),
                        "tax_amount": _decimal(row.get("sales_tax")),
                        "discount_amount": _decimal(row.get("discount")),
                        "total_amount": _decimal(
                            row.get("total_amount_without_processing_fee")
                        ),
                        "history": [
                            {
                                "action": "legacy_import",
                                "timestamp": _json_value(created_at),
                                "legacy_id": legacy_id,
                            }
                        ],
                        "created_at": created_at,
                        "updated_at": _safe_datetime(row.get("updated_at"))
                        or created_at,
                    },
                )
                self._map(target, "sales_quotation", legacy_id, quote_id)
                subtotal = Decimal("0")
                for child in children[legacy_id]:
                    child_id = int(child["id"])
                    source_part = int(child["part_id"]) if child.get("part_id") else 0
                    part_id = self.maps["part"].get(source_part)
                    if not part_id:
                        self._quarantine(
                            target,
                            "sales_line_item",
                            child_id,
                            "missing part mapping",
                            child,
                        )
                        continue
                    quantity = max(int(child.get("quantity") or 1), 1)
                    unit_price = self.part_prices.get(source_part, Decimal("0"))
                    line_total = unit_price * quantity
                    subtotal += line_total
                    line_id = self._insert(
                        target,
                        line_table,
                        {
                            "quotation_id": quote_id,
                            "part_id": part_id,
                            "description": f"Imported legacy part {source_part}",
                            "quantity": quantity,
                            "unit_price": unit_price,
                            "shipping_fee": 0,
                            "setup_fee": 0,
                            "condition": child.get("part_usage"),
                            "total": line_total,
                            "created_at": _safe_datetime(child.get("created_at"))
                            or created_at,
                        },
                    )
                    self._map(target, "sales_line_item", child_id, line_id)
                    self.counts["sales_line_items"] += 1
                if _decimal(row.get("total_parts_amount")) > 0:
                    subtotal = _decimal(row.get("total_parts_amount"))
                target.execute(
                    update(sales_table)
                    .where(sales_table.c.id == quote_id)
                    .values(subtotal=subtotal)
                )
                self.counts["sales_quotations"] += 1
                continue

            if not children[legacy_id]:
                self._quarantine(
                    target, "rental", legacy_id, "rental has no part rows", row
                )
                continue
            for child in children[legacy_id]:
                child_id = int(child["id"])
                if child_id in self.maps["rental"]:
                    continue
                source_part = int(child["part_id"]) if child.get("part_id") else 0
                part_id = self.maps["part"].get(source_part)
                if not part_id:
                    self._quarantine(
                        target,
                        "rental",
                        child_id,
                        "missing part mapping",
                        child,
                    )
                    continue
                created_at = _safe_datetime(row.get("created_at")) or datetime.utcnow()
                start_date = (
                    _safe_date(row.get("start_date"))
                    or _safe_date(created_at)
                    or date.today()
                )
                end_date = _safe_date(row.get("end_date")) or start_date
                status = (
                    "CANCELLED"
                    if row.get("deleted_at")
                    else "COMPLETED"
                    if end_date < date.today()
                    else "ACTIVE"
                )
                rental_id = self._insert(
                    target,
                    rental_table,
                    {
                        "rental_number": (f"LEGACY-RNT-{legacy_id:06d}-{child_id:06d}"),
                        "part_id": part_id,
                        "created_by_id": creator_id,
                        "customer_name": customer["name"],
                        "customer_email": customer["email"],
                        "customer_phone": customer["phone"],
                        "customer_address": customer["address"],
                        "billing_frequency": "DAILY",
                        "rental_rate": self.part_prices.get(source_part, Decimal("0")),
                        "security_deposit": 0,
                        "quantity": max(int(child.get("quantity") or 1), 1),
                        "shipping_fee": _decimal(row.get("shipping_fee")),
                        "setup_fee": _decimal(row.get("setup_fee")),
                        "item_condition": child.get("part_usage"),
                        "start_date": start_date,
                        "end_date": end_date,
                        "status": status,
                        "terms_and_conditions": (f"Imported legacy rental {legacy_id}"),
                        "history": [
                            {
                                "action": "legacy_import",
                                "timestamp": _json_value(created_at),
                                "legacy_parent_id": legacy_id,
                            }
                        ],
                        "created_at": created_at,
                        "updated_at": _safe_datetime(row.get("updated_at"))
                        or created_at,
                    },
                )
                self._map(target, "rental", child_id, rental_id)
                self.counts["rentals"] += 1

    @staticmethod
    def _invoice_status(
        row: dict[str, Any], amount_paid: Decimal, total: Decimal
    ) -> str:
        legacy_status = int(row.get("status") or 0)
        if legacy_status == 0:
            return "CANCELLED"
        if legacy_status in {2, 3} or (total > 0 and amount_paid >= total):
            return "PAID"
        if amount_paid > 0:
            return "PARTIALLY_PAID"
        due = _safe_date(row.get("due_date"))
        return "OVERDUE" if due and due < date.today() else "PENDING"

    @staticmethod
    def _payment_method(value: Any) -> str | None:
        if not value:
            return None
        return {
            1: "cheque",
            2: "paypal",
            3: "credit_card",
            4: "credit_card",
        }.get(int(value))

    def _transaction(
        self,
        target: Connection,
        invoice_id: int,
        facility_id: int | None,
        transaction_type: str,
        amount: Decimal,
        description: str,
        created_at: datetime,
        payment_method: str | None = None,
        reference: str | None = None,
        created_by_id: int | None = None,
    ) -> None:
        self._insert(
            target,
            self.tables["invoice_transactions"],
            {
                "invoice_id": invoice_id,
                "facility_id": facility_id,
                "transaction_type": transaction_type,
                "amount": amount,
                "payment_method": payment_method,
                "reference_number": reference,
                "description": description,
                "created_by_id": created_by_id or self.default_user_id,
                "created_at": created_at,
            },
        )
        self.counts["invoice_transactions"] += 1

    def _migrate_invoices(self, source: Connection, target: Connection) -> None:
        partials: dict[int, list[dict[str, Any]]] = defaultdict(list)
        logs: dict[str, list[dict[str, Any]]] = defaultdict(list)
        services_by_order: dict[str, int] = {}
        for row in self._rows(source, "SELECT id, work_order FROM services"):
            target_id = self.maps["service_request"].get(int(row["id"]))
            if target_id:
                services_by_order[_clean(row.get("work_order"))] = target_id
        for row in self._rows(source, "SELECT * FROM partial_payments ORDER BY id"):
            partials[int(row["invoice_id"])].append(row)
        for row in self._rows(source, "SELECT * FROM invoice_logs ORDER BY id"):
            logs[_clean(row.get("invoice_no"))].append(row)

        table = self.tables["invoices"]
        used_invoice_numbers = {
            str(value)
            for value in target.execute(select(table.c.invoice_number)).scalars()
        }
        for row in self._rows(source, "SELECT * FROM invoices ORDER BY id"):
            legacy_id = int(row["id"])
            if legacy_id in self.maps["invoice"]:
                continue
            facility_id = (
                self.maps["facility"].get(int(row["facility_id"]))
                if row.get("facility_id")
                else None
            )
            if not facility_id:
                self._quarantine(
                    target, "invoice", legacy_id, "missing facility mapping", row
                )
                continue
            customer = self._customer(target, facility_id)
            total = _decimal(row.get("net_amount"))
            tax = _decimal(row.get("g_tax")) + _decimal(row.get("m_tax"))
            discount = _decimal(row.get("g_discount")) + _decimal(row.get("m_discount"))
            subtotal = total - tax + discount
            partial_paid = sum(
                (_money(item.get("paid_amount")) for item in partials[legacy_id]),
                Decimal("0"),
            )
            paid = (
                partial_paid if partial_paid > 0 else _decimal(row.get("paid_amount"))
            )
            if int(row.get("status") or 0) in {2, 3} and paid <= 0:
                paid = total
            if total > 0:
                paid = min(paid, total)
            work_order = _clean(row.get("invoice_order"))
            service_id = services_by_order.get(work_order)
            inspection_id = self.inspection_by_work_order.get(work_order)
            invoice_type = (
                "SERVICE" if service_id or not inspection_id else "INSPECTION"
            )
            issue_date = _safe_date(row.get("created_at")) or date.today()
            due_date = _safe_date(row.get("due_date")) or issue_date
            method = self._payment_method(row.get("payment_gateway"))
            created_at = _safe_datetime(row.get("created_at")) or datetime.utcnow()
            invoice_number = _clean(
                row.get("invoice_no"), f"LEGACY-INV-{legacy_id:06d}"
            )
            if invoice_number in used_invoice_numbers:
                invoice_number = f"{invoice_number}-L{legacy_id}"
            used_invoice_numbers.add(invoice_number)
            invoice_id = self._insert(
                target,
                table,
                {
                    "invoice_number": invoice_number,
                    "invoice_type": invoice_type,
                    "customer_name": customer["name"],
                    "customer_email": customer["email"],
                    "customer_phone": customer["phone"],
                    "customer_address": customer["address"],
                    "facility_id": facility_id,
                    "service_request_id": service_id,
                    "inspection_id": inspection_id,
                    "subtotal": subtotal,
                    "tax_amount": tax,
                    "discount_amount": discount,
                    "total_amount": total,
                    "amount_paid": paid,
                    "balance_due": max(total - paid, Decimal("0")),
                    "status": self._invoice_status(row, paid, total),
                    "issue_date": issue_date,
                    "due_date": due_date,
                    "payment_terms": "Legacy terms",
                    "payment_method": method,
                    "notes": (
                        f"Imported legacy invoice {legacy_id}; work order "
                        f"{work_order or 'not recorded'}. Fee breakdown: "
                        f"parts={_decimal(row.get('parts'))}, "
                        f"travel={_decimal(row.get('travel'))}, "
                        f"PM={_decimal(row.get('pm_cost'))}, "
                        f"shipping={_decimal(row.get('shipping'))}."
                    ),
                    "created_at": created_at,
                    "updated_at": _safe_datetime(row.get("updated_at")) or created_at,
                },
            )
            self._map(target, "invoice", legacy_id, invoice_id)
            self._transaction(
                target,
                invoice_id,
                facility_id,
                "invoice_created",
                total,
                f"Imported legacy invoice {legacy_id}",
                created_at,
            )
            if partials[legacy_id]:
                for payment in partials[legacy_id]:
                    self._transaction(
                        target,
                        invoice_id,
                        facility_id,
                        "payment",
                        _money(payment.get("paid_amount")),
                        "Imported legacy partial payment",
                        _safe_datetime(payment.get("paid_at"))
                        or _safe_datetime(payment.get("created_at"))
                        or created_at,
                        payment.get("payment_type") or method,
                        payment.get("charge_id"),
                    )
                    self.counts["invoice_payments"] += 1
            elif paid != 0:
                self._transaction(
                    target,
                    invoice_id,
                    facility_id,
                    "payment",
                    paid,
                    "Imported legacy payment balance",
                    _safe_datetime(row.get("paid_at"))
                    or _safe_datetime(row.get("updated_at"))
                    or created_at,
                    method,
                    row.get("charge_id"),
                )
                self.counts["invoice_payments"] += 1
            refund = _money(row.get("refund"))
            if refund > 0:
                self._transaction(
                    target,
                    invoice_id,
                    facility_id,
                    "refund",
                    -refund,
                    "Imported legacy refund",
                    _safe_datetime(row.get("updated_at")) or created_at,
                    method,
                )
                self.counts["invoice_refunds"] += 1
            for log in logs[_clean(row.get("invoice_no"))]:
                actor = (
                    self.maps["user"].get(int(log["causer_id"]))
                    if log.get("causer_id")
                    else self.default_user_id
                )
                self._transaction(
                    target,
                    invoice_id,
                    facility_id,
                    "status_change",
                    Decimal("0"),
                    _clean(log.get("action"), "Legacy invoice event"),
                    _safe_datetime(log.get("created_at")) or created_at,
                    created_by_id=actor,
                )
                self.counts["invoice_logs"] += 1
            self.counts["invoices"] += 1

    def _sync_legacy_invoice_financials(
        self, source: Connection, target: Connection
    ) -> None:
        partials: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for payment in self._rows(source, "SELECT * FROM partial_payments ORDER BY id"):
            partials[int(payment["invoice_id"])].append(payment)
        invoice_table = self.tables["invoices"]
        tx_table = self.tables["invoice_transactions"]
        for row in self._rows(source, "SELECT * FROM invoices ORDER BY id"):
            legacy_id = int(row["id"])
            invoice_id = self.maps["invoice"].get(legacy_id)
            if not invoice_id:
                continue
            total = _decimal(row.get("net_amount"))
            tax = _decimal(row.get("g_tax")) + _decimal(row.get("m_tax"))
            discount = _decimal(row.get("g_discount")) + _decimal(row.get("m_discount"))
            partial_paid = sum(
                (_money(item.get("paid_amount")) for item in partials[legacy_id]),
                Decimal("0"),
            )
            paid = (
                partial_paid if partial_paid > 0 else _decimal(row.get("paid_amount"))
            )
            if int(row.get("status") or 0) in {2, 3} and paid == 0:
                paid = total
            if total > 0:
                paid = min(paid, total)
            target.execute(
                update(invoice_table)
                .where(invoice_table.c.id == invoice_id)
                .values(
                    subtotal=total - tax + discount,
                    tax_amount=tax,
                    discount_amount=discount,
                    total_amount=total,
                    amount_paid=paid,
                    balance_due=max(total - paid, Decimal("0")),
                    status=self._invoice_status(row, paid, total),
                )
            )
            target.execute(
                update(tx_table)
                .where(
                    tx_table.c.invoice_id == invoice_id,
                    tx_table.c.transaction_type == "invoice_created",
                )
                .values(amount=total)
            )
            if partials[legacy_id]:
                continue
            existing_payment = target.execute(
                select(tx_table.c.id).where(
                    tx_table.c.invoice_id == invoice_id,
                    tx_table.c.description == "Imported legacy payment balance",
                )
            ).scalar_one_or_none()
            if existing_payment:
                target.execute(
                    update(tx_table)
                    .where(tx_table.c.id == existing_payment)
                    .values(amount=paid)
                )
            elif paid != 0:
                facility_id = target.execute(
                    select(invoice_table.c.facility_id).where(
                        invoice_table.c.id == invoice_id
                    )
                ).scalar_one()
                self._transaction(
                    target,
                    invoice_id,
                    int(facility_id) if facility_id else None,
                    "payment",
                    paid,
                    "Imported legacy payment balance",
                    _safe_datetime(row.get("paid_at"))
                    or _safe_datetime(row.get("updated_at"))
                    or datetime.utcnow(),
                    self._payment_method(row.get("payment_gateway")),
                    row.get("charge_id"),
                )

    def _migrate_quotation_invoices(
        self, source: Connection, target: Connection
    ) -> None:
        table = self.tables["invoices"]
        inspection_table = self.tables["inspections"]
        for row in self._rows(source, "SELECT * FROM qoutation_invoices ORDER BY id"):
            legacy_id = int(row["id"])
            if legacy_id in self.maps["quotation_invoice"]:
                continue
            inspection_id = self.maps["inspection_quotation"].get(
                int(row["qoutation_id"])
            )
            if not inspection_id:
                self._quarantine(
                    target,
                    "quotation_invoice",
                    legacy_id,
                    "missing inspection quotation mapping",
                    row,
                )
                continue
            inspection = (
                target.execute(
                    select(inspection_table).where(
                        inspection_table.c.id == inspection_id
                    )
                )
                .mappings()
                .one()
            )
            facility_id = int(inspection["facility_id"])
            customer = self._customer(target, facility_id)
            total = _money(row.get("net_amount"))
            tax = _money(row.get("taxes"))
            discount = _money(row.get("discount"))
            created_at = _safe_datetime(row.get("created_at")) or datetime.utcnow()
            invoice_id = self._insert(
                target,
                table,
                {
                    "invoice_number": f"LEGACY-QINV-{legacy_id:06d}",
                    "invoice_type": "INSPECTION",
                    "customer_name": customer["name"],
                    "customer_email": customer["email"],
                    "customer_phone": customer["phone"],
                    "customer_address": customer["address"],
                    "facility_id": facility_id,
                    "inspection_id": inspection_id,
                    "subtotal": max(total - tax + discount, Decimal("0")),
                    "tax_amount": tax,
                    "discount_amount": discount,
                    "total_amount": total,
                    "amount_paid": 0,
                    "balance_due": total,
                    "status": "PENDING",
                    "issue_date": _safe_date(created_at) or date.today(),
                    "due_date": _safe_date(row.get("due_date")) or date.today(),
                    "notes": (
                        f"Imported legacy inspection quotation invoice {legacy_id}"
                    ),
                    "created_at": created_at,
                    "updated_at": _safe_datetime(row.get("updated_at")) or created_at,
                },
            )
            self._map(target, "quotation_invoice", legacy_id, invoice_id)
            self._transaction(
                target,
                invoice_id,
                facility_id,
                "invoice_created",
                total,
                f"Imported quotation invoice {legacy_id}",
                created_at,
            )
            self.counts["quotation_invoices"] += 1

    def _create_commerce_invoices(self, source: Connection, target: Connection) -> None:
        invoice_table = self.tables["invoices"]
        sales_table = self.tables["sales_quotations"]
        rental_table = self.tables["rentals"]
        children: dict[int, list[int]] = defaultdict(list)
        for row in self._rows(
            source, "SELECT id, sale_and_rental_id FROM sale_and_rental_parts"
        ):
            children[int(row["sale_and_rental_id"])].append(int(row["id"]))

        for row in self._rows(
            source,
            "SELECT * FROM sale_and_rentals WHERE page='invoice' ORDER BY id",
        ):
            legacy_id = int(row["id"])
            if _clean(row.get("type")).lower() == "sale":
                record_id = self.maps["sales_quotation"].get(legacy_id)
                map_entity = "sales_invoice"
                invoice_type = "SALES"
                relation_field = "sales_quotation_id"
                source_table = sales_table
            else:
                rental_ids = [
                    self.maps["rental"][child_id]
                    for child_id in children[legacy_id]
                    if child_id in self.maps["rental"]
                ]
                record_id = rental_ids[0] if rental_ids else None
                map_entity = "rental_invoice"
                invoice_type = "RENTAL"
                relation_field = "rental_id"
                source_table = rental_table
            existing_invoice_id = self.maps[map_entity].get(legacy_id)
            if existing_invoice_id:
                total = _money(row.get("total_amount_without_processing_fee"))
                source_marked_paid = _clean(row.get("is_paid")).lower() == "paid"
                paid = (
                    total
                    if source_marked_paid
                    else min(_money(row.get("paid_amount")), total)
                )
                target.execute(
                    update(invoice_table)
                    .where(invoice_table.c.id == existing_invoice_id)
                    .values(
                        subtotal=_money(row.get("total_parts_amount")) or total,
                        tax_amount=_money(row.get("sales_tax")),
                        discount_amount=_money(row.get("discount")),
                        total_amount=total,
                        amount_paid=paid,
                        balance_due=max(total - paid, Decimal("0")),
                        status="PAID"
                        if source_marked_paid or (total > 0 and paid >= total)
                        else "PARTIALLY_PAID"
                        if paid > 0
                        else "PENDING",
                    )
                )
                tx_table = self.tables["invoice_transactions"]
                target.execute(
                    update(tx_table)
                    .where(
                        tx_table.c.invoice_id == existing_invoice_id,
                        tx_table.c.transaction_type == "invoice_created",
                    )
                    .values(amount=total)
                )
                target.execute(
                    delete(tx_table).where(
                        tx_table.c.invoice_id == existing_invoice_id,
                        tx_table.c.description == "Imported legacy commerce payment",
                    )
                )
                if paid > 0:
                    self._transaction(
                        target,
                        existing_invoice_id,
                        None,
                        "payment",
                        paid,
                        "Imported legacy commerce payment",
                        _safe_datetime(row.get("updated_at")) or datetime.utcnow(),
                    )
                continue
            if not record_id:
                self._quarantine(
                    target,
                    map_entity,
                    legacy_id,
                    "missing migrated commerce record",
                    row,
                )
                continue
            record = (
                target.execute(
                    select(source_table).where(source_table.c.id == record_id)
                )
                .mappings()
                .one()
            )
            facility_id = record.get("facility_id") if invoice_type == "SALES" else None
            total = _money(row.get("total_amount_without_processing_fee"))
            source_marked_paid = _clean(row.get("is_paid")).lower() == "paid"
            paid = total if source_marked_paid else _money(row.get("paid_amount"))
            paid = min(paid, total) if total > 0 else paid
            created_at = _safe_datetime(row.get("created_at")) or datetime.utcnow()
            values = {
                "invoice_number": (
                    f"INV-{invoice_type.upper()}-LEGACY-{legacy_id:06d}"
                ),
                "invoice_type": invoice_type,
                "customer_name": record["customer_name"],
                "customer_email": record.get("customer_email")
                or "legacy-customer@migration.invalid",
                "customer_phone": record.get("customer_phone"),
                "customer_address": record.get("customer_address"),
                "facility_id": facility_id,
                relation_field: record_id,
                "subtotal": _money(row.get("total_parts_amount")) or total,
                "tax_amount": _money(row.get("sales_tax")),
                "discount_amount": _money(row.get("discount")),
                "total_amount": total,
                "amount_paid": paid,
                "balance_due": max(total - paid, Decimal("0")),
                "status": "PAID"
                if source_marked_paid or (total > 0 and paid >= total)
                else "PARTIALLY_PAID"
                if paid > 0
                else "PENDING",
                "issue_date": _safe_date(created_at) or date.today(),
                "due_date": _safe_date(row.get("end_date"))
                or _safe_date(created_at)
                or date.today(),
                "notes": f"Imported legacy {invoice_type} invoice {legacy_id}",
                "created_at": created_at,
                "updated_at": _safe_datetime(row.get("updated_at")) or created_at,
            }
            invoice_id = self._insert(target, invoice_table, values)
            self._map(target, map_entity, legacy_id, invoice_id)
            target.execute(
                update(source_table)
                .where(source_table.c.id == record_id)
                .values(converted_invoice_id=invoice_id)
            )
            if invoice_type == "RENTAL":
                for child_id in children[legacy_id]:
                    rental_id = self.maps["rental"].get(child_id)
                    if rental_id:
                        target.execute(
                            update(rental_table)
                            .where(rental_table.c.id == rental_id)
                            .values(converted_invoice_id=invoice_id)
                        )
            self._transaction(
                target,
                invoice_id,
                facility_id,
                "invoice_created",
                total,
                f"Imported legacy {invoice_type} invoice {legacy_id}",
                created_at,
            )
            if paid > 0:
                self._transaction(
                    target,
                    invoice_id,
                    facility_id,
                    "payment",
                    paid,
                    "Imported legacy commerce payment",
                    _safe_datetime(row.get("updated_at")) or created_at,
                )
                self.counts["invoice_payments"] += 1
            self.counts[f"{invoice_type.lower()}_invoices"] += 1

    def _reset_sequences(self, target: Connection) -> None:
        for table in self.tables.values():
            target.execute(
                text(
                    f"SELECT setval(pg_get_serial_sequence('{table.name}', 'id'), "
                    f"COALESCE((SELECT MAX(id) FROM {table.name}), 1), true)"
                )
            )
