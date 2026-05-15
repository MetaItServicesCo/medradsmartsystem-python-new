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
from app.utils.facility_access import get_user_facility_ids, is_facility_scoped_user

router = APIRouter()


@router.get("/summary")
def read_dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Live KPI summary for dashboard cards."""
    allowed_facility_ids = get_user_facility_ids(db, current_user) if is_facility_scoped_user(current_user) else None

    def facility_scope(query, model):
        if allowed_facility_ids is None:
            return query
        return query.filter(model.facility_id.in_(allowed_facility_ids))

    open_service_statuses = [
        ServiceRequestStatus.NEW,
        ServiceRequestStatus.ASSIGNED,
        ServiceRequestStatus.IN_PROGRESS,
    ]
    facility_query = db.query(Facility)
    if allowed_facility_ids is not None:
        facility_query = facility_query.filter(Facility.id.in_(allowed_facility_ids))
    active_facilities = facility_query.filter(Facility.status == "active").count()
    total_facilities = facility_query.count()
    total_service_requests = facility_scope(db.query(ServiceRequest), ServiceRequest).count()
    open_service_requests = facility_scope(db.query(ServiceRequest), ServiceRequest).filter(ServiceRequest.status.in_(open_service_statuses)).count()
    critical_service_requests = facility_scope(db.query(ServiceRequest), ServiceRequest).filter(
        ServiceRequest.priority == Priority.CRITICAL,
        ServiceRequest.status.in_(open_service_statuses),
    ).count()
    total_inspections = facility_scope(db.query(Inspection), Inspection).count()
    overdue_inspections = facility_scope(db.query(Inspection), Inspection).filter(Inspection.status == InspectionStatus.OVERDUE).count()
    upcoming_inspections = facility_scope(db.query(Inspection), Inspection).filter(Inspection.status == InspectionStatus.UPCOMING).count()
    rental_query = db.query(Rental)
    if allowed_facility_ids is not None:
        rental_query = rental_query.join(Equipment, Equipment.id == Rental.equipment_id).filter(
            Equipment.facility_id.in_(allowed_facility_ids)
        )
    active_rentals = rental_query.filter(Rental.status == RentalStatus.ACTIVE).count()
    total_equipment = facility_scope(db.query(Equipment), Equipment).count()
    active_equipment = facility_scope(db.query(Equipment), Equipment).filter(Equipment.status == EquipmentStatus.ACTIVE).count()
    maintenance_equipment = facility_scope(db.query(Equipment), Equipment).filter(Equipment.status == EquipmentStatus.IN_MAINTENANCE).count()
    assigned_user_query = db.query(UserFacility)
    primary_user_query = db.query(User).filter(User.facility_id.isnot(None))
    if allowed_facility_ids is not None:
        assigned_user_query = assigned_user_query.filter(UserFacility.facility_id.in_(allowed_facility_ids))
        primary_user_query = primary_user_query.filter(User.facility_id.in_(allowed_facility_ids))
    assigned_users = assigned_user_query.count()
    users_with_primary_facility = primary_user_query.count()
    pending_invoices = facility_scope(db.query(Invoice), Invoice).filter(Invoice.status == InvoiceStatus.PENDING).count()
    overdue_invoices = facility_scope(db.query(Invoice), Invoice).filter(Invoice.status == InvoiceStatus.OVERDUE).count()
    low_stock_parts = facility_scope(db.query(InventoryPart), InventoryPart).filter(InventoryPart.quantity_on_hand <= InventoryPart.reorder_level).count()
    expiring_parts = facility_scope(db.query(InventoryPart), InventoryPart).filter(
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
