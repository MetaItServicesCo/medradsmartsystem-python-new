import apiClient from './client'
import { pageThrough } from '@/utils/paging'

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
  // Where a self check-in was marked, and the employee's own note (why it was
  // marked by hand, or a dispute). HR's note is `remark`.
  latitude?: number | null
  longitude?: number | null
  location_accuracy_m?: number | null
  /** The address the location resolves to; filled in a moment after the mark. */
  location_place?: string | null
  employee_note?: string | null
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

export interface AttendanceFaceBox {
  x: number
  y: number
  width: number
  height: number
  confidence: number
}

export interface AttendanceFaceDetectionResponse {
  faces: AttendanceFaceBox[]
  face_count: number
}

export interface AttendanceFaceRecognitionResponse {
  matched: boolean
  duplicate?: boolean
  verification_status: 'verified' | 'needs_review' | 'rejected'
  confidence: number
  message: string
  faces: AttendanceFaceBox[]
  profile?: {
    profile_id: number
    user_id: number
    full_name: string | null
    facility_id?: number | null
  }
  candidate?: {
    profile_id: number
    user_id: number
    full_name: string | null
  }
  event?: AttendanceEvent
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

export interface AttendanceProfileQuery {
  search?: string
  facility_id?: number
  /** Only users who are enrolled for face attendance. Active-only always. */
  enrolled_only?: boolean
  skip?: number
  limit?: number
}

export const ATTENDANCE_PROFILES_PAGE_LIMIT = 500

export const fetchAttendanceProfiles = async (
  params?: AttendanceProfileQuery,
): Promise<AttendanceProfileListResponse> => {
  const res = await apiClient.get('/attendance/profiles', { params })
  return res.data
}

/** Every matching profile, a page at a time. See utils/paging. */
export const fetchAllAttendanceProfiles = async (
  params: Omit<AttendanceProfileQuery, 'skip' | 'limit'> = {},
  maxProfiles = 10000,
): Promise<AttendanceProfileListResponse> => pageThrough<AttendanceProfile>(
  (skip, limit) => fetchAttendanceProfiles({ ...params, skip, limit }),
  ATTENDANCE_PROFILES_PAGE_LIMIT,
  maxProfiles,
)

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

export const trainAttendanceFaceModel = async (profileId: number): Promise<AttendanceProfile> => {
  const res = await apiClient.post(`/attendance/profiles/${profileId}/train`)
  return res.data
}

export const detectAttendanceFace = async (file: File): Promise<AttendanceFaceDetectionResponse> => {
  const form = new FormData()
  form.append('file', file)
  const res = await apiClient.post('/attendance/face/detect', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export const recognizeAttendanceFace = async (
  file: File,
  payload: {
    event_type: AttendanceEventPayload['event_type']
    facility_id?: number | null
    device_label?: string
    device_timezone?: string
  } = { event_type: 'check_in' }
): Promise<AttendanceFaceRecognitionResponse> => {
  const form = new FormData()
  form.append('file', file)
  form.append('event_type', payload.event_type)
  if (payload.facility_id) form.append('facility_id', String(payload.facility_id))
  if (payload.device_label) form.append('device_label', payload.device_label)
  if (payload.device_timezone) form.append('device_timezone', payload.device_timezone)
  const res = await apiClient.post('/attendance/face/recognize', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export interface AttendanceEventQuery {
  date_from?: string
  date_to?: string
  user_id?: number
  facility_id?: number
  verification_status?: string
  skip?: number
  limit?: number
}

/**
 * The server's hard cap on this endpoint. Asking for more is not clamped --
 * it is a 422 before the handler runs, so the whole request fails. Both the
 * HR month grid and the employee sheet asked for 5000 and silently got
 * nothing back, which the pages then drew as a month of absences.
 */
export const ATTENDANCE_EVENTS_PAGE_LIMIT = 500

export const fetchAttendanceEvents = async (
  params?: AttendanceEventQuery,
): Promise<AttendanceEventListResponse> => {
  const res = await apiClient.get('/attendance/events', { params })
  return res.data
}

/**
 * Every event matching the query, fetched a page at a time.
 *
 * The loop itself is utils/paging, which is where it can be tested.
 */
export const fetchAllAttendanceEvents = async (
  params: Omit<AttendanceEventQuery, 'skip' | 'limit'> = {},
  maxEvents = 20000,
): Promise<AttendanceEventListResponse> => pageThrough<AttendanceEvent>(
  (skip, limit) => fetchAttendanceEvents({ ...params, skip, limit }),
  ATTENDANCE_EVENTS_PAGE_LIMIT,
  maxEvents,
)

export const reviewAttendanceEvent = async (
  eventId: number,
  payload: { verification_status: 'verified' | 'rejected'; remark?: string }
): Promise<AttendanceEvent> => {
  const res = await apiClient.patch(`/attendance/events/${eventId}/review`, payload)
  return res.data
}

export const createAttendanceEvent = async (payload: AttendanceEventPayload): Promise<AttendanceEvent> => {
  const res = await apiClient.post('/attendance/events', payload)
  return res.data
}

// ── The register ─────────────────────────────────────────────────────────────
// Classified days, computed by the same server-side rules engine that writes
// the timesheets payroll is paid from. The UI renders these verdicts; it does
// not derive its own, because two engines is how a screen and a payslip end
// up disagreeing about whether somebody turned up.

export type AttendanceDayStatus =
  | 'full_day' | 'early_leave' | 'half_day' | 'absent'
  | 'on_leave' | 'holiday'

// ── Self check-in: every employee marks their own attendance ─────────────────

export type AttendanceEventType = 'check_in' | 'check_out' | 'break_start' | 'break_end'

export interface MyAttendanceStatus {
  face_enrolled: boolean
  last_event: AttendanceEvent | null
}

export interface MyAttendanceMarkResult {
  recorded: boolean
  duplicate?: boolean
  verification_status?: 'verified' | 'needs_review'
  reason?: 'not_enrolled' | 'no_face' | 'not_matched' | 'liveness'
  can_mark_manually?: boolean
  confidence?: number
  message: string
  event?: AttendanceEvent
}

export interface MyAttendanceMark {
  event_type: AttendanceEventType
  photo?: Blob | null
  manual?: boolean
  note?: string
  latitude?: number
  longitude?: number
  location_accuracy_m?: number
}

/** A mark's photo. Biometric, so never a public link: fetched with the user's login. */
export const fetchAttendanceEventPhoto = async (eventId: number): Promise<Blob> => {
  const res = await apiClient.get(`/attendance/events/${eventId}/photo`, { responseType: 'blob' })
  return res.data
}

export const fetchMyAttendanceStatus = async (): Promise<MyAttendanceStatus> => {
  const res = await apiClient.get('/attendance/me/status')
  return res.data
}

/** By face (checked against my own enrolment), or by hand with a note - flagged for HR. */
export const markMyAttendance = async (mark: MyAttendanceMark): Promise<MyAttendanceMarkResult> => {
  const form = new FormData()
  form.append('event_type', mark.event_type)
  if (mark.photo) form.append('file', mark.photo, 'check-in.jpg')
  if (mark.manual) form.append('manual', 'true')
  if (mark.note) form.append('note', mark.note)
  if (mark.latitude !== undefined && mark.longitude !== undefined) {
    form.append('latitude', String(mark.latitude))
    form.append('longitude', String(mark.longitude))
    if (mark.location_accuracy_m !== undefined) form.append('location_accuracy_m', String(mark.location_accuracy_m))
  }
  try {
    form.append('device_timezone', Intl.DateTimeFormat().resolvedOptions().timeZone)
  } catch {
    // An unknown zone is recorded as the default.
  }
  form.append('device_label', /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'Self check-in (phone)' : 'Self check-in (web)')
  const res = await apiClient.post('/attendance/me/check', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  return res.data
}

export interface RegisterDay {
  date: string
  status: AttendanceDayStatus
  hours_worked: number
  check_in: string | null
  check_out: string | null
  check_out_next_day: boolean
  open_shift: boolean
  is_late: boolean
  late_minutes: number
  is_early_departure: boolean
  early_departure_minutes: number
  late_strike: boolean
  needs_review: boolean
  note: string | null
  event_count: number
}

export interface RegisterTotals {
  present: number
  expected: number
  full_days: number
  early_leave: number
  half_days: number
  absent: number
  on_leave: number
  holiday: number
  late: number
  hours_worked: number
  needs_review: number
}

export interface RegisterEntry {
  user: AttendanceUserBrief
  enrolled_from: string | null
  policy: {
    id: number | null
    name: string
    work_hours_per_day: number
    shift_start: string | null
    shift_end: string | null
    timezone: string
    late_grace_minutes: number
    early_departure_grace_minutes: number
  }
  days: RegisterDay[]
  totals: RegisterTotals
}

export interface RegisterResponse {
  items: RegisterEntry[]
  total: number
  date_from: string
  date_to: string
}

export const ATTENDANCE_REGISTER_PAGE_LIMIT = 500

export interface RegisterQuery {
  date_from: string
  date_to: string
  user_id?: number
  enrolled_only?: boolean
  skip?: number
  limit?: number
}

export const fetchAttendanceRegister = async (
  params: RegisterQuery,
): Promise<RegisterResponse> => {
  const res = await apiClient.get('/attendance/register', { params })
  return res.data
}

/** Every employee in the register for a range, a page at a time. */
export const fetchAllAttendanceRegister = async (
  params: Omit<RegisterQuery, 'skip' | 'limit'>,
  maxEntries = 5000,
): Promise<RegisterResponse> => {
  const page = await pageThrough<RegisterEntry>(
    (skip, limit) => fetchAttendanceRegister({ ...params, skip, limit }),
    ATTENDANCE_REGISTER_PAGE_LIMIT,
    maxEntries,
  )
  return { ...page, date_from: params.date_from, date_to: params.date_to }
}

/** The signed-in user's own register. Self-scoped on the server. */
export const fetchMyAttendanceRegister = async (
  date_from: string,
  date_to: string,
): Promise<RegisterResponse> => {
  const res = await apiClient.get('/attendance/me/register', {
    params: { date_from, date_to },
  })
  return res.data
}
