import apiClient from './client'

export interface AttendanceUserBrief {
  id: number
  full_name: string
  username: string
  email: string
  role: string
  avatar_url?: string | null
}

export interface AttendanceFacilityBrief {
  id: number
  name: string
}

export interface AttendanceProfile {
  id: number
  user_id: number
  facility_id?: number | null
  employee_code?: string | null
  face_status: string
  face_samples_count: number
  face_model_version?: string | null
  notes?: string | null
  created_at: string
  updated_at: string
  user: AttendanceUserBrief
  facility?: AttendanceFacilityBrief | null
}

export interface AttendanceEvent {
  id: number
  user_id: number
  profile_id?: number | null
  facility_id?: number | null
  event_type: string
  event_time: string
  timezone: string
  source: string
  verification_status: string
  confidence?: number | null
  remark?: string | null
  device_label?: string | null
  image_url?: string | null
  created_by_id?: number | null
  created_at: string
  user: AttendanceUserBrief
  facility?: AttendanceFacilityBrief | null
}

export interface AttendanceProfileListResponse {
  items: AttendanceProfile[]
  total: number
}

export interface AttendanceEventListResponse {
  items: AttendanceEvent[]
  total: number
}

export interface AttendanceSummary {
  date: string
  total_employees: number
  enrolled_faces: number
  checked_in: number
  checked_out: number
  on_break: number
  needs_review: number
  latest_events: AttendanceEvent[]
}

export interface AttendanceEventPayload {
  user_id?: number
  facility_id?: number | null
  event_type: 'check_in' | 'check_out' | 'break_start' | 'break_end'
  event_time?: string
  timezone?: string
  source?: 'manual' | 'face' | 'admin'
  verification_status?: 'verified' | 'needs_review' | 'rejected'
  confidence?: number
  remark?: string
  device_label?: string
}

export const fetchAttendanceSummary = async (targetDate?: string): Promise<AttendanceSummary> => {
  const res = await apiClient.get('/attendance/summary/today', { params: targetDate ? { target_date: targetDate } : undefined })
  return res.data
}

export const fetchAttendanceProfiles = async (params?: {
  search?: string
  facility_id?: number
  skip?: number
  limit?: number
}): Promise<AttendanceProfileListResponse> => {
  const res = await apiClient.get('/attendance/profiles', { params })
  return res.data
}

export const createAttendanceProfile = async (payload: {
  user_id: number
  facility_id?: number | null
  employee_code?: string
  notes?: string
}): Promise<AttendanceProfile> => {
  const res = await apiClient.post('/attendance/profiles', payload)
  return res.data
}

export const updateAttendanceProfile = async (id: number, payload: {
  facility_id?: number | null
  employee_code?: string
  face_status?: string
  notes?: string
}): Promise<AttendanceProfile> => {
  const res = await apiClient.put(`/attendance/profiles/${id}`, payload)
  return res.data
}

export const uploadAttendanceFaceSample = async (profileId: number, file: File): Promise<AttendanceProfile> => {
  const form = new FormData()
  form.append('file', file)
  const res = await apiClient.post(`/attendance/profiles/${profileId}/face-samples`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export const fetchAttendanceEvents = async (params?: {
  date_from?: string
  date_to?: string
  user_id?: number
  facility_id?: number
  skip?: number
  limit?: number
}): Promise<AttendanceEventListResponse> => {
  const res = await apiClient.get('/attendance/events', { params })
  return res.data
}

export const createAttendanceEvent = async (payload: AttendanceEventPayload): Promise<AttendanceEvent> => {
  const res = await apiClient.post('/attendance/events', payload)
  return res.data
}
