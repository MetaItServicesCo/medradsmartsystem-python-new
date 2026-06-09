import apiClient from './client'

export type RentalStatus = 'active' | 'completed' | 'cancelled'
export type BillingFrequency = 'daily' | 'weekly' | 'monthly'
export type RentalInvoiceStatus = 'pending' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled'

export interface RentalPart {
  id: number
  part_number: string
  part_type: string
  description: string
  make: string | null
  model: string | null
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

export interface Rental {
  id: number
  rental_number: string
  equipment_id: number | null
  part_id: number
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
  initial_meter_reading: number | null
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

export interface RentalPayload {
  part_id: number
  customer_name: string
  customer_email: string
  customer_phone: string
  customer_address: string
  billing_frequency: BillingFrequency
  rental_rate: number
  security_deposit: number
  quantity?: number
  shipping_fee?: number
  setup_fee?: number
  item_condition?: string | null
  start_date: string
  end_date: string
  initial_condition?: string | null
  initial_meter_reading?: number | null
  terms_and_conditions?: string | null
}

export interface RentalReturnPayload {
  actual_return_date: string
  return_condition: string
  final_meter_reading?: number | null
}

export const fetchRentalParts = async (search?: string): Promise<{ items: RentalPart[]; total: number }> => {
  const res = await apiClient.get('/rentals/parts', { params: { search } })
  return res.data
}

export const fetchRentals = async (
  params: { status?: string; search?: string } = {}
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
  params: { status?: RentalInvoiceStatus } = {}
): Promise<{ items: RentalInvoice[]; total: number }> => {
  const res = await apiClient.get('/rentals/invoices', { params })
  return res.data
}

export const updateRentalInvoice = async (
  id: number,
  data: { amount_paid?: number; due_date?: string; status?: RentalInvoiceStatus; payment_method?: string | null; notes?: string }
): Promise<RentalInvoice> => {
  const res = await apiClient.put(`/rentals/invoices/${id}`, data)
  return res.data
}

export const fetchRentalHistory = async (): Promise<{ items: RentalHistoryItem[]; total: number }> => {
  const res = await apiClient.get('/rentals/history')
  return res.data
}
