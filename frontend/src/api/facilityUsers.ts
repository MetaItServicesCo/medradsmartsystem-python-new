import apiClient from './client'

export interface FacilityUser {
  id: number
  username: string
  email: string
  full_name: string
  user_type: string
  role: string
  is_active: boolean
  facility_id: number | null
  created_at: string
  updated_at: string
}

export interface FacilityUserListResponse {
  items: FacilityUser[]
  total: number
}

export const fetchFacilityUsers = async (
  facilityId?: number,
  roles?: string[],
): Promise<FacilityUserListResponse> => {
  const params = {
    ...(facilityId ? { facility_id: facilityId } : {}),
    ...(roles?.length ? { roles: roles.join(',') } : {}),
  }
  const res = await apiClient.get('/facility-users/', { params })
  return res.data
}

export const fetchFacilityManagerCandidates = async (
  facilityId: number,
  search?: string,
): Promise<FacilityUserListResponse> => {
  const res = await apiClient.get('/facility-users/manager-candidates', {
    params: {
      facility_id: facilityId,
      ...(search?.trim() ? { search: search.trim() } : {}),
    },
  })
  return res.data
}

export const assignFacilityManagerRole = async (
  facilityId: number,
  userId: number,
  role: 'facility_admin' | 'facility_manager',
): Promise<FacilityUser> => {
  const res = await apiClient.put(`/facility-users/${facilityId}/managers/${userId}`, { role })
  return res.data
}

export const assignUserToFacility = async (userId: number, facilityId: number | null): Promise<FacilityUser> => {
  const res = await apiClient.put(`/facility-users/${userId}/facility`, { facility_id: facilityId })
  return res.data
}

export const removeUserFromFacility = async (userId: number): Promise<FacilityUser> => {
  const res = await apiClient.delete(`/facility-users/${userId}/facility`)
  return res.data
}
export const bulkAssignUsersToFacility = async (facilityId: number, userIds: number[]): Promise<{ detail: string }> => {
  const res = await apiClient.post('/facility-users/bulk-assign', { facility_id: facilityId, user_ids: userIds })
  return res.data
}
