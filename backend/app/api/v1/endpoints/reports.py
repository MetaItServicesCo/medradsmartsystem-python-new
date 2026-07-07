from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.models.user import User
from app.utils.permission_deps import require_module_access

router = APIRouter(dependencies=[Depends(require_module_access("reports"))])


@router.get("/service-reports")
async def get_service_reports(
    current_user: User = Depends(get_current_user),
):
    return {"message": "Service reports endpoint"}


@router.get("/inspection-reports")
async def get_inspection_reports(
    current_user: User = Depends(get_current_user),
):
    return {"message": "Inspection reports endpoint"}


@router.get("/financial-reports")
async def get_financial_reports(
    current_user: User = Depends(get_current_user),
):
    return {"message": "Financial reports endpoint"}
