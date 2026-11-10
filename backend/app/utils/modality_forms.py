"""What a new asset's type decides: that a sub-modality is chosen where its
modality has them, and which inspection form it gets.

The current modality list gives each sub-modality (or modality) an inspection
form. A new asset of that type gets it unless someone chose another form for
that asset. A hidden form is never given. The old list (is_legacy) has no
forms and works as before. Used wherever an asset is added, so the rule
cannot differ between them.
"""
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.inspection_form import InspectionForm
from app.models.modality import Modality


def default_form_id(db: Session, modality: Optional[Modality]) -> Optional[int]:
    """The sub-modality's form, or else its modality's; never a hidden form."""
    current = modality
    seen: set[int] = set()
    while current is not None and current.id not in seen:
        seen.add(current.id)
        if current.inspection_form_id:
            visible = (
                db.query(InspectionForm.id)
                .filter(InspectionForm.id == current.inspection_form_id, InspectionForm.archived_at.is_(None))
                .first()
            )
            if visible:
                return visible.id
        current = current.parent
    return None


def require_type(db: Session, modality_id: Optional[int]) -> Optional[Modality]:
    """The asset's modality, which must exist; in the current list, a modality
    that has sub-modalities needs one of them chosen."""
    if modality_id is None:
        return None
    modality = db.query(Modality).filter(Modality.id == modality_id).first()
    if not modality:
        raise HTTPException(status_code=404, detail="Modality not found")
    if not modality.is_legacy and modality.parent_id is None and modality.children:
        raise HTTPException(status_code=422, detail=f"Choose a sub-modality of {modality.name}")
    return modality


def form_for_new_asset(db: Session, modality: Optional[Modality], chosen_form_id: Optional[int]) -> Optional[int]:
    """The form chosen for this asset, or else the one its type gives."""
    if chosen_form_id:
        return chosen_form_id
    return default_form_id(db, modality)
