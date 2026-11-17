"""Rental and lease-to-own drafts saved however much is filled in

Revision ID: f2a7c9d4e1b3
Revises: e8c4f2a6b9d1
Create Date: 2026-11-17

"Save as Draft" saves an agreement however much of it is filled in.

* A rental agreement's start and end dates may not be known yet. Creating or
  activating a live agreement still requires both.
* A lease-to-own draft may not have its product or terms yet, so it has no
  price or schedule until it does. Sending it still requires them.

Only drafts can leave these empty; every existing row keeps its values.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "f2a7c9d4e1b3"
down_revision: Union[str, Sequence[str], None] = "e8c4f2a6b9d1"
branch_labels = None
depends_on = None

MONEY = sa.Numeric(12, 2)
COLUMNS = {
    "rentals": {"start_date": sa.Date(), "end_date": sa.Date()},
    "lease_agreements": {
        "item_description": sa.Text(),
        "unit_cash_price": MONEY,
        "cash_price": MONEY,
        "lease_price": MONEY,
        "tax_rate_percent": sa.Numeric(5, 2),
        "installment_count": sa.Integer(),
        "first_due_date": sa.Date(),
        "regular_installment": MONEY,
        "total_tax": MONEY,
        "total_of_payments": MONEY,
    },
}


def _nullable(table: str) -> dict[str, bool]:
    return {item["name"]: item["nullable"] for item in sa.inspect(op.get_bind()).get_columns(table)}


def _set_nullable(table: str, columns: dict, nullable: bool) -> None:
    current = _nullable(table)
    changing = {name: type_ for name, type_ in columns.items() if bool(current[name]) != nullable}
    if not changing:
        return
    # Batch mode: a plain ALTER on PostgreSQL; a table rebuild where SQLite needs one.
    with op.batch_alter_table(table) as batch:
        for name, type_ in changing.items():
            batch.alter_column(name, existing_type=type_, nullable=nullable)


def upgrade() -> None:
    for table, columns in COLUMNS.items():
        _set_nullable(table, columns, True)


def downgrade() -> None:
    bind = op.get_bind()
    for table, columns in COLUMNS.items():
        empty = bind.execute(sa.text(
            f"SELECT COUNT(*) FROM {table} WHERE " + " OR ".join(f"{name} IS NULL" for name in columns)
        )).scalar()
        if empty:
            raise RuntimeError(
                f"{empty} draft(s) in {table} were saved incomplete; complete or delete them before downgrading."
            )
    for table, columns in COLUMNS.items():
        _set_nullable(table, columns, False)
