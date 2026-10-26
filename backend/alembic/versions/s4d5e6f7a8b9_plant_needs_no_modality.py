"""Plant needs a trade, not a clinical modality

Revision ID: s4d5e6f7a8b9
Revises: r3c4d5e6f7a8
Create Date: 2026-09-12

`equipment.modality_id` was NOT NULL because every asset used to be a medical
device, and modality — imaging, patient monitoring, laboratory, treatment — is
how those are classified. Since plant moved into the same table, registering a
lift has meant telling the system which kind of medical imaging it is.

That is not a small annoyance. It is the first thing anybody does when adding a
chiller, and it makes the product feel like it was built for something else.

A clinical asset still has a modality. A plant asset has a discipline, which
carries the routing, the default book life and the maintenance programme.
Requiring one or the other is the rule; requiring both was never sensible.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "s4d5e6f7a8b9"
down_revision: Union[str, Sequence[str], None] = "r3c4d5e6f7a8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "equipment", "modality_id",
        existing_type=sa.Integer(),
        nullable=True,
    )


def downgrade() -> None:
    # Anything registered as plant since the upgrade has no modality to restore,
    # so this would fail on a NOT NULL that no longer holds. Left deliberately
    # one-way rather than silently inventing a clinical classification for a
    # chiller.
    raise NotImplementedError(
        "Cannot restore NOT NULL on equipment.modality_id: plant assets "
        "registered since this migration have no modality."
    )
