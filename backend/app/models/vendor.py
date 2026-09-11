"""Vendors, their contracts, and the credentials that let them on site.

Today a supplier is three loose strings on `InventoryPart` — `supplier_name`,
`supplier_email`, `supplier_phone` — repeated on every row and reconcilable by
nobody. That is survivable for buying a filter and useless for the way a
hospital actually runs its plant, where elevators, fire alarm, generators and
medical gas are all maintained under contract by outside firms.

Three things here are not optional in a hospital, and each is a table rather
than a field for the same reason: something expires and somebody must be told.

  * `VendorCredential` — certificates of insurance and trade licences. An
    accreditation survey will ask you to evidence that the contractor working
    on your fire pump was licensed and insured on the day they did it. A lapsed
    COI should stop a dispatch, not surface in a spreadsheet a quarter later.
  * `VendorContract` — scope, term, and the response times actually promised.
    Tier SLAs cover in-house work; a vendor's obligations come from their
    contract and are frequently tighter (or much looser) than the house rate.
  * `VendorContact` — the after-hours number. At 02:00 the useful field is not
    the company's main line.
"""
from sqlalchemy import (
    Boolean, Column, Date, DateTime, ForeignKey, Index, Integer, JSON, Numeric,
    String, Text, UniqueConstraint,
)
from sqlalchemy.orm import relationship
from datetime import date, datetime
import enum

from app.db.base import Base
from app.utils.clock import utc_today


class VendorType(str, enum.Enum):
    SERVICE_CONTRACTOR = "service_contractor"
    MANUFACTURER = "manufacturer"
    DISTRIBUTOR = "distributor"
    CONSULTANT = "consultant"
    AUTHORITY = "authority"          # AHJ, state inspector, accrediting body


class VendorStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    # Not merely inactive — barred from dispatch. Set when credentials lapse or
    # after an incident, and deliberately distinct so that reinstating is a
    # decision somebody makes rather than a checkbox someone flips back.
    SUSPENDED = "suspended"


class CredentialType(str, enum.Enum):
    GENERAL_LIABILITY = "general_liability"        # COI
    WORKERS_COMP = "workers_comp"
    AUTO_LIABILITY = "auto_liability"
    UMBRELLA = "umbrella"
    PROFESSIONAL_LIABILITY = "professional_liability"
    STATE_LICENSE = "state_license"                # electrical, plumbing, mechanical
    ELEVATOR_MECHANIC_LICENSE = "elevator_mechanic_license"
    MEDICAL_GAS_CERT = "medical_gas_cert"          # ASSE 6010 / 6015 and similar
    BACKFLOW_TESTER_CERT = "backflow_tester_cert"
    NICET = "nicet"                                # fire alarm / sprinkler
    BUSINESS_LICENSE = "business_license"
    W9 = "w9"
    BAA = "baa"
    OTHER = "other"


class VendorContractType(str, enum.Enum):
    FULL_SERVICE = "full_service"     # parts and labour, everything covered
    PREVENTIVE_ONLY = "preventive_only"
    TIME_AND_MATERIALS = "time_and_materials"
    WARRANTY = "warranty"
    INSPECTION_ONLY = "inspection_only"
    MONITORING = "monitoring"


class VendorContractStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    EXPIRED = "expired"
    TERMINATED = "terminated"
    PENDING_RENEWAL = "pending_renewal"


class Vendor(Base):
    __tablename__ = "vendors"
    __table_args__ = (
        UniqueConstraint("code", name="uq_vendors_code"),
        Index("ix_vendors_status_name", "status", "name"),
    )

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(48), nullable=False, index=True)
    name = Column(String(255), nullable=False, index=True)
    legal_name = Column(String(255), nullable=True)
    vendor_type = Column(String(32), nullable=False, default=VendorType.SERVICE_CONTRACTOR.value, index=True)
    status = Column(String(16), nullable=False, default=VendorStatus.ACTIVE.value, index=True)

    # Which trades this firm is engaged for. A list of discipline ids rather
    # than a join table: it is read whole every time and never queried across.
    discipline_ids = Column(JSON, nullable=True, default=list)

    phone = Column(String(48), nullable=True)
    after_hours_phone = Column(String(48), nullable=True)
    email = Column(String(255), nullable=True)
    website = Column(String(255), nullable=True)

    address = Column(String(255), nullable=True)
    suite = Column(String(64), nullable=True)
    city = Column(String(128), nullable=True)
    state = Column(String(64), nullable=True)
    zip_code = Column(String(24), nullable=True)
    country = Column(String(64), nullable=True, default="United States")

    tax_id = Column(String(64), nullable=True)
    account_number = Column(String(64), nullable=True)

    # Denormalised roll-up of the credential table, refreshed whenever a
    # credential is written. The dispatch screen checks this on every
    # assignment and must not run three joins to do it.
    credentials_ok = Column(Boolean, nullable=False, default=False, index=True)
    earliest_credential_expiry = Column(Date, nullable=True, index=True)

    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    contacts = relationship("VendorContact", back_populates="vendor", cascade="all, delete-orphan")
    credentials = relationship("VendorCredential", back_populates="vendor", cascade="all, delete-orphan")
    contracts = relationship("VendorContract", back_populates="vendor", cascade="all, delete-orphan")

    @property
    def is_dispatchable(self) -> bool:
        """Active, not suspended, and papers in order."""
        return self.status == VendorStatus.ACTIVE.value and bool(self.credentials_ok)


