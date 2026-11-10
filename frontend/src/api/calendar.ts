import apiClient from './client'

export interface CalendarTechnician {
  id: number
  full_name: string
}

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
  /** A technician schedule: tagged technicians, seen by them, its creator and every Admin. */
  is_schedule?: boolean
  all_day?: boolean
  location?: string | null
  technicians?: CalendarTechnician[]
  created_by_name?: string | null
  /** Whether the person looking may change or delete it. */
  can_edit?: boolean
}

export interface CreateEventPayload {
  title: string
  description?: string
  start_time: string
  end_time: string
  is_meeting?: boolean
  workspace_id?: number
  color?: string
  technician_ids?: number[]
  all_day?: boolean
  location?: string | null
}

export interface UpdateEventPayload {
  title?: string
  description?: string
  start_time?: string
  end_time?: string
  is_meeting?: boolean
  color?: string
  technician_ids?: number[]
  all_day?: boolean
  location?: string | null
}

export interface ScheduleClash {
  technician_id: number
  technician_name: string
  event_id: number
  title: string
  start_time: string
  end_time: string
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

/** The technicians a schedule can be for (Admins, Super Admins and technicians only). */
export const fetchScheduleTechnicians = async (): Promise<CalendarTechnician[]> => {
  const res = await apiClient.get('/calendar/technicians')
  return res.data
}

/** Schedules the tagged technicians already have at that time: a warning, not a block. */
export const checkScheduleClashes = async (data: {
  technician_ids: number[]
  start_time: string
  end_time: string
  exclude_event_id?: number
}): Promise<ScheduleClash[]> => {
  const res = await apiClient.post('/calendar/schedule/clashes', data)
  return res.data
}
