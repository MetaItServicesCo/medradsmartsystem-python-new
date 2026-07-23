"""add invoice billing approval workflow

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e3f4a5b6c7d8"
down_revision: Union[str, Sequence[str], None] = "d2e3f4a5b6c7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_columns = {column["name"] for column in inspector.get_columns("invoices")}
    added_approval_status = "billing_approval_status" not in existing_columns

    columns = {
        "billing_approval_status": sa.Column(
            "billing_approval_status",
            sa.String(),
            nullable=True,
        ),
        "approved_for_billing_by_id": sa.Column(
            "approved_for_billing_by_id", sa.Integer(), nullable=True
        ),
        "approved_for_billing_at": sa.Column(
            "approved_for_billing_at", sa.DateTime(), nullable=True
        ),
        "approved_total_amount": sa.Column(
            "approved_total_amount", sa.Numeric(10, 2), nullable=True
        ),
        "approval_invalidated_at": sa.Column(
            "approval_invalidated_at", sa.DateTime(), nullable=True
        ),
    }
    for name, column in columns.items():
        if name not in existing_columns:
            op.add_column("invoices", column)

    inspector = sa.inspect(bind)
    foreign_keys = inspector.get_foreign_keys("invoices")
    has_approval_fk = any(
        fk.get("constrained_columns") == ["approved_for_billing_by_id"]
        for fk in foreign_keys
    )
    if not has_approval_fk:
        op.create_foreign_key(
            "fk_invoices_approved_for_billing_by_id_users",
            "invoices",
            "users",
            ["approved_for_billing_by_id"],
            ["id"],
            ondelete="SET NULL",
        )
    indexes = {index["name"] for index in inspector.get_indexes("invoices")}
    if "ix_invoices_billing_approval_status" not in indexes:
        op.create_index(
            "ix_invoices_billing_approval_status",
            "invoices",
            ["billing_approval_status"],
        )

    # Preserve all existing production billing workflows. Only invoices
    # generated after this deployment begin in the pending approval state.
    if added_approval_status:
        op.execute(
            """
            UPDATE invoices
            SET billing_approval_status = 'approved',
                approved_for_billing_at = COALESCE(updated_at, created_at),
                approved_total_amount = total_amount
            WHERE billing_approval_status IS NULL
            """
        )
    else:
        op.execute(
            "UPDATE invoices SET billing_approval_status = 'pending' "
            "WHERE billing_approval_status IS NULL"
        )
    op.alter_column(
        "invoices",
        "billing_approval_status",
        existing_type=sa.String(),
        nullable=False,
        server_default="pending",
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    indexes = {index["name"] for index in inspector.get_indexes("invoices")}
    if "ix_invoices_billing_approval_status" in indexes:
        op.drop_index("ix_invoices_billing_approval_status", table_name="invoices")

    approval_fk = next(
        (
            fk
            for fk in inspector.get_foreign_keys("invoices")
            if fk.get("constrained_columns") == ["approved_for_billing_by_id"]
        ),
        None,
    )
    if approval_fk and approval_fk.get("name"):
        op.drop_constraint(approval_fk["name"], "invoices", type_="foreignkey")

    existing_columns = {column["name"] for column in inspector.get_columns("invoices")}
    for column_name in [
        "approval_invalidated_at",
        "approved_total_amount",
        "approved_for_billing_at",
        "approved_for_billing_by_id",
        "billing_approval_status",
    ]:
        if column_name in existing_columns:
            op.drop_column("invoices", column_name)
