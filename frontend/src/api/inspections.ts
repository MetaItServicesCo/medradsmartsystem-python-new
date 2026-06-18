import apiClient from './client'

export type InspectionStatus = 'upcoming' | 'in_progress' | 'completed' | 'overdue'
export type InspectionResult = 'pass' | 'fail' | 'pending'
export type InvoiceStatus = 'pending' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled'
export type InspectionFrequency = 'instant' | 'quarterly' | 'semi_annual' | 'annual'

export interface InspectionFacility {
  id: number
  name: string
  city: string | null
  state: string | null
  tier_name: string | null
  inventory_count: number
}

export interface InspectionInventoryItem {
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
  serial_number: string | null
  location: string | null
  condition: string
  is_critical: boolean
  status: string
}

export interface InspectionEquipmentItem {
  id: number
  facility_id: number
  facility_name: string | null
  tier_name: string | null
  asset_tag: string
  make: string
  model: string
  serial_number: string
  modality_name: string | null
  status: string
  criticality: string
}

export interface InspectionInvoice {
  id: number
  invoice_number: string
  invoice_type: string
  customer_name: string
  customer_email: string
  customer_phone: string | null
  customer_address: string | null
  facility_id: number | null
  inspection_id: number | null
  subtotal: number
  tax_amount: number
  discount_amount: number
  total_amount: number
  amount_paid: number
  balance_due: number
  status: InvoiceStatus
  issue_date: string
  due_date: string
  payment_terms: string | null
  notes: string | null
  created_at: string
  updated_at: string
  facility_name: string | null
  inspection_number?: string | null
  inventory_part_name?: string | null
  inspector_name?: string | null
  transactions?: InvoiceTransaction[]
  travel_charges?: number | null
  service_charges?: number | null
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

export interface Inspection {
  id: number
  inspection_number: string
  batch_id: number | null
  batch_number: string | null
  equipment_id: number | null
  inventory_part_id: number | null
  facility_id: number
  inspector_id: number | null
  form_template_id: number
  status: InspectionStatus
  result: InspectionResult
  scheduled_date: string
  started_at: string | null
  completed_at: string | null
  form_data: Record<string, any> | null
  corrective_actions: string | null
  inspection_scope: string | null
  inspection_frequency: InspectionFrequency | string | null
  compliance_requirement: string | null
  criticality: string | null
  quotation_notes: string | null
  is_instant: boolean
  created_at: string
  updated_at: string
  facility_name: string | null
  inventory_part_name: string | null
  equipment_name: string | null
  asset_name: string | null
  part_number: string | null
  asset_tag: string | null
  serial_number: string | null
  make: string | null
  model: string | null
  tier_name: string | null
  inspector_name: string | null
  invoice: InspectionInvoice | null
}

export interface InspectionListResponse {
  items: Inspection[]
  total: number
}

export interface InspectionBatch {
  id: number
  batch_number: string
  facility_id: number
  inspector_id: number | null
  form_template_id: number
  status: InspectionStatus
  scheduled_date: string
  started_at: string | null
  completed_at: string | null
  inspection_frequency: InspectionFrequency | string | null
  inspection_scope: string | null
  notes: string | null
  is_instant: boolean
  created_at: string
  updated_at: string
  facility_name: string | null
  inspector_name: string | null
  asset_count: number
  completed_count: number
  in_progress_count: number
  pending_count: number
  assets?: Inspection[]
}

export interface InspectionBatchListResponse {
  items: InspectionBatch[]
  total: number
}

export interface InspectionInvoiceListResponse {
  items: InspectionInvoice[]
  total: number
}

export interface InspectionFormOption {
  id: number
  name: string
  description: string | null
  modality_id: number | null
  modality_name: string | null
  created_at: string
  updated_at: string
}

export interface InstantInspectionPayload {
  facility_id: number
  equipment_ids?: number[]
  frequency?: InspectionFrequency
  scheduled_date?: string
  notes?: string
}

export interface InspectionSchedulePayload {
  facility_id: number
  equipment_ids?: number[]
  frequency: InspectionFrequency
  scheduled_date: string
  compliance_requirement?: string
  criticality?: string
  notes?: string
}

export interface InspectionCompletePayload {
  result: InspectionResult
  form_data: Record<string, any>
  corrective_actions?: string
  labor_hours?: number
  parts_amount?: number
  inspection_charge?: number
  other_charges?: number
  tax_amount?: number
  discount_amount?: number
  notes?: string
}

export interface InspectionReportPayload extends InspectionCompletePayload {
  status: InspectionStatus
}

export interface BatchAssetCreatePayload {
  asset_tag: string
  make: string
  model: string
  serial_number: string
  modality_id: number
  tier_id?: number | null
  inspection_form_id?: number | null
  description?: string
  risk_priority?: string
  risk_name?: string
  location?: string
  pm_scheduling?: string
  last_pm_date?: string | null
  installation_date?: string | null
  inventory_date?: string | null
}

export interface InspectionInvoiceUpdatePayload {
  subtotal?: number
  tax_amount?: number
  discount_amount?: number
  total_amount?: number
  amount_paid?: number
  due_date?: string
  payment_terms?: string
  notes?: string
  status?: InvoiceStatus
  travel_charges?: number
  service_charges?: number
}

export const fetchInspectionFacilities = async (): Promise<InspectionFacility[]> => {
  const res = await apiClient.get('/inspections/facilities')
  return res.data
}

export const fetchInspectionForms = async (
  modalityId?: number
): Promise<{ items: InspectionFormOption[]; total: number }> => {
  const res = await apiClient.get('/inspections/forms', {
    params: modalityId ? { modality_id: modalityId } : undefined,
  })
  return res.data
}

export const updateInspectionForm = async (
  id: number,
  data: { modality_id: number | null }
): Promise<InspectionFormOption> => {
  const res = await apiClient.patch(`/inspections/forms/${id}`, data)
  return res.data
}

export const fetchInspectionFacilityInventory = async (
  facilityId: number,
  search?: string
): Promise<InspectionInventoryItem[]> => {
  const res = await apiClient.get(`/inspections/facilities/${facilityId}/inventory`, { params: { search } })
  return res.data
}

export const fetchInspectionFacilityEquipment = async (
  facilityId: number
): Promise<InspectionEquipmentItem[]> => {
  const res = await apiClient.get(`/inspections/facilities/${facilityId}/equipment`)
  return res.data
}

export const fetchInspections = async (
  params: { status?: InspectionStatus; facility_id?: number } = {}
): Promise<InspectionListResponse> => {
  const res = await apiClient.get('/inspections/', { params })
  return res.data
}

export const fetchInspectionBatches = async (
  params: { status?: InspectionStatus; facility_id?: number } = {}
): Promise<InspectionBatchListResponse> => {
  const res = await apiClient.get('/inspections/batches', { params })
  return res.data
}

export const fetchInspectionBatch = async (id: number): Promise<InspectionBatch> => {
  const res = await apiClient.get(`/inspections/batches/${id}`)
  return res.data
}

export const createInstantInspection = async (
  data: InstantInspectionPayload
): Promise<InspectionBatchListResponse> => {
  const res = await apiClient.post('/inspections/instant', data)
  return res.data
}

export const scheduleInspections = async (
  data: InspectionSchedulePayload
): Promise<InspectionBatchListResponse> => {
  const res = await apiClient.post('/inspections/schedule', data)
  return res.data
}

export const generateUpcomingInspections = async (
  data: { facility_id?: number; days_ahead?: number } = {}
): Promise<InspectionListResponse> => {
  const res = await apiClient.post('/inspections/generate-upcoming', data)
  return res.data
}

export const startInspection = async (id: number): Promise<Inspection> => {
  const res = await apiClient.put(`/inspections/${id}/start`)
  return res.data
}

export const completeInspection = async (
  id: number,
  data: InspectionCompletePayload
): Promise<Inspection> => {
  const res = await apiClient.put(`/inspections/${id}/complete`, data)
  return res.data
}

export const saveInspectionReport = async (
  id: number,
  data: InspectionReportPayload
): Promise<Inspection> => {
  const res = await apiClient.put(`/inspections/${id}/report`, data)
  return res.data
}

export const addInspectionBatchAsset = async (
  batchId: number,
  data: BatchAssetCreatePayload
): Promise<InspectionBatch> => {
  const res = await apiClient.post(`/inspections/batches/${batchId}/assets`, data)
  return res.data
}

export const removeInspectionBatchAsset = async (
  batchId: number,
  inspectionId: number
): Promise<InspectionBatch> => {
  const res = await apiClient.delete(`/inspections/batches/${batchId}/assets/${inspectionId}`)
  return res.data
}

export const updateInspectionTechnician = async (
  inspectionId: number,
  inspectorId: number | null
): Promise<Inspection> => {
  const res = await apiClient.patch(`/inspections/${inspectionId}/technician`, { inspector_id: inspectorId })
  return res.data
}

export const fetchInspectionQuotations = async (): Promise<InspectionInvoiceListResponse> => {
  const res = await apiClient.get('/inspections/quotations')
  return res.data
}

export const updateInspectionInvoice = async (
  id: number,
  data: InspectionInvoiceUpdatePayload
): Promise<InspectionInvoice> => {
  const res = await apiClient.put(`/inspections/invoices/${id}`, data)
  return res.data
}
