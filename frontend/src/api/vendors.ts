import apiClient from './client'

export interface MetaOption { value: string; label: string }

export interface VendorMeta {
  vendor_types: MetaOption[]
  statuses: MetaOption[]
  credential_types: MetaOption[]
  contract_statuses: MetaOption[]
}

export interface Vendor {
  id: number
  code: string
  name: string
  legal_name: string | null
  vendor_type: string
  status: string
  discipline_ids: number[] | null
  phone: string | null
  after_hours_phone: string | null
  email: string | null
  website: string | null
  address: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  country: string | null
  tax_id: string | null
  account_number: string | null
  notes: string | null
  // Denormalised gate the dispatch screen reads. False also means nobody has
  // checked yet, which is deliberately not the same as being fine.
  credentials_ok: boolean
  earliest_credential_expiry: string | null
  is_dispatchable: boolean
  created_at: string
  updated_at: string
}

export interface VendorContact {
  id: number
  vendor_id: number
  full_name: string
  title: string | null
  phone: string | null
  mobile: string | null
  email: string | null
  is_primary: boolean
  is_escalation: boolean
  escalation_order: number | null
  notes: string | null
}

export interface VendorCredential {
  id: number
  vendor_id: number
  credential_type: string
  identifier: string | null
  issuer: string | null
  jurisdiction: string | null
  issued_on: string | null
  expires_on: string | null
  coverage_amount: string | null
  is_blocking: boolean
  is_expired: boolean
  days_until_expiry: number | null
  notes: string | null
}

export interface VendorContract {
  id: number
  contract_number: string
  vendor_id: number
  facility_id: number | null
  title: string
  contract_type: string
  status: string
  discipline_ids: number[] | null
  location_id: number | null
  start_date: string | null
  end_date: string | null
  renewal_notice_date: string | null
  auto_renews: boolean
  annual_value: string | null
  labor_rate_per_hour: string | null
  response_hours_by_priority: Record<string, number> | null
  covers_after_hours: boolean
  covers_parts: boolean
  scope_notes: string | null
  is_current: boolean
  covered_equipment_ids: number[]
}

export interface VendorDetail extends Vendor {
  contacts: VendorContact[]
  credentials: VendorCredential[]
  contracts: VendorContract[]
}

export interface ExpiringCredential {
  vendor_id: number
  vendor_name: string
  credential_id: number
  credential_type: string
  identifier: string | null
  expires_on: string | null
  days_until_expiry: number | null
  is_blocking: boolean
  is_expired: boolean
}

// What a surveyor will ask about, before they ask.
export interface ComplianceWatchlist {
  expired: ExpiringCredential[]
  expiring_soon: ExpiringCredential[]
  horizon_days: number
  blocked_vendor_count: number
}

export const fetchVendorMeta = async (): Promise<VendorMeta> => {
  const res = await apiClient.get('/vendors/meta')
  return res.data
}

export const fetchVendors = async (params: {
  q?: string
  vendor_type?: string
  status?: string
  discipline_id?: number
  dispatchable_only?: boolean
  skip?: number
  limit?: number
}): Promise<{ items: Vendor[]; total: number }> => {
  const res = await apiClient.get('/vendors/', { params })
  return res.data
}

export const fetchVendor = async (id: number): Promise<VendorDetail> => {
  const res = await apiClient.get(`/vendors/${id}`)
  return res.data
}

export const createVendor = async (payload: Partial<Vendor>): Promise<Vendor> => {
  const res = await apiClient.post('/vendors/', payload)
  return res.data
}

export const updateVendor = async (id: number, payload: Partial<Vendor>): Promise<Vendor> => {
  const res = await apiClient.put(`/vendors/${id}`, payload)
  return res.data
}

export const deleteVendor = async (id: number) => {
  const res = await apiClient.delete(`/vendors/${id}`)
  return res.data
}

export const fetchComplianceWatchlist = async (
  horizonDays = 60,
): Promise<ComplianceWatchlist> => {
  const res = await apiClient.get('/vendors/compliance/watchlist', {
    params: { horizon_days: horizonDays },
  })
  return res.data
}

export const createCredential = async (
  vendorId: number,
  payload: Partial<VendorCredential>,
): Promise<VendorCredential> => {
  const res = await apiClient.post(`/vendors/${vendorId}/credentials`, {
    ...payload, vendor_id: vendorId,
  })
  return res.data
}

export const updateCredential = async (
  credentialId: number,
  payload: Partial<VendorCredential>,
): Promise<VendorCredential> => {
  const res = await apiClient.put(`/vendors/credentials/${credentialId}`, payload)
  return res.data
}

export const deleteCredential = async (credentialId: number) => {
  const res = await apiClient.delete(`/vendors/credentials/${credentialId}`)
  return res.data
}

export const createContact = async (
  vendorId: number,
  payload: Partial<VendorContact>,
): Promise<VendorContact> => {
  const res = await apiClient.post(`/vendors/${vendorId}/contacts`, {
    ...payload, vendor_id: vendorId,
  })
  return res.data
}

export const deleteContact = async (contactId: number) => {
  const res = await apiClient.delete(`/vendors/contacts/${contactId}`)
  return res.data
}

export const fetchContracts = async (params: {
  vendor_id?: number
  facility_id?: number
  status?: string
  expiring_within_days?: number
}): Promise<{ items: VendorContract[]; total: number }> => {
  const res = await apiClient.get('/vendors/contracts/all', { params })
  return res.data
}

export const createContract = async (
  payload: Partial<VendorContract> & { vendor_id: number; contract_number: string; title: string },
): Promise<VendorContract> => {
  const res = await apiClient.post('/vendors/contracts', payload)
  return res.data
}

export const updateContract = async (
  id: number,
  payload: Partial<VendorContract>,
): Promise<VendorContract> => {
  const res = await apiClient.put(`/vendors/contracts/${id}`, payload)
  return res.data
}

export const deleteContract = async (id: number) => {
  const res = await apiClient.delete(`/vendors/contracts/${id}`)
  return res.data
}
