import apiClient from './client'
import { completePaymentRequest, paymentRequestKey } from '@/utils/paymentIdempotency'

export type ServiceRequestPriority = 'low' | 'medium' | 'high' | 'critical'
export type ServiceRequestStatus =
  | 'new'
  | 'assigned'
  | 'in_progress'
  | 'waiting_on_parts'
  | 'waiting_for_approval'
  | 'waiting_for_depot_repair'
  | 'waiting_for_vendor_repair'
  | 'completed'
  | 'cancelled'

// ── Line Items ──────────────────────────────────────────────────────────────

export interface LineItem {
  id?: number
  quotation_id?: number
  item_type: 'part' | 'labor' | 'other'
  description: string
  quantity: number
  unit_price: number
  total: number
  created_at?: string
}

export interface LineItemCreate {
  item_type: 'part' | 'labor' | 'other'
  description: string
  quantity: number
  unit_price: number
  total: number
}

// ── Quotation Payment ───────────────────────────────────────────────────────

export interface QuotationPayment {
  id: number
  quotation_id: number
  payment_method: 'credit_card' | 'ach' | 'mbmts_ach'
  amount: number
  reference_number: string | null
  status: string
  notes: string | null
  bank_name: string | null
  account_last_four: string | null
  routing_number_last_four: string | null
  mbmts_account_name: string | null
  mbmts_routing_number: string | null
  mbmts_account_number: string | null
  mbmts_bank_name: string | null
  mbmts_bank_address: string | null
  paid_at: string | null
  created_at: string
  created_by_id: number
  authorization_id?: number | null
  payment_channel?: 'admin_assisted' | 'facility_self_service' | null
  payer_role?: string | null
  paid_by_name?: string | null
}

export interface QuotationPaymentCreate {
  payment_method: 'credit_card' | 'ach' | 'mbmts_ach'
  amount: number
  notes?: string
  bank_name?: string
  account_last_four?: string
  routing_number_last_four?: string
  mbmts_account_name?: string
  mbmts_routing_number?: string
  mbmts_account_number?: string
  mbmts_bank_name?: string
  mbmts_bank_address?: string
}

export const submitQuotationPaymentProof = async (
  quotationId: number,
  data: { amount: number; payment_method: string; notes?: string; file: File },
) => {
  const form = new FormData()
  form.append('amount', String(data.amount))
  form.append('payment_method', data.payment_method)
  if (data.notes) form.append('notes', data.notes)
  form.append('proof_file', data.file)
  const response = await apiClient.post(`/service-requests/quotations/${quotationId}/payment-proofs`, form)
  return response.data
}

export const approveQuotationPaymentProof = async (proofId: number, notes?: string) => {
  const response = await apiClient.post(`/service-requests/payment-proofs/${proofId}/approve`, { notes })
  return response.data
}

export const rejectQuotationPaymentProof = async (proofId: number, notes: string) => {
  const response = await apiClient.post(`/service-requests/payment-proofs/${proofId}/reject`, { notes })
  return response.data
}

export interface QuotationAuthorization {
  id: number
  quotation_id: number
  status: 'requested' | 'authorized' | 'declined' | 'invalidated' | 'fulfilled_in_invoice' | string
  authorized_amount: number
  channel?: 'phone' | 'self_service' | null
  requested_by_id?: number | null
  requested_by_name?: string | null
  authorized_by_id?: number | null
  authorized_by_name?: string | null
  authorized_by_role?: string | null
  recorded_by_id?: number | null
  recorded_by_name?: string | null
  confirmation_reference?: string | null
  notes?: string | null
  requested_at?: string | null
  decided_at?: string | null
  invalidated_at?: string | null
  created_at?: string | null
}

export interface QuotationLedgerEntry {
  id: number
  quotation_id: number
  event_type: string
  actor_id?: number | null
  actor_name: string
  actor_role: string
  channel?: string | null
  amount?: number | null
  reference_number?: string | null
  details?: Record<string, any> | null
  created_at: string
}

export interface QuotationAuthorizationDecision {
  decision: 'authorized' | 'declined'
  channel: 'self_service' | 'phone'
  authorized_by_user_id?: number
  notes?: string
  confirmation_reference?: string
}

export interface QuotationAuthorizationCandidate {
  id: number
  full_name: string
  email: string
  role: 'facility_admin' | 'facility_manager' | string
}

export interface InvoiceTransaction {
  id: number
  invoice_id: number
  facility_id?: number | null
  transaction_type: string
  amount: number
  payment_method?: string | null
  reference_number?: string | null
  description?: string | null
  created_by_id?: number | null
  created_by_name?: string | null
  created_at?: string | null
}

