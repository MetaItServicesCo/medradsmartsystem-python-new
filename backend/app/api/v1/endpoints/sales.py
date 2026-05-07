from fastapi import APIRouter

router = APIRouter()

@router.get("/quotations")
async def list_quotations():
    return {"message": "List quotations endpoint"}

@router.post("/quotations")
async def create_quotation():
    return {"message": "Create quotation endpoint"}

@router.post("/quotations/{id}/convert-to-invoice")
async def convert_to_invoice(id: int):
    return {"message": f"Convert quotation {id} to invoice"}
