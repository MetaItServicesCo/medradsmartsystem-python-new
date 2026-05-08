from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.base import get_db
from app.models.equipment import Equipment, EquipmentStatus
from app.models.facility import Facility
from app.models.inspection import Inspection, InspectionStatus
from app.models.inventory import InventoryPart
from app.models.invoice import Invoice, InvoiceStatus
from app.models.rental import Rental, RentalStatus
from app.models.service_request import Priority, ServiceRequest, ServiceRequestStatus
from app.models.user import User
from app.models.user_facility import UserFacility

router = APIRouter()


@router.get("/summary")
def read_dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Live KPI summary for dashboard cards."""
    open_service_statuses = [
        ServiceRequestStatus.NEW,
        ServiceRequestStatus.ASSIGNED,
        ServiceRequestStatus.IN_PROGRESS,
    ]
    active_facilities = db.query(Facility).filter(Facility.status == "active").count()
    total_facilities = db.query(Facility).count()
    total_service_requests = db.query(ServiceRequest).count()
    open_service_requests = db.query(ServiceRequest).filter(ServiceRequest.status.in_(open_service_statuses)).count()
    critical_service_requests = db.query(ServiceRequest).filter(
        ServiceRequest.priority == Priority.CRITICAL,
        ServiceRequest.status.in_(open_service_statuses),
    ).count()
    total_inspections = db.query(Inspection).count()
    overdue_inspections = db.query(Inspection).filter(Inspection.status == InspectionStatus.OVERDUE).count()
    upcoming_inspections = db.query(Inspection).filter(Inspection.status == InspectionStatus.UPCOMING).count()
    active_rentals = db.query(Rental).filter(Rental.status == RentalStatus.ACTIVE).count()
    total_equipment = db.query(Equipment).count()
    active_equipment = db.query(Equipment).filter(Equipment.status == EquipmentStatus.ACTIVE).count()
    maintenance_equipment = db.query(Equipment).filter(Equipment.status == EquipmentStatus.IN_MAINTENANCE).count()
    assigned_users = db.query(UserFacility).count()
    users_with_primary_facility = db.query(User).filter(User.facility_id.isnot(None)).count()
    pending_invoices = db.query(Invoice).filter(Invoice.status == InvoiceStatus.PENDING).count()
    overdue_invoices = db.query(Invoice).filter(Invoice.status == InvoiceStatus.OVERDUE).count()
    low_stock_parts = db.query(InventoryPart).filter(InventoryPart.quantity_on_hand <= InventoryPart.reorder_level).count()
    expiring_parts = db.query(InventoryPart).filter(
        InventoryPart.expiry_date.isnot(None),
        InventoryPart.expiry_date <= date.today() + timedelta(days=30),
    ).count()

    return {
        "facilities": {
            "total": total_facilities,
            "active": active_facilities,
            "inactive": max(total_facilities - active_facilities, 0),
        },
        "service_requests": {
            "total": total_service_requests,
            "open": open_service_requests,
            "critical": critical_service_requests,
        },
        "inspections": {
            "total": total_inspections,
            "upcoming": upcoming_inspections,
            "overdue": overdue_inspections,
        },
        "rentals": {
            "active": active_rentals,
        },
        "equipment": {
            "total": total_equipment,
            "active": active_equipment,
            "in_maintenance": maintenance_equipment,
        },
        "user_assignments": {
            "total": assigned_users + users_with_primary_facility,
            "direct": users_with_primary_facility,
            "multi_facility": assigned_users,
        },
        "invoices": {
            "pending": pending_invoices,
            "overdue": overdue_invoices,
        },
        "inventory": {
            "low_stock_parts": low_stock_parts,
            "expiring_parts": expiring_parts,
        },
    }
