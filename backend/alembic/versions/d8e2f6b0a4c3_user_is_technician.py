"""Let any staff user also work as a technician

Revision ID: d8e2f6b0a4c3
Revises: c7d1e5a9b3f2
Create Date: 2026-10-31

One column, users.is_technician, false for everyone. Purely additive: no
existing column, value or permission changes, so after this migration every
user behaves exactly as before until someone ticks the box.

Idempotent like its neighbours, because this database has been built both by
migrating through and by create_all() then stamping.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d8e2f6b0a4c3"
down_revision: Union[str, Sequence[str], None] = "c7d1e5a9b3f2"
branch_labels = None
depends_on = None


def _columns() -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns("users")}


def upgrade() -> None:
    if "is_technician" not in _columns():
        op.add_column(
            "users",
            sa.Column("is_technician", sa.Boolean(), nullable=False, server_default=sa.false()),
        )


def downgrade() -> None:
    if "is_technician" in _columns():
        op.drop_column("users", "is_technician")
