import apiClient from './client'

export interface UserFacilityBrief {
  id: number
  name: string
}

export interface UserData {
  id: number
  username: string
  email: string
  full_name: string
  phone: string | null
  avatar_url: string | null
  user_type: string
  role: string
  is_active: boolean
  facility_id: number | null
  created_at: string
  updated_at: string
  facilities: UserFacilityBrief[]
}

export interface UserListResponse {
  items: UserData[]
  total: number
}

export interface UserSearchResult {
  id: number
  username: string
  email: string
  full_name: string
  avatar_url: string | null
  role: string
  is_active: boolean
}

export interface CreateUserPayload {
  username: string
  email: string
  full_name: string
  password: string
  phone?: string
  role?: string
  user_type?: string
  facility_ids?: number[]
}

export interface UpdateUserPayload {
  username?: string
  email?: string
  full_name?: string
  password?: string
  phone?: string
  role?: string
  user_type?: string
  is_active?: boolean
  facility_ids?: number[]
}

export const fetchUsers = async (params?: {
  skip?: number
  limit?: number
  role?: string
  is_active?: boolean
  search?: string
}): Promise<UserListResponse> => {
  const res = await apiClient.get('/users/', { params })
  return res.data
}

export const fetchUser = async (id: number): Promise<UserData> => {
  const res = await apiClient.get(`/users/${id}`)
  return res.data
}

export const createUser = async (data: CreateUserPayload): Promise<UserData> => {
  const res = await apiClient.post('/users/', data)
  return res.data
}

export const updateUser = async (id: number, data: UpdateUserPayload): Promise<UserData> => {
  const res = await apiClient.put(`/users/${id}`, data)
  return res.data
}

export const updateUserRole = async (id: number, role: string): Promise<UserData> => {
  const res = await apiClient.put(`/users/${id}/role`, { role })
  return res.data
}

export const deactivateUser = async (id: number): Promise<UserData> => {
  const res = await apiClient.put(`/users/${id}/deactivate`)
  return res.data
}

export const deleteUser = async (id: number): Promise<void> => {
  await apiClient.delete(`/users/${id}`)
}

export const activateUser = async (id: number): Promise<UserData> => {
  const res = await apiClient.put(`/users/${id}/activate`)
  return res.data
}

export const impersonateUser = async (id: number): Promise<{ access_token: string; user: UserData }> => {
  const res = await apiClient.post(`/users/${id}/impersonate`)
  return res.data
}

export const searchUsers = async (q: string): Promise<UserSearchResult[]> => {
  const res = await apiClient.get('/users/search', { params: { q } })
  return res.data
}
