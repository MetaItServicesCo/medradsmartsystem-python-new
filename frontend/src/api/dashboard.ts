import apiClient from './client'

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
