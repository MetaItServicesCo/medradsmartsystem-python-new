"""Employee tracking, merged in from Tracker: switches, consent, devices, evidence

Revision ID: b3e8f1a5c7d2
Revises: a7d2e9c4b1f6
Create Date: 2026-11-06

A super admin switches tracking on per person (desktop activity, location,
screen view); the person consents before anything is collected; their desktop
agent or phone signs in as a device. Kept as evidence for HR: activity blocks
(apps, window titles, input counts - never content) and location thinned to a
point every few minutes. Collected only while checked in. New tables only;
nothing existing changes.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "b3e8f1a5c7d2"
down_revision: Union[str, Sequence[str], None] = "a7d2e9c4b1f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tracking_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("desktop_activity", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("location", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("screen_view", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("consent_version", sa.String(), nullable=True),
        sa.Column("consent_features", sa.JSON(), nullable=True),
        sa.Column("consent_at", sa.DateTime(), nullable=True),
        sa.Column("updated_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_tracking_settings_id", "tracking_settings", ["id"])
    op.create_index("ix_tracking_settings_user_id", "tracking_settings", ["user_id"], unique=True)

    op.create_table(
        "tracking_devices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("os_name", sa.String(length=64), nullable=True),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("password_version", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_tracking_devices_id", "tracking_devices", ["id"])
    op.create_index("ix_tracking_devices_user_id", "tracking_devices", ["user_id"])
    op.create_index("ix_tracking_devices_token_hash", "tracking_devices", ["token_hash"], unique=True)

    op.create_table(
        "tracking_activity_blocks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("device_id", sa.Integer(), sa.ForeignKey("tracking_devices.id", ondelete="SET NULL"), nullable=True),
        sa.Column("local_day", sa.Date(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("ended_at", sa.DateTime(), nullable=False),
        sa.Column("app", sa.String(length=128), nullable=False),
        sa.Column("titles", sa.JSON(), nullable=False),
        sa.Column("minutes", sa.Integer(), nullable=False),
        sa.Column("tz", sa.String(length=64), nullable=True),
        sa.Column("keys", sa.Integer(), nullable=False),
        sa.Column("clicks", sa.Integer(), nullable=False),
        sa.Column("scrolls", sa.Integer(), nullable=False),
        sa.Column("mouse_px", sa.Integer(), nullable=False),
        sa.Column("active_samples", sa.Integer(), nullable=False),
        sa.Column("samples", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("user_id", "local_day", "started_at", "app", name="uq_tracking_block"),
    )
    op.create_index("ix_tracking_activity_blocks_id", "tracking_activity_blocks", ["id"])
    op.create_index("ix_tracking_blocks_user_day", "tracking_activity_blocks", ["user_id", "local_day"])

    op.create_table(
        "tracking_location_samples",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("device_id", sa.Integer(), sa.ForeignKey("tracking_devices.id", ondelete="SET NULL"), nullable=True),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lon", sa.Float(), nullable=False),
        sa.Column("accuracy_m", sa.Float(), nullable=True),
        sa.Column("speed_mps", sa.Float(), nullable=True),
        sa.Column("heading_deg", sa.Float(), nullable=True),
        sa.Column("recorded_at", sa.DateTime(), nullable=False),
        sa.Column("received_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_tracking_location_samples_id", "tracking_location_samples", ["id"])
    op.create_index("ix_tracking_location_user_time", "tracking_location_samples", ["user_id", "recorded_at"])


def downgrade() -> None:
    op.drop_table("tracking_location_samples")
    op.drop_table("tracking_activity_blocks")
    op.drop_table("tracking_devices")
    op.drop_table("tracking_settings")
