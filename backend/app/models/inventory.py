from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, JSON, Numeric, String, Text
from sqlalchemy.orm import relationship
from datetime import datetime

from app.db.base import Base


class InventoryPart(Base):
    __tablename__ = "inventory_parts"

    id = Column(Integer, primary_key=True, index=True)
    facility_id = Column(Integer, ForeignKey("facilities.id"), nullable=False, index=True)
    tier_id = Column(Integer, ForeignKey("tiers.id"), nullable=True, index=True)
    modality_id = Column(Integer, ForeignKey("modalities.id"), nullable=True, index=True)
    inspection_form_id = Column(Integer, ForeignKey("inspection_forms.id"), nullable=True)

    asset_tag = Column(String, nullable=True, index=True)
    part_number = Column(String, nullable=False, index=True)
    part_type = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=False)
    make = Column(String, nullable=True)
    model = Column(String, nullable=True)
    default_picture_url = Column(Text, nullable=True)
    risk_priority = Column(String, nullable=True)
    risk_name = Column(String, nullable=True)
    inventory_date = Column(Date, nullable=True)
    unit_price = Column(Numeric(10, 2), nullable=False, default=0)
    condition = Column(String, nullable=False, default="new")

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

    supplier_name = Column(String, nullable=True)
    supplier_contact = Column(String, nullable=True)
    supplier_email = Column(String, nullable=True)
    supplier_phone = Column(String, nullable=True)
    technical_specs = Column(JSON, nullable=True)

    batch_number = Column(String, nullable=True, index=True)
    expiry_date = Column(Date, nullable=True, index=True)
    serial_number = Column(String, nullable=True, index=True)
    is_critical = Column(Boolean, default=False)

    quantity_on_hand = Column(Integer, nullable=False, default=0)
    reorder_level = Column(Integer, nullable=False, default=0)
    location = Column(String, nullable=True)
    status = Column(String, nullable=False, default="active")

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    facility = relationship("Facility", back_populates="inventory_parts")
    tier = relationship("Tier", back_populates="inventory_parts")
    modality = relationship("Modality")
    inspection_form = relationship("InspectionForm")
    transactions = relationship("InventoryTransaction", back_populates="part", cascade="all, delete-orphan")


class InventoryTransaction(Base):
    __tablename__ = "inventory_transactions"

    id = Column(Integer, primary_key=True, index=True)
    part_id = Column(Integer, ForeignKey("inventory_parts.id", ondelete="CASCADE"), nullable=False, index=True)
    facility_id = Column(Integer, ForeignKey("facilities.id"), nullable=False, index=True)
    transaction_type = Column(String, nullable=False, index=True)
    quantity = Column(Integer, nullable=False)
    unit_cost = Column(Numeric(10, 2), nullable=True)
    balance_after = Column(Integer, nullable=False, default=0)

    from_facility_id = Column(Integer, ForeignKey("facilities.id"), nullable=True)
    to_facility_id = Column(Integer, ForeignKey("facilities.id"), nullable=True)
    authorization_reference = Column(String, nullable=True)
    authorization_details = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)

    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    part = relationship("InventoryPart", back_populates="transactions")
    facility = relationship("Facility", foreign_keys=[facility_id])
    from_facility = relationship("Facility", foreign_keys=[from_facility_id])
    to_facility = relationship("Facility", foreign_keys=[to_facility_id])
    created_by = relationship("User")
