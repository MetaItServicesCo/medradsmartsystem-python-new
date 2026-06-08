"""smart attendance

Revision ID: 7b9c1d2e3f40
Revises: 6e2a91bd5f30
Create Date: 2026-06-08 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "7b9c1d2e3f40"
down_revision: Union[str, Sequence[str], None] = "6e2a91bd5f30"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


attendance_face_status = sa.Enum("NOT_ENROLLED", "ENROLLED", "NEEDS_RETRAIN", name="attendancefacestatus")
attendance_event_type = sa.Enum("CHECK_IN", "CHECK_OUT", "BREAK_START", "BREAK_END", name="attendanceeventtype")
attendance_source = sa.Enum("MANUAL", "FACE", "ADMIN", name="attendancesource")
attendance_verification_status = sa.Enum("VERIFIED", "NEEDS_REVIEW", "REJECTED", name="attendanceverificationstatus")


def _table_exists(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def _index_exists(table_name: str, index_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return any(index["name"] == index_name for index in sa.inspect(op.get_bind()).get_indexes(table_name))


def _create_index_if_missing(index_name: str, table_name: str, columns: list[str], unique: bool = False) -> None:
    if _table_exists(table_name) and not _index_exists(table_name, index_name):
        op.create_index(index_name, table_name, columns, unique=unique)


def upgrade() -> None:
    bind = op.get_bind()
    attendance_face_status.create(bind, checkfirst=True)
    attendance_event_type.create(bind, checkfirst=True)
    attendance_source.create(bind, checkfirst=True)
    attendance_verification_status.create(bind, checkfirst=True)

    if not _table_exists("attendance_profiles"):
        op.create_table(
            "attendance_profiles",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("facility_id", sa.Integer(), nullable=True),
            sa.Column("employee_code", sa.String(), nullable=True),
            sa.Column("face_status", attendance_face_status, nullable=False),
            sa.Column("face_samples_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("face_model_version", sa.String(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
    _create_index_if_missing("ix_attendance_profiles_id", "attendance_profiles", ["id"])
    _create_index_if_missing("ix_attendance_profiles_user_id", "attendance_profiles", ["user_id"], unique=True)
    _create_index_if_missing("ix_attendance_profiles_facility_id", "attendance_profiles", ["facility_id"])
    _create_index_if_missing("ix_attendance_profiles_employee_code", "attendance_profiles", ["employee_code"], unique=True)

    if not _table_exists("attendance_face_samples"):
        op.create_table(
            "attendance_face_samples",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("profile_id", sa.Integer(), nullable=False),
            sa.Column("image_url", sa.String(), nullable=False),
            sa.Column("quality_score", sa.Float(), nullable=True),
            sa.Column("captured_by_id", sa.Integer(), nullable=True),
            sa.Column("captured_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["captured_by_id"], ["users.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["profile_id"], ["attendance_profiles.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
    _create_index_if_missing("ix_attendance_face_samples_id", "attendance_face_samples", ["id"])
    _create_index_if_missing("ix_attendance_face_samples_profile_id", "attendance_face_samples", ["profile_id"])

    if not _table_exists("attendance_events"):
        op.create_table(
            "attendance_events",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("profile_id", sa.Integer(), nullable=True),
            sa.Column("facility_id", sa.Integer(), nullable=True),
            sa.Column("event_type", attendance_event_type, nullable=False),
            sa.Column("event_time", sa.DateTime(), nullable=False),
            sa.Column("timezone", sa.String(), nullable=False),
            sa.Column("source", attendance_source, nullable=False),
            sa.Column("verification_status", attendance_verification_status, nullable=False),
            sa.Column("confidence", sa.Float(), nullable=True),
            sa.Column("remark", sa.String(), nullable=True),
            sa.Column("device_label", sa.String(), nullable=True),
            sa.Column("image_url", sa.String(), nullable=True),
            sa.Column("created_by_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["profile_id"], ["attendance_profiles.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
    _create_index_if_missing("ix_attendance_events_id", "attendance_events", ["id"])
    _create_index_if_missing("ix_attendance_events_user_id", "attendance_events", ["user_id"])
    _create_index_if_missing("ix_attendance_events_profile_id", "attendance_events", ["profile_id"])
    _create_index_if_missing("ix_attendance_events_facility_id", "attendance_events", ["facility_id"])
    _create_index_if_missing("ix_attendance_events_event_type", "attendance_events", ["event_type"])
    _create_index_if_missing("ix_attendance_events_event_time", "attendance_events", ["event_time"])


def downgrade() -> None:
    for table_name in ["attendance_events", "attendance_face_samples", "attendance_profiles"]:
        if _table_exists(table_name):
            op.drop_table(table_name)

    bind = op.get_bind()
    attendance_verification_status.drop(bind, checkfirst=True)
    attendance_source.drop(bind, checkfirst=True)
    attendance_event_type.drop(bind, checkfirst=True)
    attendance_face_status.drop(bind, checkfirst=True)
