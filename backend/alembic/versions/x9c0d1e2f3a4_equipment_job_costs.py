"""Labour and parts cost on equipment jobs, and major work

Revision ID: x9c0d1e2f3a4
Revises: w8b9c0d1e2f3
Create Date: 2026-09-15

Service and inspection jobs record what they cost in labour and in parts; their
sum goes in the existing total_cost, which spend reporting already reads. A
service can be marked major work, whose cost is capital: it is posted to the
asset ledger as an improvement and depreciated rather than counted as running
cost.

Equipment cost needs no new column. The total stays in equipment.cost, where
depreciation reads it, and the price of one item is that total divided by the
quantity.

Checks before each step, like the migrations before it.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "x9c0d1e2f3a4"
down_revision: Union[str, Sequence[str], None] = "w8b9c0d1e2f3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("service_requests")}
    if "labour_cost" not in columns:
        op.add_column("service_requests", sa.Column("labour_cost", sa.Numeric(12, 2), nullable=True))
    if "parts_cost" not in columns:
        op.add_column("service_requests", sa.Column("parts_cost", sa.Numeric(12, 2), nullable=True))
    if "is_major_work" not in columns:
        op.add_column("service_requests", sa.Column("is_major_work", sa.Boolean(), nullable=False,
                                                    server_default=sa.false()))


def downgrade() -> None:
    for column in ("is_major_work", "parts_cost", "labour_cost"):
        op.drop_column("service_requests", column)
