"""Let an inspection form be archived

Forms accumulate. Drafts, duplicates and the one somebody made to try
something out sit in the picker forever because there has never been a way to
remove them.

Deleting is only sometimes the right answer. Inspection.form_template_id and
InspectionBatch.form_template_id are both NOT NULL, so a form any inspection was
ever run against cannot be removed without either being refused by Postgres or
destroying the ability to open those inspections. Archiving is the answer for
those: out of the picker, still on disk, history intact.

One nullable timestamp rather than a boolean, because "when was this archived"
is free to keep and impossible to reconstruct later.

Revision ID: n9e0f1a2b3c4
Revises: m8d9e0f1a2b3
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "n9e0f1a2b3c4"
down_revision: Union[str, Sequence[str], None] = "m8d9e0f1a2b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nullable with no default: every existing form stays exactly as it is,
    # visible and unarchived, which is what it was the moment before this ran.
    op.add_column(
        "inspection_forms",
        sa.Column("archived_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("inspection_forms", "archived_at")
