import apiClient from './client'

export type SalesQuotationStatus = 'draft' | 'sent' | 'viewed' | 'changes_requested' | 'declined' | 'accepted' | 'pending' | 'in_progress' | 'completed' | 'cancelled'
export type SalesPaidStatus = 'unpaid' | 'paid'
export type SalesInvoiceStatus = 'pending' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled'

export interface SalesPart {
  id: number
  part_number: string
  part_type: string
  description: string
  make: string | null
  model: string | null
  default_picture_url: string | null
  serial_number: string | null
  condition: string
  quantity_on_hand: number
  unit_price: number
  facility_id: number | null
  facility_name: string | null
  status: string
}

export interface SalesQuotationLineItem {
  id: number
  part_id: number | null
  item_kind: 'product' | 'trade_in' | 'refund'
  is_default: boolean
  is_selected: boolean
  item_metadata?: Record<string, any>
  part_number: string | null
  part_description: string | null
  description: string
  quantity: number
  unit_price: number
  shipping_fee: number
  setup_fee: number
  condition: string | null
  total: number
}

export interface SalesQuotationRecipient {
  id: number
  user_id: number | null
  recipient_type: 'primary' | 'additional'
  name: string
  email: string
  role: string | null
  status: string
  sent_at: string | null
  viewed_at: string | null
  accepted_at: string | null
}

export interface SalesQuotationRecipientCandidate {
  id: number
  full_name: string
  email: string
  phone: string | null
  role: 'facility_admin' | 'facility_manager' | 'client' | string
}

export interface SalesHistoryItem {
  action: string
  by: string
  user_id: number
  at: string
  details: Record<string, any>
  quotation_id: number
  quotation_number: string
  work_order: string
  facility_name: string | null
  customer_name: string
}

export interface SalesQuotation {
  id: number
  quotation_number: string
  work_order: string
  facility_id: number | null
  facility_name: string | null
  customer_name: string
  customer_email: string | null
  customer_phone: string | null
  customer_address: string | null
  quotation_type: string
  selection_status: 'pending' | 'accepted'
  selection_channel: string | null
  selection_snapshot: Array<Record<string, any>>
  accepted_by_id: number | null
  accepted_by_name: string | null
  accepted_at: string | null
  sent_at: string | null
  expires_at: string | null
  revision: number
  status: SalesQuotationStatus | string
  paid_status: SalesPaidStatus | string
  requested_date: string | null
  notes: string | null
  worked_hours: number
  setup_fee: number
  service_fee: number
  shipping_fee: number
  application_fee: number
  tax_rate: number
  payment_method: string | null
  subtotal: number
  tax_amount: number
  discount_amount: number
  total_amount: number
  created_by_id: number
  created_by_name: string | null
  converted_invoice_id: number | null
  converted_invoice_number: string | null
  converted_invoice_status: SalesInvoiceStatus | string | null
  converted_invoice_amount_paid: number | null
  converted_invoice_balance_due: number | null
  converted_invoice_payment_method: string | null
  created_at: string
  updated_at: string
  history: SalesHistoryItem[]
  line_items: SalesQuotationLineItem[]
  recipients: SalesQuotationRecipient[]
  primary_recipient: SalesQuotationRecipient | null
  additional_recipients: SalesQuotationRecipient[]
}

export interface SalesInvoice {
  id: number
  invoice_number: string
  invoice_type: string
  sales_quotation_id: number | null
  sales_quotation_number: string | null
  work_order: string | null
  customer_name: string
  customer_email: string
  customer_phone?: string | null
  customer_address?: string | null
  facility_id: number | null
  facility_name: string | null
  subtotal: number
  tax_amount: number
  discount_amount: number
  total_amount: number
  amount_paid: number
  refunded_amount: number
  net_paid: number
  refund_status: 'none' | 'partially_refunded' | 'refunded'
  balance_due: number
  status: SalesInvoiceStatus
  issue_date: string
  due_date: string
  payment_method: string | null
  notes: string | null
  created_at: string
  updated_at: string
  transactions?: InvoiceTransaction[]
  line_items?: SalesQuotationLineItem[]
  labels?: Record<string, any> | null
  summary_rows?: Array<{ id?: string; label: string; value: number }>
  billing_approval_status: 'pending' | 'approved'
  approved_for_billing_by_id?: number | null
  approved_for_billing_by_name?: string | null
  approved_for_billing_at?: string | null
  approved_total_amount?: number | null
  approval_invalidated_at?: string | null
}

