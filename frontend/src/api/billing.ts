import apiClient from './client'
import { completePaymentRequest, paymentRequestKey } from '@/utils/paymentIdempotency'

export interface InvoiceBillingApproval {
  id: number
  invoice_number: string
  billing_approval_status: 'pending' | 'approved'
  approved_for_billing_by_id?: number | null
  approved_for_billing_by_name?: string | null
  approved_for_billing_at?: string | null
  approved_total_amount?: number | null
  approval_invalidated_at?: string | null
}

export const approveInvoiceForBilling = async (invoiceId: number): Promise<InvoiceBillingApproval> => {
  const response = await apiClient.put(`/billing/invoices/${invoiceId}/approve`)
  return response.data
}

export const recordInvoicePayment = async (
  invoiceId: number,
  data: { amount: number; payment_method: string; notes?: string },
) => {
  const fingerprint = `invoice:${invoiceId}:${Number(data.amount).toFixed(2)}:${data.payment_method}`
  const response = await apiClient.post(`/billing/invoices/${invoiceId}/payments`, {
    ...data,
    idempotency_key: paymentRequestKey(fingerprint),
  })
  completePaymentRequest(fingerprint)
  return response.data
}
