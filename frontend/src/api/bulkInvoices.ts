/**
 * Bulk invoices: several invoices, of one or more facilities, sent and paid as one.
 *
 * The bulk invoice owes what its invoices owe. Payments are recorded on it
 * alone; once it is paid in full, each of its invoices is marked paid. While an
 * invoice is in one, it is paid only through it.
 */
import apiClient from './client'
import { linkPaymentForm, type LinkPaymentReport, type PublicServiceInvoice } from './serviceRequests'

export type BulkInvoiceStatus = 'draft' | 'sent' | 'partially_paid' | 'paid' | 'cancelled'

/** An invoice as the bulk invoice lists it. `amount` is its line: what it owes, or what was paid on it. */
export interface BulkInvoiceLine {
  id: number
  invoice_number: string
  invoice_type: 'service' | 'inspection' | 'sales' | 'rental' | string
  type_label: string
  related_number: string | null
  facility_id: number | null
  facility_name: string
  customer_name: string | null
  issue_date: string | null
  due_date: string | null
  total_amount: string
  amount_paid: string
  balance_due: string
  amount: string
  status: string
}

/** An open invoice offered for a bulk invoice, and whether it can go in. */
export interface BulkCandidate extends BulkInvoiceLine {
  eligible: boolean
  reason: string | null
  in_this_bulk: boolean
}

/** A facility's billing contact, in parts, for the Bill To. */
export interface BulkBillTo {
  facility_id: number | null
  name: string | null
  email: string | null
  address: string | null
  suite: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  country: string | null
}

export interface BulkCandidateGroup {
  key: string
  facility_id: number | null
  facility_name: string
  bill_to: BulkBillTo
  invoices: BulkCandidate[]
  eligible_count?: number
  locked_count?: number
  /** Found by the search, with no open invoice: shown so the search says what it found. */
  no_open_invoices?: boolean
}

export interface BulkInvoiceRow {
  id: number
  bulk_number: string
  status: BulkInvoiceStatus
  bill_to_name: string
  bill_to_email: string | null
  facilities: string[]
  invoice_count: number
  total_amount: string
  amount_paid: string
  balance_due: string
  created_at: string
  created_by: string | null
  public_link_sent_at: string | null
  public_link_email: string | null
  paid_at: string | null
  needs_attention: boolean
  being_updated: boolean
}

export interface BulkPayment {
  id: number
  paid_at: string
  payment_method: string
  method_label: string
  amount: string
  card_fee_amount: string
  reference_number: string | null
  card_brand: string | null
  card_last4: string | null
  payer_name?: string | null
  notes?: string | null
  recorded_by?: string | null
  payment_proof_id?: number | null
}

/** One invoice's own page in the bulk invoice: its document, as it prints on its own. */
export interface BulkInvoicePage {
  invoice_number: string
  type_label: string
  kind: 'service' | 'inspection' | 'sales' | 'rental' | string
  document: any
}

/** The bulk invoice as it prints: the front page, then each invoice in full. */
export interface BulkInvoiceDocument {
  bulk_number: string
  status: BulkInvoiceStatus
  issue_date: string | null
  due_date: string | null
  note: string | null
  bill_to: { name: string; email: string | null; address: string | null }
  groups: { facility_id: number | null; facility_name: string; subtotal: string; invoices: BulkInvoiceLine[] }[]
  invoice_count: number
  facility_count: number
  total_amount: string
  amount_paid: string
  card_fee_amount: string
  balance_due: string
  payments: BulkPayment[]
  invoices: BulkInvoicePage[]
}

export interface BulkInvoiceDetail extends BulkInvoiceRow {
  bill_to_facility_id: number | null
  bill_to_address: string | null
  note: string | null
  card_fee_amount: string
  settlement_error: string | null
  cancelled_at: string | null
  public_link_expires_at: string | null
  busy: string | null
  invoice_ids: number[]
  invoices: BulkInvoiceLine[]
  payments: BulkPayment[]
  document: BulkInvoiceDocument
  can_edit: boolean
  can_send: boolean
  can_cancel: boolean
  can_record_payment: boolean
  can_settle: boolean
}