export interface InvoiceTransaction {
  id: number
  invoice_id: number
  facility_id: number | null
  transaction_type: string
  amount: number
  payment_method: string | null
  reference_number: string | null
  description: string | null
  created_by_id: number | null
  created_by_name: string | null
  created_at: string
}

export interface SalesInvoiceCreatePayload {
  labour_hours?: number
  worked_hours?: number
  setup_fee?: number
  service_fee?: number
  shipping_fee?: number
  application_fee?: number
  tax_rate?: number
  discount_type?: 'fixed' | 'percent'
  discount_amount?: number
  payment_method?: string | null
  action?: string | null
  due_date?: string | null
  notes?: string | null
  selected_line_item_ids?: number[]
  selection_channel?: string
}

export interface SalesQuotationPayload {
  facility_id?: number | null
  customer_name: string
  customer_email?: string | null
  customer_phone?: string | null
  customer_address?: string | null
  quotation_type?: string
  requested_date?: string | null
  notes?: string | null
  tax_amount?: number
  discount_amount?: number
  items: Array<{
    part_id?: number | null
    item_kind?: 'product' | 'trade_in' | 'refund'
    is_default?: boolean
    quantity: number
    unit_price?: number
    shipping_fee?: number
    setup_fee?: number
    condition?: string | null
    description?: string
    item_metadata?: Record<string, any>
  }>
  primary_recipient_user_id?: number | null
  additional_recipient_user_ids?: number[]
}

export interface SalesQuotationDelivery extends SalesQuotation {
  primary_share_url: string | null
  delivery_links: Array<{
    recipient_id: number
    recipient_type: 'primary' | 'additional'
    name: string
    email: string
    share_url: string
  }>
}

export interface SalesQuotationPortal {
  company_name: string
  quotation: {
    id: number
    quotation_number: string
    work_order: string
    revision: number
    quotation_type: string
    status: string
    selection_status: string
    facility_name: string | null
    customer_name: string
    customer_address: string | null
    requested_date: string | null
    sent_at: string | null
    expires_at: string | null
    notes: string | null
    subtotal: number
    tax_amount: number
    discount_amount: number
    total_amount: number
    line_items: SalesQuotationLineItem[]
  }
  recipient: SalesQuotationRecipient
  can_accept: boolean
  acceptance: {
    accepted_by_name: string
    signature_name: string
    accepted_at: string
    quotation_revision: number
    selection_snapshot: Array<Record<string, any>>
    pricing_snapshot: Record<string, any>
  } | null
  invoice: {
    id: number
    invoice_number: string
    status: string
    billing_approval_status: 'pending' | 'approved'
    total_amount: number
    balance_due: number
  } | null
}

