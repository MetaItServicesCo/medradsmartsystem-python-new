import apiClient from './client'

export interface NotificationItem {
  id: number
  user_id: number
  actor_id: number | null
  title: string
  message: string | null
  notification_type: string
  link_url: string | null
  is_read: boolean
  read_at: string | null
  created_at: string
}

export interface NotificationListResponse {
  items: NotificationItem[]
  total: number
  unread_count: number
}

export const fetchNotifications = async (params?: {
  unread_only?: boolean
  skip?: number
  limit?: number
}): Promise<NotificationListResponse> => {
  const res = await apiClient.get('/notifications/', { params })
  return res.data
}

export const markNotificationRead = async (id: number): Promise<NotificationItem> => {
  const res = await apiClient.put(`/notifications/${id}/read`)
  return res.data
}

export const markAllNotificationsRead = async (): Promise<{ updated: number }> => {
  const res = await apiClient.put('/notifications/read-all')
  return res.data
}
