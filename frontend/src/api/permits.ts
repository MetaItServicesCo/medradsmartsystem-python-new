import apiClient from './client'

export interface MetaOption { value: string; label: string }

export interface PermitMeta {
  permit_types: MetaOption[]
  statuses: MetaOption[]
  approval_roles: MetaOption[]
  construction_activity_types: MetaOption[]
  patient_risk_groups: MetaOption[]
  icra_classes: MetaOption[]
}

export interface PermitApproval {
  id: number
  permit_id: number
  approver_role: string
  status: string
  approved_by_id: number | null
  approved_by_name: string | null
  decided_at: string | null
  conditions: string | null
  rejection_reason: string | null
}

export interface WorkPermit {
  id: number
  permit_number: string
  facility_id: number
  work_order_id: number | null
  location_id: number | null
  permit_type: string
  status: string
  title: string
  description: string | null
  work_scope: string | null
  valid_from: string | null
  valid_to: string | null
  construction_activity_type: string | null
  patient_risk_group: string | null
  icra_class: string | null
  required_precautions: string[] | null
  impairs_fire_alarm: boolean
  impairs_sprinkler: boolean
  impairs_egress: boolean
  impairs_smoke_barrier: boolean
  ilsm_measures: string[] | null
  fire_watch_required: boolean
  fire_watch_minutes_after: number | null
  fire_watch_by: string | null
  extinguisher_verified: boolean
  isolation_points: Array<Record<string, unknown>> | null
  energy_verified_zero: boolean
  service_type: string | null
  affected_location_ids: number[] | null
  affected_summary: string | null
  requested_at: string | null
  closed_at: string | null
  controls_removed: boolean
  closeout_notes: string | null
  created_at: string
  updated_at: string
}

export interface WorkPermitDetail extends WorkPermit {
  approvals: PermitApproval[]
  // Approved is not the same as authorising: a permit outside its window
  // authorises nothing, which is the whole reason the window exists.
  is_authorising: boolean
  outstanding_approvals: string[]
  location_code: string | null
  work_order_number: string | null
}

// What the assessment would produce, shown before committing to it.
export interface ICRAPreview {
  construction_activity_type: string
  patient_risk_group: string
  icra_class: string
  required_precautions: string[]
  required_approvals: string[]
}

export const fetchPermitMeta = async (): Promise<PermitMeta> => {
  const res = await apiClient.get('/permits/meta')
  return res.data
}

export const fetchIcraPreview = async (params: {
  construction_activity_type: string
  location_id?: number
  patient_risk_group?: string
}): Promise<ICRAPreview> => {
  const res = await apiClient.get('/permits/icra-preview', { params })
  return res.data
}

export const fetchPermits = async (params: {
  facility_id?: number
  work_order_id?: number
  permit_type?: string
  status?: string
  open_only?: boolean
  awaiting_role?: string
  limit?: number
}): Promise<{ items: WorkPermitDetail[]; total: number }> => {
  const res = await apiClient.get('/permits/', { params })
  return res.data
}

export const fetchPermit = async (id: number): Promise<WorkPermitDetail> => {
  const res = await apiClient.get(`/permits/${id}`)
  return res.data
}

export const createPermit = async (payload: {
  facility_id: number
  permit_type: string
  title: string
  work_order_id?: number | null
  location_id?: number | null
  description?: string | null
  work_scope?: string | null
  valid_from?: string | null
  valid_to?: string | null
  construction_activity_type?: string | null
  patient_risk_group?: string | null
  impairs_fire_alarm?: boolean
  impairs_sprinkler?: boolean
  impairs_egress?: boolean
  impairs_smoke_barrier?: boolean
  service_type?: string | null
  // For a shutdown: work out the affected spaces from the dependency graph
  // rather than asking somebody to list them.
  derive_impact_from_equipment_id?: number | null
}): Promise<WorkPermitDetail> => {
  const res = await apiClient.post('/permits/', payload)
  return res.data
}

export const updatePermit = async (
  id: number, payload: Partial<WorkPermit>,
): Promise<WorkPermitDetail> => {
  const res = await apiClient.put(`/permits/${id}`, payload)
  return res.data
}

export const submitPermit = async (id: number): Promise<WorkPermitDetail> => {
  const res = await apiClient.post(`/permits/${id}/submit`)
  return res.data
}

export const decidePermit = async (id: number, payload: {
  role: string
  approved: boolean
  conditions?: string
  reason?: string
}): Promise<WorkPermitDetail> => {
  const res = await apiClient.post(`/permits/${id}/decision`, payload)
  return res.data
}

export const closePermit = async (id: number, payload: {
  controls_removed: boolean
  notes?: string
}): Promise<WorkPermitDetail> => {
  const res = await apiClient.post(`/permits/${id}/close`, payload)
  return res.data
}

export const cancelPermit = async (id: number): Promise<WorkPermitDetail> => {
  const res = await apiClient.post(`/permits/${id}/cancel`)
  return res.data
}
