"""Payment proofs sent through an invoice link

Revision ID: e8c4f2a6b9d1
Revises: d7b3e1a9c2f4
Create Date: 2026-11-17

A customer paying a service or inspection invoice through its link can report
an ACH, MBMTS ACH or cheque payment for staff to check. They are not signed
in, so the proof records who they said they are instead of a user. Every
existing proof keeps its user; nothing about them changes.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "e8c4f2a6b9d1"
down_revision: Union[str, Sequence[str], None] = "d7b3e1a9c2f4"
branch_labels = None
depends_on = None

TABLE = "payment_proofs"
NEW_COLUMNS = (
    # "payment_link" for one sent through an invoice link; empty when signed in.
    ("submitted_via", sa.String(length=20)),
    ("payer_name", sa.String(length=200)),
    ("payer_email", sa.String(length=320)),
    # The cheque or transaction number the payer gave.
    ("payer_reference", sa.String(length=100)),
)


def _columns() -> dict[str, dict]:
    return {item["name"]: item for item in sa.inspect(op.get_bind()).get_columns(TABLE)}


def upgrade() -> None:
    columns = _columns()
    for name, type_ in NEW_COLUMNS:
        if name not in columns:
            op.add_column(TABLE, sa.Column(name, type_, nullable=True))
    if not columns["submitted_by_id"]["nullable"]:
        # Batch mode: a plain ALTER on PostgreSQL; a table rebuild where SQLite needs one.
        with op.batch_alter_table(TABLE) as batch:
            batch.alter_column("submitted_by_id", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    from_links = op.get_bind().execute(
        sa.text(f"SELECT COUNT(*) FROM {TABLE} WHERE submitted_by_id IS NULL")
    ).scalar()
    if from_links:
        raise RuntimeError(
            f"{from_links} payment proof(s) were sent through an invoice link and have no user; "
            "they would be lost. Not downgrading."
        )
    columns = _columns()
    if columns["submitted_by_id"]["nullable"]:
        with op.batch_alter_table(TABLE) as batch:
            batch.alter_column("submitted_by_id", existing_type=sa.Integer(), nullable=False)
    for name, _type in reversed(NEW_COLUMNS):
        if name in columns:
            op.drop_column(TABLE, name)
