"""How a lease-to-own agreement is described to staff and to the customer.

One presenter for both, so the two cannot disagree about what is owed. The
customer view is the staff view with the internal parts removed -- history,
consent evidence, who created it -- never a separately computed figure.
"""
from __future__ import annotations

from typing import Any, Optional

from app.models.invoice import Invoice, InvoiceStatus
from app.models.lease import LeaseAgreement
from app.utils import lease_service as svc
from app.utils.lease_math import money


def _money_str(value: Any) -> str:
    return str(money(value))


def _invoice_brief(invoice: Optional[Invoice]) -> Optional[dict[str, Any]]:
    if invoice is None:
        return None
    status = invoice.status.value if hasattr(invoice.status, "value") else invoice.status
    return {
        "id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "status": status,
        "total_amount": _money_str(invoice.total_amount),
        "amount_paid": _money_str(invoice.amount_paid),
        "balance_due": _money_str(invoice.balance_due),
        "due_date": invoice.due_date.isoformat() if invoice.due_date else None,
        "payable": status in (InvoiceStatus.PENDING.value, InvoiceStatus.OVERDUE.value,
                              InvoiceStatus.PARTIALLY_PAID.value) and money(invoice.balance_due) > 0,
    }


def lease_summary(agreement: LeaseAgreement) -> dict[str, Any]:
    paid = sum(1 for i in agreement.installments if i.status == "paid")
    next_due = next((i for i in agreement.installments if i.status in ("scheduled", "invoiced")), None)
    return {
        "id": agreement.id,
        "agreement_number": agreement.agreement_number,
        "status": agreement.status,
        "stage": svc.stage(agreement),
        "customer_name": agreement.customer_name,
        "customer_email": agreement.customer_email,
        "facility_id": agreement.facility_id,
        "item_description": agreement.item_description,
        "item_part_number": agreement.item_part_number,
        "quantity": agreement.quantity,
        "total_of_payments": _money_str(agreement.total_of_payments),
        "regular_installment": _money_str(agreement.regular_installment),
        "installment_count": agreement.installment_count,
        "installments_paid": paid,
        "frequency": agreement.frequency,
        "next_due_date": next_due.due_date.isoformat() if next_due else None,
        "auto_charge": bool(agreement.auto_charge),
        "created_at": agreement.created_at.isoformat() if agreement.created_at else None,
    }


def lease_detail(agreement: LeaseAgreement, *, staff: bool) -> dict[str, Any]:
    quote = svc.quote_buyout(agreement) if agreement.status in ("active", "in_default") else None
    outstanding = []
    for invoice in [agreement.down_payment_invoice, agreement.buyout_invoice] + [
        inv for i in agreement.installments for inv in (i.invoice, i.late_fee_invoice)
    ]:
        brief = _invoice_brief(invoice)
        if brief and brief["payable"]:
            outstanding.append(brief)

    data: dict[str, Any] = {
        **lease_summary(agreement),
        "revision": agreement.revision,
        "customer_phone": agreement.customer_phone,
        "customer_address": agreement.customer_address,
        "unit_cash_price": _money_str(agreement.unit_cash_price),
        "cash_price": _money_str(agreement.cash_price),
        "markup_percent": str(agreement.markup_percent),
        "markup_amount": _money_str(agreement.markup_amount),
        "lease_price": _money_str(agreement.lease_price),
        "down_payment": _money_str(agreement.down_payment),
        "down_payment_tax": _money_str(agreement.down_payment_tax),
        "down_payment_total": _money_str(money(agreement.down_payment) + money(agreement.down_payment_tax)),
        "tax_rate_percent": str(agreement.tax_rate_percent),
        "total_tax": _money_str(agreement.total_tax),
        "first_due_date": agreement.first_due_date.isoformat() if agreement.first_due_date else None,
        "grace_days": agreement.grace_days,
        "late_fee_amount": _money_str(agreement.late_fee_amount),
        "default_after_missed": agreement.default_after_missed,
        "invoice_lead_days": agreement.invoice_lead_days,
        "signed_at": agreement.signed_at.isoformat() if agreement.signed_at else None,
        "signed_by_name": agreement.signed_by_name,
        "activated_at": agreement.activated_at.isoformat() if agreement.activated_at else None,
        "completed_at": agreement.completed_at.isoformat() if agreement.completed_at else None,
        "completion_method": agreement.completion_method,
        "cancelled_at": agreement.cancelled_at.isoformat() if agreement.cancelled_at else None,
        "card": ({
            "brand": agreement.square_card_brand,
            "last4": agreement.square_card_last4,
            "exp_month": agreement.square_card_exp_month,
            "exp_year": agreement.square_card_exp_year,
        } if agreement.square_card_last4 else None),
        "down_payment_invoice": _invoice_brief(agreement.down_payment_invoice),
        "buyout_invoice": _invoice_brief(agreement.buyout_invoice),
        "buyout_quote": ({
            "remaining_principal": _money_str(quote.remaining_principal),
            "waived_markup": _money_str(quote.waived_markup),
            "tax": _money_str(quote.tax),
            "outstanding_fees": _money_str(quote.outstanding_fees),
            "total": _money_str(quote.total),
        } if quote and quote.total > 0 else None),
        "outstanding_invoices": outstanding,
        "amount_outstanding": _money_str(sum((money(i["balance_due"]) for i in outstanding), money(0))),
        "installments": [{
            "number": i.number,
            "due_date": i.due_date.isoformat(),
            "principal": _money_str(i.principal),
            "markup": _money_str(i.markup),
            "amount": _money_str(i.amount),
            "tax": _money_str(i.tax),
            "total": _money_str(i.total),
            "status": i.status,
            "invoice": _invoice_brief(i.invoice),
            "late_fee": _invoice_brief(i.late_fee_invoice),
        } for i in agreement.installments],
    }
    if staff:
        data.update({
            "cancellation_reason": agreement.cancellation_reason,
            "stock_committed": bool(agreement.stock_committed),
            "stock_returned": bool(agreement.stock_returned),
            "overpayment_amount": _money_str(agreement.overpayment_amount),
            "failed_charge_count": agreement.failed_charge_count,
            "card_cleanup_pending": bool(agreement.card_cleanup_pending),
            "part_id": agreement.part_id,
            "customer_user_id": agreement.customer_user_id,
            "notes": agreement.notes,
            "sent_at": agreement.sent_at.isoformat() if agreement.sent_at else None,
            "history": list(reversed(agreement.history or [])),
            "authorizations": [{
                "event_type": a.event_type,
                "accepted_by_name": a.accepted_by_name,
                "channel": a.channel,
                "consent_text": a.consent_text,
                "card_last4": a.card_last4,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            } for a in agreement.authorizations],
            "created_by": agreement.created_by.full_name if agreement.created_by else None,
        })
    else:
        # What the customer is agreeing to, worded exactly as it is recorded.
        data["consent_text"] = svc.consent_text(agreement)
        data["auto_charge_consent"] = svc.AUTO_CHARGE_CONSENT.format(
            company="Mr. BioMed Tech Services", last4="(your card)", number=agreement.agreement_number)
    return data
