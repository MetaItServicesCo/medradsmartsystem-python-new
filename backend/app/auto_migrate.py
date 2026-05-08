from sqlalchemy import text
from app.db.base import engine, Base
# Import all models to ensure they are registered with Base
from app.models import (
    facility, facility_document, equipment, service_request,
    inspection, invoice, rental, tier, user, department, modality,
)
from app.models import user_facility, equipment_facility, facility_tier, inventory, chat, calendar, notification


def run_migration():
    # Attempt to create any missing tables (e.g., new tables)
    Base.metadata.create_all(bind=engine)
    
    # Facility columns migration (existing)
    columns = [
        "contact_person VARCHAR", "suite VARCHAR", "website VARCHAR", 
        "parent_facility_id INTEGER REFERENCES facilities(id)",
        "status VARCHAR DEFAULT 'active'", "billing_name VARCHAR",
        "billing_email VARCHAR", "billing_street VARCHAR", "billing_suite VARCHAR",
        "billing_city VARCHAR", "billing_state VARCHAR", "billing_zip_code VARCHAR",
        "tax_exemption BOOLEAN DEFAULT FALSE", "inheritance VARCHAR",
        "installment_type VARCHAR", "payment_method VARCHAR", "delivery_email VARCHAR"
    ]

    # User columns migration (new fields)
    user_columns = [
        "phone VARCHAR",
        "avatar_url VARCHAR",
    ]

    with engine.connect() as conn:
        for col in columns:
            try:
                conn.execute(text(f"ALTER TABLE facilities ADD COLUMN {col}"))
                conn.commit()
            except Exception as e:
                conn.rollback()
                pass  # safely ignore if column already exists

        for col in user_columns:
            try:
                conn.execute(text(f"ALTER TABLE users ADD COLUMN {col}"))
                conn.commit()
            except Exception as e:
                conn.rollback()
                pass  # safely ignore if column already exists

        # Chat columns migration
        friend_request_columns = [
            "message TEXT",
            "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP"
        ]
        for col in friend_request_columns:
            try:
                conn.execute(text(f"ALTER TABLE friend_requests ADD COLUMN {col}"))
                conn.commit()
            except Exception as e:
                conn.rollback()
                pass  # safely ignore if column already exists

        # Chat file sharing columns migration
        file_columns = [
            "file_url VARCHAR",
            "file_name VARCHAR",
            "file_size INTEGER",
            "file_type VARCHAR",
        ]
        for table in ["direct_messages", "workspace_messages"]:
            for col in file_columns:
                try:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col}"))
                    conn.commit()
                except Exception as e:
                    conn.rollback()
                    pass  # safely ignore if column already exists

        # Quotation table columns migration
        quotation_columns = [
            "quotation_number VARCHAR",
            "status VARCHAR DEFAULT 'draft'",
        ]
        for col in quotation_columns:
            try:
                conn.execute(text(f"ALTER TABLE service_request_quotations ADD COLUMN {col}"))
                conn.commit()
            except Exception as e:
                conn.rollback()
                pass

        # Drop unique constraint on service_request_id to allow multiple quotations
        try:
            conn.execute(text(
                "ALTER TABLE service_request_quotations DROP CONSTRAINT IF EXISTS service_request_quotations_service_request_id_key"
            ))
            conn.commit()
        except Exception as e:
            conn.rollback()
            pass

        # Backfill quotation_number for existing rows
        try:
            conn.execute(text("""
                UPDATE service_request_quotations
                SET quotation_number = 'Q-' || LPAD(id::text, 4, '0')
                WHERE quotation_number IS NULL
            """))
            conn.commit()
        except Exception as e:
            conn.rollback()
            pass
