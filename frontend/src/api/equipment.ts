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
  inspection_form_id: number | null
  default_picture_url: string | null
  description: string | null
  risk_priority: string | null
  risk_name: string | null
  location: string | null
  inventory_date: string | null
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
  cost: number | null
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
  inspection_form_id?: number | null
  default_picture_url?: string
  description?: string
  risk_priority?: string
  risk_name?: string
  location?: string
  inventory_date?: string | null
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
  cost?: number
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
  purchase_date?: string
  warranty_expiration?: string
  status?: string
}

export interface EquipmentListResponse {
  items: EquipmentItem[]
  total: number
}

export const fetchEquipment = async (facilityId?: number, search?: string): Promise<EquipmentListResponse> => {
  const params = facilityId
    ? { facility_id: facilityId, search: search || undefined, limit: 500 }
    : { search: search || undefined, limit: 500 }
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

export const exportEquipmentCsv = async (): Promise<void> => {
  const res = await apiClient.get('/equipment/export-csv', { responseType: 'blob' })
  const blob = new Blob([res.data], { type: 'text/csv' })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'facility_inventory.csv'
  document.body.appendChild(a)
  a.click()
  window.URL.revokeObjectURL(url)
  a.remove()
}
