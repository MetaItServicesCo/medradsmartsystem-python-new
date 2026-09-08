"""Part definitions: describe a kind of part once, count the units separately

Ten identical pumps are one description and ten physical objects. Writing the
description ten times is the waste this removes, and correcting it in ten
places afterwards is the bug it prevents: edit the definition and every unit
carries the change, because they were never separate copies to begin with.

It is also what makes recognition possible. Matching a photograph against every
unit means comparing against five hundred pictures of the same pump; matching
against definitions means comparing against one reference per kind. The split
is a requirement of the feature, not a tidiness exercise.

The embedding column is created and written by nothing. It is where a
photograph's vector will live when there is code to compute one. Postgres here
has no pgvector -- the stock image does not ship it -- so it is JSON, and
similarity is computed in Python. That is fine for thousands of definitions and
is the ceiling worth knowing about now rather than later.

Revision ID: j5a6b7c8d9e0
Revises: i4f5a6b7c8d9
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "j5a6b7c8d9e0"
down_revision: Union[str, Sequence[str], None] = "i4f5a6b7c8d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "part_definitions",
        sa.Column("id", sa.Integer(), nullable=False),
        # What someone would call it out loud, before anyone has filled in the
        # catalogue fields.
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("part_number", sa.String(length=255), nullable=True),
        sa.Column("part_type", sa.String(length=255), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("make", sa.String(length=255), nullable=True),
        sa.Column("model", sa.String(length=255), nullable=True),
        sa.Column("unit_price", sa.Numeric(10, 2), nullable=True),
        # The picture recognition compares against, and the vector it compares
        # with. Nothing writes the vector yet.
        sa.Column("reference_photo_path", sa.String(length=512), nullable=True),
        sa.Column("embedding", sa.JSON(), nullable=True),
        sa.Column("embedding_model", sa.String(length=64), nullable=True),
        # An exact code beats any visual guess, so it is matched first.
        sa.Column("gtin", sa.String(length=32), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_part_definitions_name", "part_definitions", ["name"])
    op.create_index("ix_part_definitions_gtin", "part_definitions", ["gtin"])
    op.create_index("ix_part_definitions_part_number", "part_definitions", ["part_number"])

    # Units point at their kind. Nullable because a capture can exist before
    # anyone has decided what it is, which is the whole point of capturing
    # first and describing later.
    op.add_column(
        "inventory_captures",
        sa.Column("definition_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_inventory_captures_definition",
        "inventory_captures",
        "part_definitions",
        ["definition_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_inventory_captures_definition",
        "inventory_captures",
        ["definition_id"],
    )
    # "How many of these do we have" is the question the capture screen asks on
    # every recognition, so it is worth answering from an index.
    op.create_index(
        "ix_inventory_captures_definition_status",
        "inventory_captures",
        ["definition_id", "status"],
    )


def downgrade() -> None:
    op.drop_index("ix_inventory_captures_definition_status", table_name="inventory_captures")
    op.drop_index("ix_inventory_captures_definition", table_name="inventory_captures")
    op.drop_constraint("fk_inventory_captures_definition", "inventory_captures", type_="foreignkey")
    op.drop_column("inventory_captures", "definition_id")
    op.drop_index("ix_part_definitions_part_number", table_name="part_definitions")
    op.drop_index("ix_part_definitions_gtin", table_name="part_definitions")
    op.drop_index("ix_part_definitions_name", table_name="part_definitions")
    op.drop_table("part_definitions")