export interface ServiceInvoiceLineItem {
  item_number?: string | null
  description: string
  quantity: number
  unit_price: number
  shipping_fee?: number
  setup_fee?: number
  condition?: string | null
  total_amount: number
}

export interface ServiceInvoicePaidQuotationLineItem {
  id?: number
  quotation_id?: number
  item_type?: string | null
  description: string
  quantity: number
  unit_price: number
  total: number
  created_at?: string | null
}

export interface ServiceInvoicePaidQuotation {
  id: number
  quotation_number: string
  description?: string | null
  amount: number
  paid_amount: number
  paid_at?: string | null
  payment_method?: string | null
  reference_number?: string | null
  line_items?: ServiceInvoicePaidQuotationLineItem[]
}

export interface ServiceInvoice {
  id: number
  invoice_number: string
  invoice_type: 'service'
  service_request_id: number
  request_number?: string | null
  customer_name: string
  customer_email: string
  customer_phone?: string | null
  customer_address?: string | null
  facility_id?: number | null
  facility_name?: string | null
  subtotal: number
  tax_amount: number
  discount_amount: number
  total_amount: number
  amount_paid: number
  balance_due: number
  status: string
  issue_date: string | null
  due_date: string | null
  payment_method?: string | null
  notes?: string | null
  created_at: string
  updated_at: string
  transactions?: InvoiceTransaction[]
  line_items?: ServiceInvoiceLineItem[]
  labels?: Record<string, any> | null
  summary_rows?: Array<{ id?: string; label: string; value: number }>
  paid_quotations?: ServiceInvoicePaidQuotation[]
  billing_approval_status: 'pending' | 'approved'
  approved_for_billing_by_id?: number | null
  approved_for_billing_by_name?: string | null
  approved_for_billing_at?: string | null
  approved_total_amount?: number | null
  approval_invalidated_at?: string | null
}

export interface ServiceInvoiceCreatePayload {
  include_quotations: boolean
  quotation_ids?: number[]
  tax_amount?: number
  discount_amount?: number
  due_date?: string | null
  payment_method?: string | null
  notes?: string
  travel_charges?: number
  labor_fee_override?: number
}

export interface ServiceInvoiceUpdatePayload {
  customer_name?: string
  customer_email?: string
  customer_phone?: string | null
  customer_address?: string | null
  subtotal?: number
  tax_amount?: number
  discount_amount?: number
  total_amount?: number
  amount_paid?: number
  issue_date?: string
  due_date?: string
  status?: string
  payment_method?: string | null
  notes?: string
  line_items?: ServiceInvoiceLineItem[]
  labels?: Record<string, any>
  summary_rows?: Array<{ id?: string; label: string; value: number }>
}

// ── Quotation ───────────────────────────────────────────────────────────────

export interface ServiceRequestQuotation {
  id: number
  service_request_id: number
  created_by_id: number
  quotation_number: string
  amount: number
  description: string
  status: string
  created_at: string
  updated_at: string
  line_items: LineItem[]
  payments: QuotationPayment[]
  revision_history?: { timestamp: string, user: string, old_amount: number, new_amount: number, difference: number }[]
  authorizations?: QuotationAuthorization[]
  ledger_entries?: QuotationLedgerEntry[]
}

export interface ServiceRequestQuotationCreate {
  description: string
  line_items?: LineItemCreate[]
}

export interface ServiceRequestQuotationUpdate {
  description?: string
  status?: string
  line_items?: LineItemCreate[]
}

export interface ServiceRequestQuotationList extends ServiceRequestQuotation {
  request_number: string
  facility_name: string | null
  facility_id?: number | null
}

// ── Service Request ─────────────────────────────────────────────────────────

export interface ServiceRequest {
  id: number
  request_number: string
  facility_id: number
  equipment_id: number
  requester_id: number
  assigned_technician_id: number | null
  problem_description: string
  service_required: string | null
  preferred_datetime: string | null
  requested_by_name: string | null
  reference_number: string | null
  request_image_url: string | null
  priority: ServiceRequestPriority
  status: ServiceRequestStatus
  resolution_description: string | null
  time_spent_hours: number | null
  total_cost: number | null
  tier_id: number | null
  tier_name: string | null
  tier_labor_rate_per_hour: number | null
  tier_mileage_rate: number | null
  calculated_service_cost: number | null
  assigned_at: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  
  billing_status: 'pending' | 'approved' | 'not_approved'
  cc_auth_requested: boolean
  invoice_deleted: boolean
  service_invoice?: ServiceInvoice | null
  history: ServiceRequestHistoryEntry[]

  // Denormalized display names
  facility_name: string | null
  equipment_name: string | null
  requester_name: string | null
  technician_name: string | null
  
  quotations: ServiceRequestQuotation[]
}

