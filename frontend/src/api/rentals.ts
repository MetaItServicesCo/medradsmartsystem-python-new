import apiClient from './client'

export type RentalStatus = 'active' | 'completed' | 'cancelled'
// 'daily' is retained only for legacy agreements; new agreements use the tiers below.
export type BillingFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly'
export type RentalItemStatus = 'out' | 'returned'
export type RentalDiscountType = 'flat' | 'percent'
export type RentalDepositStatus = 'held' | 'refunded' | 'deducted' | 'waived'
export type RentalInvoiceStatus = 'pending' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled'

export interface RentalPart {
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

export interface RentalHistoryItem {
  action: string
  by: string
  user_id: number
  at: string
  details: Record<string, any>
  rental_id: number
  rental_number: string
  facility_name: string | null
  customer_name: string
  part_number: string | null
  part_description: string | null
}

export interface RentalItem {
  id: number
  part_id: number | null
  equipment_id: number | null
  part_number: string | null
  part_description: string | null
  default_picture_url: string | null
  quantity: number
  rental_rate: number
  item_condition: string | null
  shipping_fee: number
  setup_fee: number
  labor_fee: number
  initial_condition: string | null
  return_condition: string | null
  initial_meter_reading: string | null
  final_meter_reading: number | null
  returned_at: string | null
  item_status: RentalItemStatus
}

export interface Rental {
  id: number
  rental_number: string
  is_overdue: boolean
  items: RentalItem[]
  auto_charge: boolean
  committed_periods: number | null
  periods_billed: number
  next_bill_date: string | null
  discount_type: RentalDiscountType | null
  discount_value: number | null
  discount_apply_after_periods: number | null
  deposit_status: RentalDepositStatus | null
  deposit_settled_amount: number | null
  equipment_id: number | null
  part_id: number | null
  part_number: string | null
  part_description: string | null
  customer_name: string
  customer_email: string
  customer_phone: string
  customer_address: string
  billing_frequency: BillingFrequency
  rental_rate: number
  security_deposit: number
  quantity: number
  shipping_fee: number
  setup_fee: number
  item_condition: string | null
  start_date: string
  end_date: string
  actual_return_date: string | null
  status: RentalStatus
  initial_condition: string | null
  return_condition: string | null
  initial_meter_reading: string | null
  final_meter_reading: number | null
  terms_and_conditions: string | null
  converted_invoice_id: number | null
  converted_invoice_number: string | null
  converted_invoice_status: RentalInvoiceStatus | null
  converted_invoice_amount_paid: number | null
  converted_invoice_balance_due: number | null
  converted_invoice_payment_method: string | null
  created_by_id: number | null
  created_by_name: string | null
  created_at: string
  updated_at: string
  history: RentalHistoryItem[]
}

export interface RentalInvoice {
  id: number
  invoice_number: string
  invoice_type: string
  rental_id: number | null
  rental_number: string | null
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
  balance_due: number
  status: RentalInvoiceStatus
  issue_date: string
  due_date: string
  payment_method: string | null
  notes: string | null
  created_at: string
  updated_at: string
  transactions?: InvoiceTransaction[]
  line_items?: any[]
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

export interface RentalInvoiceCreatePayload {
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
}

export interface RentalItemPayload {
  part_id?: number | null
  equipment_id?: number | null
  quantity?: number
  rental_rate?: number
  item_condition?: string | null
  shipping_fee?: number
  setup_fee?: number
  labor_fee?: number
  initial_condition?: string | null
  initial_meter_reading?: string | null
}

export interface RentalPayload {
  customer_name: string
  customer_email: string
  customer_phone: string
  customer_address: string
  billing_frequency: BillingFrequency
  security_deposit: number
  start_date: string
  end_date: string
  terms_and_conditions?: string | null
  items?: RentalItemPayload[]
  // Legacy single-item fallback (still accepted by the backend during transition).
  part_id?: number
  rental_rate?: number
  quantity?: number
  shipping_fee?: number
  setup_fee?: number
  item_condition?: string | null
  initial_condition?: string | null
  initial_meter_reading?: string | null
  // Recurring billing / commitment discount configuration.
  auto_charge?: boolean
  committed_periods?: number | null
  discount_type?: RentalDiscountType | null
  discount_value?: number | null
  discount_apply_after_periods?: number | null
}

export interface RentalProductRate {
  part_id: number
  weekly_rate: number | null
  biweekly_rate: number | null
  monthly_rate: number | null
  quarterly_rate: number | null
  default_deposit: number | null
}

export interface RentalItemReturnPayload {
  item_id: number
  return_condition?: string | null
  final_meter_reading?: number | null
}

export interface RentalReturnPayload {
  actual_return_date: string
  return_condition?: string | null
  final_meter_reading?: number | null
  // When provided, only these items are returned (partial return).
  items?: RentalItemReturnPayload[]
  // Security-deposit settlement, applied when the agreement is fully returned.
  deposit_action?: 'refund' | 'deduct' | 'waive' | null
  deposit_deduction?: number | null
}

export const fetchRentalParts = async (
  search?: string,
  limit?: number,
  skip?: number,
  searchField?: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<{ items: RentalPart[]; total: number }> => {
  const res = await apiClient.get('/rentals/parts', { params: { search, search_field: searchField, date_from: dateFrom, date_to: dateTo, limit, skip } })
  return res.data
}

export const fetchRentals = async (
  params: { status?: string; search?: string; search_field?: string; date_from?: string; date_to?: string; skip?: number; limit?: number } = {}
): Promise<{ items: Rental[]; total: number }> => {
  const res = await apiClient.get('/rentals', { params })
  return res.data
}

export const createRental = async (data: RentalPayload): Promise<Rental> => {
  const res = await apiClient.post('/rentals', data)
  return res.data
}

export const updateRental = async (
  id: number,
  data: Partial<RentalPayload> & { status?: string }
): Promise<Rental> => {
  const res = await apiClient.put(`/rentals/${id}`, data)
  return res.data
}

export const deleteRental = async (id: number): Promise<void> => {
  await apiClient.delete(`/rentals/${id}`)
}

export const returnRental = async (
  id: number,
  data: RentalReturnPayload
): Promise<Rental> => {
  const res = await apiClient.post(`/rentals/${id}/return`, data)
  return res.data
}

export const convertRentalToInvoice = async (
  id: number,
  data: RentalInvoiceCreatePayload
): Promise<RentalInvoice> => {
  const res = await apiClient.post(`/rentals/${id}/convert-to-invoice`, data)
  return res.data
}

export const fetchRentalInvoices = async (
  params: { status?: RentalInvoiceStatus; search?: string; search_field?: string; date_from?: string; date_to?: string; skip?: number; limit?: number } = {}
): Promise<{ items: RentalInvoice[]; total: number }> => {
  const res = await apiClient.get('/rentals/invoices', { params })
  return res.data
}

export const fetchRentalSummary = async (): Promise<{ total_invoiced: number; total_collected: number; products: number }> => {
  const res = await apiClient.get('/rentals/summary')
  return res.data
}

export const updateRentalInvoice = async (
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
    status?: RentalInvoiceStatus | string
    payment_method?: string | null
    notes?: string | null
    line_items?: any[]
    labels?: Record<string, any>
    summary_rows?: Array<{ id?: string; label: string; value: number }>
  }
): Promise<RentalInvoice> => {
  const res = await apiClient.put(`/rentals/invoices/${id}`, data)
  return res.data
}

export const fetchRentalHistory = async (
  params: { search?: string; search_field?: string; date_from?: string; date_to?: string; skip?: number; limit?: number } = {}
): Promise<{ items: RentalHistoryItem[]; total: number }> => {
  const res = await apiClient.get('/rentals/history', { params })
  return res.data
}

export const fetchRentalProductRate = async (partId: number): Promise<RentalProductRate> => {
  const res = await apiClient.get(`/rentals/product-rates/${partId}`)
  return res.data
}

export const upsertRentalProductRate = async (
  partId: number,
  data: Partial<Omit<RentalProductRate, 'part_id'>>,
): Promise<RentalProductRate> => {
  const res = await apiClient.put(`/rentals/product-rates/${partId}`, data)
  return res.data
}

export const runRecurringBilling = async (): Promise<Record<string, number>> => {
  const res = await apiClient.post('/rentals/run-recurring-billing')
  return res.data
}

export const saveRentalCard = async (id: number, sourceId: string): Promise<Rental> => {
  const res = await apiClient.post(`/rentals/${id}/save-card`, { source_id: sourceId })
  return res.data
}
