"""Inspection batches: a travel cost

Revision ID: a7e2c9d4f1b3
Revises: f6c9e3a7b2d4
Create Date: 2026-11-13

One empty column: the cost of the trip to the facility, billed once on the
batch invoice. Every existing batch starts with none, so no invoice changes.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "a7e2c9d4f1b3"
down_revision: Union[str, Sequence[str], None] = "f6c9e3a7b2d4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("inspection_batches")}
    if "travel_cost" not in columns:
        op.add_column("inspection_batches", sa.Column("travel_cost", sa.Numeric(12, 2), nullable=True))


def downgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("inspection_batches")}
    if "travel_cost" in columns:
        op.drop_column("inspection_batches", "travel_cost")
