from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth,
    users,
    facilities,
    tiers,
    facility_users,
    modalities,
    departments,
    equipment,
    chat,
    websocket,
    calendar,
    audit,
    service_requests,
    inventory,
    dashboard,
    notifications,
    inspections,
    test_equipment,
    sales,
    rentals,
    attendance,
    hr,
    reports,
    billing,
)

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(facilities.router, prefix="/facilities", tags=["facilities"])
api_router.include_router(tiers.router, prefix="/tiers", tags=["tiers"])
api_router.include_router(facility_users.router, prefix="/facility-users", tags=["facility-users"])
api_router.include_router(modalities.router, prefix="/modalities", tags=["modalities"])
api_router.include_router(departments.router, prefix="/departments", tags=["departments"])
api_router.include_router(equipment.router, prefix="/equipment", tags=["equipment"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
api_router.include_router(websocket.router, tags=["websocket"])
api_router.include_router(calendar.router, prefix="/calendar", tags=["calendar"])
api_router.include_router(audit.router, prefix="/audit-logs", tags=["audit-logs"])
api_router.include_router(service_requests.router, prefix="/service-requests", tags=["service-requests"])
api_router.include_router(inventory.router, prefix="/inventory", tags=["inventory"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(inspections.router, prefix="/inspections", tags=["inspections"])
api_router.include_router(test_equipment.router, prefix="/test-equipment", tags=["test-equipment"])
api_router.include_router(sales.router, prefix="/sales", tags=["sales"])
api_router.include_router(rentals.router, prefix="/rentals", tags=["rentals"])
api_router.include_router(attendance.router, prefix="/attendance", tags=["attendance"])
api_router.include_router(hr.router, prefix="/hr", tags=["hr"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(billing.router, prefix="/billing", tags=["billing"])
