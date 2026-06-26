import apiClient from './client'

const BASE = '/hr'

// ── Dashboard ──────────────────────────────────────────────────────────────
export const fetchHRDashboard = () =>
  apiClient.get(`${BASE}/dashboard`).then(r => r.data)

// ── Employees ──────────────────────────────────────────────────────────────
export const fetchHREmployees = (params?: Record<string, any>) =>
  apiClient.get(`${BASE}/employees`, { params }).then(r => r.data)

// ── Leave Types ────────────────────────────────────────────────────────────
export const fetchLeaveTypes = () =>
  apiClient.get(`${BASE}/leave-types`).then(r => r.data)
export const createLeaveType = (data: any) =>
  apiClient.post(`${BASE}/leave-types`, data).then(r => r.data)
export const updateLeaveType = (id: number, data: any) =>
  apiClient.put(`${BASE}/leave-types/${id}`, data).then(r => r.data)
export const deleteLeaveType = (id: number) =>
  apiClient.delete(`${BASE}/leave-types/${id}`)

// ── Leave Policies ──────────────────────────────────────────────────────────
export const fetchLeavePolicies = () =>
  apiClient.get(`${BASE}/leave-policies`).then(r => r.data)
export const createLeavePolicy = (data: any) =>
  apiClient.post(`${BASE}/leave-policies`, data).then(r => r.data)
export const updateLeavePolicy = (id: number, data: any) =>
  apiClient.put(`${BASE}/leave-policies/${id}`, data).then(r => r.data)
export const deleteLeavePolicy = (id: number) =>
  apiClient.delete(`${BASE}/leave-policies/${id}`)

// ── Leave Requests ──────────────────────────────────────────────────────────
export const fetchLeaveRequests = (params?: Record<string, any>) =>
  apiClient.get(`${BASE}/leave-requests`, { params }).then(r => r.data)
export const createLeaveRequest = (data: any) =>
  apiClient.post(`${BASE}/leave-requests`, data).then(r => r.data)
export const updateLeaveRequest = (id: number, data: any) =>
  apiClient.put(`${BASE}/leave-requests/${id}`, data).then(r => r.data)
export const deleteLeaveRequest = (id: number) =>
  apiClient.delete(`${BASE}/leave-requests/${id}`)

// ── Attendance Policies ─────────────────────────────────────────────────────
export const fetchAttendancePolicies = () =>
  apiClient.get(`${BASE}/attendance-policies`).then(r => r.data)
export const createAttendancePolicy = (data: any) =>
  apiClient.post(`${BASE}/attendance-policies`, data).then(r => r.data)
export const updateAttendancePolicy = (id: number, data: any) =>
  apiClient.put(`${BASE}/attendance-policies/${id}`, data).then(r => r.data)
export const deleteAttendancePolicy = (id: number) =>
  apiClient.delete(`${BASE}/attendance-policies/${id}`)

// ── Holidays ───────────────────────────────────────────────────────────────
export const fetchHolidays = (year?: number) =>
  apiClient.get(`${BASE}/holidays`, { params: year ? { year } : {} }).then(r => r.data)
export const createHoliday = (data: any) =>
  apiClient.post(`${BASE}/holidays`, data).then(r => r.data)
export const updateHoliday = (id: number, data: any) =>
  apiClient.put(`${BASE}/holidays/${id}`, data).then(r => r.data)
export const deleteHoliday = (id: number) =>
  apiClient.delete(`${BASE}/holidays/${id}`)

// ── Announcements ──────────────────────────────────────────────────────────
export const fetchAnnouncements = (includeExpired = false) =>
  apiClient.get(`${BASE}/announcements`, { params: { include_expired: includeExpired } }).then(r => r.data)
export const createAnnouncement = (data: any) =>
  apiClient.post(`${BASE}/announcements`, data).then(r => r.data)
export const updateAnnouncement = (id: number, data: any) =>
  apiClient.put(`${BASE}/announcements/${id}`, data).then(r => r.data)
export const deleteAnnouncement = (id: number) =>
  apiClient.delete(`${BASE}/announcements/${id}`)

// ── Job Openings ───────────────────────────────────────────────────────────
export const fetchJobOpenings = (params?: Record<string, any>) =>
  apiClient.get(`${BASE}/job-openings`, { params }).then(r => r.data)
export const createJobOpening = (data: any) =>
  apiClient.post(`${BASE}/job-openings`, data).then(r => r.data)
export const updateJobOpening = (id: number, data: any) =>
  apiClient.put(`${BASE}/job-openings/${id}`, data).then(r => r.data)
