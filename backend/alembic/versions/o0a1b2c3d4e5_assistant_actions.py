"""Record what the assistant changes, before it changes it

Revision ID: o0a1b2c3d4e5
Revises: x9c0d1e2f3a4
Create Date: 2026-10-19

Created idempotently on purpose. This deployment's database has at times
been built with create_all() and stamped rather than migrated through, so
a table can already exist at a revision that claims to create it.

There is also an older assistant_actions, created by u6f7a8b9c0d1 for a
design that no longer exists in this codebase: a uuid primary key, an
action_type and a card, and none of the columns the current write tools
read. On a database migrated straight through, that revision runs first
and this one would find a table present, skip, and leave the assistant
pointed at something it cannot use.

So the shape is checked, not just the name. A table without a token
column is the old one and is replaced. That discards its rows, which is
the right call for this table and only this table: it holds proposed and
applied changes written by code that is no longer here, nothing reads
them, and a proposal is worthless once the session that made it is gone.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "o0a1b2c3d4e5"
down_revision: Union[str, Sequence[str], None] = "x9c0d1e2f3a4"
branch_labels = None
depends_on = None

TABLE = "assistant_actions"


def _exists() -> bool:
    return TABLE in sa.inspect(op.get_bind()).get_table_names()


def _has_token_column() -> bool:
    inspector = sa.inspect(op.get_bind())
    return "token" in {c["name"] for c in inspector.get_columns(TABLE)}


def upgrade() -> None:
    if _exists():
        if _has_token_column():
            return
        # The older design, from u6f7a8b9c0d1. See the note at the top.
        op.drop_table(TABLE)
        sa.Enum(name="actionstatus").drop(op.get_bind(), checkfirst=True)
    op.create_table(
        TABLE,
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("token", sa.String(length=64), nullable=False),
        sa.Column("tool", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.Enum("PROPOSED", "APPLIED", "FAILED", "EXPIRED",
                                    name="actionstatus"), nullable=False),
        sa.Column("entity_type", sa.String(length=40), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("before", sa.JSON(), nullable=True),
        sa.Column("after", sa.JSON(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("applied_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token"),
    )
    op.create_index("ix_assistant_actions_id", TABLE, ["id"])
    op.create_index("ix_assistant_actions_token", TABLE, ["token"])
    op.create_index("ix_assistant_actions_tool", TABLE, ["tool"])
    op.create_index("ix_assistant_actions_user_id", TABLE, ["user_id"])
    op.create_index("ix_assistant_actions_status", TABLE, ["status"])
    op.create_index("ix_assistant_actions_entity_id", TABLE, ["entity_id"])
    op.create_index("ix_assistant_actions_created_at", TABLE, ["created_at"])
    op.create_index("ix_assistant_actions_user_status", TABLE, ["user_id", "status"])


def downgrade() -> None:
    if _exists():
        op.drop_table(TABLE)
    sa.Enum(name="actionstatus").drop(op.get_bind(), checkfirst=True)
