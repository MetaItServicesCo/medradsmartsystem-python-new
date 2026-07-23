from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.invoice import InvoiceStatus
from app.models.user import UserRole
from app.utils.invoice_approval import (
    BILLING_APPROVAL_APPROVED,
    BILLING_APPROVAL_PENDING,
    approve_invoice_for_billing,
    ensure_financial_edit_allowed,
    has_financial_edits,
    invalidate_invoice_approval,
    is_invoice_approver,
    is_invoice_payer,
    require_invoice_approved,
    validate_requested_payment_status,
)


class _FakeSession:
    def __init__(self):
        self.added = []

    def query(self, *_args):
        return self

    def filter(self, *_args):
        return self

    def count(self):
        return len(self.added)

    def add(self, item):
        self.added.append(item)


def _user(role: UserRole, *, user_id: int = 1, facility_id=None):
    return SimpleNamespace(
        id=user_id,
        role=role,
        facility_id=facility_id,
        full_name="Test User",
    )


def _invoice(approval_status=BILLING_APPROVAL_PENDING, *, paid=Decimal("0")):
    return SimpleNamespace(
        id=12,
        invoice_number="INV-TEST-12",
        facility_id=4,
        status=InvoiceStatus.PENDING,
        total_amount=Decimal("125.00"),
        amount_paid=paid,
        billing_approval_status=approval_status,
        approved_for_billing_by_id=None,
        approved_for_billing_at=None,
        approved_total_amount=None,
        approval_invalidated_at=None,
        updated_at=None,
        subtotal=Decimal("125.00"),
        tax_amount=Decimal("0"),
        discount_amount=Decimal("0"),
        notes=None,
    )


def test_only_internal_unscoped_admins_can_approve():
    assert is_invoice_approver(_user(UserRole.SUPERADMIN))
    assert is_invoice_approver(_user(UserRole.ADMIN))
    assert not is_invoice_approver(_user(UserRole.ADMIN, facility_id=4))
    assert not is_invoice_approver(_user(UserRole.FACILITY_ADMIN, facility_id=4))


def test_payment_roles_exclude_internal_admin_but_include_superadmin_and_facility_users():
    assert is_invoice_payer(_user(UserRole.SUPERADMIN))
    assert not is_invoice_payer(_user(UserRole.ADMIN))
    assert is_invoice_payer(_user(UserRole.FACILITY_ADMIN, facility_id=4))
    assert is_invoice_payer(_user(UserRole.FACILITY_MANAGER, facility_id=4))
    assert is_invoice_payer(_user(UserRole.CLIENT, facility_id=4))


def test_pending_invoice_cannot_be_paid():
    with pytest.raises(HTTPException) as error:
        require_invoice_approved(_invoice())
    assert error.value.status_code == 409


def test_approval_records_snapshot_actor_and_ledger_entry():
    db = _FakeSession()
    invoice = _invoice()
    approver = _user(UserRole.ADMIN, user_id=8)

    approve_invoice_for_billing(db, invoice, approver)

    assert invoice.billing_approval_status == BILLING_APPROVAL_APPROVED
    assert invoice.approved_for_billing_by_id == 8
    assert invoice.approved_total_amount == Decimal("125.00")
    assert invoice.approved_for_billing_at is not None
    assert len(db.added) == 1
    assert db.added[0].transaction_type == "billing_approved"


def test_approval_is_idempotent_at_same_total():
    db = _FakeSession()
    invoice = _invoice(BILLING_APPROVAL_APPROVED)
    invoice.approved_total_amount = invoice.total_amount

    approve_invoice_for_billing(db, invoice, _user(UserRole.SUPERADMIN))

    assert db.added == []


def test_financial_edit_invalidates_approval_and_is_audited():
    db = _FakeSession()
    invoice = _invoice(BILLING_APPROVAL_APPROVED)
    invoice.approved_for_billing_by_id = 8
    invoice.approved_for_billing_at = object()
    invoice.approved_total_amount = invoice.total_amount

    changed = invalidate_invoice_approval(db, invoice, _user(UserRole.ADMIN))

    assert changed
    assert invoice.billing_approval_status == BILLING_APPROVAL_PENDING
    assert invoice.approved_for_billing_by_id is None
    assert invoice.approved_total_amount is None
    assert invoice.approval_invalidated_at is not None
    assert db.added[0].transaction_type == "billing_approval_invalidated"


def test_financial_edit_is_locked_after_any_payment():
    invoice = _invoice(BILLING_APPROVAL_APPROVED, paid=Decimal("1.00"))

    with pytest.raises(HTTPException) as error:
        ensure_financial_edit_allowed(invoice, {"tax_amount": Decimal("5.00")})

    assert error.value.status_code == 409


def test_unchanged_financial_fields_do_not_invalidate_or_block_nonfinancial_edits():
    invoice = _invoice(BILLING_APPROVAL_APPROVED, paid=Decimal("125.00"))
    submitted = {
        "subtotal": Decimal("125.00"),
        "tax_amount": Decimal("0.00"),
        "discount_amount": Decimal("0.00"),
        "total_amount": Decimal("125.00"),
        "notes": "Updated customer-visible note",
    }

    assert not has_financial_edits(invoice, submitted)
    ensure_financial_edit_allowed(invoice, submitted)


def test_invoice_cannot_be_marked_paid_without_full_payment():
    invoice = _invoice(BILLING_APPROVAL_APPROVED)

    with pytest.raises(HTTPException) as error:
        validate_requested_payment_status(
            invoice,
            {"status": InvoiceStatus.PAID},
            Decimal("0"),
        )

    assert error.value.status_code == 400


def test_paid_invoice_cannot_be_cancelled():
    invoice = _invoice(BILLING_APPROVAL_APPROVED, paid=Decimal("125.00"))

    with pytest.raises(HTTPException) as error:
        validate_requested_payment_status(
            invoice,
            {"status": InvoiceStatus.CANCELLED},
            Decimal("125.00"),
        )

    assert error.value.status_code == 409
