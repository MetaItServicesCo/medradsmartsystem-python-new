"""service request workflow statuses

Revision ID: f7a8b9c0d1e2
Revises: e1f2a3b4c5d6
Create Date: 2026-07-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "f7a8b9c0d1e2"
down_revision: Union[str, Sequence[str], None] = "e1f2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


NEW_STATUS_VALUES = [
    "WAITING_ON_PARTS",
    "WAITING_FOR_APPROVAL",
    "WAITING_FOR_DEPOT_REPAIR",
    "WAITING_FOR_VENDOR_REPAIR",
]


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for value in NEW_STATUS_VALUES:
            op.execute(f"ALTER TYPE servicerequeststatus ADD VALUE IF NOT EXISTS '{value}'")


def downgrade() -> None:
    # PostgreSQL enum values cannot be removed safely without rebuilding the type.
    pass
