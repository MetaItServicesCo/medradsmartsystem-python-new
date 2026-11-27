"""Lead source URL

Revision ID: d7e3a9c5b2f1
Revises: c4d9e2f7a1b3
Create Date: 2026-11-28

A lead that came from a website says which one: adds leads.source_url
(empty for every existing lead, and for any lead whose source is not
"website"). Nothing else changes.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "d7e3a9c5b2f1"
down_revision: Union[str, Sequence[str], None] = "c4d9e2f7a1b3"
branch_labels = None
depends_on = None


def _columns() -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns("leads")}


def upgrade() -> None:
    if "source_url" not in _columns():
        op.add_column("leads", sa.Column("source_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    if "source_url" in _columns():
        op.drop_column("leads", "source_url")
