"""Encrypt detailed payment-proof extraction findings.

Revision ID: e0b1c2d3e4f5
Revises: d9a0b1c2d3e4
"""

from __future__ import annotations

import json

from alembic import op
import sqlalchemy as sa

from app.utils.payment_data_security import (
    decrypt_payment_reference,
    encrypt_payment_reference,
)


revision = "e0b1c2d3e4f5"
down_revision = "d9a0b1c2d3e4"
branch_labels = None
depends_on = None


SAFE_KEYS = {
    "ocr_version",
    "claimed_amount_detected",
    "target_reference_detected",
    "reconciliation",
    "legibility",
    "confidence_basis",
    "confidence_is_estimate",
    "extraction_error",
}


def _as_dict(value) -> dict:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except (TypeError, ValueError):
            return {}
    return {}


def upgrade() -> None:
    op.add_column("payment_proofs", sa.Column("extracted_data_encrypted", sa.Text(), nullable=True))
    connection = op.get_bind()
    rows = connection.execute(sa.text("SELECT id, extracted_data FROM payment_proofs")).mappings()
    for row in rows:
        detailed = _as_dict(row["extracted_data"])
        if not detailed:
            continue
        protected = encrypt_payment_reference(
            json.dumps(detailed, separators=(",", ":"), sort_keys=True, default=str)
        )
        safe = {key: value for key, value in detailed.items() if key in SAFE_KEYS}
        connection.execute(
            sa.text(
                "UPDATE payment_proofs "
                "SET extracted_data_encrypted = :protected, extracted_data = CAST(:safe AS JSON) "
                "WHERE id = :proof_id"
            ),
            {"protected": protected, "safe": json.dumps(safe), "proof_id": row["id"]},
        )


def downgrade() -> None:
    connection = op.get_bind()
    rows = connection.execute(
        sa.text(
            "SELECT id, extracted_data_encrypted FROM payment_proofs "
            "WHERE extracted_data_encrypted IS NOT NULL"
        )
    ).mappings()
    for row in rows:
        plaintext = decrypt_payment_reference(row["extracted_data_encrypted"])
        detailed = _as_dict(plaintext)
        connection.execute(
            sa.text(
                "UPDATE payment_proofs SET extracted_data = CAST(:detailed AS JSON) WHERE id = :proof_id"
            ),
            {"detailed": json.dumps(detailed), "proof_id": row["id"]},
        )
    op.drop_column("payment_proofs", "extracted_data_encrypted")
