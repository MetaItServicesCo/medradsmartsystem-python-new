from sqlalchemy import text
from app.db.base import engine, Base
# Import all models to ensure they are registered with Base
from app.models import (
    facility, facility_document, equipment, service_request,
    inspection, inspection_form, invoice, rental, tier, user, department, modality,
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
        "permissions JSON",
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

        inspection_columns = [
            "inventory_part_id INTEGER REFERENCES inventory_parts(id)",
            "inspection_scope VARCHAR DEFAULT 'facility_inventory'",
            "inspection_frequency VARCHAR DEFAULT 'instant'",
            "compliance_requirement VARCHAR",
            "criticality VARCHAR",
            "quotation_notes TEXT",
        ]
        for col in inspection_columns:
            try:
                conn.execute(text(f"ALTER TABLE inspections ADD COLUMN {col}"))
                conn.commit()
            except Exception as e:
                conn.rollback()
                pass

        try:
            conn.execute(text("ALTER TABLE inspections ALTER COLUMN equipment_id DROP NOT NULL"))
            conn.commit()
        except Exception as e:
            conn.rollback()
            pass

        try:
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_inspections_inventory_part_id ON inspections (inventory_part_id)"))
            conn.commit()
        except Exception as e:
            conn.rollback()
            pass

        service_request_columns = [
            "service_required TEXT",
            "preferred_datetime TIMESTAMP",
            "requested_by_name VARCHAR",
            "reference_number VARCHAR",
            "request_image_url TEXT",
            "history JSON",
        ]
        for col in service_request_columns:
            try:
                conn.execute(text(f"ALTER TABLE service_requests ADD COLUMN {col}"))
                conn.commit()
            except Exception as e:
                conn.rollback()
                pass

        inventory_equipment_columns = [
            "modality_id INTEGER REFERENCES modalities(id)",
            "inspection_form_id INTEGER REFERENCES inspection_forms(id)",
            "asset_tag VARCHAR",
            "default_picture_url TEXT",
            "risk_priority VARCHAR",
            "risk_name VARCHAR",
            "inventory_date DATE",
            "acquisition_authorized_by VARCHAR",
            "department VARCHAR",
            "po_no VARCHAR",
            "requester_first_name VARCHAR",
            "requester_last_name VARCHAR",
            "requester_phone VARCHAR",
            "requester_fax VARCHAR",
            "requester_mailing_address TEXT",
            "requester_email VARCHAR",
            "owning_department VARCHAR",
            "acquisition_method VARCHAR",
            "acquired_company_name VARCHAR",
            "acquired_account_number VARCHAR",
            "acquired_sales_person VARCHAR",
            "acquired_phone VARCHAR",
            "acquired_email VARCHAR",
            "acquired_mailing_address TEXT",
            "acquisition_date DATE",
            "supplier_address TEXT",
            "vendor_name VARCHAR",
            "purchase_location VARCHAR",
            "shipping_method VARCHAR",
            "warehouse_arrival_date DATE",
            "capital_equipment VARCHAR",
            "warranty_duration VARCHAR",
            "parts_duration VARCHAR",
            "labor_duration VARCHAR",
            "coverage_start_date DATE",
            "coverage_type VARCHAR",
            "part_warranty_end_date DATE",
            "labor_warranty_end_date DATE",
            "pm_scheduling VARCHAR",
            "installation_date DATE",
            "last_pm_date DATE",
            "next_generated_pm_date DATE",
        ]
        for col in inventory_equipment_columns:
            try:
                conn.execute(text(f"ALTER TABLE inventory_parts ADD COLUMN {col}"))
                conn.commit()
            except Exception as e:
                conn.rollback()
                pass

        for alter_sql in [
            "ALTER TABLE inventory_parts ALTER COLUMN facility_id DROP NOT NULL",
            "ALTER TABLE inventory_transactions ALTER COLUMN facility_id DROP NOT NULL",
        ]:
            try:
                conn.execute(text(alter_sql))
                conn.commit()
            except Exception as e:
                conn.rollback()
                pass

        for index_sql in [
            "CREATE INDEX IF NOT EXISTS ix_inventory_parts_asset_tag ON inventory_parts (asset_tag)",
            "CREATE INDEX IF NOT EXISTS ix_inventory_parts_modality_id ON inventory_parts (modality_id)",
        ]:
            try:
                conn.execute(text(index_sql))
                conn.commit()
            except Exception as e:
                conn.rollback()
                pass

        equipment_registration_columns = [
            "inspection_form_id INTEGER REFERENCES inspection_forms(id)",
            "default_picture_url TEXT",
            "description TEXT",
            "risk_priority VARCHAR",
            "risk_name VARCHAR",
            "location VARCHAR",
            "inventory_date DATE",
            "acquisition_authorized_by VARCHAR",
            "department VARCHAR",
            "po_no VARCHAR",
            "requester_first_name VARCHAR",
            "requester_last_name VARCHAR",
            "requester_phone VARCHAR",
            "requester_fax VARCHAR",
            "requester_mailing_address TEXT",
            "requester_email VARCHAR",
            "owning_department VARCHAR",
            "acquisition_method VARCHAR",
            "acquired_company_name VARCHAR",
            "acquired_account_number VARCHAR",
            "acquired_sales_person VARCHAR",
            "acquired_phone VARCHAR",
            "acquired_email VARCHAR",
            "acquired_mailing_address TEXT",
            "cost NUMERIC(10, 2)",
            "acquisition_date DATE",
            "capital_equipment VARCHAR",
            "warranty_duration VARCHAR",
            "parts_duration VARCHAR",
            "labor_duration VARCHAR",
            "coverage_start_date DATE",
            "coverage_type VARCHAR",
            "part_warranty_end_date DATE",
            "labor_warranty_end_date DATE",
            "pm_scheduling VARCHAR",
            "installation_date DATE",
            "last_pm_date DATE",
            "next_generated_pm_date DATE",
        ]
        for col in equipment_registration_columns:
            try:
                conn.execute(text(f"ALTER TABLE equipment ADD COLUMN {col}"))
                conn.commit()
            except Exception as e:
                conn.rollback()
                pass

        inspection_form_columns = [
            "modality_id INTEGER REFERENCES modalities(id)",
        ]
        for col in inspection_form_columns:
            try:
                conn.execute(text(f"ALTER TABLE inspection_forms ADD COLUMN {col}"))
                conn.commit()
            except Exception as e:
                conn.rollback()
                pass

        try:
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_inspection_forms_modality_id ON inspection_forms (modality_id)"))
            conn.commit()
        except Exception as e:
            conn.rollback()
            pass
