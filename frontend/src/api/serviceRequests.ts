import apiClient from './client'

export type ServiceRequestPriority = 'low' | 'medium' | 'high' | 'critical'
export type ServiceRequestStatus = 'new' | 'assigned' | 'in_progress' | 'completed' | 'cancelled'

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
  assigned_at: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  
  billing_status: 'pending' | 'approved' | 'not_approved'
  cc_auth_requested: boolean
  invoice_deleted: boolean
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

export interface ServiceRequestHistoryEntry {
  timestamp: string
  action: string
  user_id?: number
  user?: string
  changes?: Record<string, { from: unknown; to: unknown }>
}

export interface ServiceRequestListResponse {
  items: ServiceRequest[]
  total: number
}

export interface ServiceRequestListParams {
  status?: string
  priority?: string
  facility_id?: number
  search?: string
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

export const createServiceRequest = async (
  data: ServiceRequestCreate
): Promise<ServiceRequest> => {
  const res = await apiClient.post('/service-requests/', data)
  return res.data
}

export const updateServiceRequest = async (
  id: number,
  data: ServiceRequestUpdate
): Promise<ServiceRequest> => {
  const res = await apiClient.patch(`/service-requests/${id}`, data)
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

export const fetchAllQuotations = async (): Promise<ServiceRequestQuotationList[]> => {
  const res = await apiClient.get('/service-requests/quotations/all')
  return res.data
}

// ─── Payment Functions ───────────────────────────────────────

export const createQuotationPayment = async (
  quotationId: number,
  data: QuotationPaymentCreate
): Promise<QuotationPayment> => {
  const res = await apiClient.post(`/service-requests/quotations/${quotationId}/payments`, data)
  return res.data
}
