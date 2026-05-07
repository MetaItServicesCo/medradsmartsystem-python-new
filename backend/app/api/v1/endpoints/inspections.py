from fastapi import APIRouter

router = APIRouter()

@router.get("/")
async def list_inspections():
    return {"message": "List inspections endpoint"}

@router.post("/")
async def create_inspection():
    return {"message": "Create inspection endpoint"}
