from sqlalchemy import Boolean, Column, Integer, String, Text, ForeignKey, Enum as SQLEnum, Index, func, text
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.db.base import Base

class ModalityCategory(str, enum.Enum):
    IMAGING = "imaging"
    PATIENT_MONITORING = "patient_monitoring"
    LABORATORY = "laboratory"
    TREATMENT = "treatment"

class Modality(Base):
    __tablename__ = "modalities"
    # A name is unique within its modality and its list (the current list, or
    # the old list kept on existing assets), so "Laser System" can sit under
    # two modalities and the current list can reuse old names.
    __table_args__ = (
        Index(
            "uq_modalities_list_parent_name",
            "is_legacy",
            func.coalesce(text("parent_id"), 0),
            "name",
            unique=True,
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    category = Column(SQLEnum(ModalityCategory), nullable=False)
    description = Column(Text, nullable=True)
    inspection_frequency_days = Column(Integer, nullable=True)
    parent_id = Column(Integer, ForeignKey("modalities.id"), nullable=True)
    # The old list: kept on the assets that use it, never offered for a new asset.
    is_legacy = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    # The inspection form a new asset of this type gets: the sub-modality's,
    # or else its modality's. A hidden form is never given.
    inspection_form_id = Column(Integer, ForeignKey("inspection_forms.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    parent = relationship("Modality", remote_side=[id], back_populates="children")
    children = relationship("Modality", back_populates="parent", cascade="all, delete-orphan")
    equipment = relationship("Equipment", back_populates="modality")
    inspection_forms = relationship("InspectionForm", back_populates="modality", foreign_keys="InspectionForm.modality_id")
    inspection_form = relationship("InspectionForm", foreign_keys=[inspection_form_id])
