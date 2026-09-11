"""Facilities and MEP foundation — locations, plans, vendors, space status

Extends a medical-equipment system to cover the building it sits in:
mechanical, electrical, plumbing, vertical transport, medical gas and the rest.

The shape of this migration follows one decision: almost nothing existing
changes. `Facility` stays the campus and the tenancy boundary, because
`facility_id` is the scoping key on every table here and on the RBAC data
scope, and inserting a campus above it would mean re-plumbing all of that to
buy nothing. `Modality` keeps classifying biomedical equipment; the new
`disciplines` table answers the different question MEP work asks — which trade
owns this. Plant assets go into the existing `equipment` table rather than a
third asset table, because there are already two near-identical ones (equipment
and inventory_parts) and a third would make every report choose which two of
three to union.

Only one existing column is altered, and it is the one the whole design turns
on: `service_requests.equipment_id` becomes nullable. A nurse reporting a dead
socket in an operating theatre knows the room and does not know — and must not
be made to hunt for — the receptacle's asset tag. The invariant it used to
provide (a work order has a subject) moves to `app.services.work_order`, which
requires equipment or location and refuses neither.

Everything added is nullable or defaulted, so existing rows are untouched and
the downgrade is clean.

Revision ID: o0f1a2b3c4d5
Revises: n9e0f1a2b3c4
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "o0f1a2b3c4d5"
down_revision: Union[str, Sequence[str], None] = "n9e0f1a2b3c4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Seeded so that a fresh install can file work on day one. Codes are stable
# identifiers routing rules and imports refer to; names are display text an
# admin may rename freely.
SEED_DISCIPLINES = (
    ("mechanical", "Mechanical / HVAC", "#0EA5E9", "Air handling, chillers, boilers, exhaust, controls", 10),
    ("electrical", "Electrical", "#F59E0B", "Distribution, panels, generators, transfer switches, lighting", 20),
    ("plumbing", "Plumbing", "#3B82F6", "Domestic water, sanitary, storm, backflow, water heaters", 30),
    ("vertical_transport", "Vertical Transport", "#8B5CF6", "Elevators, escalators, dumbwaiters, lifts", 40),
    ("fire_life_safety", "Fire & Life Safety", "#EF4444", "Alarm, sprinkler, standpipe, fire pump, suppression, dampers", 50),
    ("medical_gas", "Medical Gas & Vacuum", "#10B981", "Oxygen, medical air, nitrous, vacuum, manifolds, zone valves", 60),
    ("building_envelope", "Building & Envelope", "#78716C", "Roofing, doors, hardware, glazing, finishes, casework", 70),
    ("it_low_voltage", "IT & Low Voltage", "#6366F1", "Structured cabling, nurse call, access control, CCTV", 80),
    ("biomedical", "Biomedical", "#EC4899", "Clinical equipment — bridges to the existing modality tree", 90),
)


def upgrade() -> None:
    # ── Disciplines ─────────────────────────────────────────────────────────
    op.create_table(
        "disciplines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("color", sa.String(length=16), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_disciplines_code"),
    )
    op.create_index("ix_disciplines_id", "disciplines", ["id"])
    op.create_index("ix_disciplines_code", "disciplines", ["code"])
    op.create_index("ix_disciplines_is_active", "disciplines", ["is_active"])

    disciplines = sa.table(
        "disciplines",
        sa.column("code", sa.String), sa.column("name", sa.String),
        sa.column("color", sa.String), sa.column("description", sa.Text),
        sa.column("sort_order", sa.Integer),
    )
    op.bulk_insert(disciplines, [
        {"code": code, "name": name, "color": color, "description": description, "sort_order": order}
        for code, name, color, description, order in SEED_DISCIPLINES
    ])

    op.create_table(
        "user_disciplines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("discipline_id", sa.Integer(), nullable=False),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("certification_note", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["discipline_id"], ["disciplines.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "discipline_id", name="uq_user_disciplines_user_discipline"),
    )
    op.create_index("ix_user_disciplines_user_id", "user_disciplines", ["user_id"])
    op.create_index("ix_user_disciplines_discipline_id", "user_disciplines", ["discipline_id"])

    # ── Locations ───────────────────────────────────────────────────────────
    # `floor_plan_id` is added after floor_plans exists, because the two
    # reference each other: a plan belongs to a floor, and a room is pinned to
    # a plan. Creating one FK later is cheaper than a deferrable circular pair.
    op.create_table(
        "locations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("facility_id", sa.Integer(), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("path", sa.String(length=512), nullable=False, server_default=""),
        sa.Column("depth", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("location_type", sa.String(length=32), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("department_id", sa.Integer(), nullable=True),
        sa.Column("space_use", sa.String(length=48), nullable=True),
        sa.Column("criticality", sa.String(length=16), nullable=True),
        sa.Column("electrical_branch", sa.String(length=16), nullable=True),
        sa.Column("area_sqft", sa.Numeric(12, 2), nullable=True),
        sa.Column("ceiling_height_ft", sa.Numeric(6, 2), nullable=True),
        sa.Column("volume_cuft", sa.Numeric(14, 2), nullable=True),
        sa.Column("occupancy_status", sa.String(length=32), nullable=False, server_default="in_service"),
        sa.Column("bed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("plan_x", sa.Numeric(10, 6), nullable=True),
        sa.Column("plan_y", sa.Numeric(10, 6), nullable=True),
        sa.Column("is_provisional", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("external_ref", sa.String(length=128), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_id"], ["locations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_locations_id", "locations", ["id"])
    op.create_index("ix_locations_facility_id", "locations", ["facility_id"])
    op.create_index("ix_locations_parent_id", "locations", ["parent_id"])
    op.create_index("ix_locations_path", "locations", ["path"])
    op.create_index("ix_locations_code", "locations", ["code"])
    op.create_index("ix_locations_location_type", "locations", ["location_type"])
    op.create_index("ix_locations_space_use", "locations", ["space_use"])
    op.create_index("ix_locations_criticality", "locations", ["criticality"])
    op.create_index("ix_locations_department_id", "locations", ["department_id"])
    op.create_index("ix_locations_is_active", "locations", ["is_active"])
    op.create_index("ix_locations_is_provisional", "locations", ["is_provisional"])
    op.create_index("ix_locations_occupancy_status", "locations", ["occupancy_status"])
    op.create_index("ix_locations_external_ref", "locations", ["external_ref"])
    # The workhorse: subtree reads are `path LIKE '/3/41/%'` and every list view
    # filters by facility first, so the two travel together.
    op.create_index("ix_locations_facility_path", "locations", ["facility_id", "path"])
    op.create_index("ix_locations_facility_type_active", "locations", ["facility_id", "location_type", "is_active"])
    op.create_index("ix_locations_parent_code", "locations", ["parent_id", "code"])
    op.create_index("ix_locations_facility_use", "locations", ["facility_id", "space_use"])

    # ── Floor plans ─────────────────────────────────────────────────────────
    op.create_table(
        "floor_plans",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("facility_id", sa.Integer(), nullable=False),
        sa.Column("location_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("source_filename", sa.String(length=255), nullable=True),
        sa.Column("source_path", sa.String(length=512), nullable=True),
        sa.Column("source_mime", sa.String(length=64), nullable=True),
        sa.Column("page_number", sa.Integer(), nullable=True),
        sa.Column("image_path", sa.String(length=512), nullable=True),
        sa.Column("width_px", sa.Integer(), nullable=True),
        sa.Column("height_px", sa.Integer(), nullable=True),
        # Set by drawing one line over a known dimension. Turns the drawing
        # into a measuring instrument: room area in square feet, hence volume,
        # hence air changes per hour.
        sa.Column("scale_ft_per_px", sa.Numeric(12, 6), nullable=True),
        sa.Column("rotation_deg", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_current", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("uploaded_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["location_id"], ["locations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_floor_plans_id", "floor_plans", ["id"])
    op.create_index("ix_floor_plans_facility_id", "floor_plans", ["facility_id"])
    op.create_index("ix_floor_plans_location_id", "floor_plans", ["location_id"])
    op.create_index("ix_floor_plans_is_current", "floor_plans", ["is_current"])
    op.create_index("ix_floor_plans_location_current", "floor_plans", ["location_id", "is_current"])

    op.add_column("locations", sa.Column("floor_plan_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_locations_floor_plan_id", "locations", "floor_plans",
        ["floor_plan_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index("ix_locations_floor_plan_id", "locations", ["floor_plan_id"])

    # ── Vendors ─────────────────────────────────────────────────────────────
    op.create_table(
        "vendors",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=48), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("legal_name", sa.String(length=255), nullable=True),
        sa.Column("vendor_type", sa.String(length=32), nullable=False, server_default="service_contractor"),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="active"),
        sa.Column("discipline_ids", sa.JSON(), nullable=True),
        sa.Column("phone", sa.String(length=48), nullable=True),
        sa.Column("after_hours_phone", sa.String(length=48), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("website", sa.String(length=255), nullable=True),
        sa.Column("address", sa.String(length=255), nullable=True),
        sa.Column("suite", sa.String(length=64), nullable=True),
        sa.Column("city", sa.String(length=128), nullable=True),
        sa.Column("state", sa.String(length=64), nullable=True),
        sa.Column("zip_code", sa.String(length=24), nullable=True),
        sa.Column("country", sa.String(length=64), nullable=True, server_default="United States"),
        sa.Column("tax_id", sa.String(length=64), nullable=True),
        sa.Column("account_number", sa.String(length=64), nullable=True),
        # Defaults false: a vendor with no credentials on file has not been
        # checked, and treating unknown as fine is the failure a survey looks for.
        sa.Column("credentials_ok", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("earliest_credential_expiry", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_vendors_code"),
    )
    op.create_index("ix_vendors_id", "vendors", ["id"])
    op.create_index("ix_vendors_code", "vendors", ["code"])
    op.create_index("ix_vendors_name", "vendors", ["name"])
    op.create_index("ix_vendors_vendor_type", "vendors", ["vendor_type"])
    op.create_index("ix_vendors_status", "vendors", ["status"])
    op.create_index("ix_vendors_credentials_ok", "vendors", ["credentials_ok"])
    op.create_index("ix_vendors_earliest_credential_expiry", "vendors", ["earliest_credential_expiry"])
    op.create_index("ix_vendors_status_name", "vendors", ["status", "name"])

    op.create_table(
        "vendor_contacts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("vendor_id", sa.Integer(), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("title", sa.String(length=128), nullable=True),
        sa.Column("phone", sa.String(length=48), nullable=True),
        sa.Column("mobile", sa.String(length=48), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_escalation", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("escalation_order", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendors.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_vendor_contacts_id", "vendor_contacts", ["id"])
    op.create_index("ix_vendor_contacts_vendor_id", "vendor_contacts", ["vendor_id"])
    op.create_index("ix_vendor_contacts_vendor_primary", "vendor_contacts", ["vendor_id", "is_primary"])

    op.create_table(
        "vendor_credentials",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("vendor_id", sa.Integer(), nullable=False),
        sa.Column("credential_type", sa.String(length=48), nullable=False),
        sa.Column("identifier", sa.String(length=128), nullable=True),
        sa.Column("issuer", sa.String(length=255), nullable=True),
        sa.Column("jurisdiction", sa.String(length=64), nullable=True),
        sa.Column("issued_on", sa.Date(), nullable=True),
        sa.Column("expires_on", sa.Date(), nullable=True),
        sa.Column("coverage_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("document_filename", sa.String(length=255), nullable=True),
        sa.Column("document_path", sa.String(length=512), nullable=True),
        sa.Column("is_blocking", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendors.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_vendor_credentials_id", "vendor_credentials", ["id"])
    op.create_index("ix_vendor_credentials_vendor_id", "vendor_credentials", ["vendor_id"])
    op.create_index("ix_vendor_credentials_credential_type", "vendor_credentials", ["credential_type"])
    op.create_index("ix_vendor_credentials_expires_on", "vendor_credentials", ["expires_on"])
    op.create_index("ix_vendor_credentials_vendor_type", "vendor_credentials", ["vendor_id", "credential_type"])

    op.create_table(
        "vendor_contracts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("contract_number", sa.String(length=64), nullable=False),
        sa.Column("vendor_id", sa.Integer(), nullable=False),
        sa.Column("facility_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("contract_type", sa.String(length=32), nullable=False, server_default="full_service"),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="draft"),
        sa.Column("discipline_ids", sa.JSON(), nullable=True),
        sa.Column("location_id", sa.Integer(), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("renewal_notice_date", sa.Date(), nullable=True),
        sa.Column("auto_renews", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("annual_value", sa.Numeric(14, 2), nullable=True),
        sa.Column("labor_rate_per_hour", sa.Numeric(10, 2), nullable=True),
        sa.Column("overtime_rate_per_hour", sa.Numeric(10, 2), nullable=True),
        sa.Column("holiday_rate_per_hour", sa.Numeric(10, 2), nullable=True),
        sa.Column("trip_charge", sa.Numeric(10, 2), nullable=True),
        # JSON rather than four columns: contracts do not agree on how many
        # priority bands they recognise, and a missing band should fall back to
        # the house matrix rather than be invented as a number.
        sa.Column("response_hours_by_priority", sa.JSON(), nullable=True),
        sa.Column("covers_after_hours", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("covers_parts", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("scope_notes", sa.Text(), nullable=True),
        sa.Column("document_filename", sa.String(length=255), nullable=True),
        sa.Column("document_path", sa.String(length=512), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendors.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["location_id"], ["locations.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("contract_number", name="uq_vendor_contracts_number"),
    )
    op.create_index("ix_vendor_contracts_id", "vendor_contracts", ["id"])
    op.create_index("ix_vendor_contracts_contract_number", "vendor_contracts", ["contract_number"])
    op.create_index("ix_vendor_contracts_vendor_id", "vendor_contracts", ["vendor_id"])
    op.create_index("ix_vendor_contracts_facility_id", "vendor_contracts", ["facility_id"])
    op.create_index("ix_vendor_contracts_status", "vendor_contracts", ["status"])
    op.create_index("ix_vendor_contracts_end_date", "vendor_contracts", ["end_date"])
    op.create_index("ix_vendor_contracts_renewal_notice_date", "vendor_contracts", ["renewal_notice_date"])
    op.create_index("ix_vendor_contracts_facility_status", "vendor_contracts", ["facility_id", "status"])
    op.create_index("ix_vendor_contracts_vendor_status", "vendor_contracts", ["vendor_id", "status"])

    op.create_table(
        "vendor_contract_assets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("contract_id", sa.Integer(), nullable=False),
        sa.Column("equipment_id", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["contract_id"], ["vendor_contracts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["equipment_id"], ["equipment.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("contract_id", "equipment_id", name="uq_contract_asset"),
    )
    op.create_index("ix_vendor_contract_assets_id", "vendor_contract_assets", ["id"])
    op.create_index("ix_vca_contract_id", "vendor_contract_assets", ["contract_id"])
    op.create_index("ix_vca_equipment_id", "vendor_contract_assets", ["equipment_id"])

    # ── Equipment: facilities columns ───────────────────────────────────────
    # All nullable. Every existing row keeps working exactly as it did, and the
    # legacy free-text `location` column is deliberately left alone: it holds
    # years of typed-in data and becomes the fallback display for assets that
    # have not been placed in the tree yet.
    op.add_column("equipment", sa.Column("discipline_id", sa.Integer(), nullable=True))
    op.add_column("equipment", sa.Column("location_id", sa.Integer(), nullable=True))
    op.add_column("equipment", sa.Column("parent_equipment_id", sa.Integer(), nullable=True))
    op.add_column("equipment", sa.Column("criticality", sa.String(), nullable=True))
    op.add_column("equipment", sa.Column("electrical_branch", sa.String(), nullable=True))
    op.add_column("equipment", sa.Column("service_vendor_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_equipment_discipline_id", "equipment", "disciplines", ["discipline_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_equipment_location_id", "equipment", "locations", ["location_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_equipment_parent_equipment_id", "equipment", "equipment", ["parent_equipment_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_equipment_service_vendor_id", "equipment", "vendors", ["service_vendor_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_equipment_discipline_id", "equipment", ["discipline_id"])
    op.create_index("ix_equipment_location_id", "equipment", ["location_id"])
    op.create_index("ix_equipment_parent_equipment_id", "equipment", ["parent_equipment_id"])
    op.create_index("ix_equipment_criticality", "equipment", ["criticality"])
    op.create_index("ix_equipment_service_vendor_id", "equipment", ["service_vendor_id"])

    # ── Asset dependency graph ──────────────────────────────────────────────
    op.create_table(
        "asset_serves_asset",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("upstream_equipment_id", sa.Integer(), nullable=False),
        sa.Column("downstream_equipment_id", sa.Integer(), nullable=False),
        sa.Column("service_type", sa.String(length=32), nullable=False),
        sa.Column("connection_ref", sa.String(length=128), nullable=True),
        sa.Column("is_redundant", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["upstream_equipment_id"], ["equipment.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["downstream_equipment_id"], ["equipment.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "upstream_equipment_id", "downstream_equipment_id", "service_type",
            name="uq_asset_serves_asset",
        ),
    )
    op.create_index("ix_asa_id", "asset_serves_asset", ["id"])
    op.create_index("ix_asa_upstream_id", "asset_serves_asset", ["upstream_equipment_id"])
    op.create_index("ix_asa_downstream_id", "asset_serves_asset", ["downstream_equipment_id"])
    op.create_index("ix_asa_service_type", "asset_serves_asset", ["service_type"])
    # Both directions are traversed constantly: downstream for impact, upstream
    # for diagnosis. Neither is the rare one.
    op.create_index("ix_asa_upstream_type", "asset_serves_asset", ["upstream_equipment_id", "service_type"])
    op.create_index("ix_asa_downstream_type", "asset_serves_asset", ["downstream_equipment_id", "service_type"])

    op.create_table(
        "asset_serves_location",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("equipment_id", sa.Integer(), nullable=False),
        sa.Column("location_id", sa.Integer(), nullable=False),
        sa.Column("service_type", sa.String(length=32), nullable=False),
        sa.Column("is_sole_source", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("connection_ref", sa.String(length=128), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["equipment_id"], ["equipment.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["location_id"], ["locations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("equipment_id", "location_id", "service_type", name="uq_asset_serves_location"),
    )
    op.create_index("ix_asl_id", "asset_serves_location", ["id"])
    op.create_index("ix_asl_equipment_id", "asset_serves_location", ["equipment_id"])
    op.create_index("ix_asl_location_id", "asset_serves_location", ["location_id"])
    op.create_index("ix_asl_service_type", "asset_serves_location", ["service_type"])
    op.create_index("ix_asl_equipment_type", "asset_serves_location", ["equipment_id", "service_type"])
    op.create_index("ix_asl_location_type", "asset_serves_location", ["location_id", "service_type"])

    # ── Service requests: work order columns ────────────────────────────────
    # The one existing column this migration alters. See the module docstring.
    op.alter_column("service_requests", "equipment_id", existing_type=sa.Integer(), nullable=True)

    op.add_column("service_requests", sa.Column("location_id", sa.Integer(), nullable=True))
    op.add_column("service_requests", sa.Column("work_order_type", sa.String(), nullable=False, server_default="corrective"))
    op.add_column("service_requests", sa.Column("discipline_id", sa.Integer(), nullable=True))
    op.add_column("service_requests", sa.Column("assigned_vendor_id", sa.Integer(), nullable=True))
    op.add_column("service_requests", sa.Column("vendor_contract_id", sa.Integer(), nullable=True))
    # Every existing request is medical equipment service billed to a facility,
    # so the default preserves exactly today's behaviour.
    op.add_column("service_requests", sa.Column("is_billable", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("service_requests", sa.Column("cost_center", sa.String(), nullable=True))
    op.add_column("service_requests", sa.Column("sla_response_hours", sa.Integer(), nullable=True))
    op.add_column("service_requests", sa.Column("sla_due_at", sa.DateTime(), nullable=True))
    op.add_column("service_requests", sa.Column("responded_at", sa.DateTime(), nullable=True))
    op.add_column("service_requests", sa.Column("sla_breached", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("service_requests", sa.Column("takes_space_out_of_service", sa.Boolean(), nullable=False, server_default=sa.false()))

    op.create_foreign_key("fk_sr_location_id", "service_requests", "locations", ["location_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_sr_discipline_id", "service_requests", "disciplines", ["discipline_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_sr_assigned_vendor_id", "service_requests", "vendors", ["assigned_vendor_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_sr_vendor_contract_id", "service_requests", "vendor_contracts", ["vendor_contract_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_sr_location_id", "service_requests", ["location_id"])
    op.create_index("ix_sr_work_order_type", "service_requests", ["work_order_type"])
    op.create_index("ix_sr_discipline_id", "service_requests", ["discipline_id"])
    op.create_index("ix_sr_assigned_vendor_id", "service_requests", ["assigned_vendor_id"])
    op.create_index("ix_sr_is_billable", "service_requests", ["is_billable"])
    op.create_index("ix_sr_sla_due_at", "service_requests", ["sla_due_at"])
    op.create_index("ix_sr_sla_breached", "service_requests", ["sla_breached"])

    # Backfill the trade on existing rows so that reports grouping by discipline
    # do not show every historical ticket as unclassified.
    op.execute(
        "UPDATE service_requests SET discipline_id = "
        "(SELECT id FROM disciplines WHERE code = 'biomedical') "
        "WHERE discipline_id IS NULL"
    )
    op.execute(
        "UPDATE equipment SET discipline_id = "
        "(SELECT id FROM disciplines WHERE code = 'biomedical') "
        "WHERE discipline_id IS NULL"
    )

    # ── Space status ────────────────────────────────────────────────────────
    # PHI boundary: state only, never identity. See the docstring at the top of
    # app/models/space_status.py before adding a column here.
    op.create_table(
        "space_statuses",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("facility_id", sa.Integer(), nullable=False),
        sa.Column("location_id", sa.Integer(), nullable=False),
        sa.Column("availability", sa.String(length=32), nullable=False),
        sa.Column("oos_reason", sa.String(length=48), nullable=True),
        sa.Column("work_order_id", sa.Integer(), nullable=True),
        sa.Column("since", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("expected_return_at", sa.DateTime(), nullable=True),
        sa.Column("source", sa.String(length=24), nullable=False, server_default="manual"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("changed_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["location_id"], ["locations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["work_order_id"], ["service_requests.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["changed_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("location_id", name="uq_space_statuses_location"),
    )
    op.create_index("ix_space_statuses_id", "space_statuses", ["id"])
    op.create_index("ix_space_statuses_facility_id", "space_statuses", ["facility_id"])
    op.create_index("ix_space_statuses_location_id", "space_statuses", ["location_id"])
    op.create_index("ix_space_statuses_availability", "space_statuses", ["availability"])
    op.create_index("ix_space_statuses_oos_reason", "space_statuses", ["oos_reason"])
    op.create_index("ix_space_statuses_work_order_id", "space_statuses", ["work_order_id"])
    op.create_index("ix_space_statuses_since", "space_statuses", ["since"])
    op.create_index("ix_space_statuses_facility_availability", "space_statuses", ["facility_id", "availability"])
    op.create_index("ix_space_statuses_facility_since", "space_statuses", ["facility_id", "since"])

    op.create_table(
        "space_status_history",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("facility_id", sa.Integer(), nullable=False),
        sa.Column("location_id", sa.Integer(), nullable=False),
        sa.Column("availability", sa.String(length=32), nullable=False),
        sa.Column("oos_reason", sa.String(length=48), nullable=True),
        sa.Column("work_order_id", sa.Integer(), nullable=True),
        sa.Column("effective_from", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("effective_to", sa.DateTime(), nullable=True),
        sa.Column("duration_minutes", sa.Numeric(12, 2), nullable=True),
        # Denormalised at write time: a store room reclassified as an ICU next
        # year must not rewrite what last quarter's downtime is attributed to.
        sa.Column("space_use", sa.String(length=48), nullable=True),
        sa.Column("criticality", sa.String(length=16), nullable=True),
        sa.Column("counts_as_bed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("counts_as_procedure_room", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("source", sa.String(length=24), nullable=False, server_default="manual"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("changed_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["location_id"], ["locations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["work_order_id"], ["service_requests.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["changed_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ssh_id", "space_status_history", ["id"])
    op.create_index("ix_ssh_facility_id", "space_status_history", ["facility_id"])
    op.create_index("ix_ssh_location_id", "space_status_history", ["location_id"])
    op.create_index("ix_ssh_availability", "space_status_history", ["availability"])
    op.create_index("ix_ssh_oos_reason", "space_status_history", ["oos_reason"])
    op.create_index("ix_ssh_work_order_id", "space_status_history", ["work_order_id"])
    op.create_index("ix_ssh_effective_from", "space_status_history", ["effective_from"])
    op.create_index("ix_ssh_effective_to", "space_status_history", ["effective_to"])
    op.create_index("ix_ssh_space_use", "space_status_history", ["space_use"])
    op.create_index("ix_ssh_location_from", "space_status_history", ["location_id", "effective_from"])
    op.create_index("ix_ssh_facility_from", "space_status_history", ["facility_id", "effective_from"])
    # The capacity report: unavailable intervals in a window, grouped by reason.
    op.create_index("ix_ssh_facility_reason_from", "space_status_history", ["facility_id", "oos_reason", "effective_from"])
    op.create_index("ix_ssh_open_intervals", "space_status_history", ["location_id", "effective_to"])

    # ── Readings ────────────────────────────────────────────────────────────
    op.create_table(
        "reading_points",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("facility_id", sa.Integer(), nullable=False),
        sa.Column("equipment_id", sa.Integer(), nullable=True),
        sa.Column("location_id", sa.Integer(), nullable=True),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False, server_default="environmental"),
        # NOT NULL, and copied onto every reading. ASHRAE 170 asks an operating
        # room for 0.01 in. w.c. positive; the same requirement in pascals is
        # about 2.5, and a value stored without its unit cannot tell them apart.
        sa.Column("unit", sa.String(length=16), nullable=False),
        sa.Column("min_spec", sa.Numeric(14, 4), nullable=True),
        sa.Column("max_spec", sa.Numeric(14, 4), nullable=True),
        sa.Column("target", sa.Numeric(14, 4), nullable=True),
        sa.Column("spec_reference", sa.String(length=255), nullable=True),
        sa.Column("frequency_days", sa.Integer(), nullable=True),
        sa.Column("last_reading_at", sa.DateTime(), nullable=True),
        sa.Column("next_due_at", sa.DateTime(), nullable=True),
        sa.Column("gates_space_availability", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["equipment_id"], ["equipment.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["location_id"], ["locations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("facility_id", "code", name="uq_reading_points_facility_code"),
    )
    op.create_index("ix_reading_points_id", "reading_points", ["id"])
    op.create_index("ix_reading_points_facility_id", "reading_points", ["facility_id"])
    op.create_index("ix_reading_points_equipment_id", "reading_points", ["equipment_id"])
    op.create_index("ix_reading_points_location_id", "reading_points", ["location_id"])
    op.create_index("ix_reading_points_code", "reading_points", ["code"])
    op.create_index("ix_reading_points_kind", "reading_points", ["kind"])
    op.create_index("ix_reading_points_is_active", "reading_points", ["is_active"])
    op.create_index("ix_reading_points_next_due_at", "reading_points", ["next_due_at"])
    op.create_index("ix_reading_points_equipment", "reading_points", ["equipment_id", "is_active"])
    op.create_index("ix_reading_points_location", "reading_points", ["location_id", "is_active"])
    op.create_index("ix_reading_points_facility_kind", "reading_points", ["facility_id", "kind"])
    op.create_index("ix_reading_points_next_due", "reading_points", ["facility_id", "next_due_at"])

    op.create_table(
        "readings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("point_id", sa.Integer(), nullable=False),
        sa.Column("facility_id", sa.Integer(), nullable=False),
        sa.Column("value", sa.Numeric(14, 4), nullable=False),
        sa.Column("unit", sa.String(length=16), nullable=False),
        # Evaluated at write time against the band in force at that moment. A
        # limit tightened in March must not turn February's compliant readings
        # into violations.
        sa.Column("in_spec", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("recorded_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("recorded_by_id", sa.Integer(), nullable=True),
        sa.Column("work_order_id", sa.Integer(), nullable=True),
        sa.Column("inspection_id", sa.Integer(), nullable=True),
        sa.Column("source", sa.String(length=24), nullable=False, server_default="manual"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["point_id"], ["reading_points.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["recorded_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["work_order_id"], ["service_requests.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["inspection_id"], ["inspections.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_readings_id", "readings", ["id"])
    op.create_index("ix_readings_point_id", "readings", ["point_id"])
    op.create_index("ix_readings_facility_id", "readings", ["facility_id"])
    op.create_index("ix_readings_in_spec", "readings", ["in_spec"])
    op.create_index("ix_readings_recorded_at", "readings", ["recorded_at"])
    op.create_index("ix_readings_work_order_id", "readings", ["work_order_id"])
    op.create_index("ix_readings_inspection_id", "readings", ["inspection_id"])
    op.create_index("ix_readings_point_recorded", "readings", ["point_id", "recorded_at"])
    op.create_index("ix_readings_facility_inspec_recorded", "readings", ["facility_id", "in_spec", "recorded_at"])


def downgrade() -> None:
    # Reverse creation order so that dependents go before their referents.
    op.drop_table("readings")
    op.drop_table("reading_points")
    op.drop_table("space_status_history")
    op.drop_table("space_statuses")

    for index in (
        "ix_sr_sla_breached", "ix_sr_sla_due_at", "ix_sr_is_billable",
        "ix_sr_assigned_vendor_id", "ix_sr_discipline_id", "ix_sr_work_order_type",
        "ix_sr_location_id",
    ):
        op.drop_index(index, table_name="service_requests")
    for constraint in (
        "fk_sr_vendor_contract_id", "fk_sr_assigned_vendor_id",
        "fk_sr_discipline_id", "fk_sr_location_id",
    ):
        op.drop_constraint(constraint, "service_requests", type_="foreignkey")
    for column in (
        "takes_space_out_of_service", "sla_breached", "responded_at", "sla_due_at",
        "sla_response_hours", "cost_center", "is_billable", "vendor_contract_id",
        "assigned_vendor_id", "discipline_id", "work_order_type", "location_id",
    ):
        op.drop_column("service_requests", column)

    # Rows created with a location and no equipment cannot satisfy the restored
    # NOT NULL. Removing them is the only honest way back, and it is why this
    # downgrade should be run deliberately rather than reflexively.
    op.execute("DELETE FROM service_requests WHERE equipment_id IS NULL")
    op.alter_column("service_requests", "equipment_id", existing_type=sa.Integer(), nullable=False)

    op.drop_table("asset_serves_location")
    op.drop_table("asset_serves_asset")

    for index in (
        "ix_equipment_service_vendor_id", "ix_equipment_criticality",
        "ix_equipment_parent_equipment_id", "ix_equipment_location_id",
        "ix_equipment_discipline_id",
    ):
        op.drop_index(index, table_name="equipment")
    for constraint in (
        "fk_equipment_service_vendor_id", "fk_equipment_parent_equipment_id",
        "fk_equipment_location_id", "fk_equipment_discipline_id",
    ):
        op.drop_constraint(constraint, "equipment", type_="foreignkey")
    for column in (
        "service_vendor_id", "electrical_branch", "criticality",
        "parent_equipment_id", "location_id", "discipline_id",
    ):
        op.drop_column("equipment", column)

    op.drop_table("vendor_contract_assets")
    op.drop_table("vendor_contracts")
    op.drop_table("vendor_credentials")
    op.drop_table("vendor_contacts")
    op.drop_table("vendors")

    op.drop_index("ix_locations_floor_plan_id", table_name="locations")
    op.drop_constraint("fk_locations_floor_plan_id", "locations", type_="foreignkey")
    op.drop_column("locations", "floor_plan_id")

    op.drop_table("floor_plans")
    op.drop_table("locations")
    op.drop_table("user_disciplines")
    op.drop_table("disciplines")
