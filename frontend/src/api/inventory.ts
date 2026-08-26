import apiClient from './client'

export type InventoryTransactionType = 'receiving' | 'issuance' | 'transfer' | 'adjustment'

export interface InventoryPart {
  id: number
  facility_id: number | null
  facility_name: string | null
  tier_id: number | null
  tier_name: string | null
  modality_id: number | null
  modality_name: string | null
  inspection_form_id: number | null
  inspection_form_name: string | null
  asset_tag: string | null
  part_number: string
  part_type: string
  description: string
  make: string | null
  model: string | null
  default_picture_url: string | null
  risk_priority: string | null
  risk_name: string | null
  inventory_date: string | null
  unit_price: number
  condition: string
  acquisition_authorized_by: string | null
  department: string | null
  po_no: string | null
  requester_first_name: string | null
  requester_last_name: string | null
  requester_phone: string | null
  requester_fax: string | null
  requester_mailing_address: string | null
  requester_email: string | null
  owning_department: string | null
  acquisition_method: string | null
  acquired_company_name: string | null
  acquired_account_number: string | null
  acquired_sales_person: string | null
  acquired_phone: string | null
  acquired_email: string | null
  acquired_mailing_address: string | null
  acquisition_date: string | null
  capital_equipment: string | null
  warranty_duration: string | null
  parts_duration: string | null
  labor_duration: string | null
  coverage_start_date: string | null
  coverage_type: string | null
  part_warranty_end_date: string | null
  labor_warranty_end_date: string | null
  pm_scheduling: string | null
  installation_date: string | null
  last_pm_date: string | null
  next_generated_pm_date: string | null
  supplier_name: string | null
  supplier_contact: string | null
  supplier_email: string | null
  supplier_phone: string | null
  supplier_address: string | null
  vendor_name: string | null
  purchase_location: string | null
  shipping_method: string | null
  warehouse_arrival_date: string | null
  technical_specs: Record<string, any> | null
  batch_number: string | null
  expiry_date: string | null
  serial_number: string | null
  is_critical: boolean
  quantity_on_hand: number
  reorder_level: number
  location: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface InventoryPartPayload {
  facility_id?: number | null
  tier_id?: number | null
  modality_id?: number | null
  inspection_form_id?: number | null
  asset_tag?: string
  part_number: string
  part_type: string
  description: string
  make?: string
  model?: string
  default_picture_url?: string
  risk_priority?: string
  risk_name?: string
  inventory_date?: string | null
  unit_price: number
  condition: string
  acquisition_authorized_by?: string
  department?: string
  po_no?: string
  requester_first_name?: string
  requester_last_name?: string
  requester_phone?: string
  requester_fax?: string
  requester_mailing_address?: string
  requester_email?: string
  owning_department?: string
  acquisition_method?: string
  acquired_company_name?: string
  acquired_account_number?: string
  acquired_sales_person?: string
  acquired_phone?: string
  acquired_email?: string
  acquired_mailing_address?: string
  acquisition_date?: string | null
  capital_equipment?: string
  warranty_duration?: string
  parts_duration?: string
  labor_duration?: string
  coverage_start_date?: string | null
  coverage_type?: string
  part_warranty_end_date?: string | null
  labor_warranty_end_date?: string | null
  pm_scheduling?: string
  installation_date?: string | null
  last_pm_date?: string | null
  next_generated_pm_date?: string | null
  supplier_name?: string
  supplier_contact?: string
  supplier_email?: string
  supplier_phone?: string
  supplier_address?: string
  vendor_name?: string
  purchase_location?: string
  shipping_method?: string
  warehouse_arrival_date?: string | null
  technical_specs?: Record<string, any> | null
  batch_number?: string
  expiry_date?: string | null
  serial_number?: string
  is_critical?: boolean
  quantity_on_hand: number
  reorder_level: number
  location?: string
  status?: string
}

export interface InventoryPartListResponse {
  items: InventoryPart[]
  total: number
}

export interface InventorySummary {
  total_parts: number
  total_units: number
  low_stock: number
  critical: number
  stock_value: number
}

export interface InventoryListParams {
  facility_id?: number
  tier_id?: number
  part_type?: string
  search?: string
  search_field?: string
  stock_view?: 'in_stock' | 'low_stock' | 'stock_value'
  low_stock?: boolean
  expiring_days?: number
  skip?: number
  limit?: number
}

export interface InventoryTransaction {
  id: number
  part_id: number
  facility_id: number | null
  transaction_type: InventoryTransactionType
  quantity: number
  unit_cost: number | null
  balance_after: number
  from_facility_id: number | null
  to_facility_id: number | null
  authorization_reference: string | null
  authorization_details: string | null
  notes: string | null
  created_by_id: number
  created_by_name: string | null
  created_at: string
}

export interface InventoryTransactionPayload {
  transaction_type: InventoryTransactionType
  quantity: number
  unit_cost?: number
  from_facility_id?: number | null
  to_facility_id?: number | null
  authorization_reference?: string
  authorization_details?: string
  notes?: string
}

export const fetchInventoryParts = async (
  params: InventoryListParams = {}
): Promise<InventoryPartListResponse> => {
  const res = await apiClient.get('/inventory/', { params })
  return res.data
}

export const fetchInventorySummary = async (
  params: InventoryListParams = {}
): Promise<InventorySummary> => {
  const res = await apiClient.get('/inventory/summary', { params })
  return res.data
}

export const createInventoryPart = async (data: InventoryPartPayload): Promise<InventoryPart> => {
  const res = await apiClient.post('/inventory/', data)
  return res.data
}

export const updateInventoryPart = async (
  id: number,
  data: Partial<InventoryPartPayload>
): Promise<InventoryPart> => {
  const res = await apiClient.put(`/inventory/${id}`, data)
  return res.data
}

export const deleteInventoryPart = async (id: number): Promise<void> => {
  await apiClient.delete(`/inventory/${id}`)
}

export const fetchInventoryTransactions = async (
  partId: number
): Promise<{ items: InventoryTransaction[]; total: number }> => {
  const res = await apiClient.get(`/inventory/${partId}/transactions`)
  return res.data
}

export const createInventoryTransaction = async (
  partId: number,
  data: InventoryTransactionPayload
): Promise<InventoryTransaction> => {
  const res = await apiClient.post(`/inventory/${partId}/transactions`, data)
  return res.data
}

export const exportInventoryPartsCsv = async (): Promise<void> => {
  const res = await apiClient.get('/inventory/export-csv', { responseType: 'blob' })
  const blob = new Blob([res.data], { type: 'text/csv' })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'parts_inventory.csv'
  document.body.appendChild(a)
  a.click()
  window.URL.revokeObjectURL(url)
  a.remove()
}
