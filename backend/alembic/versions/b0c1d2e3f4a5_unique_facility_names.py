"""Enforce canonical facility-name uniqueness.

Revision ID: b0c1d2e3f4a5
Revises: a9b1c2d3e4f5
Create Date: 2026-07-21
"""

from typing import Sequence, Union

from alembic import op


revision: str = "b0c1d2e3f4a5"
down_revision: Union[str, Sequence[str], None] = "a9b1c2d3e4f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Normalize harmless whitespace first so the stored value and comparison key agree.
    op.execute(
        """
        UPDATE facilities
        SET name = regexp_replace(btrim(name), '\\s+', ' ', 'g')
        """
    )
    op.execute(
        """
        UPDATE facilities
        SET name = 'Facility ' || id
        WHERE name = ''
        """
    )

    # Preserve every legacy row while assigning deterministic names to existing duplicates.
    op.execute(
        """
        DO $$
        DECLARE
            duplicate_record RECORD;
            base_name TEXT;
            candidate TEXT;
            copy_number INTEGER;
        BEGIN
            FOR duplicate_record IN
                SELECT id, name
                FROM (
                    SELECT
                        id,
                        name,
                        row_number() OVER (
                            PARTITION BY lower(regexp_replace(btrim(name), '\\s+', ' ', 'g'))
                            ORDER BY id
                        ) AS occurrence
                    FROM facilities
                ) ranked
                WHERE occurrence > 1
                ORDER BY id
            LOOP
                base_name := regexp_replace(
                    duplicate_record.name,
                    '\\s+\\(copy( [0-9]+)?\\)$',
                    '',
                    'i'
                );
                IF base_name = '' THEN
                    base_name := duplicate_record.name;
                END IF;

                copy_number := 1;
                LOOP
                    candidate := base_name || CASE
                        WHEN copy_number = 1 THEN ' (Copy)'
                        ELSE ' (Copy ' || copy_number || ')'
                    END;

                    EXIT WHEN NOT EXISTS (
                        SELECT 1
                        FROM facilities
                        WHERE id <> duplicate_record.id
                          AND lower(regexp_replace(btrim(name), '\\s+', ' ', 'g')) =
                              lower(regexp_replace(btrim(candidate), '\\s+', ' ', 'g'))
                    );
                    copy_number := copy_number + 1;
                END LOOP;

                UPDATE facilities
                SET name = candidate
                WHERE id = duplicate_record.id;
            END LOOP;
        END $$;
        """
    )

    op.execute(
        """
        CREATE UNIQUE INDEX uq_facilities_name_canonical
        ON facilities (
            (lower(regexp_replace(btrim(name), '\\s+', ' ', 'g')))
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_facilities_name_canonical")
