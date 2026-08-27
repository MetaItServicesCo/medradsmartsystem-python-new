import apiClient from './client'
import type { AuditLogItem } from './audit'

export interface DashboardSummary {
  facilities: { total: number; active: number; inactive: number }
  service_requests: { total: number; open: number; critical: number }
  inspections: { total: number; upcoming: number; overdue: number }
  rentals: { active: number }
  equipment: { total: number; active: number; in_maintenance: number }
  user_assignments: { total: number; direct: number; multi_facility: number }
  invoices: { pending: number; overdue: number }
  inventory: { low_stock_parts: number; expiring_parts: number }
}

export const fetchDashboardSummary = async (): Promise<DashboardSummary> => {
  const res = await apiClient.get('/dashboard/summary')
  return res.data
}

export type DashboardComparisonMode = 'previous_period' | 'previous_year' | 'custom'

export interface DashboardMetricComparison {
  current: number
  previous: number
  delta: number
  change_percent: number | null
  direction: 'up' | 'down' | 'flat'
}

export interface DashboardAlert {
  key: string
  title: string
  count: number
  severity: 'critical' | 'warning' | 'info'
  detail: string
  module: string
  route: string
}

export interface RevenueStream {
  stream: string
  label: string
  current: number
  previous: number
  delta: number
}

export interface DashboardIntelligence {
  period: { from: string; to: string }
  comparison: { mode: DashboardComparisonMode; from: string; to: string }
  metrics: Record<string, DashboardMetricComparison>
  revenue_breakdown: RevenueStream[]
  trajectory: { direction: 'upward' | 'downward' | 'stable'; score: number; basis: string[] }
  alerts: DashboardAlert[]
  generated_at: string
}

export interface DashboardAnalysis {
  available: boolean
  source: string
  headline: string
  summary: string
  positives: string[]
  risks: string[]
  actions: string[]
  generated_at: string
}

export interface DashboardActivityResponse {
  items: AuditLogItem[]
  total: number
  scope: 'own' | 'global'
}

export interface DashboardPeriodParams {
  date_from?: string
  date_to?: string
  comparison?: DashboardComparisonMode
  comparison_from?: string
  comparison_to?: string
}

export const fetchDashboardIntelligence = async (params: DashboardPeriodParams): Promise<DashboardIntelligence> => {
  const res = await apiClient.get('/dashboard/intelligence', { params })
  return res.data
}

export const fetchDashboardAnalysis = async (
  params: DashboardPeriodParams,
  module?: string,
): Promise<DashboardAnalysis> => {
  const res = await apiClient.get('/dashboard/analysis', {
    params: module ? { ...params, module } : params,
  })
  return res.data
}

export const fetchDashboardActivity = async (params?: {
  skip?: number
  limit?: number
  search?: string
  action?: string
  from_date?: string
  to_date?: string
}): Promise<DashboardActivityResponse> => {
  const res = await apiClient.get('/dashboard/activity', { params })
  return res.data
}
