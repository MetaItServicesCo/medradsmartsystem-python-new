import apiClient from './client'

export interface Tier {
  id: number
  tier_code: string
  name: string
  description: string | null
  response_time_hours: number | null
  labor_rate_per_hour: number
  service_call_fee: number
  preventive_maintenance_fee: number
  mileage_rate: number
  status: string
  created_at: string
  updated_at: string
}

export interface TierCreate {
  tier_code: string
  name: string
  description?: string
  response_time_hours?: number
  labor_rate_per_hour: number
  service_call_fee: number
  preventive_maintenance_fee: number
  mileage_rate: number
  status?: string
}

export interface TierUpdate {
  tier_code?: string
  name?: string
  description?: string
  response_time_hours?: number
  labor_rate_per_hour?: number
  service_call_fee?: number
  preventive_maintenance_fee?: number
  mileage_rate?: number
  status?: string
}

export interface TierListResponse {
  items: Tier[]
  total: number
}

export interface TierListParams {
  search?: string
  skip?: number
  limit?: number
}

export const fetchTiers = async (params: TierListParams = {}): Promise<TierListResponse> => {
  const res = await apiClient.get('/tiers/', { params })
  return res.data
}

export const createTier = async (data: TierCreate): Promise<Tier> => {
  const res = await apiClient.post('/tiers/', data)
  return res.data
}

export const updateTier = async (id: number, data: TierUpdate): Promise<Tier> => {
  const res = await apiClient.put(`/tiers/${id}`, data)
  return res.data
}

export const duplicateTier = async (id: number): Promise<Tier> => {
  const res = await apiClient.post(`/tiers/${id}/duplicate`)
  return res.data
}

export const deleteTier = async (id: number): Promise<void> => {
  await apiClient.delete(`/tiers/${id}`)
}
