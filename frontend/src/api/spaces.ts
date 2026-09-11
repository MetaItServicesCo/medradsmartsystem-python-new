import apiClient from './client'

export interface MetaOption { value: string; label: string }

export interface SpaceMeta {
  availabilities: MetaOption[]
  out_of_service_reasons: MetaOption[]
  /** Only the states legal for the location asked about, so the picker cannot produce a 400. */
  applicable_availabilities: string[] | null
}

export interface SpaceStatus {
  id: number
  facility_id: number
  location_id: number
  availability: string
  oos_reason: string | null
  work_order_id: number | null
  since: string
  expected_return_at: string | null
  source: string
  notes: string | null
  changed_by_id: number | null
  location_code: string | null
  location_name: string | null
  location_type: string | null
  space_use: string | null
  criticality: string | null
  bed_count: number
  hours_in_state: number | null
}

export interface BoardSummary {
  total: number
  available: number
  unavailable: number
  by_availability: Record<string, number>
}

export interface SpaceStatusHistoryEntry {
  id: number
  location_id: number
  availability: string
  oos_reason: string | null
  work_order_id: number | null
  effective_from: string
  effective_to: string | null
  duration_minutes: string | null
  space_use: string | null
  criticality: string | null
  source: string
  notes: string | null
}

/**
 * The number that makes this a capacity conversation rather than a maintenance
 * one — and one no standalone CMMS or bed-management system can produce alone.
 */
export interface DowntimeReport {
  start: string
  end: string
  incidents: number
  bed_days_lost: number
  procedure_room_hours_lost: number
  other_space_hours_lost: number
  minutes_by_reason: Record<string, number>
  minutes_by_space_use: Record<string, number>
  facilities_attributable_only: boolean
}

export const fetchSpaceMeta = async (locationId?: number): Promise<SpaceMeta> => {
  const res = await apiClient.get('/spaces/meta', {
    params: locationId ? { location_id: locationId } : undefined,
  })
  return res.data
}

export const fetchBoardSummary = async (params: {
  facility_id?: number
  under_location_id?: number
}): Promise<BoardSummary> => {
  const res = await apiClient.get('/spaces/board', { params })
  return res.data
}

export const fetchSpaceStatuses = async (params: {
  facility_id?: number
  availability?: string
  oos_reason?: string
  space_use?: string
  unavailable_only?: boolean
  limit?: number
}): Promise<{ items: SpaceStatus[]; total: number }> => {
  const res = await apiClient.get('/spaces/', { params })
  return res.data
}

/** Spaces down longer than anybody intended — the quiet corrupter of capacity numbers. */
export const fetchStaleSpaces = async (params: {
  facility_id?: number
  older_than_hours?: number
}): Promise<{ items: SpaceStatus[]; total: number }> => {
  const res = await apiClient.get('/spaces/stale', { params })
  return res.data
}

export const fetchSpaceStatus = async (locationId: number): Promise<SpaceStatus> => {
  const res = await apiClient.get(`/spaces/locations/${locationId}`)
  return res.data
}

export const setSpaceStatus = async (locationId: number, payload: {
  availability: string
  oos_reason?: string | null
  work_order_id?: number | null
  expected_return_at?: string | null
  notes?: string | null
}): Promise<SpaceStatus> => {
  const res = await apiClient.put(`/spaces/locations/${locationId}`, payload)
  return res.data
}

export const fetchSpaceHistory = async (
  locationId: number,
  limit = 100,
): Promise<{ items: SpaceStatusHistoryEntry[]; total: number }> => {
  const res = await apiClient.get(`/spaces/locations/${locationId}/history`, { params: { limit } })
  return res.data
}

export const fetchDowntimeReport = async (params: {
  facility_id?: number
  start?: string
  end?: string
  facilities_attributable_only?: boolean
}): Promise<DowntimeReport> => {
  const res = await apiClient.get('/spaces/reports/downtime', { params })
  return res.data
}
