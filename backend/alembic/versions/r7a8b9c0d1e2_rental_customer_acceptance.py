"""rental customer acceptance and saved card consent

Revision ID: r7a8b9c0d1e2
Revises: p5e6f7a8b9c0
Create Date: 2026-08-04
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "r7a8b9c0d1e2"
down_revision: Union[str, Sequence[str], None] = "p5e6f7a8b9c0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("rentals", sa.Column("revision", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("rentals", sa.Column("square_card_brand", sa.String(), nullable=True))
    op.add_column("rentals", sa.Column("square_card_last4", sa.String(), nullable=True))
    op.add_column("rentals", sa.Column("square_card_exp_month", sa.Integer(), nullable=True))
    op.add_column("rentals", sa.Column("square_card_exp_year", sa.Integer(), nullable=True))
    op.add_column("rentals", sa.Column("auto_charge_authorized_at", sa.DateTime(), nullable=True))
    op.add_column("rentals", sa.Column("auto_charge_authorized_by", sa.String(), nullable=True))

    # Existing auto-charge agreements were created under the previous explicit
    # staff workflow. Preserve those schedules rather than silently disabling
    # recurring billing when the new consent metadata is introduced.
    op.execute(
        sa.text(
            """
            UPDATE rentals
            SET auto_charge_authorized_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP),
                auto_charge_authorized_by = 'Existing authorization (migrated)'
            WHERE auto_charge = TRUE AND square_card_id IS NOT NULL
            """
        )
    )

    op.create_table(
        "rental_agreement_acceptances",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("rental_id", sa.Integer(), nullable=False),
        sa.Column("accepted_by_name", sa.String(), nullable=False),
        sa.Column("signature_name", sa.String(), nullable=False),
        sa.Column("terms_accepted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("agreement_revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("agreement_snapshot", sa.JSON(), nullable=False),
        sa.Column("pricing_snapshot", sa.JSON(), nullable=False),
        sa.Column("ip_address", sa.String(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("accepted_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["rental_id"], ["rentals.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("rental_id", name="uq_rental_acceptance_rental"),
    )
    op.create_index("ix_rental_agreement_acceptances_id", "rental_agreement_acceptances", ["id"])
    op.create_index("ix_rental_agreement_acceptances_rental_id", "rental_agreement_acceptances", ["rental_id"])
    op.create_index("ix_rental_agreement_acceptances_accepted_at", "rental_agreement_acceptances", ["accepted_at"])


def downgrade() -> None:
    op.drop_index("ix_rental_agreement_acceptances_accepted_at", table_name="rental_agreement_acceptances")
    op.drop_index("ix_rental_agreement_acceptances_rental_id", table_name="rental_agreement_acceptances")
    op.drop_index("ix_rental_agreement_acceptances_id", table_name="rental_agreement_acceptances")
    op.drop_table("rental_agreement_acceptances")
    op.drop_column("rentals", "auto_charge_authorized_by")
    op.drop_column("rentals", "auto_charge_authorized_at")
    op.drop_column("rentals", "square_card_exp_year")
    op.drop_column("rentals", "square_card_exp_month")
    op.drop_column("rentals", "square_card_last4")
    op.drop_column("rentals", "square_card_brand")
    op.drop_column("rentals", "revision")
