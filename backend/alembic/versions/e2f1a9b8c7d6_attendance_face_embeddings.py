"""attendance face embeddings

Revision ID: e2f1a9b8c7d6
Revises: 9c8d7e6f5a40
Create Date: 2026-06-10 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e2f1a9b8c7d6"
down_revision: Union[str, Sequence[str], None] = "9c8d7e6f5a40"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def _column_exists(table_name: str, column_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return column_name in {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def _add_column_if_missing(table_name: str, column: sa.Column) -> None:
    if _table_exists(table_name) and not _column_exists(table_name, column.name):
        op.add_column(table_name, column)


def upgrade() -> None:
    _add_column_if_missing("attendance_profiles", sa.Column("face_embedding", sa.JSON(), nullable=True))
    _add_column_if_missing("attendance_face_samples", sa.Column("embedding", sa.JSON(), nullable=True))


def downgrade() -> None:
    if _column_exists("attendance_face_samples", "embedding"):
        op.drop_column("attendance_face_samples", "embedding")
    if _column_exists("attendance_profiles", "face_embedding"):
        op.drop_column("attendance_profiles", "face_embedding")
