from datetime import datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401 - register the complete model metadata for SQLite
from app.api.v1.endpoints.reports import get_inspection_reports, reports_summary
from app.db.base import Base
from app.models.facility import Facility
from app.models.inspection import Inspection, InspectionBatch, InspectionResult, InspectionStatus
from app.models.inspection_form import InspectionForm
from app.models.user import User, UserRole, UserType


def test_completed_batch_is_one_logical_report_while_standalone_stays_independent() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    try:
        admin = User(
            username="reports-admin",
            email="reports-admin@example.com",
            full_name="Reports Admin",
            hashed_password="test",
            user_type=UserType.EMPLOYEE,
            role=UserRole.SUPERADMIN,
        )
        facility = Facility(
            name="Report Facility",
            phone="(214) 555-0100",
            email="reports@example.com",
            address="1 Main Street",
            city="Dallas",
            state="TX",
            zip_code="75001",
            country="United States",
        )
        form = InspectionForm(name="Report Form", schema={})
        db.add_all([admin, facility, form])
        db.flush()

        completed_at = datetime(2026, 8, 25, 14, 0)
        batch = InspectionBatch(
            batch_number="INSP-BATCH-001",
            facility_id=facility.id,
            inspector_id=admin.id,
            form_template_id=form.id,
            status=InspectionStatus.COMPLETED,
            scheduled_date=completed_at,
            completed_at=completed_at,
        )
        db.add(batch)
        db.flush()

        db.add_all(
            [
                Inspection(
                    inspection_number=f"INSP-00{index}",
                    batch_id=batch.id,
                    facility_id=facility.id,
                    inspector_id=admin.id,
                    form_template_id=form.id,
                    status=InspectionStatus.COMPLETED,
                    result=InspectionResult.PASS,
                    scheduled_date=completed_at,
                    completed_at=completed_at,
                )
                for index in range(1, 4)
            ]
            + [
                Inspection(
                    inspection_number="INSP-STANDALONE-001",
                    facility_id=facility.id,
                    inspector_id=admin.id,
                    form_template_id=form.id,
                    status=InspectionStatus.COMPLETED,
                    result=InspectionResult.PASS,
                    scheduled_date=completed_at,
                    completed_at=completed_at,
                )
            ]
        )
        db.commit()

        result = get_inspection_reports(
            db=db,
            search=None,
            facility_id=None,
            technician_id=None,
            result=None,
            date_from=None,
            date_to=None,
            skip=0,
            limit=25,
            current_user=admin,
        )

        assert result["total"] == 2
        assert len(result["items"]) == 2
        batch_report = next(item for item in result["items"] if item["batch_id"] == batch.id)
        standalone_report = next(item for item in result["items"] if item["batch_id"] is None)
        assert batch_report["report_key"] == f"batch:{batch.id}"
        assert batch_report["report_number"] == "INSP-BATCH-001"
        assert batch_report["asset_count"] == 3
        assert batch_report["asset_name"] == "3 inspected assets"
        assert standalone_report["report_key"].startswith("inspection:")
        assert standalone_report["report_number"] == "INSP-STANDALONE-001"
        assert standalone_report["asset_count"] == 1

        summary = reports_summary(
            db=db,
            date_from=None,
            date_to=None,
            current_user=admin,
        )
        assert summary["inspection_reports"] == 2
    finally:
        db.close()
        engine.dispose()
