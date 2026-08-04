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
    # `daily` is retained for legacy rows only; the UI no longer offers it.
    DAILY = "daily"
    WEEKLY = "weekly"
    BIWEEKLY = "biweekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"

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

class Rental(Base):
    __tablename__ = "rentals"
    __table_args__ = (
        Index("ix_rentals_status_start_created", "status", "start_date", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    rental_number = Column(String, unique=True, nullable=False, index=True)
    converted_invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    customer_name = Column(String, nullable=False)
    customer_email = Column(String, nullable=False)
    customer_phone = Column(String, nullable=False)
    customer_address = Column(Text, nullable=False)
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
    created_by = relationship("User")
    acceptance = relationship(
        "RentalAgreementAcceptance",
        back_populates="rental",
        cascade="all, delete-orphan",
        uselist=False,
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
