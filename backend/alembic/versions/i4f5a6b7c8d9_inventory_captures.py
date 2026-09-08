"""Inventory captures: photograph a part now, describe it later

Rapid intake from a phone. Each capture gets a code the moment the shutter
fires and becomes a draft nobody has to complete on the spot; the details are
filled in afterwards, from a desk, by someone who can type.

Deliberately its own table rather than a draft state on inventory_parts. A
draft flag there would leak into every existing list, count, summary and CSV
export -- silently, and everywhere -- because none of those queries know to
exclude it. Nothing in this migration touches an existing table, so nothing
that works today can behave differently tomorrow.

The columns for what a label says (barcode, lot, expiry, serial, OCR text) are
created now and written by nothing yet. Reading labels comes later; adding the
columns then would be a second migration for no reason.

Revision ID: i4f5a6b7c8d9
Revises: h3e4f5a6b7c8
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "i4f5a6b7c8d9"
down_revision: Union[str, Sequence[str], None] = "h3e4f5a6b7c8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "inventory_captures",
        sa.Column("id", sa.Integer(), nullable=False),
        # Ours, assigned at capture, unique for the life of the system. This is
        # the thing a label would carry if one is ever printed.
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("facility_id", sa.Integer(), nullable=True),
        sa.Column("captured_by_id", sa.Integer(), nullable=True),
        # draft -> confirmed (a part exists) or discarded.
        sa.Column("status", sa.String(length=16), nullable=False, server_default="draft"),
        sa.Column("photo_path", sa.String(length=512), nullable=True),
        sa.Column("photo_mime", sa.String(length=64), nullable=True),
        # What someone typed while standing in front of it, which is usually
        # very little and occasionally the only thing that identifies it.
        sa.Column("label", sa.String(length=255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        # What the label said. Suggestions, never truths: filled by a reader
        # that does not exist yet, and always subject to confirmation.
        sa.Column("barcode_raw", sa.Text(), nullable=True),
        sa.Column("gtin", sa.String(length=32), nullable=True),
        sa.Column("lot", sa.String(length=64), nullable=True),
        sa.Column("expiry_date", sa.Date(), nullable=True),
        sa.Column("serial_number", sa.String(length=128), nullable=True),
        sa.Column("ocr_text", sa.Text(), nullable=True),
        sa.Column("extraction_status", sa.String(length=16), nullable=False, server_default="pending"),
        # Set once the draft becomes a real part, so a capture can always be
        # traced to what it became.
        sa.Column("part_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["captured_by_id"], ["users.id"], ondelete="SET NULL"),
        # A confirmed capture keeps pointing at its part; deleting the part
        # leaves the capture as the record that it once existed.
        sa.ForeignKeyConstraint(["part_id"], ["inventory_parts.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_inventory_captures_code", "inventory_captures", ["code"], unique=True)
    op.create_index("ix_inventory_captures_status", "inventory_captures", ["status"])
    op.create_index("ix_inventory_captures_facility", "inventory_captures", ["facility_id"])
    # The review queue is "my drafts, newest first", so it is worth an index.
    op.create_index(
        "ix_inventory_captures_captured_by_created",
        "inventory_captures",
        ["captured_by_id", "created_at"],
    )
    op.create_index("ix_inventory_captures_gtin", "inventory_captures", ["gtin"])


def downgrade() -> None:
    op.drop_index("ix_inventory_captures_gtin", table_name="inventory_captures")
    op.drop_index("ix_inventory_captures_captured_by_created", table_name="inventory_captures")
    op.drop_index("ix_inventory_captures_facility", table_name="inventory_captures")
    op.drop_index("ix_inventory_captures_status", table_name="inventory_captures")
    op.drop_index("ix_inventory_captures_code", table_name="inventory_captures")
    op.drop_table("inventory_captures")