export const fetchSalesParts = async (
  search?: string,
  limit?: number,
  skip?: number,
  searchField?: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<{ items: SalesPart[]; total: number }> => {
  const res = await apiClient.get('/sales/parts', { params: { search, search_field: searchField, date_from: dateFrom, date_to: dateTo, limit, skip } })
  return res.data
}

export const fetchSalesQuotations = async (
  params: { status?: string; view?: 'quotations' | 'in_progress' | 'completed'; search?: string; search_field?: string; date_from?: string; date_to?: string; skip?: number; limit?: number } = {}
): Promise<{ items: SalesQuotation[]; total: number }> => {
  const res = await apiClient.get('/sales/quotations', { params })
  return res.data
}

export const fetchSalesSummary = async (): Promise<{
  quotations: number
  invoices: number
  in_progress: number
  completed: number
  history: number
  parts: number
  in_progress_total: number
  in_progress_paid: number
  completed_total: number
}> => {
  const res = await apiClient.get('/sales/summary')
  return res.data
}

export const fetchSalesQuotation = async (id: number): Promise<SalesQuotation> => {
  const res = await apiClient.get(`/sales/quotations/${id}`)
  return res.data
}

export const createSalesQuotation = async (data: SalesQuotationPayload): Promise<SalesQuotation> => {
  const res = await apiClient.post('/sales/quotations', data)
  return res.data
}

export const updateSalesQuotation = async (
  id: number,
  data: Partial<SalesQuotationPayload> & { status?: string; paid_status?: string }
): Promise<SalesQuotation> => {
  const res = await apiClient.put(`/sales/quotations/${id}`, data)
  return res.data
}

export const fetchSalesQuotationRecipientCandidates = async (
  facilityId: number,
  search?: string,
): Promise<{ items: SalesQuotationRecipientCandidate[]; total: number }> => {
  const res = await apiClient.get(`/sales/facilities/${facilityId}/quotation-recipients`, {
    params: { search, limit: 100 },
  })
  return res.data
}

export const sendSalesQuotation = async (
  id: number,
  expiresInDays = 30,
): Promise<SalesQuotationDelivery> => {
  const res = await apiClient.post(`/sales/quotations/${id}/send`, {
    expires_in_days: expiresInDays,
  })
  return res.data
}

export const deleteSalesQuotation = async (id: number): Promise<void> => {
  await apiClient.delete(`/sales/quotations/${id}`)
}

export const convertSalesQuotationToInvoice = async (
  id: number,
  data: SalesInvoiceCreatePayload
): Promise<SalesInvoice> => {
  const res = await apiClient.post(`/sales/quotations/${id}/convert-to-invoice`, data)
  return res.data
}

export const requestSalesCardAuthorization = async (id: number): Promise<SalesQuotation> => {
  const res = await apiClient.post(`/sales/quotations/${id}/request-card-authorization`)
  return res.data
}

export const completeSalesQuotation = async (id: number): Promise<SalesQuotation> => {
  const res = await apiClient.post(`/sales/quotations/${id}/complete`)
  return res.data
}

export const fetchSalesInvoices = async (
  params: { status?: SalesInvoiceStatus; search?: string; search_field?: string; date_from?: string; date_to?: string; skip?: number; limit?: number } = {}
): Promise<{ items: SalesInvoice[]; total: number }> => {
  const res = await apiClient.get('/sales/invoices', { params })
  return res.data
}

export const updateSalesInvoice = async (
  id: number,
  data: {
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
    status?: SalesInvoiceStatus | string
    payment_method?: string | null
    notes?: string | null
    line_items?: any[]
    labels?: Record<string, any>
    summary_rows?: Array<{ id?: string; label: string; value: number }>
  }
): Promise<SalesInvoice> => {
  const res = await apiClient.put(`/sales/invoices/${id}`, data)
  return res.data
}

export const refundSalesInvoice = async (
  id: number,
  data: { amount: number; payment_method?: string | null; notes?: string | null },
): Promise<SalesInvoice> => {
  const res = await apiClient.post(`/sales/invoices/${id}/refunds`, data)
  return res.data
}

export const fetchSalesHistory = async (
  params: { search?: string; search_field?: string; date_from?: string; date_to?: string; skip?: number; limit?: number } = {}
): Promise<{ items: SalesHistoryItem[]; total: number }> => {
  const res = await apiClient.get('/sales/history', { params })
  return res.data
}

export const fetchPublicSalesQuotation = async (token: string): Promise<SalesQuotationPortal> => {
  const res = await apiClient.get(`/public/quotations/${token}`)
  return res.data
}

export const acceptPublicSalesQuotation = async (
  token: string,
  data: { selected_line_item_ids: number[]; signature_name: string; terms_accepted: boolean },
): Promise<SalesQuotationPortal> => {
  const res = await apiClient.post(`/public/quotations/${token}/accept`, data)
  return res.data
}

export const decidePublicSalesQuotation = async (
  token: string,
  action: 'decline' | 'request_changes',
  comments?: string,
): Promise<SalesQuotationPortal> => {
  const res = await apiClient.post(`/public/quotations/${token}/decision`, { action, comments })
  return res.data
}

export const fetchClientSalesQuotations = async (
  params: { search?: string; skip?: number; limit?: number } = {},
): Promise<{ items: SalesQuotationPortal[]; total: number }> => {
  const res = await apiClient.get('/client-sales/quotations', { params })
  return res.data
}

export const fetchClientSalesQuotation = async (id: number): Promise<SalesQuotationPortal> => {
  const res = await apiClient.get(`/client-sales/quotations/${id}`)
  return res.data
}

export const acceptClientSalesQuotation = async (
  id: number,
  data: { selected_line_item_ids: number[]; signature_name: string; terms_accepted: boolean },
): Promise<SalesQuotationPortal> => {
  const res = await apiClient.post(`/client-sales/quotations/${id}/accept`, data)
  return res.data
}

export const decideClientSalesQuotation = async (
  id: number,
  action: 'decline' | 'request_changes',
  comments?: string,
): Promise<SalesQuotationPortal> => {
  const res = await apiClient.post(`/client-sales/quotations/${id}/decision`, { action, comments })
  return res.data
}