export const deleteJobOpening = (id: number) =>
  apiClient.delete(`${BASE}/job-openings/${id}`)

// ── Candidates ─────────────────────────────────────────────────────────────
export const fetchCandidates = (params?: Record<string, any>) =>
  apiClient.get(`${BASE}/candidates`, { params }).then(r => r.data)
export const createCandidate = (data: any) =>
  apiClient.post(`${BASE}/candidates`, data).then(r => r.data)
export const updateCandidate = (id: number, data: any) =>
  apiClient.put(`${BASE}/candidates/${id}`, data).then(r => r.data)
export const deleteCandidate = (id: number) =>
  apiClient.delete(`${BASE}/candidates/${id}`)

// ── Job Offers ─────────────────────────────────────────────────────────────
export const fetchJobOffers = (params?: Record<string, any>) =>
  apiClient.get(`${BASE}/job-offers`, { params }).then(r => r.data)
export const createJobOffer = (data: any) =>
  apiClient.post(`${BASE}/job-offers`, data).then(r => r.data)
export const updateJobOffer = (id: number, data: any) =>
  apiClient.put(`${BASE}/job-offers/${id}`, data).then(r => r.data)
export const deleteJobOffer = (id: number) =>
  apiClient.delete(`${BASE}/job-offers/${id}`)

// ── Onboarding Checklists ──────────────────────────────────────────────────
export const fetchOnboardingChecklists = () =>
  apiClient.get(`${BASE}/onboarding-checklists`).then(r => r.data)
export const createOnboardingChecklist = (data: any) =>
  apiClient.post(`${BASE}/onboarding-checklists`, data).then(r => r.data)
export const updateOnboardingChecklist = (id: number, data: any) =>
  apiClient.put(`${BASE}/onboarding-checklists/${id}`, data).then(r => r.data)
export const deleteOnboardingChecklist = (id: number) =>
  apiClient.delete(`${BASE}/onboarding-checklists/${id}`)

// ── Awards ─────────────────────────────────────────────────────────────────
export const fetchAwards = (params?: Record<string, any>) =>
  apiClient.get(`${BASE}/awards`, { params }).then(r => r.data)
export const createAward = (data: any) =>
  apiClient.post(`${BASE}/awards`, data).then(r => r.data)
export const updateAward = (id: number, data: any) =>
  apiClient.put(`${BASE}/awards/${id}`, data).then(r => r.data)
export const deleteAward = (id: number) =>
  apiClient.delete(`${BASE}/awards/${id}`)

// ── Promotions ─────────────────────────────────────────────────────────────
export const fetchPromotions = (params?: Record<string, any>) =>
  apiClient.get(`${BASE}/promotions`, { params }).then(r => r.data)
export const createPromotion = (data: any) =>
  apiClient.post(`${BASE}/promotions`, data).then(r => r.data)
export const updatePromotion = (id: number, data: any) =>
  apiClient.put(`${BASE}/promotions/${id}`, data).then(r => r.data)
export const deletePromotion = (id: number) =>
  apiClient.delete(`${BASE}/promotions/${id}`)

// ── Resignations ───────────────────────────────────────────────────────────
export const fetchResignations = (params?: Record<string, any>) =>
  apiClient.get(`${BASE}/resignations`, { params }).then(r => r.data)
export const createResignation = (data: any) =>
  apiClient.post(`${BASE}/resignations`, data).then(r => r.data)
export const updateResignation = (id: number, data: any) =>
  apiClient.put(`${BASE}/resignations/${id}`, data).then(r => r.data)
export const deleteResignation = (id: number) =>
  apiClient.delete(`${BASE}/resignations/${id}`)

// ── Terminations ───────────────────────────────────────────────────────────
export const fetchTerminations = (params?: Record<string, any>) =>
  apiClient.get(`${BASE}/terminations`, { params }).then(r => r.data)
export const createTermination = (data: any) =>
  apiClient.post(`${BASE}/terminations`, data).then(r => r.data)
export const updateTermination = (id: number, data: any) =>
  apiClient.put(`${BASE}/terminations/${id}`, data).then(r => r.data)
export const deleteTermination = (id: number) =>
  apiClient.delete(`${BASE}/terminations/${id}`)

// ── Tax Brackets ───────────────────────────────────────────────────────────
export const fetchTaxBrackets = () =>
  apiClient.get(`${BASE}/tax-brackets`).then(r => r.data)
export const createTaxBracket = (data: any) =>
  apiClient.post(`${BASE}/tax-brackets`, data).then(r => r.data)
