from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import String, cast, or_
from sqlalchemy.orm import Session

from app import crud
from app.core.deps import get_current_user, get_admin_user
from app.db.base import get_db
from app.models.user import User
from app.models.modality import Modality
from app.schemas.modality import (
    ModalityCreate, ModalityUpdate, ModalityResponse, ModalityListResponse
)

router = APIRouter()


def _modality_matches(modality: Modality, search: str) -> bool:
    """Return true when a modality matches the normalized search term."""
    category = modality.category.value if modality.category else ""
    values = (modality.name or "", modality.description or "", category)
    return any(search in value.lower() for value in values)


def _build_tree(modality: Modality, search: Optional[str] = None) -> Optional[dict]:
    """Recursively build modality tree."""
    children = [
        child_tree
        for child in sorted(modality.children or [], key=lambda item: item.id or 0, reverse=True)
        if (child_tree := _build_tree(child, search)) is not None
    ]
    if search and not _modality_matches(modality, search) and not children:
        return None
    return {
        "id": modality.id,
        "name": modality.name,
        "category": modality.category.value if modality.category else None,
        "description": modality.description,
        "inspection_frequency_days": modality.inspection_frequency_days,
        "parent_id": modality.parent_id,
        "children": children,
    }


@router.get("/", response_model=ModalityListResponse)
def list_modalities(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    parent_only: bool = Query(True, description="If true, return only root modalities with children nested"),
    search: Optional[str] = Query(None, description="Search modalities by name, description, or category"),
) -> Any:
    """List modalities. By default returns tree structure (root nodes only with nested children)."""
    search_term = search.strip().lower() if search and search.strip() else None
    if parent_only:
        items = (
            db.query(Modality)
            .filter(Modality.parent_id == None)
            .order_by(Modality.id.desc())
            .all()
        )
        tree = [
            item
            for modality in items
            if (item := _build_tree(modality, search_term)) is not None
        ]
    else:
        query = db.query(Modality)
        if search_term:
            like = f"%{search_term}%"
            query = query.filter(
                or_(
                    Modality.name.ilike(like),
                    Modality.description.ilike(like),
                    cast(Modality.category, String).ilike(like),
                )
            )
        items = query.order_by(Modality.id.desc()).all()
        tree = [_build_tree(m) for m in items]
    return {"items": tree, "total": len(tree)}


@router.get("/{id}", response_model=ModalityResponse)
def get_modality(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Get a single modality with its children."""
    modality = db.query(Modality).filter(Modality.id == id).first()
    if not modality:
        raise HTTPException(status_code=404, detail="Modality not found")
    return _build_tree(modality)


@router.post("/", response_model=ModalityResponse, status_code=201)
def create_modality(
    modality_in: ModalityCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    """Create a modality or sub-modality."""
    if modality_in.parent_id:
        parent = db.query(Modality).filter(Modality.id == modality_in.parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent modality not found")
    modality = crud.modality.create(db=db, obj_in=modality_in)
    return _build_tree(modality)


@router.put("/{id}", response_model=ModalityResponse)
def update_modality(
    id: int,
    modality_in: ModalityUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    """Update a modality."""
    modality = db.query(Modality).filter(Modality.id == id).first()
    if not modality:
        raise HTTPException(status_code=404, detail="Modality not found")
    updated = crud.modality.update(db=db, db_obj=modality, obj_in=modality_in)
    return _build_tree(updated)


@router.post("/{id}/duplicate", response_model=ModalityResponse, status_code=201)
def duplicate_modality(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    """Duplicate a modality (and optionally its children)."""
    original = db.query(Modality).filter(Modality.id == id).first()
    if not original:
        raise HTTPException(status_code=404, detail="Modality not found")

    def _dup(mod: Modality, new_parent_id=None) -> Modality:
        new_mod = Modality(
            name=f"{mod.name} (Copy)",
            category=mod.category,
            description=mod.description,
            inspection_frequency_days=mod.inspection_frequency_days,
            parent_id=new_parent_id,
        )
        db.add(new_mod)
        db.flush()
        for child in mod.children:
            _dup(child, new_mod.id)
        return new_mod

    new_modality = _dup(original, original.parent_id)
    db.commit()
    db.refresh(new_modality)
    return _build_tree(new_modality)


@router.delete("/{id}")
def delete_modality(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    """Delete a modality and all its children."""
    modality = db.query(Modality).filter(Modality.id == id).first()
    if not modality:
        raise HTTPException(status_code=404, detail="Modality not found")
    db.delete(modality)
    db.commit()
    return {"detail": "Modality deleted"}
