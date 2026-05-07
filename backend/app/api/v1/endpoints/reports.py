from fastapi import APIRouter

router = APIRouter()

@router.get("/service-reports")
async def get_service_reports():
    return {"message": "Service reports endpoint"}

@router.get("/inspection-reports")
async def get_inspection_reports():
    return {"message": "Inspection reports endpoint"}

@router.get("/financial-reports")
async def get_financial_reports():
    return {"message": "Financial reports endpoint"}
