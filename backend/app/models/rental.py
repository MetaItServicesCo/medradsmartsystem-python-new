from sqlalchemy import Column, Integer, String, Text, DateTime, Date, Boolean, ForeignKey, Enum as SQLEnum, Index, Numeric, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.db.base import Base

class RentalStatus(str, enum.Enum):
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

class BillingFrequency(str, enum.Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    BIWEEKLY = "biweekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    CUSTOM = "custom"

class RentalDiscountType(str, enum.Enum):
    FLAT = "flat"
    PERCENT = "percent"

class RentalDepositStatus(str, enum.Enum):
    HELD = "held"
    REFUNDED = "refunded"
    DEDUCTED = "deducted"
    WAIVED = "waived"

class RentalItemStatus(str, enum.Enum):
    OUT = "out"
    RETURNED = "returned"


class RentalExtensionStatus(str, enum.Enum):
    REQUESTED = "requested"
    OFFERED = "offered"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class RentalDiscountPackage(Base):
    """Reusable discount template for new rental agreements.

    Agreements continue to store their own pricing fields. This table is only a
    convenience template, so editing or retiring a package can never rewrite a
    signed agreement or an existing billing schedule.
    """
    __tablename__ = "rental_discount_packages"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    name_key = Column(String(120), nullable=False, unique=True, index=True)
    discount_type = Column(String(20), nullable=False)  # flat | percent
    discount_value = Column(Numeric(10, 2), nullable=False)
    application_mode = Column(String(30), nullable=False, default="single_invoice")
    invoice_number = Column(Integer, nullable=False, default=1)
    continue_after = Column(Boolean, nullable=False, default=False)
    requires_saved_card = Column(Boolean, nullable=False, default=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

class Rental(Base):
    __tablename__ = "rentals"
    __table_args__ = (
        Index("ix_rentals_status_start_created", "status", "start_date", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    rental_number = Column(String, unique=True, nullable=False, index=True)
    converted_invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    facility_id = Column(Integer, ForeignKey("facilities.id", ondelete="SET NULL"), nullable=True, index=True)
    customer_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    customer_name = Column(String, nullable=False)
    customer_email = Column(String, nullable=False)
    customer_phone = Column(String, nullable=False)
    # Additional agreement recipients are stored as structured delivery metadata.
    # Each entry contains user_id (when internal), name, and email; the primary
    # customer remains the signer/payer and is stored in the columns above.
    secondary_recipients = Column(JSON, nullable=False, default=list)
    # customer_address is the composed single-line delivery address (also used on the
    # invoice). The structured parts below are the source of truth; customer_address is
    # rebuilt from them on save so every existing reader keeps working unchanged.
    customer_address = Column(Text, nullable=False)
    delivery_street = Column(String, nullable=True)
    delivery_city = Column(String, nullable=True)
    delivery_state = Column(String, nullable=True)
    delivery_zip = Column(String, nullable=True)
    billing_frequency = Column(SQLEnum(BillingFrequency), nullable=False)
    security_deposit = Column(Numeric(10, 2), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    status = Column(SQLEnum(RentalStatus), default=RentalStatus.ACTIVE)
    terms_and_conditions = Column(Text, nullable=True)
    history = Column(JSON, nullable=True)

    # Recurring billing + auto-charge configuration.
    auto_charge = Column(Boolean, nullable=False, default=False)
    # Soft reference to the saved card-on-file authorization; wired to Square in
    # the recurring-billing phase.
    payment_authorization_id = Column(Integer, nullable=True)
    # Square stored-card id used to auto-charge each period, and how many
    # consecutive auto-charge attempts have failed (the customer is notified after 3).
    square_card_id = Column(String, nullable=True)
    square_customer_id = Column(String, nullable=True)
    failed_charge_count = Column(Integer, nullable=False, default=0)
    committed_periods = Column(Integer, nullable=True)
    periods_billed = Column(Integer, nullable=False, default=0)
    next_bill_date = Column(Date, nullable=True)

    # Customer-facing portal: a hashed access token for the public agreement link.
    access_token_hash = Column(String, nullable=True, unique=True, index=True)
    token_expires_at = Column(DateTime, nullable=True)
    portal_sent_at = Column(DateTime, nullable=True)
    revision = Column(Integer, nullable=False, default=1)

    # PCI-minimized display metadata. The card number/CVV are never stored.
    square_card_brand = Column(String, nullable=True)
    square_card_last4 = Column(String, nullable=True)
    square_card_exp_month = Column(Integer, nullable=True)
    square_card_exp_year = Column(Integer, nullable=True)
    auto_charge_authorized_at = Column(DateTime, nullable=True)
    auto_charge_authorized_by = Column(String, nullable=True)

    # Commitment discount, applied once a payment milestone is reached (e.g. a
    # 4-month deal's discount lands on the 4th invoice after 3 periods are paid).
    # Stored as plain strings (RentalDiscountType values) per the house convention.
    discount_type = Column(String, nullable=True)  # 'flat' | 'percent'
    discount_value = Column(Numeric(10, 2), nullable=True)
    discount_apply_after_periods = Column(Integer, nullable=True)
    # Explicit, customer-visible discount schedule. The legacy
    # discount_apply_after_periods field remains readable for old agreements.
    discount_application_mode = Column(String, nullable=False, default="single_invoice")  # single_invoice | commitment
    discount_invoice_number = Column(Integer, nullable=True)
    discount_continue = Column(Boolean, nullable=False, default=False)
    discount_requires_card = Column(Boolean, nullable=False, default=False)

    # Security-deposit settlement, resolved on final return.
    deposit_status = Column(String, nullable=True)  # RentalDepositStatus values
    deposit_settled_amount = Column(Numeric(10, 2), nullable=True)

    # --- Deprecated single-item columns (kept for backfill/rollback safety;
    # superseded by RentalItem rows and dropped in a later cleanup migration). ---
    equipment_id = Column(Integer, ForeignKey("equipment.id"), nullable=True)
    part_id = Column(Integer, ForeignKey("inventory_parts.id"), nullable=True, index=True)
    rental_rate = Column(Numeric(10, 2), nullable=True)
    quantity = Column(Integer, nullable=True, default=1)
    shipping_fee = Column(Numeric(10, 2), nullable=True, default=0)
    setup_fee = Column(Numeric(10, 2), nullable=True, default=0)
    item_condition = Column(String, nullable=True)
    actual_return_date = Column(Date, nullable=True)
    initial_condition = Column(Text, nullable=True)
    return_condition = Column(Text, nullable=True)
    initial_meter_reading = Column(Text, nullable=True)
    final_meter_reading = Column(Integer, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    items = relationship(
        "RentalItem",
        back_populates="rental",
        cascade="all, delete-orphan",
        order_by="RentalItem.id",
    )
    converted_invoice = relationship("Invoice", foreign_keys=[converted_invoice_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
    customer_user = relationship("User", foreign_keys=[customer_user_id])
    facility = relationship("Facility")
    acceptance = relationship(
        "RentalAgreementAcceptance",
        back_populates="rental",
        cascade="all, delete-orphan",
        uselist=False,
        lazy="selectin",
    )
    extensions = relationship(
        "RentalExtensionRequest",
        back_populates="rental",
        cascade="all, delete-orphan",
        order_by="RentalExtensionRequest.sequence",
        lazy="selectin",
    )
    # Legacy single-item relationships (deprecated).
    equipment = relationship("Equipment")
    part = relationship("InventoryPart", foreign_keys=[part_id])


class RentalItem(Base):
    __tablename__ = "rental_items"

    id = Column(Integer, primary_key=True, index=True)
    rental_id = Column(Integer, ForeignKey("rentals.id", ondelete="CASCADE"), nullable=False, index=True)
    part_id = Column(Integer, ForeignKey("inventory_parts.id"), nullable=True, index=True)
    equipment_id = Column(Integer, ForeignKey("equipment.id"), nullable=True)

    # Snapshots so the line reads correctly even if the catalog changes later.
    part_number = Column(String, nullable=True)
    part_description = Column(String, nullable=True)

    quantity = Column(Integer, nullable=False, default=1)
    rental_rate = Column(Numeric(10, 2), nullable=False, default=0)
    item_condition = Column(String, nullable=True)
    shipping_fee = Column(Numeric(10, 2), nullable=False, default=0)
    setup_fee = Column(Numeric(10, 2), nullable=False, default=0)
    labor_fee = Column(Numeric(10, 2), nullable=False, default=0)
    removal_fee = Column(Numeric(10, 2), nullable=False, default=0)
    security_deposit = Column(Numeric(10, 2), nullable=False, default=0)
    deposit_status = Column(String, nullable=True)
    deposit_settled_amount = Column(Numeric(10, 2), nullable=True)

    initial_condition = Column(Text, nullable=True)
    return_condition = Column(Text, nullable=True)
    initial_meter_reading = Column(Text, nullable=True)
    final_meter_reading = Column(Integer, nullable=True)

    # Per-item return, enabling partial returns of a multi-item agreement.
    returned_at = Column(Date, nullable=True)
    item_status = Column(String, nullable=False, default=RentalItemStatus.OUT.value)  # 'out' | 'returned'

    created_at = Column(DateTime, default=datetime.utcnow)

    rental = relationship("Rental", back_populates="items")
    part = relationship("InventoryPart")
    equipment = relationship("Equipment")


class RentalProductRate(Base):
    """Per-product rate card driving term-tiered pricing (e.g. bed = $2,500/week,
    $5,000/month). Selecting an agreement's frequency auto-fills the item rate."""
    __tablename__ = "rental_product_rates"

    id = Column(Integer, primary_key=True, index=True)
    part_id = Column(Integer, ForeignKey("inventory_parts.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    daily_rate = Column(Numeric(10, 2), nullable=True)
    weekly_rate = Column(Numeric(10, 2), nullable=True)
    biweekly_rate = Column(Numeric(10, 2), nullable=True)
    monthly_rate = Column(Numeric(10, 2), nullable=True)
    quarterly_rate = Column(Numeric(10, 2), nullable=True)
    default_deposit = Column(Numeric(10, 2), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    part = relationship("InventoryPart")


class RentalAgreementAcceptance(Base):
    """Immutable evidence of the customer-visible agreement revision accepted."""
    __tablename__ = "rental_agreement_acceptances"
    __table_args__ = (
        UniqueConstraint("rental_id", name="uq_rental_acceptance_rental"),
    )

    id = Column(Integer, primary_key=True, index=True)
    rental_id = Column(Integer, ForeignKey("rentals.id", ondelete="CASCADE"), nullable=False, index=True)
    accepted_by_name = Column(String, nullable=False)
    signature_name = Column(String, nullable=False)
    terms_accepted = Column(Boolean, nullable=False, default=False)
    agreement_revision = Column(Integer, nullable=False, default=1)
    agreement_snapshot = Column(JSON, nullable=False)
    pricing_snapshot = Column(JSON, nullable=False)
    ip_address = Column(String, nullable=True)
    user_agent = Column(Text, nullable=True)
    accepted_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    rental = relationship("Rental", back_populates="acceptance")


class RentalExtensionRequest(Base):
    """Auditable amendment request that can extend, but never rewrite, an agreement."""
    __tablename__ = "rental_extension_requests"
    __table_args__ = (
        UniqueConstraint("rental_id", "sequence", name="uq_rental_extension_sequence"),
        Index("ix_rental_extensions_rental_status", "rental_id", "status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    rental_id = Column(Integer, ForeignKey("rentals.id", ondelete="CASCADE"), nullable=False, index=True)
    sequence = Column(Integer, nullable=False)
    status = Column(String, nullable=False, default=RentalExtensionStatus.REQUESTED.value, index=True)

    requested_end_date = Column(Date, nullable=True)
    requested_additional_periods = Column(Integer, nullable=True)
    request_reason = Column(Text, nullable=True)
    requested_by_name = Column(String, nullable=False)
    requested_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    requested_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    original_end_date = Column(Date, nullable=False)
    original_committed_periods = Column(Integer, nullable=True)
    offered_end_date = Column(Date, nullable=True)
    offered_total_periods = Column(Integer, nullable=True)
    offered_terms = Column(Text, nullable=True)
    offered_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    offered_at = Column(DateTime, nullable=True)
    rejected_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    rejected_at = Column(DateTime, nullable=True)
    decision_notes = Column(Text, nullable=True)

    access_token_hash = Column(String, nullable=True, unique=True, index=True)
    token_expires_at = Column(DateTime, nullable=True)
    portal_sent_at = Column(DateTime, nullable=True)

    accepted_by_name = Column(String, nullable=True)
    signature_name = Column(String, nullable=True)
    terms_accepted = Column(Boolean, nullable=False, default=False)
    continue_auto_charge = Column(Boolean, nullable=False, default=False)
    amendment_snapshot = Column(JSON, nullable=True)
    ip_address = Column(String, nullable=True)
    user_agent = Column(Text, nullable=True)
    accepted_at = Column(DateTime, nullable=True)
    activated_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    rental = relationship("Rental", back_populates="extensions")
    requested_by_user = relationship("User", foreign_keys=[requested_by_user_id])
    offered_by = relationship("User", foreign_keys=[offered_by_id])
    rejected_by = relationship("User", foreign_keys=[rejected_by_id])
