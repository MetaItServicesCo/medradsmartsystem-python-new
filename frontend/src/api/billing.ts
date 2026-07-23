import apiClient from './client'

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
  const response = await apiClient.post(`/billing/invoices/${invoiceId}/payments`, data)
  return response.data
}
