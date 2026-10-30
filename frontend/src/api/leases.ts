import apiClient from './client'

// Lease-to-own. Every money figure here arrives as a string from the server,
// already rounded to the cent by the backend's money module; the UI displays
// them and never recomputes them, so the screen cannot drift from the bill.

export type LeaseStatus = 'draft' | 'sent' | 'active' | 'in_default' | 'completed' | 'cancelled'
export type LeaseStage =
  | LeaseStatus
  | 'awaiting_signature'
  | 'awaiting_down_payment'
  | 'buyout_pending'
export type LeaseFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly'

export interface LeaseInvoiceBrief {
  id: number
  invoice_number: string
  status: string
  total_amount: string
  amount_paid: string
  balance_due: string
  due_date: string | null
  payable: boolean
}

export interface LeaseInstallment {
  number: number
  due_date: string
  principal: string
  markup: string
  amount: string
  tax: string
  total: string
  status: 'scheduled' | 'invoiced' | 'paid' | 'cancelled'
  invoice: LeaseInvoiceBrief | null
  late_fee: LeaseInvoiceBrief | null
}

export interface LeaseSummary {
  id: number
  agreement_number: string
  status: LeaseStatus
  stage: LeaseStage
  customer_name: string
  customer_email: string
  facility_id: number | null
  item_description: string
  item_part_number: string | null
  quantity: number
  total_of_payments: string
  regular_installment: string
  installment_count: number
  installments_paid: number
  frequency: LeaseFrequency
  next_due_date: string | null
  auto_charge: boolean
  created_at: string | null
}

export interface LeaseBuyoutQuote {
  remaining_principal: string
  waived_markup: string
  tax: string
  outstanding_fees: string
  total: string
}

export interface LeaseDetail extends LeaseSummary {
  revision: number
  customer_phone: string | null
  customer_address: string | null
  unit_cash_price: string
  cash_price: string
  markup_percent: string
  markup_amount: string
  lease_price: string
  down_payment: string
  down_payment_tax: string
  down_payment_total: string
  tax_rate_percent: string
  total_tax: string
  first_due_date: string | null
  grace_days: number
  late_fee_amount: string
  default_after_missed: number
  invoice_lead_days: number
  signed_at: string | null
  signed_by_name: string | null
  activated_at: string | null
  completed_at: string | null
  completion_method: 'schedule' | 'buyout' | null
  cancelled_at: string | null
  card: { brand: string | null; last4: string | null; exp_month: number | null; exp_year: number | null } | null
  down_payment_invoice: LeaseInvoiceBrief | null
  buyout_invoice: LeaseInvoiceBrief | null
  buyout_quote: LeaseBuyoutQuote | null
  outstanding_invoices: LeaseInvoiceBrief[]
  amount_outstanding: string
  installments: LeaseInstallment[]
  // Staff only.
  cancellation_reason?: string | null
  stock_committed?: boolean
  stock_returned?: boolean
  overpayment_amount?: string
  failed_charge_count?: number
  card_cleanup_pending?: boolean
  part_id?: number | null
  customer_user_id?: number | null
  notes?: string | null
  sent_at?: string | null
  history?: Array<{ action: string; by: string; at: string; details?: Record<string, unknown> }>
  authorizations?: Array<{
    event_type: string
    accepted_by_name: string
    channel: string
    consent_text: string
    card_last4: string | null
    created_at: string | null
  }>
  created_by?: string | null
  // Customer portal only.
  consent_text?: string
  auto_charge_consent?: string
  square?: {
    enabled: boolean
    environment: string
    application_id: string | null
    location_id: string | null
    currency: string
    sdk_url: string
  }
}

export interface LeaseInput {
  customer_name: string
  customer_email: string
  customer_phone?: string | null
  customer_address?: string | null
  facility_id?: number | null
  customer_user_id?: number | null
  part_id: number
  quantity: number
  unit_cash_price?: string | null
  markup_percent: string
  down_payment: string
  installment_count: number
  frequency: LeaseFrequency
  first_due_date: string
  tax_rate_percent: string
  grace_days: number
  late_fee_amount: string
  default_after_missed: number
  invoice_lead_days: number
  notes?: string | null
}

