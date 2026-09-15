import apiClient from './client'

export interface MetaOption { value: string; label: string }

export interface MaintenanceMeta {
  bases: MetaOption[]
  statuses: MetaOption[]
}

export interface MaintenanceSchedule {
  id: number
  facility_id: number
  equipment_id: number | null
  location_id: number | null
  name: string
  task_description: string | null
  discipline_id: number | null
  // Plant needs runtime scheduling in a way clinical equipment does not: a
  // generator that never runs does not need its 200-hour service.
  basis: string
  interval_days: number | null
  interval_runtime_hours: string | null
  runtime_point_id: number | null
  runtime_at_last_service: string | null
  estimated_hours: string | null
  priority: string
  lead_time_days: number
  assigned_technician_id: number | null
  assigned_vendor_id: number | null
  takes_space_out_of_service: boolean
  status: string
  last_generated_at: string | null
  last_completed_at: string | null
  next_due_date: string | null
  open_work_order_id: number | null
  equipment_tag: string | null
  /** Set for equipment in Facility (Electrical, Plumbing, Mechanical, HVAC). */
  equipment_name?: string | null
  location_code: string | null
  is_due: boolean
  is_overdue: boolean
  current_runtime_hours: number | null
}

export interface MaintenanceForecast {
  horizon_days: number
  scheduled: number
  overdue: number
  estimated_hours: number
  by_month: Record<string, number>
}

export const fetchMaintenanceMeta = async (): Promise<MaintenanceMeta> => {
  const res = await apiClient.get('/maintenance/meta')
  return res.data
}

export const fetchSchedules = async (params: {
  facility_id?: number
  equipment_id?: number
  location_id?: number
  discipline_id?: number
  status?: string
  due_only?: boolean
  limit?: number
}): Promise<{ items: MaintenanceSchedule[]; total: number }> => {
  const res = await apiClient.get('/maintenance/schedules', { params })
  return res.data
}

export const createSchedule = async (payload: {
  facility_id: number
  name: string
  equipment_id?: number | null
  location_id?: number | null
  task_description?: string | null
  discipline_id?: number | null
  basis?: string
  interval_days?: number | null
  interval_runtime_hours?: number | null
  runtime_point_id?: number | null
  estimated_hours?: number | null
  priority?: string
  lead_time_days?: number
  assigned_technician_id?: number | null
  assigned_vendor_id?: number | null
  takes_space_out_of_service?: boolean
  next_due_date?: string | null
}): Promise<MaintenanceSchedule> => {
  const res = await apiClient.post('/maintenance/schedules', payload)
  return res.data
}

export const updateSchedule = async (
  id: number, payload: Partial<MaintenanceSchedule>,
): Promise<MaintenanceSchedule> => {
  const res = await apiClient.put(`/maintenance/schedules/${id}`, payload)
  return res.data
}

export const retireSchedule = async (id: number) => {
  const res = await apiClient.delete(`/maintenance/schedules/${id}`)
  return res.data
}

/** Idempotent — a schedule with work already open generates nothing. */
export const generateWorkOrders = async (
  facilityId?: number,
): Promise<{ considered: number; generated: number; request_numbers: string[] }> => {
  const res = await apiClient.post('/maintenance/generate', null, {
    params: facilityId ? { facility_id: facilityId } : undefined,
  })
  return res.data
}

export const fetchForecast = async (params: {
  facility_id?: number
  days?: number
}): Promise<MaintenanceForecast> => {
  const res = await apiClient.get('/maintenance/forecast', { params })
  return res.data
}
