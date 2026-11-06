import apiClient from './client'

/** The three things a super admin can switch on per person. */
export interface TrackingSwitches {
  desktop_activity: boolean
  location: boolean
  screen_view: boolean
}

export interface TrackedPerson extends TrackingSwitches {
  user_id: number
  full_name: string
  username: string
  email: string
  role: string | null
  is_active: boolean
  tracked: boolean
  consent_required: boolean
  consent_at: string | null
  consented_features: string[]
  active_devices: number
}

export interface TrackingDevice {
  id: number
  user_id: number
  kind: 'desktop' | 'phone'
  name: string
  os_name: string | null
  created_at: string
  last_seen_at: string | null
  revoked_at: string | null
}

/** What is switched on for the signed-in person, and whether they must consent. */
export interface MyTracking {
  features: TrackingSwitches
  tracked: boolean
  consent_required: boolean
  consent_version: string
  consent_text: string | null
  consent_at: string | null
  on_shift: boolean
}

/** Something about a tracked person that needs attention. */
export type TrackingWarning = 'no_consent' | 'no_desktop_device' | 'no_phone_device' | 'desktop_silent' | 'phone_silent'

export interface TrackingLocation {
  lat: number
  lon: number
  accuracy_m: number | null
  speed_mps: number | null
  heading_deg: number | null
  recorded_at: string
  source: 'live' | 'saved'
}

/** One attendance mark as evidence: when, how, and where it was made. */
export interface TrackingMark {
  id: number
  event_type: 'check_in' | 'check_out' | 'break_start' | 'break_end'
  event_time: string
  source: string
  verification_status: string
  latitude: number | null
  longitude: number | null
  location_accuracy_m: number | null
  location_place: string | null
  device_label: string | null
}

export interface TrackingOverviewPerson extends TrackingSwitches {
  user_id: number
  full_name: string
  username: string
  role: string | null
  consent_required: boolean
  on_shift: boolean
  shift_started_at: string | null
  /** Their check-in for the shift they are on, with where it was made. */
  check_in: TrackingMark | null
  desktop_devices: number
  desktop_last_seen_at: string | null
  phone_devices: number
  phone_last_seen_at: string | null
  activity: {
    minutes: number
    keys: number
    clicks: number
    active_ratio: number | null
    last_at: string | null
    top_app: string | null
  }
  /** Where they are now. `location` is the switch. */
  position: TrackingLocation | null
  screen_live: boolean
  warnings: TrackingWarning[]
}

export interface TrackingOverview {
  date: string
  people: TrackingOverviewPerson[]
}

export interface TrackingDayBlock {
  started_at: string
  ended_at: string
  app: string
  titles: string[]
  minutes: number
  keys: number
  clicks: number
  scrolls: number
  active_ratio: number | null
}

export interface TrackingDayPoint {
  lat: number
  lon: number
  accuracy_m: number | null
  speed_mps: number | null
  recorded_at: string
}

export interface TrackingPersonDay {
  user: { id: number; full_name: string; username: string }
  date: string
  tz: string
  shifts: { start: string; end: string; open: boolean }[]
  marks: TrackingMark[]
  totals: { minutes: number; keys: number; clicks: number; scrolls: number; active_ratio: number | null; points: number }
  apps: { app: string; minutes: number; keys: number; clicks: number }[]
  blocks: TrackingDayBlock[]
  points: TrackingDayPoint[]
}

export const fetchTrackingOverview = async (date: string): Promise<TrackingOverview> => {
  const res = await apiClient.get('/tracking/overview', { params: { date } })
  return res.data
}

export const fetchTrackingPersonDay = async (userId: number, date: string, tz: string): Promise<TrackingPersonDay> => {
  const res = await apiClient.get(`/tracking/people/${userId}/day`, { params: { date, tz } })
  return res.data
}

/** The live screen-view socket. Under /ws/ because that is the path the production proxy upgrades. */
export const screenViewUrl = (userId: number, token: string) => {
  const base = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'
  return `${base.replace(/^http/, 'ws')}/ws/tracking/view/${userId}/${encodeURIComponent(token)}`
}

export const fetchTrackedPeople = async (search?: string): Promise<TrackedPerson[]> => {
  const res = await apiClient.get('/tracking/people', { params: search ? { search } : undefined })
  return res.data
}

export const updateTrackingSwitches = async (userId: number, switches: TrackingSwitches): Promise<TrackedPerson> => {
  const res = await apiClient.put(`/tracking/people/${userId}`, switches)
  return res.data
}

export const fetchTrackingDevices = async (userId: number): Promise<TrackingDevice[]> => {
  const res = await apiClient.get(`/tracking/people/${userId}/devices`)
  return res.data
}

export const revokeTrackingDevice = async (deviceId: number): Promise<TrackingDevice> => {
  const res = await apiClient.post(`/tracking/devices/${deviceId}/revoke`)
  return res.data
}

export const fetchMyTracking = async (): Promise<MyTracking> => {
  const res = await apiClient.get('/tracking/me')
  return res.data
}

export const consentToTracking = async (version: string): Promise<MyTracking> => {
  const res = await apiClient.post('/tracking/me/consent', { version })
  return res.data
}
