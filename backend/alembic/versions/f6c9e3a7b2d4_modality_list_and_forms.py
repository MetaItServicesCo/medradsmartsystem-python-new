"""Modalities: the current list and the old list, and a form for each type

Revision ID: f6c9e3a7b2d4
Revises: e5b8d2f4a6c1
Create Date: 2026-11-11

Two columns and one rule. Nothing about how anything works changes until the
new list is put in place (app/scripts/apply_modality_list.py):

- is_legacy: the old list, kept on the assets that use it but not offered for
  new assets. Every existing modality starts as not old, exactly as today.
- inspection_form_id: the form a new asset of that type gets. Empty for every
  existing modality.
- A name only has to be unique within its modality and its list, instead of
  across all modalities, so the new list can reuse old names and "Laser
  System" can sit under two modalities. Existing names are all unique, so
  they satisfy the new rule.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "f6c9e3a7b2d4"
down_revision: Union[str, Sequence[str], None] = "e5b8d2f4a6c1"
branch_labels = None
depends_on = None


def _name_only_unique_rules(bind) -> tuple[list[str], list[str]]:
    """The unique constraints and unique indexes on modalities(name) alone, by
    their real names: the first migration left the constraint unnamed, so the
    database named it, and a database built another way may differ."""
    inspector = sa.inspect(bind)
    constraints = [c["name"] for c in inspector.get_unique_constraints("modalities") if c.get("column_names") == ["name"] and c.get("name")]
    # Postgres also lists the index behind a unique constraint; dropping the
    # constraint drops that index, so only a stand-alone unique index is dropped.
    indexes = [
        i["name"] for i in inspector.get_indexes("modalities")
        if i.get("unique") and i.get("column_names") == ["name"] and i.get("name")
        and i["name"] not in constraints and not i.get("duplicates_constraint")
    ]
    return constraints, indexes


def upgrade() -> None:
    bind = op.get_bind()
    op.add_column("modalities", sa.Column("is_legacy", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("modalities", sa.Column("inspection_form_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_modalities_inspection_form_id", "modalities", "inspection_forms",
        ["inspection_form_id"], ["id"], ondelete="SET NULL",
    )
    constraints, indexes = _name_only_unique_rules(bind)
    for name in constraints:
        op.drop_constraint(name, "modalities", type_="unique")
    for name in indexes:
        op.drop_index(name, table_name="modalities")
    op.execute(
        "CREATE UNIQUE INDEX uq_modalities_list_parent_name "
        "ON modalities (is_legacy, coalesce(parent_id, 0), name)"
    )


def downgrade() -> None:
    bind = op.get_bind()
    op.execute("DROP INDEX IF EXISTS uq_modalities_list_parent_name")
    op.drop_constraint("fk_modalities_inspection_form_id", "modalities", type_="foreignkey")
    op.drop_column("modalities", "inspection_form_id")
    op.drop_column("modalities", "is_legacy")
    # Names were unique across all modalities before. Put that back only if
    # they still are; once the new list is in, the old and new lists share
    # names, and the rule cannot come back without renaming one of them.
    duplicates = bind.execute(sa.text("SELECT name FROM modalities GROUP BY name HAVING count(*) > 1 LIMIT 1")).first()
    if duplicates is None:
        op.create_unique_constraint("modalities_name_key", "modalities", ["name"])
