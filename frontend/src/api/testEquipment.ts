import apiClient from './client'

export type TestEquipmentStatus = 'active' | 'inactive' | 'maintenance'

export interface TestEquipment {
  id: number
  tem: string
  mrf: string | null
  model: string | null
  serial_number: string | null
  description: string | null
  asset: string | null
  technician_id: number | null
  technician_name: string | null
  status: TestEquipmentStatus | string
  image_url: string | null
  created_by_id: number | null
  created_at: string
  updated_at: string
}

export interface TestEquipmentListResponse {
  items: TestEquipment[]
  total: number
}

export interface TestEquipmentPayload {
  tem: string
  mrf?: string
  model?: string
  serial_number?: string
  description?: string
  asset?: string
  technician_id?: number | null
  status?: TestEquipmentStatus | string
  image?: File | null
  remove_image?: boolean
}

const toFormData = (payload: TestEquipmentPayload): FormData => {
  const form = new FormData()
  form.append('tem', payload.tem)
  ;(['mrf', 'model', 'serial_number', 'description', 'asset', 'status'] as const).forEach((key) => {
    const value = payload[key]
    if (value !== undefined && value !== null) form.append(key, String(value))
  })
  if (payload.technician_id !== undefined && payload.technician_id !== null) {
    form.append('technician_id', String(payload.technician_id))
  }
  if (payload.remove_image) form.append('remove_image', 'true')
  if (payload.image) form.append('image', payload.image)
  return form
}

export const fetchTestEquipment = async (params?: {
  search?: string
  status?: string
  technician_id?: number
  skip?: number
  limit?: number
}): Promise<TestEquipmentListResponse> => {
  const res = await apiClient.get('/test-equipment/', { params })
  return res.data
}

export const fetchActiveTestEquipment = async (params?: {
  search?: string
  limit?: number
}): Promise<TestEquipmentListResponse> => {
  const res = await apiClient.get('/test-equipment/active-options', { params })
  return res.data
}

export const createTestEquipment = async (payload: TestEquipmentPayload): Promise<TestEquipment> => {
  const res = await apiClient.post('/test-equipment/', toFormData(payload), {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export const updateTestEquipment = async (id: number, payload: TestEquipmentPayload): Promise<TestEquipment> => {
  const res = await apiClient.put(`/test-equipment/${id}`, toFormData(payload), {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export const deleteTestEquipment = async (id: number): Promise<void> => {
  await apiClient.delete(`/test-equipment/${id}`)
}
