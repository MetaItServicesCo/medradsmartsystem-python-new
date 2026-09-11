import apiClient from './client'

export type LocationTypeValue =
  | 'building' | 'floor' | 'wing' | 'room' | 'bed'
  | 'shaft' | 'riser' | 'mech_room' | 'plenum' | 'roof' | 'exterior'

export interface Location {
  id: number
  facility_id: number
  parent_id: number | null
  path: string
  depth: number
  location_type: LocationTypeValue
  code: string
  name: string | null
  description: string | null
  department_id: number | null
  space_use: string | null
  criticality: string | null
  electrical_branch: string | null
  area_sqft: string | null
  ceiling_height_ft: string | null
  volume_cuft: string | null
  occupancy_status: string | null
  bed_count: number
  floor_plan_id: number | null
  plan_x: string | null
  plan_y: string | null
  plan_polygon: Array<{ x: number; y: number }> | null
  is_provisional: boolean
  is_active: boolean
  external_ref: string | null
  created_at: string
  updated_at: string
}

export interface LocationNode extends Location {
  children: LocationNode[]
  display_label: string | null
}

export interface LocationWithStatus extends Location {
  availability: string | null
  oos_reason: string | null
  status_since: string | null
  work_order_id: number | null
  display_label: string | null
}

export interface LocationBreadcrumb {
  id: number
  code: string
  name: string | null
  location_type: string
}

export interface LocationDetail extends Location {
  breadcrumbs: LocationBreadcrumb[]
  child_count: number
  descendant_count: number
  availability: string | null
  display_label: string | null
}

export interface LocationCreate {
  facility_id: number
  parent_id?: number | null
  location_type: string
  code: string
  name?: string | null
  description?: string | null
  department_id?: number | null
  space_use?: string | null
  criticality?: string | null
  electrical_branch?: string | null
  area_sqft?: number | null
  ceiling_height_ft?: number | null
  occupancy_status?: string | null
  is_provisional?: boolean
}

export type LocationUpdate = Partial<Omit<LocationCreate, 'facility_id' | 'location_type'>> & {
  is_active?: boolean
}

export interface MetaOption { value: string; label: string }

export interface LocationTypeMeta extends MetaOption {
  allowed_parents: string[]
  can_be_root: boolean
  can_hold_plan: boolean
}

export interface LocationMeta {
  location_types: LocationTypeMeta[]
  space_uses: MetaOption[]
  criticalities: MetaOption[]
  electrical_branches: MetaOption[]
  occupancy_statuses: MetaOption[]
}

export interface FloorPlan {
  id: number
  facility_id: number
  location_id: number
  name: string
  source_filename: string | null
  source_mime: string | null
  image_path: string | null
  width_px: number | null
  height_px: number | null
  scale_ft_per_px: string | null
  rotation_deg: number
  version: number
  is_current: boolean
  page_number: number | null
  created_at: string
  updated_at: string
}

export interface BulkImportIssue {
  row_index: number
  code: string | null
  severity: 'error' | 'warning'
  message: string
}

export interface BulkImportResult {
  dry_run: boolean
  total_rows: number
  created: number
  updated: number
  skipped: number
  issues: BulkImportIssue[]
}

export interface BulkLocationRow {
  parent_code?: string | null
  location_type: string
  code: string
  name?: string | null
  space_use?: string | null
  criticality?: string | null
  department_name?: string | null
  area_sqft?: number | null
  ceiling_height_ft?: number | null
  bed_count?: number | null
  external_ref?: string | null
}

export const fetchLocationMeta = async (): Promise<LocationMeta> => {
  const res = await apiClient.get('/locations/meta')
  return res.data
}

export const fetchLocations = async (params: {
  facility_id?: number
  parent_id?: number
  location_type?: string
  space_use?: string
  under_location_id?: number
  q?: string
  unplaced_only?: boolean
  is_provisional?: boolean
  limit?: number
}): Promise<{ items: Location[]; total: number }> => {
  const res = await apiClient.get('/locations/', { params })
  return res.data
}

export const fetchLocationTree = async (
  facilityId: number,
  rootId?: number,
): Promise<{ items: LocationNode[]; total: number }> => {
  const res = await apiClient.get('/locations/tree', {
    params: { facility_id: facilityId, root_id: rootId },
  })
  return res.data
}

export const fetchSpaceBoard = async (params: {
  facility_id: number
  under_location_id?: number
  space_use?: string
  only_unavailable?: boolean
}): Promise<LocationWithStatus[]> => {
  const res = await apiClient.get('/locations/board', { params })
  return res.data
}

