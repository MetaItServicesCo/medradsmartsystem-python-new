import apiClient from './client'

export interface ReportInvoiceBrief {
  id: number
  invoice_number: string
  status: string
  total_amount: number
  balance_due: number
}

export interface ServiceReportSession {
  user?: string | null
  timestamp?: string | null
  session_id?: string | null
  start_time?: string | null
  end_time?: string | null
  break_minutes?: number | null
  duration_hours?: number | null
  total_mileage?: number | null
  diagnosis?: string | null
  work_done?: string | null
  notes?: string | null
  test_equipment?: any[]
  parts?: any[]
}

export interface ServiceReport {
  id: number
  request_number: string
  facility_id: number
  facility_name: string | null
  equipment_id: number
  equipment_name: string | null
  asset_tag: string | null
  serial_number: string | null
  technician_id: number | null
  technician_name: string | null
  status: string
  priority: string
  problem_description: string
  service_required: string | null
  resolution_description: string | null
  time_spent_hours: number
  total_cost: number
  billing_status: string | null
  created_at: string | null
  started_at: string | null
  completed_at: string | null
  diagnosis: string | null
  work_done: string | null
  notes: string | null
  sessions: ServiceReportSession[]
  invoice: ReportInvoiceBrief | null
}

export interface InspectionReport {
  id: number
  inspection_number: string
  batch_id: number | null
  batch_number: string | null
  facility_id: number
  facility_name: string | null
  asset_name: string | null
  equipment_name?: string | null
  inventory_part_name?: string | null
  asset_tag: string | null
  part_number?: string | null
  serial_number: string | null
  make: string | null
  model: string | null
  tier_name?: string | null
  technician_id: number | null
  technician_name: string | null
  status: string
  result: string
  form_template_id: number | null
  form_template_name: string | null
  scheduled_date: string | null
  started_at: string | null
  completed_at: string | null
  inspection_frequency: string | null
  compliance_requirement: string | null
  criticality: string | null
  corrective_actions: string | null
  form_data: Record<string, any>
  invoice: ReportInvoiceBrief | null
}

export interface ServiceHistoryReport {
  id: string
  service_request_id: number
  request_number: string
  facility_id: number
  facility_name: string | null
  equipment_name: string | null
  technician_id: number | null
  technician_name: string | null
  timestamp: string | null
  action: string
  user: string | null
  changes: Record<string, any>
  summary: string | null
  status: string
}

export interface ReportsSummary {
  service_reports: number
  inspection_reports: number
  service_history: number
}

export interface ReportListResponse<T> {
  items: T[]
  total: number
  skip: number
  limit: number
}

export interface ReportListParams {
  search?: string
  facility_id?: number
  technician_id?: number
  result?: string
  action?: string
  date_from?: string
  date_to?: string
  skip?: number
  limit?: number
}

const cleanParams = (params: ReportListParams = {}) =>
  Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''))

export const fetchReportsSummary = async (
  params: Pick<ReportListParams, 'date_from' | 'date_to'> = {},
): Promise<ReportsSummary> => {
  const res = await apiClient.get('/reports/summary', { params: cleanParams(params) })
  return res.data
}

export const fetchServiceReports = async (params: ReportListParams = {}): Promise<ReportListResponse<ServiceReport>> => {
  const res = await apiClient.get('/reports/service-reports', { params: cleanParams(params) })
  return res.data
}

export const fetchInspectionReports = async (params: ReportListParams = {}): Promise<ReportListResponse<InspectionReport>> => {
  const res = await apiClient.get('/reports/inspection-reports', { params: cleanParams(params) })
  return res.data
}

export const fetchServiceHistoryReports = async (params: ReportListParams = {}): Promise<ReportListResponse<ServiceHistoryReport>> => {
  const res = await apiClient.get('/reports/service-history', { params: cleanParams(params) })
  return res.data
}
