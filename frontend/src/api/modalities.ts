import apiClient from './client'

export interface Modality {
  id: number
  name: string
  category: string
  description: string | null
  inspection_frequency_days: number | null
  parent_id: number | null
  children: Modality[]
  /** The old list: kept on existing assets, not offered for new ones. */
  is_legacy?: boolean
  /** The inspection form a new asset of this type gets. */
  inspection_form_id?: number | null
  inspection_form_name?: string | null
  inspection_form_hidden?: boolean
}

export interface ModalityCreate {
  name: string
  category: string
  description?: string
  inspection_frequency_days?: number
  parent_id?: number | null
  inspection_form_id?: number | null
}

export interface ModalityUpdate {
  name?: string
  category?: string
  description?: string
  inspection_frequency_days?: number
  parent_id?: number | null
  inspection_form_id?: number | null
}

export interface ModalityListResponse {
  items: Modality[]
  total: number
}

export const fetchModalities = async (parentOnly = true, search?: string): Promise<ModalityListResponse> => {
  const res = await apiClient.get('/modalities/', {
    params: {
      parent_only: parentOnly,
      search: search || undefined,
    },
  })
  return res.data
}

export const fetchModality = async (id: number): Promise<Modality> => {
  const res = await apiClient.get(`/modalities/${id}`)
  return res.data
}

export const createModality = async (data: ModalityCreate): Promise<Modality> => {
  const res = await apiClient.post('/modalities/', data)
  return res.data
}

export const updateModality = async (id: number, data: ModalityUpdate): Promise<Modality> => {
  const res = await apiClient.put(`/modalities/${id}`, data)
  return res.data
}

export const duplicateModality = async (id: number): Promise<Modality> => {
  const res = await apiClient.post(`/modalities/${id}/duplicate`)
  return res.data
}

export const deleteModality = async (id: number): Promise<void> => {
  await apiClient.delete(`/modalities/${id}`)
}