export interface LeaseQuotePreview {
  cash_price: string
  markup_amount: string
  lease_price: string
  down_payment: string
  down_payment_total: string
  financed_amount: string
  total_tax: string
  total_of_payments: string
  regular_installment: string
  final_due_date: string
  installments: Array<{ number: number; due_date: string; amount: string; tax: string; total: string }>
}

export interface LeasableProduct {
  id: number
  part_number: string
  description: string
  unit_price: string
  condition: string
  quantity_available: number
}

// ── Staff ────────────────────────────────────────────────────────────────────

export const fetchLeasableProducts = async (search?: string): Promise<LeasableProduct[]> => {
  const res = await apiClient.get('/leases/products', { params: { search: search || undefined } })
  return res.data.items
}

export const previewLeaseQuote = async (payload: {
  cash_price: string
  markup_percent: string
  down_payment: string
  installment_count: number
  frequency: LeaseFrequency
  first_due_date: string
  tax_rate_percent: string
}): Promise<LeaseQuotePreview> => {
  const res = await apiClient.post('/leases/quote', payload)
  return res.data
}

export const fetchLeases = async (params: {
  status?: LeaseStatus | ''
  search?: string
  skip?: number
  limit?: number
}): Promise<{ items: LeaseSummary[]; total: number }> => {
  const res = await apiClient.get('/leases', {
    params: { ...params, status: params.status || undefined, search: params.search || undefined },
  })
  return res.data
}

export const fetchLease = async (id: number): Promise<LeaseDetail> =>
  (await apiClient.get(`/leases/${id}`)).data

export const createLease = async (payload: LeaseInput): Promise<LeaseDetail> =>
  (await apiClient.post('/leases', payload)).data

export const updateLease = async (id: number, payload: LeaseInput): Promise<LeaseDetail> =>
  (await apiClient.put(`/leases/${id}`, payload)).data

export const sendLease = async (id: number): Promise<LeaseDetail> =>
  (await apiClient.post(`/leases/${id}/send`)).data

export const startLeaseBuyout = async (id: number): Promise<LeaseDetail> =>
  (await apiClient.post(`/leases/${id}/buyout`)).data

export const cancelLeaseBuyout = async (id: number): Promise<LeaseDetail> =>
  (await apiClient.post(`/leases/${id}/buyout/cancel`)).data

export const collectLeaseNow = async (id: number): Promise<{ results: Record<string, number>; lease: LeaseDetail }> =>
  (await apiClient.post(`/leases/${id}/collect`)).data

export const cancelLease = async (id: number, reason: string, returnStock: boolean): Promise<LeaseDetail> =>
  (await apiClient.post(`/leases/${id}/cancel`, { reason, return_stock: returnStock })).data

// ── Customer portal ──────────────────────────────────────────────────────────
// Authorised by the link token alone; these never send a login token.

export const fetchLeasePortal = async (token: string): Promise<LeaseDetail> =>
  (await apiClient.get(`/lease-portal/${encodeURIComponent(token)}`)).data

export const signLease = async (token: string, signedByName: string, revision: number): Promise<LeaseDetail> =>
  (await apiClient.post(`/lease-portal/${encodeURIComponent(token)}/sign`, {
    signed_by_name: signedByName, revision, agree: true,
  })).data

export const saveLeaseCard = async (
  token: string, sourceId: string, idempotencyKey: string, authorizeAutoCharge: boolean,
): Promise<LeaseDetail> =>
  (await apiClient.post(`/lease-portal/${encodeURIComponent(token)}/save-card`, {
    source_id: sourceId, idempotency_key: idempotencyKey, authorize_auto_charge: authorizeAutoCharge,
  })).data

export const removeLeaseCard = async (token: string): Promise<LeaseDetail> =>
  (await apiClient.post(`/lease-portal/${encodeURIComponent(token)}/remove-card`, { confirm: true })).data

export const payLeaseInvoice = async (
  token: string, invoiceId: number, sourceId: string, idempotencyKey: string,
): Promise<LeaseDetail> =>
  (await apiClient.post(`/lease-portal/${encodeURIComponent(token)}/pay`, {
    invoice_id: invoiceId, source_id: sourceId, idempotency_key: idempotencyKey,
  })).data

export const requestLeaseBuyout = async (token: string): Promise<LeaseDetail> =>
  (await apiClient.post(`/lease-portal/${encodeURIComponent(token)}/buyout`)).data
