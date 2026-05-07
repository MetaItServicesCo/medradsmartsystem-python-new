import apiClient from './client'

export interface Department {
  id: number
  name: string
  description: string | null
  facility_id: number
  created_at: string
  updated_at: string
}

export interface DepartmentCreate {
  name: string
  description?: string
  facility_id: number
}

export interface DepartmentUpdate {
  name?: string
  description?: string
  facility_id?: number
}

export interface DepartmentListResponse {
  items: Department[]
  total: number
}

export const fetchDepartments = async (facilityId?: number): Promise<DepartmentListResponse> => {
  const params = facilityId ? { facility_id: facilityId } : {}
  const res = await apiClient.get('/departments/', { params })
  return res.data
}

export const fetchDepartment = async (id: number): Promise<Department> => {
  const res = await apiClient.get(`/departments/${id}`)
  return res.data
}

export const createDepartment = async (data: DepartmentCreate): Promise<Department> => {
  const res = await apiClient.post('/departments/', data)
  return res.data
}

export const updateDepartment = async (id: number, data: DepartmentUpdate): Promise<Department> => {
  const res = await apiClient.put(`/departments/${id}`, data)
  return res.data
}

export const deleteDepartment = async (id: number): Promise<void> => {
  await apiClient.delete(`/departments/${id}`)
}
