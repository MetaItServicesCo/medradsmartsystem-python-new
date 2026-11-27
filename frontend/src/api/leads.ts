import apiClient from './client'

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'proposal_sent' | 'won' | 'lost'
export type LeadSource =
  | 'website' | 'referral' | 'phone_call' | 'email' | 'social_media'
  | 'trade_show' | 'walk_in' | 'advertisement' | 'other'

export interface Lead {
  id: number
  name: string
  company: string | null
  email: string | null
  phone: string | null
  source: LeadSource
  /** The website a lead came from: set only while the source is "website". */
  source_url: string | null
  status: LeadStatus
  notes: string | null
  created_by_id: number | null
  created_by_name: string | null
  created_at: string
  updated_at: string
}

export interface LeadListResponse {
  items: Lead[]
  total: number
  /** Leads matching the search and source in each status (the status filter left out). */
  status_counts: Record<LeadStatus, number>
}

export interface LeadListParams {
  search?: string
  search_field?: string
  status?: LeadStatus
  source?: LeadSource
  sort?: 'newest' | 'oldest' | 'name' | 'updated'
  skip?: number
  limit?: number
}

export interface LeadPayload {
  name: string
  company: string | null
  email: string | null
  phone: string | null
  source: LeadSource
  source_url: string | null
  status: LeadStatus
  notes: string | null
}

export const fetchLeads = async (params: LeadListParams = {}): Promise<LeadListResponse> => {
  const res = await apiClient.get('/leads/', { params })
  return res.data
}

export const createLead = async (payload: LeadPayload): Promise<Lead> => {
  const res = await apiClient.post('/leads/', payload)
  return res.data
}

/** Only the fields sent change. */
export const updateLead = async (id: number, payload: Partial<LeadPayload>): Promise<Lead> => {
  const res = await apiClient.put(`/leads/${id}`, payload)
  return res.data
}

export const deleteLead = async (id: number): Promise<void> => {
  await apiClient.delete(`/leads/${id}`)
}
