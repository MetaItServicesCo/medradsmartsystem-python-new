from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import crud
from app.core.deps import get_current_user, get_admin_user
from app.db.base import get_db
from app.models.user import User
from app.models.department import Department
from app.schemas.department import (
    DepartmentCreate, DepartmentUpdate,
    Department as DepartmentSchema, DepartmentListResponse
)

router = APIRouter()


@router.get("/", response_model=DepartmentListResponse)
def list_departments(
    db: Session = Depends(get_db),
    facility_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
) -> Any:
    """List departments, optionally filtered by facility_id."""
    query = db.query(Department)
    if facility_id is not None:
        query = query.filter(Department.facility_id == facility_id)
    items = query.all()
    return {"items": items, "total": len(items)}


@router.get("/{id}", response_model=DepartmentSchema)
def get_department(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Get a single department."""
    dept = crud.department.get(db=db, id=id)
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    return dept


@router.post("/", response_model=DepartmentSchema, status_code=201)
def create_department(
    dept_in: DepartmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    """Create a department."""
    return crud.department.create(db=db, obj_in=dept_in)


@router.put("/{id}", response_model=DepartmentSchema)
def update_department(
    id: int,
    dept_in: DepartmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    """Update a department."""
    dept = crud.department.get(db=db, id=id)
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    return crud.department.update(db=db, db_obj=dept, obj_in=dept_in)


@router.delete("/{id}")
def delete_department(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    """Delete a department."""
    dept = crud.department.get(db=db, id=id)
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    crud.department.remove(db=db, id=id)
    return {"detail": "Department deleted"}
