import apiClient from './client'

export type SalesQuotationStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'
export type SalesPaidStatus = 'unpaid' | 'paid'
export type SalesInvoiceStatus = 'pending' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled'

export interface SalesPart {
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

export interface SalesQuotationLineItem {
  id: number
  part_id: number
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
  facility_id: number | null
  facility_name: string | null
  subtotal: number
  tax_amount: number
  discount_amount: number
  total_amount: number
  amount_paid: number
  balance_due: number
  status: SalesInvoiceStatus
  issue_date: string
  due_date: string
  payment_method: string | null
  notes: string | null
  created_at: string
  updated_at: string
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
    part_id: number
    quantity: number
    unit_price?: number
    shipping_fee?: number
    setup_fee?: number
    condition?: string | null
    description?: string
  }>
}

export const fetchSalesParts = async (search?: string): Promise<{ items: SalesPart[]; total: number }> => {
  const res = await apiClient.get('/sales/parts', { params: { search } })
  return res.data
}

export const fetchSalesQuotations = async (
  params: { status?: string; search?: string } = {}
): Promise<{ items: SalesQuotation[]; total: number }> => {
  const res = await apiClient.get('/sales/quotations', { params })
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
  params: { status?: SalesInvoiceStatus } = {}
): Promise<{ items: SalesInvoice[]; total: number }> => {
  const res = await apiClient.get('/sales/invoices', { params })
  return res.data
}

export const updateSalesInvoice = async (
  id: number,
  data: { amount_paid?: number; due_date?: string; status?: SalesInvoiceStatus; payment_method?: string | null; notes?: string }
): Promise<SalesInvoice> => {
  const res = await apiClient.put(`/sales/invoices/${id}`, data)
  return res.data
}

export const fetchSalesHistory = async (): Promise<{ items: SalesHistoryItem[]; total: number }> => {
  const res = await apiClient.get('/sales/history')
  return res.data
}
