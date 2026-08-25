from datetime import date, datetime
from types import SimpleNamespace

from app.api.v1.endpoints.reports import _service_report_row, _service_session_entries


def _service_request() -> SimpleNamespace:
    technician = SimpleNamespace(full_name="Jordan Technician")
    return SimpleNamespace(
        id=41,
        request_number="SR-000041",
        facility_id=7,
        facility=SimpleNamespace(name="Example Medical Center"),
        equipment_id=11,
        equipment=SimpleNamespace(
            asset_tag="ASSET-11",
            make="Acme",
            model="Monitor 2",
            serial_number="SN-1100",
        ),
        assigned_technician_id=3,
        assigned_technician=technician,
        requester_id=5,
        requester=SimpleNamespace(full_name="Facility Requester"),
        requested_by_name=None,
        reference_number="PO-4100",
        status="completed",
        priority="high",
        problem_description="Display is blank",
        service_required="Diagnose and repair display",
        resolution_description="Replaced the display cable",
        time_spent_hours=2.25,
        total_cost=325.50,
        billing_status="invoiced",
        created_at=datetime(2026, 8, 1, 8, 0),
        assigned_at=datetime(2026, 8, 1, 9, 0),
        started_at=datetime(2026, 8, 2, 10, 0),
        completed_at=datetime(2026, 8, 2, 12, 30),
        history=[
            {
                "action": "technician_clock_out",
                "user": "Jordan Technician",
                "timestamp": "2026-08-02T12:00:00",
                "changes": {
                    "session_id": "session-1",
                    "duration_hours": 2,
                    "total_mileage": 12,
                    "parts": [{"part_number": "P-1", "quantity_used": 1}],
                },
            },
            {
                "action": "technician_work_session",
                "user": "Jordan Technician",
                "timestamp": "2026-08-02T12:30:00",
                "changes": {
                    "session_id": "session-1",
                    "total_work_hours": 2.25,
                    "total_mileage": 14,
                    "diagnosis": "Loose display cable",
                },
            },
        ],
    )


def test_service_sessions_do_not_duplicate_the_same_ledger_session() -> None:
    sessions = _service_session_entries(_service_request())

    assert len(sessions) == 1
    assert sessions[0]["session_id"] == "session-1"
    assert sessions[0]["duration_hours"] == 2.25
    assert sessions[0]["total_mileage"] == 14
    assert sessions[0]["parts"] == [{"part_number": "P-1", "quantity_used": 1}]


def test_service_report_maps_request_equipment_and_invoice_values() -> None:
    invoice = SimpleNamespace(
        id=91,
        invoice_number="INV-SERVICE-000091",
        status="partially_paid",
        subtotal=325.50,
        tax_amount=20,
        discount_amount=5,
        total_amount=340.50,
        amount_paid=100,
        balance_due=240.50,
        issue_date=date(2026, 8, 3),
        due_date=date(2026, 9, 3),
        payment_method="ach",
    )

    report = _service_report_row(_service_request(), invoice)

    assert report["requested_by_name"] == "Facility Requester"
    assert report["reference_number"] == "PO-4100"
    assert report["make"] == "Acme"
    assert report["model"] == "Monitor 2"
    assert report["time_spent_hours"] == 2.25
    assert report["invoice"] == {
        "id": 91,
        "invoice_number": "INV-SERVICE-000091",
        "status": "partially_paid",
        "subtotal": 325.5,
        "tax_amount": 20.0,
        "discount_amount": 5.0,
        "total_amount": 340.5,
        "amount_paid": 100.0,
        "balance_due": 240.5,
        "issue_date": "2026-08-03",
        "due_date": "2026-09-03",
        "payment_method": "ach",
    }
