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

export interface PaymentProof {
  id: number
  invoice_id?: number | null
  service_quotation_id?: number | null
  target_type: 'invoice' | 'service_quotation'
  target_number?: string | null
  customer_name?: string | null
  payment_method: string
  claimed_amount: number
  notes?: string | null
  original_filename: string
  mime_type: string
  file_size: number
  status: 'pending_verification' | 'approved' | 'rejected' | string
  extraction_status: 'queued' | 'processing' | 'retry' | 'completed' | 'failed' | 'cancelled' | string
  extraction_attempt_count: number
  extraction_completed_at?: string | null
  extraction_last_error?: string | null
  ocr_provider?: string | null
  ocr_text?: string | null
  extracted_data: Record<string, any>
  extraction_confidence?: number | null
  mismatch_flags: string[]
  requires_manual_review: boolean
  submitted_by_id: number
  submitted_by_name?: string | null
  reviewed_by_id?: number | null
  reviewed_by_name?: string | null
  reviewed_at?: string | null
  review_notes?: string | null
  file_url: string
  created_at: string
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

export const submitInvoicePaymentProof = async (
  invoiceId: number,
  data: { amount: number; payment_method: string; notes?: string; file: File },
): Promise<PaymentProof> => {
  const form = new FormData()
  form.append('amount', String(data.amount))
  form.append('payment_method', data.payment_method)
  if (data.notes) form.append('notes', data.notes)
  form.append('proof_file', data.file)
  const response = await apiClient.post(`/billing/invoices/${invoiceId}/payment-proofs`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return response.data
}

export const fetchPaymentProofQueue = async (status = 'pending_verification'): Promise<PaymentProof[]> => {
  const response = await apiClient.get('/billing/payment-proofs', { params: { status } })
  return response.data
}

export const approveInvoicePaymentProof = async (proofId: number, notes?: string): Promise<PaymentProof> => {
  const response = await apiClient.post(`/billing/payment-proofs/${proofId}/approve`, { notes })
  return response.data
}

export const rejectInvoicePaymentProof = async (proofId: number, notes: string): Promise<PaymentProof> => {
  const response = await apiClient.post(`/billing/payment-proofs/${proofId}/reject`, { notes })
  return response.data
}

export const retryPaymentProofOcr = async (proofId: number): Promise<PaymentProof> => {
  const response = await apiClient.post(`/billing/payment-proofs/${proofId}/retry-ocr`)
  return response.data
}

export const openPaymentProofFile = async (proofId: number, filename: string): Promise<void> => {
  const response = await apiClient.get(`/billing/payment-proofs/${proofId}/file`, { responseType: 'blob' })
  const url = URL.createObjectURL(response.data)
  const opened = window.open(url, '_blank', 'noopener,noreferrer')
  if (!opened) {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
