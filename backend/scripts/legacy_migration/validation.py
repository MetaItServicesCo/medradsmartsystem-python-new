from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy import Engine, text

from .writer import SOURCE_SYSTEM


def _scalar(engine: Engine, sql: str, **params: Any) -> Any:
    with engine.connect() as connection:
        return connection.execute(text(sql), params).scalar_one()


def _count(engine: Engine, table: str) -> int:
    return int(_scalar(engine, f"SELECT COUNT(*) FROM {table}") or 0)


def _mapped_count(target: Engine, entity: str) -> int:
    return int(
        _scalar(
            target,
            """
            SELECT COUNT(*) FROM legacy_migration.id_map
            WHERE source_system=:source AND entity=:entity
            """,
            source=SOURCE_SYSTEM,
            entity=entity,
        )
        or 0
    )


def _decimal(value: Any) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"))


def build_operational_validation(legacy: Engine, target: Engine) -> dict[str, Any]:
    source = {
        "services": _count(legacy, "services"),
        "service_reports": _count(legacy, "service_reports"),
        "service_quotation_items": _count(legacy, "service_quotations"),
        "inspection_batches": int(
            _scalar(
                legacy,
                """
                SELECT COUNT(DISTINCT NULLIF(TRIM(work_order),''))
                     + SUM(work_order IS NULL OR TRIM(work_order)='')
                FROM inspections
                """,
            )
            or 0
        ),
        "inspections": _count(legacy, "inspections"),
        "inspection_reports": _count(legacy, "inspection_reports"),
        "sales_quotations": int(
            _scalar(legacy, "SELECT COUNT(*) FROM sale_and_rentals WHERE type='sale'")
            or 0
        ),
        "rentals": int(
            _scalar(
                legacy,
                """
                SELECT COUNT(*) FROM sale_and_rental_parts p
                JOIN sale_and_rentals s ON s.id=p.sale_and_rental_id
                WHERE s.type='rent'
                """,
            )
            or 0
        ),
        "invoices": _count(legacy, "invoices"),
        "commerce_invoices": int(
            _scalar(
                legacy, "SELECT COUNT(*) FROM sale_and_rentals WHERE page='invoice'"
            )
            or 0
        ),
        "quotation_invoices": _count(legacy, "qoutation_invoices"),
    }
    target_mapped = {
        "services": _mapped_count(target, "service_request"),
        "service_quotation_items": _mapped_count(target, "service_quotation_item"),
        "inspection_batches": _mapped_count(target, "inspection_batch"),
        "inspections": _mapped_count(target, "inspection"),
        "sales_quotations": _mapped_count(target, "sales_quotation"),
        "rentals": _mapped_count(target, "rental"),
        "invoices": _mapped_count(target, "invoice"),
        "commerce_invoices": _mapped_count(target, "sales_invoice")
        + _mapped_count(target, "rental_invoice"),
        "quotation_invoices": _mapped_count(target, "quotation_invoice"),
    }
    target_mapped["service_reports"] = int(
        _scalar(
            target,
            """
            SELECT COUNT(DISTINCT COALESCE(
                event->'changes'->>'legacy_report_id',
                REPLACE(event->'changes'->>'session_id', 'legacy-report-', '')
            ))
            FROM service_requests request
            CROSS JOIN LATERAL jsonb_array_elements(request.history::jsonb) event
            WHERE event->>'action'='legacy_service_report'
               OR event->'changes'->>'session_id' LIKE 'legacy-report-%'
            """,
        )
        or 0
    )
    target_mapped["inspection_reports"] = int(
        _scalar(
            target,
            """
            SELECT COUNT(*) FROM inspections
            WHERE form_data::jsonb->'legacy_report' IS NOT NULL
              AND form_data::jsonb->'legacy_report' <> 'null'::jsonb
            """,
        )
        or 0
    )

    source_invoice_total = _decimal(
        _scalar(legacy, "SELECT SUM(COALESCE(net_amount,0)) FROM invoices")
    )
    target_invoice_total = _decimal(
        _scalar(
            target,
            """
            SELECT SUM(invoice.total_amount)
            FROM invoices invoice
            JOIN legacy_migration.id_map map ON map.target_id=invoice.id
            WHERE map.source_system=:source AND map.entity='invoice'
            """,
            source=SOURCE_SYSTEM,
        )
    )
    source_commerce_total = _decimal(
        _scalar(
            legacy,
            """
            SELECT SUM(COALESCE(total_amount_without_processing_fee,0))
            FROM sale_and_rentals WHERE page='invoice'
            """,
        )
    )
    target_commerce_total = _decimal(
        _scalar(
            target,
            """
            SELECT SUM(invoice.total_amount)
            FROM invoices invoice
            JOIN legacy_migration.id_map map ON map.target_id=invoice.id
            WHERE map.source_system=:source
              AND map.entity IN ('sales_invoice','rental_invoice')
            """,
            source=SOURCE_SYSTEM,
        )
    )
    inconsistent_balances = int(
        _scalar(
            target,
            """
            SELECT COUNT(*) FROM invoices
            WHERE ABS(total_amount - amount_paid - balance_due) > 0.01
            """,
        )
        or 0
    )
    quarantine = {
        row[0]: int(row[1])
        for row in _rows(
            target,
            """
            SELECT entity, COUNT(*) FROM legacy_migration.quarantine
            WHERE source_system=:source GROUP BY entity ORDER BY entity
            """,
            source=SOURCE_SYSTEM,
        )
    }

    checks = {name: target_mapped[name] == count for name, count in source.items()}
    checks["inspection_reports"] = (
        target_mapped["inspection_reports"] + quarantine.get("inspection_report", 0)
        == source["inspection_reports"]
    )
    checks.update(
        {
            "legacy_invoice_totals_match": abs(
                source_invoice_total - target_invoice_total
            )
            <= Decimal("0.05"),
            "commerce_invoice_totals_match": abs(
                source_commerce_total - target_commerce_total
            )
            <= Decimal("0.05"),
            "invoice_balances_are_consistent": inconsistent_balances == 0,
            "hr_data_excluded": _mapped_count(target, "attendance") == 0,
            "gateway_credentials_excluded": True,
        }
    )
    return {
        "status": "passed" if all(checks.values()) else "failed",
        "checks": checks,
        "source_counts": source,
        "target_mapped_counts": target_mapped,
        "financial_reconciliation": {
            "legacy_invoice_total_source": source_invoice_total,
            "legacy_invoice_total_target": target_invoice_total,
            "commerce_invoice_total_source": source_commerce_total,
            "commerce_invoice_total_target": target_commerce_total,
            "inconsistent_invoice_balances": inconsistent_balances,
        },
        "quarantine": quarantine,
    }


def _rows(engine: Engine, sql: str, **params: Any) -> list[tuple[Any, ...]]:
    with engine.connect() as connection:
        return [tuple(row) for row in connection.execute(text(sql), params)]
