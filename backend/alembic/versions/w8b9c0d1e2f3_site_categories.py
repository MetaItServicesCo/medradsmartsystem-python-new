"""Site categories and equipment maintenance

Revision ID: w8b9c0d1e2f3
Revises: v7a8b9c0d1e2
Create Date: 2026-09-15

The simple register: a site's equipment under Electrical, Plumbing,
Mechanical and HVAC, each with a name, a type, how many, what condition it is
in and where exactly it is. Service and inspection jobs on that equipment are
ordinary work orders, which gain a due date, notes and an inspection result.

HVAC becomes its own category, so the "Mechanical / HVAC" discipline is renamed
"Mechanical" and an "hvac" discipline is added. The four category disciplines
are inserted when missing: a database built with create_all() has the table
but none of the rows the original facilities migration seeded.

Every step checks before it acts, because servers set up with create_all()
after these models changed already have some of it.
"""
from datetime import datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "w8b9c0d1e2f3"
down_revision: Union[str, Sequence[str], None] = "v7a8b9c0d1e2"
branch_labels = None
depends_on = None


CATEGORY_DISCIPLINES = (
    ("mechanical", "Mechanical", "#0EA5E9", "Lifts, boilers, compressors, vacuum pumps, medical gas, fire pumps", 10),
    ("hvac", "HVAC", "#14B8A6", "Chillers, air handling, fan coils, AC units, cooling towers, exhaust", 15),
    ("electrical", "Electrical", "#F59E0B", "Distribution, panels, generators, transfer switches, lighting", 20),
    ("plumbing", "Plumbing", "#3B82F6", "Domestic water, sanitary, storm, backflow, water heaters", 30),
)


def _columns(table: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table)}


def _indexes(table: str) -> set[str]:
    return {index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table)}


def upgrade() -> None:
    equipment = _columns("equipment")
    if "name" not in equipment:
        op.add_column("equipment", sa.Column("name", sa.String(length=160), nullable=True))
    if "equipment_type" not in equipment:
        op.add_column("equipment", sa.Column("equipment_type", sa.String(length=80), nullable=True))
    if "quantity" not in equipment:
        op.add_column("equipment", sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"))
    if "building" not in equipment:
        op.add_column("equipment", sa.Column("building", sa.String(length=120), nullable=True))
    if "floor" not in equipment:
        op.add_column("equipment", sa.Column("floor", sa.String(length=80), nullable=True))
    if "condition" not in equipment:
        op.add_column("equipment", sa.Column("condition", sa.String(length=24), nullable=True))
    if "ix_equipment_name" not in _indexes("equipment"):
        op.create_index("ix_equipment_name", "equipment", ["name"])

    work_orders = _columns("service_requests")
    if "due_on" not in work_orders:
        op.add_column("service_requests", sa.Column("due_on", sa.Date(), nullable=True))
    if "notes" not in work_orders:
        op.add_column("service_requests", sa.Column("notes", sa.Text(), nullable=True))
    if "inspection_result" not in work_orders:
        op.add_column("service_requests", sa.Column("inspection_result", sa.String(length=8), nullable=True))
    if "findings" not in work_orders:
        op.add_column("service_requests", sa.Column("findings", sa.Text(), nullable=True))
    if "ix_service_requests_due_on" not in _indexes("service_requests"):
        op.create_index("ix_service_requests_due_on", "service_requests", ["due_on"])

    bind = op.get_bind()
    # Only the name the migration itself seeded: an admin who already renamed
    # the discipline has chosen what it is called.
    bind.execute(
        sa.text("UPDATE disciplines SET name = 'Mechanical', description = :description, updated_at = :now "
                "WHERE code = 'mechanical' AND name = 'Mechanical / HVAC'"),
        {"description": CATEGORY_DISCIPLINES[0][3], "now": datetime.utcnow()},
    )
    existing = {code for (code,) in bind.execute(sa.text("SELECT code FROM disciplines"))}
    for code, name, colour, description, order in CATEGORY_DISCIPLINES:
        if code in existing:
            continue
        now = datetime.utcnow()
        bind.execute(
            sa.text("INSERT INTO disciplines (code, name, color, description, sort_order, is_active, "
                    "created_at, updated_at) VALUES (:code, :name, :color, :description, :sort_order, "
                    "true, :now, :now)"),
            {"code": code, "name": name, "color": colour, "description": description,
             "sort_order": order, "now": now},
        )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text("DELETE FROM disciplines WHERE code = 'hvac'"))
    bind.execute(sa.text("UPDATE disciplines SET name = 'Mechanical / HVAC' "
                         "WHERE code = 'mechanical' AND name = 'Mechanical'"))

    op.drop_index("ix_service_requests_due_on", table_name="service_requests")
    for column in ("findings", "inspection_result", "notes", "due_on"):
        op.drop_column("service_requests", column)

    op.drop_index("ix_equipment_name", table_name="equipment")
    for column in ("condition", "floor", "building", "quantity", "equipment_type", "name"):
        op.drop_column("equipment", column)
