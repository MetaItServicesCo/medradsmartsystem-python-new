import apiClient from './client'

export type InventoryTransactionType = 'receiving' | 'issuance' | 'transfer' | 'adjustment'

export interface InventoryPart {
  id: number
  facility_id: number
  facility_name: string | null
  tier_id: number | null
  tier_name: string | null
  part_number: string
  part_type: string
  description: string
  make: string | null
  model: string | null
  unit_price: number
  condition: string
  supplier_name: string | null
  supplier_contact: string | null
  supplier_email: string | null
  supplier_phone: string | null
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
  facility_id: number
  tier_id?: number | null
  part_number: string
  part_type: string
  description: string
  make?: string
  model?: string
  unit_price: number
  condition: string
  supplier_name?: string
  supplier_contact?: string
  supplier_email?: string
  supplier_phone?: string
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

export interface InventoryListParams {
  facility_id?: number
  tier_id?: number
  part_type?: string
  search?: string
  low_stock?: boolean
  expiring_days?: number
  skip?: number
  limit?: number
}

export interface InventoryTransaction {
  id: number
  part_id: number
  facility_id: number
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
