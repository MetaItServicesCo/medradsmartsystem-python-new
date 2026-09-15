/**
 * A site's equipment under Electrical, Plumbing, Mechanical and HVAC, and the
 * service and inspection jobs done on it.
 */
import apiClient from './client'

export type CategoryCode = 'electrical' | 'plumbing' | 'mechanical' | 'hvac'
export type Condition = 'working' | 'needs_attention' | 'out_of_service'
export type JobKind = 'service' | 'inspection'
export type JobStatus = 'open' | 'in_progress' | 'done'
export type JobStatusFilter = JobStatus | 'overdue' | ''
export type InspectionResult = 'pass' | 'fail'

export interface CategorySummary {
  code: CategoryCode
  name: string
  colour: string
  description: string
  types: string[]
  equipment: number
  needs_attention: number
  out_of_service: number
  open_jobs: number
  overdue_jobs: number
}

export interface CategoryEquipment {
  id: number
  asset_tag: string
  category: CategoryCode
  category_name: string
  name: string
  type: string | null
  building: string | null
  floor: string | null
  spot: string | null
  location_label: string
  quantity: number
  condition: Condition
  condition_label: string
  make: string | null
  model: string | null
  notes: string | null
  open_jobs: number
  next_service_on: string | null
}

export interface CategoryEquipmentInput {
  name: string
  type: string
  building: string
  floor: string | null
  spot: string | null
  quantity: number
  condition: Condition
  make: string | null
  model: string | null
  notes: string | null
}

export interface PlaceSuggestions {
  buildings: string[]
  floors: string[]
  spots: string[]
}

export interface EquipmentJob {
  id: number
  number: string
  kind: JobKind
  title: string
  status: JobStatus | 'cancelled'
  status_label: string
  due_on: string | null
  overdue: boolean
  assigned_to: { id: number; name: string } | null
  notes: string | null
  inspection_result: InspectionResult | null
  findings: string | null
  created_at: string
  completed_at: string | null
  equipment: {
    id: number
    name: string
    asset_tag: string
    type: string | null
    category: CategoryCode | null
    category_name: string | null
    location_label: string
  } | null
}

export interface JobCounts {
  open: number
  in_progress: number
  done: number
  overdue: number
}

export interface JobInput {
  equipment_id: number
  title: string
  due_on: string | null
  assigned_to_id: number | null
  status: JobStatus
  notes: string | null
  inspection_result: InspectionResult | null
  findings: string | null
}

export interface Assignee {
  id: number
  name: string
  role: string
}

export interface MaintenanceSummary {
  service: { open: number; overdue: number; failed: number }
  inspection: { open: number; overdue: number; failed: number }
}

export const fetchCategoryOverview = async (facilityId: number): Promise<{ categories: CategorySummary[] }> => {
  const res = await apiClient.get('/site-categories/overview', { params: { facility_id: facilityId } })
  return res.data
}

export const fetchCategoryEquipment = async (
  code: CategoryCode,
  facilityId: number,
  filters: { search?: string; building?: string; floor?: string; condition?: string } = {},
): Promise<{ category: { code: CategoryCode; name: string; types: string[] }; items: CategoryEquipment[]; total: number }> => {
  const params: Record<string, string | number> = { facility_id: facilityId }
  Object.entries(filters).forEach(([key, value]) => { if (value) params[key] = value })
  const res = await apiClient.get(`/site-categories/${code}/equipment`, { params })
  return res.data
}

export const fetchPlaceSuggestions = async (facilityId: number): Promise<PlaceSuggestions> => {
  const res = await apiClient.get('/site-categories/suggestions', { params: { facility_id: facilityId } })
  return res.data
}

export const addCategoryEquipment = async (
  code: CategoryCode, facilityId: number, payload: CategoryEquipmentInput,
): Promise<CategoryEquipment> => {
  const res = await apiClient.post(`/site-categories/${code}/equipment`, { facility_id: facilityId, ...payload })
  return res.data
}

export const updateCategoryEquipment = async (
  id: number, payload: Partial<CategoryEquipmentInput> & { category?: CategoryCode },
): Promise<CategoryEquipment> => {
  const res = await apiClient.put(`/site-categories/equipment/${id}`, payload)
  return res.data
}

export const deleteCategoryEquipment = async (id: number): Promise<void> => {
  await apiClient.delete(`/site-categories/equipment/${id}`)
}

export const fetchEquipmentJobs = async (
  facilityId: number,
  kind: JobKind,
  filters: { status?: JobStatusFilter; category?: string; search?: string } = {},
): Promise<{ items: EquipmentJob[]; total: number; counts: JobCounts }> => {
  const params: Record<string, string | number> = { facility_id: facilityId, kind }
  Object.entries(filters).forEach(([key, value]) => { if (value) params[key] = value })
  const res = await apiClient.get('/equipment-maintenance/jobs', { params })
  return res.data
}

export const fetchMaintenanceSummary = async (facilityId: number): Promise<MaintenanceSummary> => {
  const res = await apiClient.get('/equipment-maintenance/summary', { params: { facility_id: facilityId } })
  return res.data
}

export const fetchAssignees = async (facilityId: number): Promise<Assignee[]> => {
  const res = await apiClient.get('/equipment-maintenance/assignees', { params: { facility_id: facilityId } })
  return res.data
}

export const createEquipmentJob = async (
  facilityId: number, kind: JobKind, payload: JobInput,
): Promise<EquipmentJob> => {
  const res = await apiClient.post('/equipment-maintenance/jobs', { facility_id: facilityId, kind, ...payload })
  return res.data
}

export const updateEquipmentJob = async (id: number, payload: Partial<JobInput>): Promise<EquipmentJob> => {
  const res = await apiClient.patch(`/equipment-maintenance/jobs/${id}`, payload)
  return res.data
}

export const deleteEquipmentJob = async (id: number): Promise<void> => {
  await apiClient.delete(`/equipment-maintenance/jobs/${id}`)
}

/** The server's message when it has one, otherwise the fallback. */
export function errorMessage(error: unknown, fallback: string): string {
  const detail = (error as any)?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg).replace(/^Value error, /, '')
  return fallback
}
