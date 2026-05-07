"""facility_mgmt_enhancements

Revision ID: abc123def456
Revises: 63b2b0345b90
Create Date: 2026-04-07 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'abc123def456'
down_revision: Union[str, None] = '63b2b0345b90'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create departments table
    op.create_table('departments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('facility_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['facility_id'], ['facilities.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_departments_id'), 'departments', ['id'], unique=False)

    # 2. Add facility_id to users
    op.add_column('users', sa.Column('facility_id', sa.Integer(), nullable=True))
    op.create_foreign_key(None, 'users', 'facilities', ['facility_id'], ['id'])

    # 3. Add parent_id to modalities
    op.add_column('modalities', sa.Column('parent_id', sa.Integer(), nullable=True))
    op.create_foreign_key(None, 'modalities', 'modalities', ['parent_id'], ['id'])


def downgrade() -> None:
    op.drop_constraint(None, 'modalities', type_='foreignkey')
    op.drop_column('modalities', 'parent_id')
    
    op.drop_constraint(None, 'users', type_='foreignkey')
    op.drop_column('users', 'facility_id')
    
    op.drop_index(op.f('ix_departments_id'), table_name='departments')
    op.drop_table('departments')