class VendorContact(Base):
    __tablename__ = "vendor_contacts"
    __table_args__ = (
        Index("ix_vendor_contacts_vendor_primary", "vendor_id", "is_primary"),
    )

    id = Column(Integer, primary_key=True, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True)

    full_name = Column(String(255), nullable=False)
    title = Column(String(128), nullable=True)
    phone = Column(String(48), nullable=True)
    mobile = Column(String(48), nullable=True)
    email = Column(String(255), nullable=True)

    is_primary = Column(Boolean, nullable=False, default=False)
    # Who to wake up. Separate from `is_primary` because the account manager and
    # the person who answers at 02:00 are rarely the same human.
    is_escalation = Column(Boolean, nullable=False, default=False)
    escalation_order = Column(Integer, nullable=True)

    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    vendor = relationship("Vendor", back_populates="contacts")


class VendorCredential(Base):
    """One insurance certificate or licence, and the date it stops counting."""

    __tablename__ = "vendor_credentials"
    __table_args__ = (
        Index("ix_vendor_credentials_vendor_type", "vendor_id", "credential_type"),
    )

    id = Column(Integer, primary_key=True, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True)

    credential_type = Column(String(48), nullable=False, index=True)
    identifier = Column(String(128), nullable=True)     # policy or licence number
    issuer = Column(String(255), nullable=True)         # carrier or issuing state
    jurisdiction = Column(String(64), nullable=True)    # the state it is valid in

    issued_on = Column(Date, nullable=True)
    expires_on = Column(Date, nullable=True, index=True)
    coverage_amount = Column(Numeric(14, 2), nullable=True)

    document_filename = Column(String(255), nullable=True)
    document_path = Column(String(512), nullable=True)

    # Blocking credentials stop dispatch when they lapse. A W-9 expiring is an
    # accounting problem; a lapsed liability policy is a site-access problem,
    # and the two must not be enforced identically.
    is_blocking = Column(Boolean, nullable=False, default=True)

    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    vendor = relationship("Vendor", back_populates="credentials")

    @property
    def is_expired(self) -> bool:
        return self.expires_on is not None and self.expires_on < utc_today()

    @property
    def days_until_expiry(self) -> int | None:
        if self.expires_on is None:
            return None
        return (self.expires_on - utc_today()).days


class VendorContract(Base):
    """What the vendor is on the hook for, where, until when, and how fast."""

    __tablename__ = "vendor_contracts"
    __table_args__ = (
        UniqueConstraint("contract_number", name="uq_vendor_contracts_number"),
        Index("ix_vendor_contracts_facility_status", "facility_id", "status"),
        Index("ix_vendor_contracts_vendor_status", "vendor_id", "status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    contract_number = Column(String(64), nullable=False, index=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False, index=True)
    # NULL means the contract covers every facility in the tenancy.
    facility_id = Column(Integer, ForeignKey("facilities.id", ondelete="CASCADE"), nullable=True, index=True)

    title = Column(String(255), nullable=False)
    contract_type = Column(String(32), nullable=False, default=VendorContractType.FULL_SERVICE.value)
    status = Column(String(24), nullable=False, default=VendorContractStatus.DRAFT.value, index=True)

    # Scope is expressed one of three ways and they compose: by discipline (all
    # elevators), by explicit asset (these four chillers), or by location
    # subtree (everything in the east tower). Whichever is populated applies.
    discipline_ids = Column(JSON, nullable=True, default=list)
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)

    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True, index=True)
    # Distinct from end_date: the date somebody has to start the renewal
    # conversation, which for a fire alarm contract is months earlier.
    renewal_notice_date = Column(Date, nullable=True, index=True)
    auto_renews = Column(Boolean, nullable=False, default=False)

    annual_value = Column(Numeric(14, 2), nullable=True)
    labor_rate_per_hour = Column(Numeric(10, 2), nullable=True)
    overtime_rate_per_hour = Column(Numeric(10, 2), nullable=True)
    holiday_rate_per_hour = Column(Numeric(10, 2), nullable=True)
    trip_charge = Column(Numeric(10, 2), nullable=True)

    # Contractual response times in hours, by work order priority. A dict rather
    # than four columns because contracts do not agree on how many priority
    # bands they recognise, and a missing band should fall back rather than
    # force a fictional number into a column.
    # e.g. {"critical": 2, "high": 8, "medium": 24, "low": 72}
    response_hours_by_priority = Column(JSON, nullable=True, default=dict)
    covers_after_hours = Column(Boolean, nullable=False, default=False)
    covers_parts = Column(Boolean, nullable=False, default=False)

    scope_notes = Column(Text, nullable=True)
    document_filename = Column(String(255), nullable=True)
    document_path = Column(String(512), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    vendor = relationship("Vendor", back_populates="contracts")
    facility = relationship("Facility")
    location = relationship("Location")
    covered_assets = relationship(
        "VendorContractAsset", back_populates="contract", cascade="all, delete-orphan",
    )

    @property
    def is_current(self) -> bool:
        if self.status != VendorContractStatus.ACTIVE.value:
            return False
        today = utc_today()
        if self.start_date and self.start_date > today:
            return False
        if self.end_date and self.end_date < today:
            return False
        return True


class VendorContractAsset(Base):
    """Explicit per-asset coverage, for contracts written that way.

    Elevator contracts almost always are: five cars listed by number, each with
    its own state certificate, and the sixth car added last year quietly not
    covered. Making that a row is what surfaces the gap.
    """

    __tablename__ = "vendor_contract_assets"
    __table_args__ = (
        UniqueConstraint("contract_id", "equipment_id", name="uq_contract_asset"),
    )

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("vendor_contracts.id", ondelete="CASCADE"), nullable=False, index=True)
    equipment_id = Column(Integer, ForeignKey("equipment.id", ondelete="CASCADE"), nullable=False, index=True)

    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    contract = relationship("VendorContract", back_populates="covered_assets")
    equipment = relationship("Equipment")
