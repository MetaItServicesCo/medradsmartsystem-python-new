import apiClient from './client'

export interface EquipmentItem {
  id: number
  asset_tag: string
  make: string
  model: string
  serial_number: string
  modality_id: number
  facility_id: number
  tier_id: number | null
  purchase_date: string | null
  warranty_expiration: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface EquipmentCreate {
  asset_tag: string
  make: string
  model: string
  serial_number: string
  modality_id: number
  facility_id: number
  tier_id?: number | null
  purchase_date?: string
  warranty_expiration?: string
  status?: string
}

export interface EquipmentListResponse {
  items: EquipmentItem[]
  total: number
}

export const fetchEquipment = async (facilityId?: number): Promise<EquipmentListResponse> => {
  const params = facilityId ? { facility_id: facilityId } : {}
  const res = await apiClient.get('/equipment/', { params })
  return res.data
}

export interface EquipmentUpdate extends Partial<EquipmentCreate> {}

export const createEquipment = async (data: EquipmentCreate): Promise<EquipmentItem> => {
  const res = await apiClient.post('/equipment/', data)
  return res.data
}

export const updateEquipment = async (id: number, data: EquipmentUpdate): Promise<EquipmentItem> => {
  const res = await apiClient.put(`/equipment/${id}`, data)
  return res.data
}

export const deleteEquipment = async (id: number): Promise<void> => {
  await apiClient.delete(`/equipment/${id}`)
}
