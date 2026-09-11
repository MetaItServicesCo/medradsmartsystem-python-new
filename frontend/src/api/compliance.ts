import apiClient from './client'

export interface MetaOption { value: string; label: string }

export interface ComplianceMeta {
  authorities: MetaOption[]
  frequencies: MetaOption[]
  statuses: MetaOption[]
  results: MetaOption[]
}

export interface ComplianceProgram {
  id: number
  facility_id: number
  code: string
  name: string
  description: string | null
  authority: string
  citation: string | null
  frequency: string
  discipline_id: number | null
  applies_to_space_uses: string[] | null
  applies_to_equipment_ids: number[] | null
  grace_days: number
  requires_certificate: boolean
  certificate_must_be_posted: boolean
  requires_licensed_provider: boolean
  procedure: string | null
  reading_point_codes: string[] | null
  is_active: boolean
  open_tasks: number
  overdue_tasks: number
  subject_count: number
}

export interface ComplianceTask {
  id: number
  facility_id: number
  program_id: number
  equipment_id: number | null
  location_id: number | null
  status: string
  due_date: string
  grace_days: number
  completed_at: string | null
  result: string | null
  findings: string | null
  corrective_action: string | null
  certificate_number: string | null
  certificate_issued_by: string | null
  inspector_license: string | null
  certificate_issued_on: string | null
  certificate_expires_on: string | null
  notes: string | null
  program_code: string | null
  program_name: string | null
  authority: string | null
  citation: string | null
  procedure: string | null
  requires_certificate: boolean
  requires_licensed_provider: boolean
  equipment_tag: string | null
  location_code: string | null
  is_overdue: boolean
  days_overdue: number
  // Late but inside tolerance is recoverable; past grace is a gap in the
  // record that cannot be filled retroactively.
  is_past_grace: boolean
}

export interface ComplianceSummary {
  open: number
  overdue: number
  past_grace: number
  due_within_14_days: number
  expired_certificates: number
  failures_last_12_months: number
}

export const fetchComplianceMeta = async (): Promise<ComplianceMeta> => {
  const res = await apiClient.get('/compliance/meta')
  return res.data
}

export const fetchComplianceSummary = async (
  facilityId?: number,
): Promise<ComplianceSummary> => {
  const res = await apiClient.get('/compliance/summary', {
    params: facilityId ? { facility_id: facilityId } : undefined,
  })
  return res.data
}

export const fetchPrograms = async (params: {
  facility_id?: number
  authority?: string
  discipline_id?: number
}): Promise<{ items: ComplianceProgram[]; total: number }> => {
  const res = await apiClient.get('/compliance/programs', { params })
  return res.data
}

export const seedPrograms = async (
  facilityId: number,
): Promise<{ created: number; skipped: number; programs: string[] }> => {
  const res = await apiClient.post('/compliance/programs/seed', null, {
    params: { facility_id: facilityId },
  })
  return res.data
}

export const updateProgram = async (
  id: number, payload: Partial<ComplianceProgram>,
): Promise<ComplianceProgram> => {
  const res = await apiClient.put(`/compliance/programs/${id}`, payload)
  return res.data
}

/** Idempotent — safe to re-run, and meant for a nightly job. */
export const generateTasks = async (params: {
  facility_id?: number
  horizon_days?: number
}): Promise<{ created: number; skipped_existing: number; by_program: Record<string, number> }> => {
  const res = await apiClient.post('/compliance/generate', null, { params })
  return res.data
}

export const fetchTasks = async (params: {
  facility_id?: number
  program_id?: number
  equipment_id?: number
  status?: string
  overdue_only?: boolean
  due_within_days?: number
  limit?: number
}): Promise<{ items: ComplianceTask[]; total: number }> => {
  const res = await apiClient.get('/compliance/tasks', { params })
  return res.data
}

export const completeTask = async (id: number, payload: {
  result: string
  findings?: string
  corrective_action?: string
  performed_by_vendor_id?: number
  certificate?: {
    certificate_number?: string
    certificate_issued_by?: string
    inspector_license?: string
    certificate_issued_on?: string
    certificate_expires_on?: string
  }
  measured_values?: Record<string, unknown>
  notes?: string
}): Promise<ComplianceTask> => {
  const res = await apiClient.post(`/compliance/tasks/${id}/complete`, payload)
  return res.data
}

/**
 * Distinct from the overdue task list: a posted elevator certificate can expire
 * while the next inspection is already booked, and the car still comes out of
 * service on the date.
 */
export const fetchExpiringCertificates = async (params: {
  facility_id?: number
  horizon_days?: number
}): Promise<{ items: ComplianceTask[]; total: number }> => {
  const res = await apiClient.get('/compliance/certificates/expiring', { params })
  return res.data
}
