"""add rental extension amendments

Revision ID: u0d1e2f3a4b5
Revises: t9c0d1e2f3a4
"""
from alembic import op
import sqlalchemy as sa

revision = "u0d1e2f3a4b5"
down_revision = "t9c0d1e2f3a4"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "rental_extension_requests",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("rental_id", sa.Integer(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="requested"),
        sa.Column("requested_end_date", sa.Date(), nullable=True),
        sa.Column("requested_additional_periods", sa.Integer(), nullable=True),
        sa.Column("request_reason", sa.Text(), nullable=True),
        sa.Column("requested_by_name", sa.String(), nullable=False),
        sa.Column("requested_by_user_id", sa.Integer(), nullable=True),
        sa.Column("requested_at", sa.DateTime(), nullable=False),
        sa.Column("original_end_date", sa.Date(), nullable=False),
        sa.Column("original_committed_periods", sa.Integer(), nullable=True),
        sa.Column("offered_end_date", sa.Date(), nullable=True),
        sa.Column("offered_total_periods", sa.Integer(), nullable=True),
        sa.Column("offered_terms", sa.Text(), nullable=True),
        sa.Column("offered_by_id", sa.Integer(), nullable=True),
        sa.Column("offered_at", sa.DateTime(), nullable=True),
        sa.Column("rejected_by_id", sa.Integer(), nullable=True),
        sa.Column("rejected_at", sa.DateTime(), nullable=True),
        sa.Column("decision_notes", sa.Text(), nullable=True),
        sa.Column("access_token_hash", sa.String(), nullable=True),
        sa.Column("token_expires_at", sa.DateTime(), nullable=True),
        sa.Column("portal_sent_at", sa.DateTime(), nullable=True),
        sa.Column("accepted_by_name", sa.String(), nullable=True),
        sa.Column("signature_name", sa.String(), nullable=True),
        sa.Column("terms_accepted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("continue_auto_charge", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("amendment_snapshot", sa.JSON(), nullable=True),
        sa.Column("ip_address", sa.String(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
        sa.Column("activated_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["rental_id"], ["rentals.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["requested_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["offered_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["rejected_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("rental_id", "sequence", name="uq_rental_extension_sequence"),
    )
    op.create_index("ix_rental_extension_requests_id", "rental_extension_requests", ["id"])
    op.create_index("ix_rental_extension_requests_rental_id", "rental_extension_requests", ["rental_id"])
    op.create_index("ix_rental_extension_requests_status", "rental_extension_requests", ["status"])
    op.create_index("ix_rental_extension_requests_access_token_hash", "rental_extension_requests", ["access_token_hash"], unique=True)
    op.create_index("ix_rental_extensions_rental_status", "rental_extension_requests", ["rental_id", "status"])


def downgrade():
    op.drop_table("rental_extension_requests")
