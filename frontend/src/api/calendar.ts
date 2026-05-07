import apiClient from './client'

export interface CalendarEvent {
  id: number
  user_id: number
  workspace_id?: number
  title: string
  description?: string
  start_time: string
  end_time: string
  is_meeting: boolean
  color?: string
  created_at: string
  updated_at: string
}

export interface CreateEventPayload {
  title: string
  description?: string
  start_time: string
  end_time: string
  is_meeting?: boolean
  workspace_id?: number
  color?: string
}

export interface UpdateEventPayload {
  title?: string
  description?: string
  start_time?: string
  end_time?: string
  is_meeting?: boolean
  color?: string
}

export const fetchEvents = async (): Promise<CalendarEvent[]> => {
  const res = await apiClient.get('/calendar/events')
  return res.data
}

export const createEvent = async (data: CreateEventPayload): Promise<CalendarEvent> => {
  const res = await apiClient.post('/calendar/events', data)
  return res.data
}

export const updateEvent = async (id: number, data: UpdateEventPayload): Promise<CalendarEvent> => {
  const res = await apiClient.put(`/calendar/events/${id}`, data)
  return res.data
}

export const deleteEvent = async (id: number): Promise<CalendarEvent> => {
  const res = await apiClient.delete(`/calendar/events/${id}`)
  return res.data
}
