from fastapi import APIRouter

router = APIRouter()

@router.get("/")
async def list_inventory():
    return {"message": "List inventory endpoint"}

@router.post("/")
async def create_inventory_item():
    return {"message": "Create inventory item endpoint"}
