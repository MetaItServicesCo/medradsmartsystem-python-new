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

export interface UpdateOwnProfilePayload {
  email?: string
  full_name?: string
  phone?: string
  password?: string
}

export const resolveUploadUrl = (url?: string | null): string | undefined => {
  if (!url) return undefined
  if (url.startsWith('http://') || url.startsWith('https://')) return url

  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'
  const origin = apiBase.replace(/\/api\/v1\/?$/, '')
  return `${origin}${url.startsWith('/') ? url : `/${url}`}`
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

export const fetchCurrentUser = async (): Promise<UserData> => {
  const res = await apiClient.get('/users/me')
  return res.data
}

export const updateOwnProfile = async (data: UpdateOwnProfilePayload): Promise<UserData> => {
  const res = await apiClient.put('/users/me', data)
  return res.data
}

export const uploadOwnProfilePicture = async (file: File): Promise<UserData> => {
  const formData = new FormData()
  formData.append('file', file)
  const res = await apiClient.post('/users/me/profile-picture', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
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
