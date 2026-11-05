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
