"""Give a definition every field the Add Part form asks for

The capture screen had a form of its own: a name, and how many. That was
right for the shutter and wrong for everything after it, because the details
someone eventually types are the details the existing Add Part form asks for,
and two forms describing the same object in different words is how the two
drift apart.

So the definition now holds the same fields that form holds. Nothing here is
required -- a capture still asks for nothing but a photograph -- and nothing
here changes inventory_parts, which already had all of these. This is the
capture side catching up to the shape the rest of the module settled on
years ago.

Additive on a table this feature owns: twelve nullable columns on
part_definitions, no data written, no existing column touched.

Revision ID: k6b7c8d9e0f1
Revises: j5a6b7c8d9e0
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "k6b7c8d9e0f1"
down_revision: Union[str, Sequence[str], None] = "j5a6b7c8d9e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Name, type and nullability copied from inventory_parts deliberately: what a
# definition can hold and what a part can hold must not disagree, or confirming
# a capture would have to translate between them and would eventually lose
# something in the translation.
_COLUMNS = (
    ("condition", sa.String()),
    ("supplier_name", sa.String()),
    ("supplier_contact", sa.String()),
    ("supplier_email", sa.String()),
    ("supplier_phone", sa.String()),
    ("supplier_address", sa.Text()),
    ("vendor_name", sa.String()),
    ("purchase_location", sa.String()),
    ("shipping_method", sa.String()),
    ("acquisition_date", sa.Date()),
    ("warehouse_arrival_date", sa.Date()),
    # A data URL, exactly as the existing form stores it.
    ("default_picture_url", sa.Text()),
)


def upgrade() -> None:
    for name, type_ in _COLUMNS:
        op.add_column("part_definitions", sa.Column(name, type_, nullable=True))


def downgrade() -> None:
    for name, _ in reversed(_COLUMNS):
        op.drop_column("part_definitions", name)
