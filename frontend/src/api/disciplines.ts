import apiClient from './client'

export interface Discipline {
  id: number
  code: string
  name: string
  description: string | null
  color: string | null
  sort_order: number
  is_active: boolean
}

export interface TechnicianCandidate {
  id: number
  full_name: string
  username: string
  holds_discipline: boolean
  is_primary_discipline: boolean
  open_work_orders: number
}

export interface ImpactAssessment {
  equipment_id: number
  found: boolean
  service_type: string | null
  downstream_asset_count: number
  downstream_assets: Array<{
    id: number
    depth: number
    service_type: string
    connection_ref: string | null
    asset_tag: string | null
    make: string | null
    model: string | null
  }>
  affected_location_count: number
  affected_locations: Array<{
    id: number
    code: string
    name: string | null
    location_type: string
    space_use: string | null
    criticality: string | null
    bed_count: number
    already_out_of_service: boolean
  }>
  clinical_summary: {
    high_acuity_space_count: number
    critical_space_count: number
    beds_affected: number
    clinical_assets_affected: number
    // The sentence somebody actually reads before approving a shutdown.
    headline: string
  }
}

export const fetchDisciplines = async (): Promise<{ items: Discipline[]; total: number }> => {
  const res = await apiClient.get('/disciplines/')
  return res.data
}

export const createDiscipline = async (payload: Partial<Discipline>): Promise<Discipline> => {
  const res = await apiClient.post('/disciplines/', payload)
  return res.data
}

export const updateDiscipline = async (
  id: number, payload: Partial<Discipline>,
): Promise<Discipline> => {
  const res = await apiClient.put(`/disciplines/${id}`, payload)
  return res.data
}

export const fetchServiceTypes = async (): Promise<Array<{ value: string; label: string }>> => {
  const res = await apiClient.get('/disciplines/service-types')
  return res.data
}

export const fetchUserDisciplines = async (userId: number): Promise<number[]> => {
  const res = await apiClient.get(`/disciplines/users/${userId}`)
  return res.data
}

export const setUserDisciplines = async (userId: number, payload: {
  discipline_ids: number[]
  primary_discipline_id?: number | null
}) => {
  const res = await apiClient.put(`/disciplines/users/${userId}`, payload)
  return res.data
}

// Who could take this job — qualified first, then whoever is least buried.
export const fetchTechnicianCandidates = async (params: {
  facility_id: number
  discipline_id?: number
}): Promise<TechnicianCandidate[]> => {
  const res = await apiClient.get('/disciplines/technicians/candidates', { params })
  return res.data
}

// What goes dark if this asset stops.
export const fetchImpact = async (
  equipmentId: number,
  params: { service_type?: string; include_redundant?: boolean } = {},
): Promise<ImpactAssessment> => {
  const res = await apiClient.get(`/disciplines/equipment/${equipmentId}/impact`, { params })
  return res.data
}

export const fetchUpstream = async (equipmentId: number, serviceType?: string) => {
  const res = await apiClient.get(`/disciplines/equipment/${equipmentId}/upstream`, {
    params: serviceType ? { service_type: serviceType } : undefined,
  })
  return res.data
}

export const linkAssetToAsset = async (params: {
  upstream_equipment_id: number
  downstream_equipment_id: number
  service_type: string
  connection_ref?: string
  is_redundant?: boolean
}) => {
  const res = await apiClient.post('/disciplines/links/asset-to-asset', null, { params })
  return res.data
}

export const linkAssetToLocation = async (params: {
  equipment_id: number
  location_id: number
  service_type: string
  is_sole_source?: boolean
  connection_ref?: string
}) => {
  const res = await apiClient.post('/disciplines/links/asset-to-location', null, { params })
  return res.data
}
