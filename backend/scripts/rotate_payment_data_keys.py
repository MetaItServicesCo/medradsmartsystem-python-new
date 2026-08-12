"""Re-encrypt reusable Square references with the first configured key.

Usage (after setting PAYMENT_DATA_ENCRYPTION_KEYS=NEW_KEY,OLD_KEY):
    python -m scripts.rotate_payment_data_keys

Keep the old key configured until this command completes successfully and a
database backup has been verified.
"""

from sqlalchemy import inspect, text

from app.db.base import engine
from app.utils.payment_data_security import (
    payment_data_encryption_configured,
    reencrypt_payment_reference,
)


def main() -> None:
    if not payment_data_encryption_configured():
        raise RuntimeError("PAYMENT_DATA_ENCRYPTION_KEYS is not configured correctly")

    rotated = 0
    with engine.begin() as connection:
        rental_rows = connection.execute(
            text(
                "SELECT id, square_card_id, square_customer_id FROM rentals "
                "WHERE square_card_id IS NOT NULL OR square_customer_id IS NOT NULL"
            )
        ).mappings()
        for row in rental_rows:
            connection.execute(
                text(
                    "UPDATE rentals SET square_card_id = :card_id, square_customer_id = :customer_id "
                    "WHERE id = :rental_id"
                ),
                {
                    "rental_id": row["id"],
                    "card_id": reencrypt_payment_reference(row["square_card_id"]),
                    "customer_id": reencrypt_payment_reference(row["square_customer_id"]),
                },
            )
            rotated += 1

        if inspect(connection).has_table("rental_payment_authorizations"):
            cleanup_rows = connection.execute(
                text(
                    "SELECT id, provider_card_reference FROM rental_payment_authorizations "
                    "WHERE provider_card_reference IS NOT NULL"
                )
            ).mappings()
            for row in cleanup_rows:
                connection.execute(
                    text(
                        "UPDATE rental_payment_authorizations SET provider_card_reference = :reference "
                        "WHERE id = :evidence_id"
                    ),
                    {
                        "evidence_id": row["id"],
                        "reference": reencrypt_payment_reference(row["provider_card_reference"]),
                    },
                )
                rotated += 1

    print(f"Re-encrypted {rotated} saved payment reference record(s).")


if __name__ == "__main__":
    main()
