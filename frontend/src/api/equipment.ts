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

  // Depreciation. The backend has accepted these since the asset ledger
  // landed; they were missing here, which is why no form could offer them.
  depreciation_method: string | null
  salvage_value: string | number | null
  useful_life_years: string | number | null
  total_expected_units: string | number | null
  last_pm_date: string | null
  next_generated_pm_date: string | null
  purchase_date: string | null
  warranty_expiration: string | null
  status: string
  created_at: string
  updated_at: string

  // Facilities placement. A room item (chair, display) has an asset_type and a
  // type_label; a lift or a ventilator has neither.
  location_id?: number | null
  discipline_id?: number | null
  criticality?: string | null
  asset_type?: string | null
  type_label?: string | null

  // Set on equipment in the Facility Categories: known by name, and where
  // exactly it is. `location` holds the room or exact spot.
  name?: string | null
  equipment_type?: string | null
  quantity?: number | null
  building?: string | null
  floor?: string | null
  condition?: string | null
}

export interface EquipmentCreate {
  /** Blank: the next tag for the site is issued. */
  asset_tag?: string
  /** Required for clinical equipment only. */
  make?: string
  model?: string
  serial_number?: string
  modality_id?: number | null
  discipline_id?: number | null
  location_id?: number | null
  criticality?: string | null
  asset_type?: string | null
  serves?: Array<{ location_id: number; service_type: string }>
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

  // Depreciation. The backend has accepted these since the asset ledger
  // landed; they were missing here, which is why no form could offer them.
  depreciation_method?: string | null
  salvage_value?: string | number | null
  useful_life_years?: string | number | null
  total_expected_units?: string | number | null
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

/**
 * The asset register for one site, filtered on the server.
 *
 * The Assets page used to call fetchEquipment with an object where it takes a
 * facility id, so the site filter never reached the server and every site's
 * register listed every site's assets. Named parameters here make that a type
 * error rather than a silent leak.
 */
export const fetchAssetRegister = async (params: {
  /** Required by the register page; a room's own list is scoped by location_id. */
  facility_id?: number
  search?: string
  location_id?: number | null
  kind?: 'room_items' | 'equipment' | null
  discipline_id?: number | null
  skip?: number
  limit?: number
}): Promise<{ items: EquipmentItem[]; total: number }> => {
  const res = await apiClient.get('/equipment/', {
    params: {
      facility_id: params.facility_id,
      search: params.search || undefined,
      location_id: params.location_id ?? undefined,
      kind: params.kind ?? undefined,
      discipline_id: params.discipline_id ?? undefined,
      skip: params.skip ?? 0,
      limit: params.limit ?? 100,
    },
  })
  return res.data
}

export const fetchEquipmentById = async (id: number): Promise<EquipmentItem> => {
  const res = await apiClient.get(`/equipment/${id}`)
  return res.data
}

export interface RoomItemType {
  key: string
  label: string
  discipline: string
  discipline_id: number | null
}

export const fetchRoomItemTypes = async (): Promise<{ types: RoomItemType[] }> => {
  const res = await apiClient.get('/equipment/room-item-types')
  return res.data
}

/** Put several of one item in a room, each its own asset with its own tag. */
export const addRoomItems = async (payload: {
  location_id: number
  asset_type: string
  count: number
  discipline_code?: string | null
  /** Only for a single item. */
  asset_tag?: string | null
  serial_number?: string | null
  make?: string | null
  model?: string | null
  cost?: number | null
  installation_date?: string | null
  description?: string | null
}): Promise<{ items: EquipmentItem[]; total: number }> => {
  const res = await apiClient.post('/equipment/room-items', payload)
  return res.data
}

/** Which assets a bulk change covers: ticked ones, or everything a register filter matches. */
export type AssetSelection =
  | { ids: number[] }
  | {
      facility_id: number
      search?: string
      location_id?: number | null
      kind?: 'room_items' | 'equipment' | null
      discipline_id?: number | null
    }

/** Details to set in bulk. Leave a field out to leave it as it is. */
export interface AssetBulkChanges {
  cost?: number
  installation_date?: string
  make?: string
  model?: string
  discipline_id?: number
}

export interface AssetBulkResult {
  dry_run: boolean
  matched: number
  assets_changed: number
  fields: Array<{
    field: keyof AssetBulkChanges
    label: string
    value: unknown
    will_change: number
    unchanged: number
    skipped_count: number
    skipped: Array<{ id: number; asset_tag: string; reason: string }>
  }>
}

/** Preview (the default) or apply the same details to many assets. */
export const bulkUpdateAssets = async (payload: {
  selection: AssetSelection
  changes: AssetBulkChanges
  dry_run: boolean
}): Promise<AssetBulkResult> => {
  const res = await apiClient.post('/equipment/bulk-update', payload)
  return res.data
}

/** The tag the next registration at this site will get, for the form to show. */
export const fetchNextTag = async (facilityId: number): Promise<string> => {
  const res = await apiClient.get('/equipment/next-tag', { params: { facility_id: facilityId } })
  return res.data.tag
}

export interface ServesLink {
  id: number
  location_id: number
  code: string
  name: string | null
  location_type: string
  criticality: string | null
  service_type: string
}

/** The spaces an asset supplies — an air handler's theatres, a panel's rooms. */
export const fetchServes = async (equipmentId: number): Promise<ServesLink[]> => {
  const res = await apiClient.get(`/equipment/${equipmentId}/serves`)
  return res.data
}

export const addServes = async (
  equipmentId: number, payload: { location_id: number; service_type: string },
): Promise<ServesLink[]> => {
  const res = await apiClient.post(`/equipment/${equipmentId}/serves`, payload)
  return res.data
}

export const removeServes = async (equipmentId: number, linkId: number): Promise<ServesLink[]> => {
  const res = await apiClient.delete(`/equipment/${equipmentId}/serves/${linkId}`)
  return res.data
}

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
