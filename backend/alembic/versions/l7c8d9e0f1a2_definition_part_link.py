"""Point a definition at the inventory part it became

Ten photographed pumps are one part with a quantity of ten, not ten parts --
that is how the capture screen counts them and how someone reading the stock
list expects to see them. So a definition needs to remember which inventory row
it produced, or saving its details twice would produce a second row saying the
same thing.

Nullable, because a definition that nobody has described yet has not become
anything. It is set the first time the details form is saved with the fields a
part requires, and after that the row is updated rather than replaced.

Additive: one nullable column on part_definitions, a table this feature owns.
inventory_parts is untouched -- the foreign key lives on this side.

Revision ID: l7c8d9e0f1a2
Revises: k6b7c8d9e0f1
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "l7c8d9e0f1a2"
down_revision: Union[str, Sequence[str], None] = "k6b7c8d9e0f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("part_definitions", sa.Column("part_id", sa.Integer(), nullable=True))
    # SET NULL rather than CASCADE: deleting a part must not delete the record
    # of what was photographed, only the claim that it is still stock.
    op.create_foreign_key(
        "fk_part_definitions_part_id",
        "part_definitions",
        "inventory_parts",
        ["part_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_part_definitions_part_id", "part_definitions", ["part_id"])


def downgrade() -> None:
    op.drop_index("ix_part_definitions_part_id", table_name="part_definitions")
    op.drop_constraint("fk_part_definitions_part_id", "part_definitions", type_="foreignkey")
    op.drop_column("part_definitions", "part_id")