export interface ServiceRequestCreate {
  facility_id: number
  equipment_id: number
  problem_description: string
  service_required?: string
  preferred_datetime?: string | null
  requested_by_name?: string
  reference_number?: string
  request_image_url?: string
  priority: ServiceRequestPriority
}

export interface ServiceRequestUpdate {
  status?: ServiceRequestStatus
  priority?: ServiceRequestPriority
  assigned_technician_id?: number | null
  problem_description?: string
  service_required?: string
  preferred_datetime?: string | null
  requested_by_name?: string
  reference_number?: string
  request_image_url?: string
  resolution_description?: string
  time_spent_hours?: number
  total_cost?: number
  billing_status?: 'pending' | 'approved' | 'not_approved'
  cc_auth_requested?: boolean
  invoice_deleted?: boolean
}

export interface ServiceRequestImageUploadResponse {
  file_url: string
  file_name: string
  file_size: number
  file_type: string
}

export interface ServiceRequestHistoryEntry {
  timestamp: string
  action: string
  user_id?: number
  user?: string
  changes?: Record<string, any>
}

export interface ServiceRequestListResponse {
  items: ServiceRequest[]
  total: number
  stats?: Record<'total' | 'new' | 'in_progress' | 'completed', number>
}

export interface ServiceRequestListParams {
  status?: string
  priority?: string
  facility_id?: number
  search?: string
  search_field?: string
  status_group?: 'new_open' | 'active' | 'completed'
  date_from?: string
  date_to?: string
  skip?: number
  limit?: number
}

// ─── CRUD Functions ──────────────────────────────────────────

export const fetchServiceRequests = async (
  params: ServiceRequestListParams = {}
): Promise<ServiceRequestListResponse> => {
  const res = await apiClient.get('/service-requests/', { params })
  return res.data
}

export const fetchServiceRequest = async (id: number): Promise<ServiceRequest> => {
  const res = await apiClient.get(`/service-requests/${id}`)
  return res.data
}

export const fetchServiceRequestImage = async (id: number): Promise<Blob> => {
  const res = await apiClient.get(`/service-requests/${id}/image`, { responseType: 'blob' })
  return res.data
}

export const createServiceRequest = async (
  data: ServiceRequestCreate
): Promise<ServiceRequest> => {
  const res = await apiClient.post('/service-requests/', data)
  return res.data
}

