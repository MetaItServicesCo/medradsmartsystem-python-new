from fastapi import APIRouter

router = APIRouter()

@router.get("/")
async def list_rentals():
    return {"message": "List rentals endpoint"}

@router.post("/")
async def create_rental():
    return {"message": "Create rental endpoint"}

@router.patch("/{id}/return")
async def return_rental(id: int):
    return {"message": f"Return rental {id}"}