export const updateTaxBracket = (id: number, data: any) =>
  apiClient.put(`${BASE}/tax-brackets/${id}`, data).then(r => r.data)
export const deleteTaxBracket = (id: number) =>
  apiClient.delete(`${BASE}/tax-brackets/${id}`)

// ── Payroll Configs ────────────────────────────────────────────────────────
export const fetchPayrollConfigs = (params?: Record<string, any>) =>
  apiClient.get(`${BASE}/payroll-configs`, { params }).then(r => r.data)
export const createPayrollConfig = (data: any) =>
  apiClient.post(`${BASE}/payroll-configs`, data).then(r => r.data)
export const updatePayrollConfig = (id: number, data: any) =>
  apiClient.put(`${BASE}/payroll-configs/${id}`, data).then(r => r.data)

// ── Payroll Runs ───────────────────────────────────────────────────────────
export const fetchPayrollRuns = (params?: Record<string, any>) =>
  apiClient.get(`${BASE}/payroll-runs`, { params }).then(r => r.data)
export const createPayrollRun = (data: any) =>
  apiClient.post(`${BASE}/payroll-runs`, data).then(r => r.data)
export const updatePayrollRun = (id: number, data: any) =>
  apiClient.put(`${BASE}/payroll-runs/${id}`, data).then(r => r.data)
export const processPayrollRun = (id: number) =>
  apiClient.post(`${BASE}/payroll-runs/${id}/process`).then(r => r.data)

// ── Meetings ───────────────────────────────────────────────────────────────
export const fetchMeetings = (params?: Record<string, any>) =>
  apiClient.get(`${BASE}/meetings`, { params }).then(r => r.data)
export const createMeeting = (data: any) =>
  apiClient.post(`${BASE}/meetings`, data).then(r => r.data)
export const updateMeeting = (id: number, data: any) =>
  apiClient.put(`${BASE}/meetings/${id}`, data).then(r => r.data)
export const deleteMeeting = (id: number) =>
  apiClient.delete(`${BASE}/meetings/${id}`)
export const upsertMeetingMinutes = (meetingId: number, data: any) =>
  apiClient.put(`${BASE}/meetings/${meetingId}/minutes`, data).then(r => r.data)

// ── Document Categories ────────────────────────────────────────────────────
export const fetchDocumentCategories = () =>
  apiClient.get(`${BASE}/document-categories`).then(r => r.data)
export const createDocumentCategory = (data: any) =>
  apiClient.post(`${BASE}/document-categories`, data).then(r => r.data)
export const deleteDocumentCategory = (id: number) =>
  apiClient.delete(`${BASE}/document-categories/${id}`)

// ── Contract Types ─────────────────────────────────────────────────────────
export const fetchContractTypes = () =>
  apiClient.get(`${BASE}/contract-types`).then(r => r.data)
export const createContractType = (data: any) =>
  apiClient.post(`${BASE}/contract-types`, data).then(r => r.data)
export const deleteContractType = (id: number) =>
  apiClient.delete(`${BASE}/contract-types/${id}`)

// ── Document Templates ─────────────────────────────────────────────────────
export const fetchDocumentTemplates = (params?: Record<string, any>) =>
  apiClient.get(`${BASE}/document-templates`, { params }).then(r => r.data)
export const createDocumentTemplate = (data: any) =>
  apiClient.post(`${BASE}/document-templates`, data).then(r => r.data)
export const updateDocumentTemplate = (id: number, data: any) =>
  apiClient.put(`${BASE}/document-templates/${id}`, data).then(r => r.data)
export const deleteDocumentTemplate = (id: number) =>
  apiClient.delete(`${BASE}/document-templates/${id}`)

// ── Contract Templates ─────────────────────────────────────────────────────
export const fetchContractTemplates = (params?: Record<string, any>) =>
  apiClient.get(`${BASE}/contract-templates`, { params }).then(r => r.data)
export const createContractTemplate = (data: any) =>
  apiClient.post(`${BASE}/contract-templates`, data).then(r => r.data)
export const updateContractTemplate = (id: number, data: any) =>
  apiClient.put(`${BASE}/contract-templates/${id}`, data).then(r => r.data)
export const deleteContractTemplate = (id: number) =>
  apiClient.delete(`${BASE}/contract-templates/${id}`)

// ── Employee Documents ─────────────────────────────────────────────────────
export const fetchEmployeeDocuments = (params?: Record<string, any>) =>
  apiClient.get(`${BASE}/employee-documents`, { params }).then(r => r.data)
