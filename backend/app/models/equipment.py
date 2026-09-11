from sqlalchemy import Column, Integer, String, DateTime, Date, ForeignKey, Enum as SQLEnum, Text, Numeric, Index
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.db.base import Base

class EquipmentStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    RENTED = "rented"
    IN_MAINTENANCE = "in_maintenance"
    RETIRED = "retired"

class Equipment(Base):
    __tablename__ = "equipment"
    __table_args__ = (
        Index("ix_equipment_facility_status_created", "facility_id", "status", "created_at"),
        Index("ix_equipment_facility_created", "facility_id", "created_at"),
    )
    
    id = Column(Integer, primary_key=True, index=True)
    asset_tag = Column(String, nullable=False, index=True)
    make = Column(String, nullable=False)
    model = Column(String, nullable=False)
    serial_number = Column(String, nullable=False, index=True)
    modality_id = Column(Integer, ForeignKey("modalities.id"), nullable=False)
    facility_id = Column(Integer, ForeignKey("facilities.id"), nullable=False, index=True)
    tier_id = Column(Integer, ForeignKey("tiers.id"), nullable=True)
    inspection_form_id = Column(Integer, ForeignKey("inspection_forms.id"), nullable=True)

    # ── Facilities / MEP ────────────────────────────────────────────────────
    # Added so plant assets live in this table rather than a third one. There
    # are already two near-identical asset tables here (this and InventoryPart,
    # which repeats the acquisition, warranty and PM blocks column for column);
    # a third would make every report choose which two of three to union.
    #
    # `modality_id` stays NOT NULL and keeps classifying the biomedical side.
    # `discipline_id` answers the different question MEP work asks — which
    # trade owns this, and who gets dispatched.
    discipline_id = Column(Integer, ForeignKey("disciplines.id", ondelete="SET NULL"), nullable=True, index=True)

    # Structured placement. `location` above is the legacy free-text string and
    # is left exactly as it is: it holds years of typed-in data, nothing is
    # gained by destroying it, and it becomes the fallback display when an
    # asset has not been placed in the tree yet.
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True, index=True)

    # Physical containment, distinct from the service edges in
    # `asset_serves_asset`. A breaker is *in* a panel; a panel *feeds* a
    # receptacle. Conflating the two makes both untraversable.
    parent_equipment_id = Column(Integer, ForeignKey("equipment.id", ondelete="SET NULL"), nullable=True, index=True)

    # Consequence of failure for this asset specifically. Usually inherited from
    # the space it serves, and overridable: a generator sitting in an unremarkable
    # yard is critical because of what depends on it, not because of where it is.
    criticality = Column(String, nullable=True, index=True)
    electrical_branch = Column(String, nullable=True)

    # The vendor who maintains it under contract, where one does. Elevators and
    # fire alarm are nearly always somebody else's to touch.
    service_vendor_id = Column(Integer, ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True, index=True)

    # ── Depreciation ────────────────────────────────────────────────────────
    # `cost` above is the acquisition figure and already exists. These are the
    # remaining inputs a book value needs. All nullable: an asset without them
    # reports "no book value can be computed" rather than a misleading zero.
    #
    # Useful life is seeded from the asset's discipline on create — a lift is
    # twenty years, a clinical monitor is seven — because nobody types a life
    # four hundred times.
    depreciation_method = Column(String, nullable=True)
    salvage_value = Column(Numeric(14, 2), nullable=True)
    useful_life_years = Column(Numeric(5, 2), nullable=True)
    # For units-of-production: a generator's rated service hours. Kept here
    # rather than derived so a rating from the nameplate is not confused with
    # hours actually run, which comes from the runtime reading point.
    total_expected_units = Column(Numeric(14, 2), nullable=True)
    default_picture_url = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
    risk_priority = Column(String, nullable=True)
    risk_name = Column(String, nullable=True)
    location = Column(String, nullable=True)
    inventory_date = Column(Date, nullable=True)
    acquisition_authorized_by = Column(String, nullable=True)
    department = Column(String, nullable=True)
    po_no = Column(String, nullable=True)
    requester_first_name = Column(String, nullable=True)
    requester_last_name = Column(String, nullable=True)
    requester_phone = Column(String, nullable=True)
    requester_fax = Column(String, nullable=True)
    requester_mailing_address = Column(Text, nullable=True)
    requester_email = Column(String, nullable=True)
    owning_department = Column(String, nullable=True)
    acquisition_method = Column(String, nullable=True)
    acquired_company_name = Column(String, nullable=True)
    acquired_account_number = Column(String, nullable=True)
    acquired_sales_person = Column(String, nullable=True)
    acquired_phone = Column(String, nullable=True)
    acquired_email = Column(String, nullable=True)
    acquired_mailing_address = Column(Text, nullable=True)
    cost = Column(Numeric(10, 2), nullable=True)
    acquisition_date = Column(Date, nullable=True)
    capital_equipment = Column(String, nullable=True)
    warranty_duration = Column(String, nullable=True)
    parts_duration = Column(String, nullable=True)
    labor_duration = Column(String, nullable=True)
    coverage_start_date = Column(Date, nullable=True)
    coverage_type = Column(String, nullable=True)
    part_warranty_end_date = Column(Date, nullable=True)
    labor_warranty_end_date = Column(Date, nullable=True)
    pm_scheduling = Column(String, nullable=True)
    installation_date = Column(Date, nullable=True)
    last_pm_date = Column(Date, nullable=True)
    next_generated_pm_date = Column(Date, nullable=True)
    purchase_date = Column(Date, nullable=True)
    warranty_expiration = Column(Date, nullable=True)
    status = Column(SQLEnum(EquipmentStatus), default=EquipmentStatus.ACTIVE)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    facility = relationship("Facility", back_populates="equipment")
    modality = relationship("Modality", back_populates="equipment")
    tier = relationship("Tier")
    inspection_form = relationship("InspectionForm")
    service_requests = relationship("ServiceRequest", back_populates="equipment")
    inspections = relationship("Inspection", back_populates="equipment")
    equipment_facilities = relationship("EquipmentFacility", back_populates="equipment", cascade="all, delete-orphan")

    # ── Facilities / MEP ────────────────────────────────────────────────────
    discipline = relationship("Discipline")
    structured_location = relationship("Location", foreign_keys=[location_id])
    service_vendor = relationship("Vendor", foreign_keys=[service_vendor_id])
    parent_equipment = relationship(
        "Equipment", remote_side=[id], backref="child_equipment", foreign_keys=[parent_equipment_id],
    )
    serves_assets = relationship(
        "AssetServesAsset",
        foreign_keys="AssetServesAsset.upstream_equipment_id",
        back_populates="upstream",
        cascade="all, delete-orphan",
    )
    served_by_assets = relationship(
        "AssetServesAsset",
        foreign_keys="AssetServesAsset.downstream_equipment_id",
        back_populates="downstream",
        cascade="all, delete-orphan",
    )
    serves_locations = relationship(
        "AssetServesLocation", back_populates="equipment", cascade="all, delete-orphan",
    )
    ledger_entries = relationship(
        "AssetLedgerEntry", back_populates="equipment", cascade="all, delete-orphan",
        order_by="AssetLedgerEntry.effective_date.desc()",
    )
