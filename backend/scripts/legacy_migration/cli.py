from __future__ import annotations

import argparse
import json
from pathlib import Path

from sqlalchemy import create_engine

from .audit import build_audit_report
from .config import MigrationConfig
from .foundation import build_foundation_plan
from .operational import OperationalWriter
from .validation import build_operational_validation
from .writer import FoundationWriter


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Audit and migrate the legacy Medrad MariaDB database.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    audit = subparsers.add_parser("audit", help="Generate an anonymized dry-run audit")
    audit.add_argument("--output", type=Path, required=True)
    foundation = subparsers.add_parser(
        "plan-foundation",
        help="Preview foundational transformations without writing data",
    )
    foundation.add_argument("--output", type=Path, required=True)
    migrate_foundation = subparsers.add_parser(
        "migrate-foundation",
        help="Write foundational records to a confirmed local staging database",
    )
    migrate_foundation.add_argument("--output", type=Path, required=True)
    migrate_foundation.add_argument("--apply", action="store_true", required=True)
    migrate_foundation.add_argument("--confirm-target", required=True)
    migrate_operational = subparsers.add_parser(
        "migrate-operational",
        help="Write services, reports, inspections, commerce, invoices, and ledgers",
    )
    migrate_operational.add_argument("--output", type=Path, required=True)
    migrate_operational.add_argument("--apply", action="store_true", required=True)
    migrate_operational.add_argument("--confirm-target", required=True)
    apply_enrichment = subparsers.add_parser(
        "apply-enrichment",
        help="Idempotently add legacy inspection forms, asset-form links, "
        "test equipment, and inspection answers to an already-migrated database "
        "(additive; production-allowed)",
    )
    apply_enrichment.add_argument("--output", type=Path, required=True)
    apply_enrichment.add_argument("--apply", action="store_true", required=True)
    apply_enrichment.add_argument("--confirm-target", required=True)
    validate_operational = subparsers.add_parser(
        "validate-operational",
        help="Reconcile migrated operational and financial records",
    )
    validate_operational.add_argument("--output", type=Path, required=True)
    return parser


def main() -> None:
    args = _parser().parse_args()
    config = MigrationConfig.from_environment()
    legacy = create_engine(config.legacy_url, pool_pre_ping=True)
    target = create_engine(config.target_url, pool_pre_ping=True)

    try:
        if args.command == "audit":
            report = build_audit_report(config, legacy, target)
        elif args.command == "plan-foundation":
            report = build_foundation_plan(legacy, target)
        elif args.command == "migrate-foundation":
            config.require_local_staging_target(args.confirm_target)
            report = FoundationWriter(legacy, target).run()
        elif args.command == "migrate-operational":
            config.require_local_staging_target(args.confirm_target)
            report = OperationalWriter(legacy, target).run()
        elif args.command == "apply-enrichment":
            if args.confirm_target != config.target_url.database:
                raise RuntimeError(
                    "Target confirmation does not match TARGET_DATABASE_URL"
                )
            report = OperationalWriter(legacy, target).apply_enrichment()
        elif args.command == "validate-operational":
            report = build_operational_validation(legacy, target)
        else:
            raise RuntimeError(f"Unsupported command: {args.command}")

        if args.command in {
            "audit",
            "plan-foundation",
            "migrate-foundation",
            "migrate-operational",
            "apply-enrichment",
            "validate-operational",
        }:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(
                json.dumps(report, indent=2, default=str),
                encoding="utf-8",
            )
            print(f"Report written to {args.output}")
    finally:
        legacy.dispose()
        target.dispose()


if __name__ == "__main__":
    main()
