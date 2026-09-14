import apiClient from './client'

export interface SpecField {
  key: string
  label: string
  type: 'number' | 'select' | 'boolean' | 'text'
  unit?: string | null
  options?: string[]
  default?: string | number | boolean
}

export interface FixtureType {
  key: string
  label: string
  prefix: string
  discipline: string
  discipline_id: number | null
  spec: SpecField[]
}

export interface FixtureCatalog {
  types: FixtureType[]
  statuses: Array<{ value: string; label: string }>
}

export interface Fixture {
  id: number
  facility_id: number
  location_id: number
  discipline_id: number | null
  fixture_type: string
  code: string
  label: string | null
  manufacturer: string | null
  model: string | null
  serial_number: string | null
  spec: Record<string, unknown> | null
  circuit_ref: string | null
  served_by_equipment_id: number | null
  status: string
  work_order_id: number | null
  quantity: number
  installed_on: string | null
  warranty_expires_on: string | null
  last_tested_on: string | null
  notes: string | null
  is_active: boolean
  // Derived server-side so a row can read "20 A critical receptacle" without
  // the browser reimplementing the catalogue.
  summary: string | null
  discipline_code: string | null
  type_label: string | null
}

export interface FixtureTypeSummary {
  fixture_type: string
  label: string
  discipline: string | null
  total: number
  working: number
  faulty: number
  isolated: number
}

export const fetchFixtureCatalog = async (): Promise<FixtureCatalog> => {
  const res = await apiClient.get('/fixtures/catalog')
  return res.data
}

export const fetchFixtures = async (params: {
  location_id?: number
  facility_id?: number
  fixture_type?: string
  discipline_id?: number
  status?: string
  limit?: number
}): Promise<{ items: Fixture[]; total: number }> => {
  const res = await apiClient.get('/fixtures/', { params })
  return res.data
}

export const fetchFixtureSummary = async (
  locationId: number,
): Promise<FixtureTypeSummary[]> => {
  const res = await apiClient.get(`/fixtures/summary/${locationId}`)
  return res.data
}

export const bulkCreateFixtures = async (payload: {
  location_id: number
  fixture_type: string
  count: number
  label?: string | null
  manufacturer?: string | null
  model?: string | null
  serial_numbers?: string[] | null
  spec?: Record<string, unknown> | null
  circuit_ref?: string | null
  served_by_equipment_id?: number | null
}): Promise<{ items: Fixture[]; total: number }> => {
  const res = await apiClient.post('/fixtures/bulk', payload)
  return res.data
}

/** Top existing rooms up to what their room type contains. Never removes. */
export const fillRooms = async (payload: {
  location_ids: number[]
  items: Array<{
    fixture_type: string
    count: number
    discipline_code?: string | null
    code_prefix?: string | null
  }>
}): Promise<{ created: number; rooms_changed: number }> => {
  const res = await apiClient.post('/fixtures/fill', payload)
  return res.data
}

export const updateFixture = async (
  id: number, payload: Partial<Fixture>,
): Promise<Fixture> => {
  const res = await apiClient.put(`/fixtures/${id}`, payload)
  return res.data
}

export const deactivateFixture = async (id: number) => {
  await apiClient.delete(`/fixtures/${id}`)
}

export const reportFixtureFault = async (
  id: number,
  payload: { description: string; priority?: string; takes_out_of_service?: boolean },
): Promise<{
  work_order_id: number
  request_number: string
  fixture_id: number
  fixture_status: string
}> => {
  const res = await apiClient.post(`/fixtures/${id}/report-fault`, payload)
  return res.data
}