export const uploadServiceRequestImage = async (
  file: File
): Promise<ServiceRequestImageUploadResponse> => {
  const formData = new FormData()
  formData.append('file', file)
  const res = await apiClient.post('/service-requests/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export const updateServiceRequest = async (
  id: number,
  data: ServiceRequestUpdate
): Promise<ServiceRequest> => {
  const res = await apiClient.patch(`/service-requests/${id}`, data)
  return res.data
}

export const clockInServiceRequest = async (id: number): Promise<ServiceRequest> => {
  const res = await apiClient.post(`/service-requests/${id}/clock-in`)
  return res.data
}

export interface ServiceRequestClockOutPayload {
  diagnosis?: string
  work_done?: string
  notes?: string
  test_equipment_ids?: number[]
  part_usages?: ServiceRequestPartUsage[]
  total_mileage?: number
}

export interface ServiceRequestPartUsage {
  part_id: number
  quantity: number
}

export interface ServiceRequestPartOption {
  id: number
  facility_id: number
  part_number: string
  description: string
  part_type: string
  make: string | null
  model: string | null
  serial_number: string | null
  batch_number: string | null
  default_picture_url: string | null
  unit_price: number
  quantity_on_hand: number
  reorder_level: number
  status: string
}

export interface ServiceRequestWorkSessionPayload extends ServiceRequestClockOutPayload {
  session_id?: string
  start_time?: string
  end_time?: string
  break_minutes?: number
  total_work_hours?: number
  total_mileage?: number
  status?: ServiceRequestStatus
}

export const fetchServiceRequestParts = async (
  id: number,
  params: { search?: string; skip?: number; limit?: number } = {},
): Promise<{ items: ServiceRequestPartOption[]; total: number }> => {
  const res = await apiClient.get(`/service-requests/${id}/available-parts`, { params })
  return res.data
}

export const clockOutServiceRequest = async (id: number, data: ServiceRequestClockOutPayload): Promise<ServiceRequest> => {
  const res = await apiClient.post(`/service-requests/${id}/clock-out`, data)
  return res.data
}

export const createServiceRequestWorkSession = async (id: number, data: ServiceRequestWorkSessionPayload): Promise<ServiceRequest> => {
  const res = await apiClient.post(`/service-requests/${id}/work-sessions`, data)
  return res.data
}

export const adjustActiveSession = async (id: number, sessionHours: number): Promise<ServiceRequest> => {
  const res = await apiClient.patch(`/service-requests/${id}/active-session`, { session_hours: sessionHours })
  return res.data
}

export const addServiceRequestNote = async (id: number, note: string): Promise<ServiceRequest> => {
  const res = await apiClient.post(`/service-requests/${id}/notes`, { note })
  return res.data
}

export const fetchServiceInvoices = async (
  params: { status?: string; service_request_id?: number; search?: string; search_field?: string; skip?: number; limit?: number } = {}
): Promise<{ items: ServiceInvoice[]; total: number; skip: number; limit: number }> => {
  const res = await apiClient.get('/service-requests/invoices', { params })
  return res.data
}

export const fetchAllServiceInvoices = async (
  search?: string,
  searchField?: string,
): Promise<{ items: ServiceInvoice[]; total: number }> => {
  const limit = 100
  let skip = 0
  let total = 0
  const items: ServiceInvoice[] = []
  do {
    const page = await fetchServiceInvoices({ search, search_field: searchField, skip, limit })
    if (page.items.length === 0) break
    items.push(...page.items)
    total = page.total
    skip += page.items.length
  } while (skip < total)
  return { items, total }
}

export const generateServiceInvoice = async (
  requestId: number,
  data: ServiceInvoiceCreatePayload
): Promise<ServiceInvoice> => {
  const res = await apiClient.post(`/service-requests/${requestId}/generate-invoice`, data)
  return res.data
}

export const updateServiceInvoice = async (
  invoiceId: number,
  data: ServiceInvoiceUpdatePayload
): Promise<ServiceInvoice> => {
  const res = await apiClient.put(`/service-requests/invoices/${invoiceId}`, data)
  return res.data
}

export const deleteServiceRequest = async (id: number): Promise<void> => {
  await apiClient.delete(`/service-requests/${id}`)
}

// ─── Quotation Functions ─────────────────────────────────────

export const createServiceRequestQuotation = async (
  requestId: number,
  data: ServiceRequestQuotationCreate
): Promise<ServiceRequestQuotation> => {
  const res = await apiClient.post(`/service-requests/${requestId}/quotations`, data)
  return res.data
}

export const updateServiceRequestQuotation = async (
  quotationId: number,
  data: ServiceRequestQuotationUpdate
): Promise<ServiceRequestQuotation> => {
  const res = await apiClient.put(`/service-requests/quotations/${quotationId}`, data)
  return res.data
}

export const deleteServiceRequestQuotation = async (
  quotationId: number
): Promise<void> => {
  await apiClient.delete(`/service-requests/quotations/${quotationId}`)
}

const fetchServiceQuotationsPage = async (
  params: { search?: string; search_field?: string; skip?: number; limit?: number } = {}
): Promise<ServiceRequestQuotationList[]> => {
  const res = await apiClient.get('/service-requests/quotations/all', { params })
  return res.data
}

export const fetchAllQuotations = async (
  search?: unknown,
  searchField?: string,
): Promise<ServiceRequestQuotationList[]> => {
  const normalizedSearch = typeof search === 'string' ? search : undefined
  const limit = 100
  let skip = 0
  const quotations: ServiceRequestQuotationList[] = []

  while (true) {
    const page = await fetchServiceQuotationsPage({
      search: normalizedSearch,
      search_field: searchField,
      skip,
      limit,
    })
    quotations.push(...page)
    if (page.length < limit) break
    skip += page.length
  }

  return quotations
}

// ─── Payment Functions ───────────────────────────────────────

export const createQuotationPayment = async (
  quotationId: number,
  data: QuotationPaymentCreate
): Promise<QuotationPayment> => {
  const fingerprint = `service-quotation:${quotationId}:${Number(data.amount).toFixed(2)}:${data.payment_method}`
  const res = await apiClient.post(`/service-requests/quotations/${quotationId}/payments`, {
    ...data,
    idempotency_key: paymentRequestKey(fingerprint),
  })
  completePaymentRequest(fingerprint)
  return res.data
}

export const requestQuotationAuthorization = async (
  quotationId: number,
  notes?: string,
): Promise<QuotationAuthorization> => {
  const res = await apiClient.post(`/service-requests/quotations/${quotationId}/authorization-requests`, { notes })
  return res.data
}

export const fetchQuotationAuthorizationCandidates = async (
  quotationId: number,
): Promise<QuotationAuthorizationCandidate[]> => {
  const res = await apiClient.get(`/service-requests/quotations/${quotationId}/authorization-candidates`)
  return res.data
}

export const decideQuotationAuthorization = async (
  quotationId: number,
  data: QuotationAuthorizationDecision,
): Promise<QuotationAuthorization> => {
  const res = await apiClient.post(`/service-requests/quotations/${quotationId}/authorization-decisions`, data)
  return res.data
}
