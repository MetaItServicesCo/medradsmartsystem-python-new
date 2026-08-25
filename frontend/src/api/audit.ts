import apiClient from './client'

export interface AuditLogItem {
  id: number
  table_name: string
  record_id: number
  action: string
  changed_by_id: number | null
  changed_by_username: string | null
  changes_json: string | null
  timestamp: string
}

export interface AuditLogResponse {
  items: AuditLogItem[]
  total: number
}

export const fetchAuditLogs = async (params?: {
  skip?: number
  limit?: number
  search?: string
  action?: string
  from_date?: string
  to_date?: string
}): Promise<AuditLogResponse> => {
  const res = await apiClient.get('/audit-logs/', { params })
  return res.data
}