export interface BulkMembership {
  invoice_id: number
  bulk_invoice_id: number
  bulk_number: string
  status: BulkInvoiceStatus
  /** Paid only through the bulk invoice (false once it, and they, are paid). */
  locked: boolean
}

export interface BulkInvoiceInput {
  invoice_ids: number[]
  bill_to_facility_id: number | null
  bill_to_name: string
  bill_to_email: string | null
  bill_to_address: string | null
  note: string | null
}

const BASE = '/billing/bulk-invoices'

export const fetchBulkInvoices = async (params: { status?: string; search?: string } = {}): Promise<BulkInvoiceRow[]> => {
  const res = await apiClient.get(BASE, { params: { status: params.status || undefined, search: params.search || undefined } })
  return res.data.items
}

export const fetchBulkMemberships = async (): Promise<BulkMembership[]> => {
  const res = await apiClient.get(`${BASE}/memberships`)
  return res.data.items
}

export const fetchBulkCandidates = async (search?: string, bulkId?: number | null): Promise<{ groups: BulkCandidateGroup[]; truncated: boolean }> => {
  const res = await apiClient.get(`${BASE}/candidates`, { params: { search: search || undefined, bulk_id: bulkId || undefined } })
  return res.data
}

export const fetchBulkInvoice = async (id: number): Promise<BulkInvoiceDetail> => {
  const res = await apiClient.get(`${BASE}/${id}`)
  return res.data
}

export const createBulkInvoice = async (data: BulkInvoiceInput): Promise<BulkInvoiceDetail> => {
  const res = await apiClient.post(BASE, data)
  return res.data
}

export const updateBulkInvoice = async (id: number, data: Partial<BulkInvoiceInput>): Promise<BulkInvoiceDetail> => {
  const res = await apiClient.put(`${BASE}/${id}`, data)
  return res.data
}

export const sendBulkInvoice = async (
  id: number,
  data: { channel: 'email' | 'link'; email?: string | null },
): Promise<BulkInvoiceDetail & { share_url: string; email: string | null; expires_at: string }> => {
  const res = await apiClient.post(`${BASE}/${id}/send`, data)
  return res.data
}

export const cancelBulkInvoice = async (id: number): Promise<BulkInvoiceDetail> => {
  const res = await apiClient.post(`${BASE}/${id}/cancel`)
  return res.data
}

export const recordBulkPayment = async (
  id: number,
  data: { amount: string; payment_method: string; reference?: string; notes?: string; idempotency_key: string },
): Promise<BulkInvoiceDetail> => {
  const res = await apiClient.post(`${BASE}/${id}/payments`, data)
  return res.data
}

export const settleBulkInvoice = async (id: number): Promise<BulkInvoiceDetail> => {
  const res = await apiClient.post(`${BASE}/${id}/settle`)
  return res.data
}

// ---------------------------------------------------------------- the customer's link

/** The link page's response: an invoice link's, with the bulk invoice's document. */
export type PublicBulkInvoice = Omit<PublicServiceInvoice, 'document'> & { document: BulkInvoiceDocument | null; is_bulk?: boolean }

export const fetchPublicBulkInvoice = async (token: string): Promise<PublicBulkInvoice> => {
  const res = await apiClient.get(`/public/bulk-invoices/${token}`)
  return res.data
}

export const payPublicBulkInvoice = async (
  token: string,
  data: { source_id: string; idempotency_key: string; payer_name: string; charge_amount?: string },
): Promise<PublicBulkInvoice> => {
  const res = await apiClient.post(`/public/bulk-invoices/${token}/square-payment`, data)
  return res.data
}

export const reportPublicBulkInvoicePayment = async (token: string, report: LinkPaymentReport): Promise<PublicBulkInvoice> => {
  const res = await apiClient.post(`/public/bulk-invoices/${token}/payment-proof`, linkPaymentForm(report), {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}