export const fetchLocation = async (id: number): Promise<LocationDetail> => {
  const res = await apiClient.get(`/locations/${id}`)
  return res.data
}

export const createLocation = async (payload: LocationCreate): Promise<Location> => {
  const res = await apiClient.post('/locations/', payload)
  return res.data
}

export const updateLocation = async (id: number, payload: LocationUpdate): Promise<Location> => {
  const res = await apiClient.put(`/locations/${id}`, payload)
  return res.data
}

export const moveLocation = async (id: number, newParentId: number | null): Promise<Location> => {
  const res = await apiClient.post(`/locations/${id}/move`, { new_parent_id: newParentId })
  return res.data
}

export const deleteLocation = async (id: number, hard = false) => {
  const res = await apiClient.delete(`/locations/${id}`, { params: { hard } })
  return res.data
}

export const bulkImportLocations = async (payload: {
  facility_id: number
  rows: BulkLocationRow[]
  dry_run: boolean
}): Promise<BulkImportResult> => {
  const res = await apiClient.post('/locations/bulk-import', payload)
  return res.data
}

// ── Floor plans ──────────────────────────────────────────────────────────────

export const fetchFloorPlans = async (
  locationId: number,
  includeSuperseded = false,
): Promise<{ items: FloorPlan[]; total: number }> => {
  const res = await apiClient.get(`/locations/${locationId}/floor-plans`, {
    params: { include_superseded: includeSuperseded },
  })
  return res.data
}

export const uploadFloorPlan = async (
  locationId: number,
  file: File,
  name?: string,
): Promise<FloorPlan> => {
  const form = new FormData()
  form.append('file', file)
  const res = await apiClient.post(`/locations/${locationId}/floor-plans`, form, {
    params: name ? { name } : undefined,
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export const updateFloorPlan = async (
  planId: number,
  payload: {
    name?: string
    page_number?: number | null
    rotation_deg?: number
    is_current?: boolean
    width_px?: number
    height_px?: number
  },
): Promise<FloorPlan> => {
  const res = await apiClient.put(`/locations/floor-plans/${planId}`, payload)
  return res.data
}

/**
 * Turn the drawing into a measuring instrument. The operator drags one line
 * over a known dimension and says what it measures; from then on a traced room
 * yields square feet, hence cubic feet, hence air changes per hour.
 */
export const calibrateFloorPlan = async (
  planId: number,
  pixelDistance: number,
  realFeet: number,
): Promise<FloorPlan> => {
  const res = await apiClient.post(`/locations/floor-plans/${planId}/calibrate`, {
    pixel_distance: pixelDistance,
    real_feet: realFeet,
  })
  return res.data
}

export const fetchPins = async (planId: number): Promise<LocationWithStatus[]> => {
  const res = await apiClient.get(`/locations/floor-plans/${planId}/pins`)
  return res.data
}

/** Batched: tracing a floor produces pins in bursts. */
export const placePins = async (
  planId: number,
  pins: Array<{ location_id: number; plan_x: number; plan_y: number }>,
) => {
  const res = await apiClient.post(`/locations/floor-plans/${planId}/pins`, { pins })
  return res.data
}

/** Click the plan, type the door number, move on — the tracing loop. */
export const quickPin = async (planId: number, payload: {
  code: string
  name?: string | null
  location_type?: string
  space_use?: string | null
  plan_x: number
  plan_y: number
}): Promise<Location> => {
  const res = await apiClient.post(`/locations/floor-plans/${planId}/quick-pin`, payload)
  return res.data
}

export interface TraceResult {
  location_id: number
  area_sqft: number | null
  perimeter_ft: number | null
  volume_cuft: number | null
  plan_x: number | null
  plan_y: number | null
  // Set when the plan has no scale yet: the outline is stored, the area is not
  // computable, and the caller should be told why rather than shown a blank.
  message: string | null
}

/**
 * Record a traced outline. Area is derived server-side from the plan's
 * calibration — a client-computed figure would quietly disagree the moment
 * anybody re-calibrated the drawing.
 */
export const traceRoom = async (
  locationId: number,
  polygon: Array<{ x: number; y: number }>,
  setPinToCentroid = true,
): Promise<TraceResult> => {
  const res = await apiClient.post(`/locations/${locationId}/trace`, {
    polygon, set_pin_to_centroid: setPinToCentroid,
  })
  return res.data
}

export const floorPlanFileUrl = (planId: number): string =>
  `${apiClient.defaults.baseURL}/locations/floor-plans/${planId}/file`