export const createEmployeeDocument = (data: any) =>
  apiClient.post(`${BASE}/employee-documents`, data).then(r => r.data)
export const updateEmployeeDocument = (id: number, data: any) =>
  apiClient.put(`${BASE}/employee-documents/${id}`, data).then(r => r.data)
export const deleteEmployeeDocument = (id: number) =>
  apiClient.delete(`${BASE}/employee-documents/${id}`)

// ── Employee Contracts ─────────────────────────────────────────────────────
export const fetchEmployeeContracts = (params?: Record<string, any>) =>
  apiClient.get(`${BASE}/employee-contracts`, { params }).then(r => r.data)
export const createEmployeeContract = (data: any) =>
  apiClient.post(`${BASE}/employee-contracts`, data).then(r => r.data)
export const updateEmployeeContract = (id: number, data: any) =>
  apiClient.put(`${BASE}/employee-contracts/${id}`, data).then(r => r.data)
export const deleteEmployeeContract = (id: number) =>
  apiClient.delete(`${BASE}/employee-contracts/${id}`)

// ── Acknowledgments ────────────────────────────────────────────────────────
export const fetchAcknowledgments = (params?: Record<string, any>) =>
  apiClient.get(`${BASE}/acknowledgments`, { params }).then(r => r.data)
export const createAcknowledgment = (data: any) =>
  apiClient.post(`${BASE}/acknowledgments`, data).then(r => r.data)

// ── Timesheets ─────────────────────────────────────────────────────────────
export const fetchTimesheets = (params?: Record<string, any>) =>
  apiClient.get(`${BASE}/timesheets`, { params }).then(r => r.data)
export const createTimesheet = (data: any) =>
  apiClient.post(`${BASE}/timesheets`, data).then(r => r.data)
export const updateTimesheet = (id: number, data: any) =>
  apiClient.put(`${BASE}/timesheets/${id}`, data).then(r => r.data)
export const deleteTimesheet = (id: number) =>
  apiClient.delete(`${BASE}/timesheets/${id}`)
export const generateTimesheets = (data: { year: number; month: number; user_id?: number }) =>
  apiClient.post(`${BASE}/timesheets/generate`, data).then(r => r.data)

// ── My Timesheets (employee self-service) ──────────────────────────────────
export const fetchMyTimesheets = (params?: Record<string, any>) =>
  apiClient.get(`${BASE}/my-timesheets`, { params }).then(r => r.data)
export const createMyTimesheet = (data: any) =>
  apiClient.post(`${BASE}/my-timesheets`, data).then(r => r.data)
export const updateMyTimesheet = (id: number, data: any) =>
  apiClient.put(`${BASE}/my-timesheets/${id}`, data).then(r => r.data)
export const deleteMyTimesheet = (id: number) =>
  apiClient.delete(`${BASE}/my-timesheets/${id}`)
export const submitMyTimesheet = (id: number) =>
  apiClient.post(`${BASE}/my-timesheets/${id}/submit`).then(r => r.data)

// ── Employee Submissions (HR review) ───────────────────────────────────────
export const fetchEmployeeSubmissions = (params?: Record<string, any>) =>
  apiClient.get(`${BASE}/employee-submissions`, { params }).then(r => r.data)
export const reviewEmployeeSubmission = (id: number, data: { status: string; review_notes?: string }) =>
  apiClient.post(`${BASE}/employee-submissions/${id}/review`, data).then(r => r.data)

// ── CSV Exports ────────────────────────────────────────────────────────────
export const downloadAttendanceSheet = async (params: Record<string, any>, filename: string) => {
  const response = await apiClient.get(`${BASE}/timesheets/export`, { params, responseType: 'blob' })
  const url = window.URL.createObjectURL(response.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}

export const downloadTimesheetSubmissions = async (params: Record<string, any>, filename: string) => {
  const response = await apiClient.get(`${BASE}/employee-submissions/export`, { params, responseType: 'blob' })
  const url = window.URL.createObjectURL(response.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}

// ── Employee Policy Assignments ─────────────────────────────────────────────
export const fetchEmployeePolicyAssignments = () =>
  apiClient.get(`${BASE}/employee-policy-assignments`).then(r => r.data)
export const createEmployeePolicyAssignment = (data: any) =>
  apiClient.post(`${BASE}/employee-policy-assignments`, data).then(r => r.data)
export const deleteEmployeePolicyAssignment = (id: number) =>
  apiClient.delete(`${BASE}/employee-policy-assignments/${id}`)
