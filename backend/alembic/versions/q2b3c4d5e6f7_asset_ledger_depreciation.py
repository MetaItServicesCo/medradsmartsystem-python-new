"""Asset ledger and depreciation

An asset register that cannot say what a thing is worth, or show what has been
done to it since it was installed, is a list rather than a register.

Most of the history needed for that already exists — service requests,
inspections, compliance tasks and readings all point at `equipment` — so this
migration deliberately does **not** add an event table to copy them into. A
copy would be a second record of the same fact, and it goes stale the first
time somebody edits the original. The operational timeline is assembled at read
time in `app.services.asset_ledger` instead.

What is added is only what nothing else records:

  * `asset_ledger_entries` — the money and the custody. Acquisition,
    capitalisation, improvements that change the depreciable basis,
    revaluations, impairments, transfers, disposals, and the reversals that
    correct them. Append-only in practice: a posted financial row is corrected
    by posting its opposite, never by editing it, because a row an auditor can
    see was rewritten is a row they cannot rely on.
  * four columns on `equipment` — the depreciation inputs that `cost` alone
    cannot supply. Method, salvage value, useful life, and expected units for
    the assets whose life is measured in running hours rather than years.

All four are nullable. An asset missing them reports that no book value can be
computed, which is deliberately distinguishable from an asset worth nothing.

Revision ID: q2b3c4d5e6f7
Revises: p1a2b3c4d5e6
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "q2b3c4d5e6f7"
down_revision: Union[str, Sequence[str], None] = "p1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "asset_ledger_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("facility_id", sa.Integer(), nullable=False),
        sa.Column("equipment_id", sa.Integer(), nullable=False),
        sa.Column("entry_type", sa.String(length=32), nullable=False),
        # The date the event happened, which is what depreciation and any period
        # report key off. Distinct from created_at, the date somebody got round
        # to recording it: an improvement completed in March and entered in June
        # depreciates from March.
        sa.Column("effective_date", sa.Date(), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=False),
        # Signed — positive adds to the basis, negative reduces it — rather than
        # a separate direction column, because every consumer wants to sum it.
        sa.Column("amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("proceeds", sa.Numeric(14, 2), nullable=True),
        # Banked at disposal rather than recomputed: the schedule it came from
        # may later be edited, and a realised gain or loss is a historical fact.
        sa.Column("gain_loss", sa.Numeric(14, 2), nullable=True),
        sa.Column("from_location_id", sa.Integer(), nullable=True),
        sa.Column("to_location_id", sa.Integer(), nullable=True),
        sa.Column("from_facility_id", sa.Integer(), nullable=True),
        sa.Column("to_facility_id", sa.Integer(), nullable=True),
        # A re-roof or a lift modernisation extends the life of the thing it
        # improves. Applied from the effective date forward, never retroactively.
        sa.Column("extends_useful_life_years", sa.Numeric(5, 2), nullable=True),
        sa.Column("reference", sa.String(length=128), nullable=True),
        sa.Column("vendor_id", sa.Integer(), nullable=True),
        sa.Column("work_order_id", sa.Integer(), nullable=True),
        sa.Column("reverses_entry_id", sa.Integer(), nullable=True),
        sa.Column("is_reversed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["equipment_id"], ["equipment.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["from_location_id"], ["locations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["to_location_id"], ["locations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["from_facility_id"], ["facilities.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["to_facility_id"], ["facilities.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendors.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["work_order_id"], ["service_requests.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["reverses_entry_id"], ["asset_ledger_entries.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_asset_ledger_entries_id", "asset_ledger_entries", ["id"])
    op.create_index("ix_asset_ledger_entries_facility_id", "asset_ledger_entries", ["facility_id"])
    op.create_index("ix_asset_ledger_entries_equipment_id", "asset_ledger_entries", ["equipment_id"])
    op.create_index("ix_asset_ledger_entries_entry_type", "asset_ledger_entries", ["entry_type"])
    op.create_index("ix_asset_ledger_entries_effective_date", "asset_ledger_entries", ["effective_date"])
    # One asset's ledger in date order — the detail view's query.
    op.create_index("ix_ledger_equipment_date", "asset_ledger_entries", ["equipment_id", "effective_date"])
    # Every disposal this quarter across the estate — the period report.
    op.create_index("ix_ledger_facility_type_date", "asset_ledger_entries", ["facility_id", "entry_type", "effective_date"])

    # ── Depreciation inputs ─────────────────────────────────────────────────
    # `equipment.cost` already holds the acquisition figure. These are the rest.
    op.add_column("equipment", sa.Column("depreciation_method", sa.String(), nullable=True))
    op.add_column("equipment", sa.Column("salvage_value", sa.Numeric(14, 2), nullable=True))
    op.add_column("equipment", sa.Column("useful_life_years", sa.Numeric(5, 2), nullable=True))
    # A generator's rated service hours, for units-of-production. Kept separate
    # from hours actually run, which comes from the runtime reading point.
    op.add_column("equipment", sa.Column("total_expected_units", sa.Numeric(14, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("equipment", "total_expected_units")
    op.drop_column("equipment", "useful_life_years")
    op.drop_column("equipment", "salvage_value")
    op.drop_column("equipment", "depreciation_method")
    op.drop_table("asset_ledger_entries")
