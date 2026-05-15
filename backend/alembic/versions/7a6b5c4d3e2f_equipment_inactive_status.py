"""equipment inactive status

Revision ID: 7a6b5c4d3e2f
Revises: 0f4c2a8d9b71
Create Date: 2026-05-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "7a6b5c4d3e2f"
down_revision: Union[str, Sequence[str], None] = "0f4c2a8d9b71"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE equipmentstatus ADD VALUE IF NOT EXISTS 'INACTIVE'")


def downgrade() -> None:
    # PostgreSQL enum values cannot be removed safely without recreating the type.
    pass
