import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Autocomplete,
  Box, Card, Typography, Button, Chip, Avatar, TextField,
  FormControl, InputLabel, Select, MenuItem, IconButton,
  Skeleton, Divider, CircularProgress, Dialog, DialogTitle,
  DialogContent, DialogActions, Checkbox, FormControlLabel,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import BuildIcon from '@mui/icons-material/Build'
import BusinessIcon from '@mui/icons-material/Business'
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing'
import PersonIcon from '@mui/icons-material/Person'
import EngineeringIcon from '@mui/icons-material/Engineering'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CancelIcon from '@mui/icons-material/Cancel'
import RequestQuoteIcon from '@mui/icons-material/RequestQuote'
import CreditCardIcon from '@mui/icons-material/CreditCard'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import ThumbUpIcon from '@mui/icons-material/ThumbUp'
import ThumbDownIcon from '@mui/icons-material/ThumbDown'
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd'
import HistoryIcon from '@mui/icons-material/History'
import ImageIcon from '@mui/icons-material/Image'
import AssessmentIcon from '@mui/icons-material/Assessment'
import EditIcon from '@mui/icons-material/Edit'
import { toast } from 'react-toastify'

import {
  createServiceRequestWorkSession,
  fetchServiceRequest,
  fetchServiceInvoices,
  generateServiceInvoice,
  updateServiceRequest,
  updateServiceInvoice,
  type ServiceRequest,
  type ServiceRequestUpdate,
  type ServiceRequestStatus as SRStatus,
} from '@/api/serviceRequests'
import QuotationPanel from './QuotationPanel'
import { fetchUsers, type UserData } from '@/api/users'
import { resolveUploadUrl } from '@/api/users'
import { fetchActiveTestEquipment, type TestEquipment } from '@/api/testEquipment'
import { useAuthStore } from '@/stores/authStore'

const PRIORITY_COLORS: Record<string, { bg: string; color: string }> = {
  low:      { bg: '#E0F2FE', color: '#0369A1' },
  medium:   { bg: '#FEF3C7', color: '#B45309' },
  high:     { bg: '#FFE4E6', color: '#BE123C' },
  critical: { bg: '#FEE2E2', color: '#DC2626' },
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  new:         { bg: '#E0E7FF', color: '#4338CA' },
  assigned:    { bg: '#DBEAFE', color: '#1D4ED8' },
  in_progress: { bg: '#FEF3C7', color: '#B45309' },
  waiting_on_parts: { bg: '#FFE4E6', color: '#BE123C' },
  waiting_for_approval: { bg: '#E0F2FE', color: '#0369A1' },
  waiting_for_depot_repair: { bg: '#F3E8FF', color: '#7E22CE' },
  waiting_for_vendor_repair: { bg: '#FFEDD5', color: '#C2410C' },
  completed:   { bg: '#D1FAE5', color: '#047857' },
  cancelled:   { bg: '#F3F4F6', color: '#6B7280' },
}

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  assigned: 'Assigned',
  in_progress: 'Service In Progress',
  waiting_on_parts: 'Waiting on Parts',
  waiting_for_approval: 'Waiting for Approval',
  waiting_for_depot_repair: 'Waiting for Depot Repair',
  waiting_for_vendor_repair: 'Waiting for Vendor Repair',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

// Ordered transitions
const NEXT_STATUS: Record<string, string> = {
  new: 'assigned',
  assigned: 'in_progress',
}

const STATUS_STEPS = ['new', 'assigned', 'in_progress', 'completed']
const SERVICE_WORKFLOW_STATUS_OPTIONS: { value: SRStatus; label: string }[] = [
  { value: 'waiting_on_parts', label: 'Waiting on Parts' },
  { value: 'in_progress', label: 'Service In Progress' },
  { value: 'waiting_for_approval', label: 'Waiting for Approval' },
  { value: 'waiting_for_depot_repair', label: 'Waiting for Depot Repair' },
  { value: 'waiting_for_vendor_repair', label: 'Waiting for Vendor Repair' },
  { value: 'completed', label: 'Completed' },
]

const toDateTimeLocalValue = (date = new Date()) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

const HISTORY_FIELD_LABELS: Record<string, string> = {
  start_time: 'Start Time',
  end_time: 'End Time',
  break_minutes: 'Break Time',
  duration_hours: 'Session Duration',
  total_work_hours: 'Manual Total Work Hours',
  total_mileage: 'Total Mileage',
  total_hours: 'Total Saved Time',
  diagnosis: 'Diagnosis',
  work_done: 'Work Done',
  notes: 'Notes',
  status: 'Status',
  assigned_technician_id: 'Assigned Technician',
  cc_auth_requested: 'CC Authorization',
  quotation_number: 'Quotation',
  authorized_by_name: 'Authorized By',
  authorized_by_role: 'Authorizer Role',
  recorded_by_name: 'Recorded By',
  paid_by_name: 'Paid/Recorded By',
  paid_by_role: 'Payer Role',
  payment_channel: 'Payment Channel',
  payment_method: 'Payment Method',
  reference_number: 'Reference',
  remaining_balance: 'Remaining Balance',
}

const HISTORY_DATE_FIELDS = new Set(['start_time', 'end_time', 'clocked_in_at', 'clocked_out_at'])
const HISTORY_HIDDEN_FIELDS = new Set(['session_id', 'test_equipment', 'clocked_in_at', 'clocked_out_at', 'duration_source', 'raw_hours', 'total_work_hours', 'quotation_id', 'authorization_id', 'authorized_by_id', 'recorded_by_id', 'paid_by_id'])

const historyActionLabel = (action?: string) => {
  if (action === 'technician_work_session' || action === 'technician_clock_out') return 'Technician Work Session'
  if (action === 'technician_clock_in') return 'Work Session Started'
  if (action === 'status_changed') return 'Status Changed'
  if (action === 'quotation_authorization_requested') return 'Quotation Authorization Requested'
  if (action === 'quotation_authorization_authorized') return 'Quotation Authorized'
  if (action === 'quotation_authorization_declined') return 'Quotation Authorization Declined'
  if (action === 'quotation_authorization_invalidated') return 'Quotation Authorization Invalidated'
  if (action === 'quotation_payment_recorded') return 'Quotation Payment Recorded'
  if (action === 'quotation_included_in_service_invoice') return 'Quotation Included in Service Invoice'
  return String(action || 'updated').replace(/_/g, ' ')
}

const ServiceRequestDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [technicianId, setTechnicianId] = useState<number | ''>('')
  const [sessionDiagnosis, setSessionDiagnosis] = useState('')
  const [sessionWorkDone, setSessionWorkDone] = useState('')
  const [sessionNotes, setSessionNotes] = useState('')
  const [sessionStartTime, setSessionStartTime] = useState(toDateTimeLocalValue())
  const [sessionEndTime, setSessionEndTime] = useState(toDateTimeLocalValue())
  const [sessionBreakMinutes, setSessionBreakMinutes] = useState('0')
  const [sessionTotalWorkHours, setSessionTotalWorkHours] = useState('')
  const [sessionTotalMileage, setSessionTotalMileage] = useState('')
  const [selectedTestEquipmentIds, setSelectedTestEquipmentIds] = useState<number[]>([])
  const [serviceWorkflowStatus, setServiceWorkflowStatus] = useState<SRStatus>('in_progress')
  const [cancelOpen, setCancelOpen] = useState(false)
  const [changeTechOpen, setChangeTechOpen] = useState(false)
  const [imageOpen, setImageOpen] = useState(false)
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [includeQuotations, setIncludeQuotations] = useState(false)
  const [selectedQuotationIds, setSelectedQuotationIds] = useState<number[]>([])
  const [invoiceDueDate, setInvoiceDueDate] = useState('')
  const [invoiceTaxAmount, setInvoiceTaxAmount] = useState('0')
  const [invoiceDiscountAmount, setInvoiceDiscountAmount] = useState('0')
  const [invoiceNotes, setInvoiceNotes] = useState('')
  const [invoiceTravelMode, setInvoiceTravelMode] = useState<'fixed' | 'mileage'>('fixed')
  const [invoiceTravelCharges, setInvoiceTravelCharges] = useState('0')
  const [invoiceLaborFees, setInvoiceLaborFees] = useState('0')
  const [editingTime, setEditingTime] = useState(false)
  const [editTimeValue, setEditTimeValue] = useState('')
  const [editInvoiceOpen, setEditInvoiceOpen] = useState(false)
  const [editInvoiceAmountPaid, setEditInvoiceAmountPaid] = useState('0')
  const [editInvoiceStatus, setEditInvoiceStatus] = useState('')
  const [editInvoiceDueDate, setEditInvoiceDueDate] = useState('')
  const [editInvoiceNotes, setEditInvoiceNotes] = useState('')


  const user = useAuthStore(state => state.user)
  const canCreateQuotation = ['superadmin', 'admin', 'technician'].includes(user?.role || '')
  const canManageServiceBilling = ['superadmin', 'admin', 'facility_admin', 'facility_manager'].includes(user?.role || '')

  const { data: sr, isLoading } = useQuery({
    queryKey: ['service-request', id],
    queryFn: () => fetchServiceRequest(Number(id)),
    enabled: !!id,
  })

  useEffect(() => {
    if (sr?.status && SERVICE_WORKFLOW_STATUS_OPTIONS.some(option => option.value === sr.status)) {
      setServiceWorkflowStatus(sr.status)
    }
  }, [sr?.status])

  // Secondary invoice check — fallback for backends that don't yet embed service_invoice in the SR response
  const { data: srInvoicesData } = useQuery({
    queryKey: ['service-invoices-for-sr', id],
    queryFn: () => fetchServiceInvoices({ service_request_id: Number(id) }),
    enabled: !!id && !sr?.service_invoice,
    staleTime: 30_000,
  })
  const resolvedInvoice = sr?.service_invoice ?? (srInvoicesData?.items?.find(inv => inv.status !== 'cancelled') ?? null)

  // Fetch technicians for assignment
  const { data: usersData } = useQuery({
    queryKey: ['users-technicians'],
    queryFn: () => fetchUsers({ role: 'technician', limit: 200 }),
  })
  const technicians: UserData[] = usersData?.items ?? []

  const { data: testEquipmentData } = useQuery({
    queryKey: ['test-equipment', 'active-options'],
    queryFn: () => fetchActiveTestEquipment({ limit: 500 }),
  })
  const testEquipmentOptions = testEquipmentData?.items || []

  const updateMutation = useMutation({
    mutationFn: (data: ServiceRequestUpdate) =>
      updateServiceRequest(Number(id), data),
    onSuccess: () => {
      toast.success('Service request updated')
      setChangeTechOpen(false)
      queryClient.invalidateQueries({ queryKey: ['service-request', id] })
      queryClient.invalidateQueries({ queryKey: ['service-requests'] })
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Update failed')
    },
  })

  const workSessionMutation = useMutation({
    mutationFn: () => {
      const totalWorkHours = sessionTotalWorkHours.trim() ? Number(sessionTotalWorkHours) : null
      return createServiceRequestWorkSession(Number(id), {
        start_time: totalWorkHours && totalWorkHours > 0 ? undefined : new Date(sessionStartTime).toISOString(),
        end_time: totalWorkHours && totalWorkHours > 0 ? undefined : new Date(sessionEndTime).toISOString(),
        break_minutes: Number(sessionBreakMinutes || 0),
        total_work_hours: totalWorkHours && totalWorkHours > 0 ? totalWorkHours : undefined,
        total_mileage: sessionTotalMileage.trim() === '' ? undefined : Number(sessionTotalMileage || 0),
        diagnosis: sessionDiagnosis.trim(),
        work_done: sessionWorkDone.trim(),
        notes: sessionNotes.trim(),
        test_equipment_ids: selectedTestEquipmentIds,
        status: serviceWorkflowStatus,
      })
    },
    onSuccess: () => {
      toast.success('Work order updated')
      const now = new Date()
      setSessionStartTime(toDateTimeLocalValue(now))
      setSessionEndTime(toDateTimeLocalValue(now))
      setSessionBreakMinutes('0')
      setSessionTotalWorkHours('')
      setSessionTotalMileage('')
      setSessionDiagnosis('')
      setSessionWorkDone('')
      setSessionNotes('')
      setSelectedTestEquipmentIds([])
      queryClient.invalidateQueries({ queryKey: ['service-request', id] })
      queryClient.invalidateQueries({ queryKey: ['service-requests'] })
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to update work order')
    },
  })

  const invoiceMutation = useMutation({
    mutationFn: () => generateServiceInvoice(Number(id), {
      include_quotations: includeQuotations,
      quotation_ids: includeQuotations ? selectedQuotationIds : [],
      tax_amount: Number(invoiceTaxAmount || 0),
      discount_amount: Number(invoiceDiscountAmount || 0),
      due_date: invoiceDueDate || null,
      notes: invoiceNotes || undefined,
      travel_charges: invoiceTravelAmount,
      labor_fee_override: invoiceLaborFees.trim() === '' ? undefined : Number(invoiceLaborFees || 0),
    }),
    onSuccess: (invoice) => {
      toast.success(`Invoice ${invoice.invoice_number} is ready in Billing`)
      setInvoiceOpen(false)
      // Immediately stamp the invoice into cached SR so the button switches without a round-trip
      queryClient.setQueryData(['service-request', id], (old: any) =>
        old ? { ...old, service_invoice: invoice } : old
      )
      // Also seed the secondary invoice cache so resolvedInvoice picks it up instantly
      queryClient.setQueryData(['service-invoices-for-sr', id], { items: [invoice], total: 1 })
      queryClient.invalidateQueries({ queryKey: ['service-request', id] })
      queryClient.invalidateQueries({ queryKey: ['service-requests'] })
      queryClient.invalidateQueries({ queryKey: ['service-invoices'] })
      queryClient.invalidateQueries({ queryKey: ['billing-service-invoices'] })
      queryClient.invalidateQueries({ queryKey: ['billing-service-quotations'] })
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to generate service invoice')
    },
  })

  const openEditInvoice = () => {
    if (!resolvedInvoice) return
    setEditInvoiceAmountPaid(String(resolvedInvoice.amount_paid ?? 0))
    setEditInvoiceStatus(resolvedInvoice.status ?? '')
    setEditInvoiceDueDate(resolvedInvoice.due_date ? resolvedInvoice.due_date.split('T')[0] : '')
    setEditInvoiceNotes(resolvedInvoice.notes ?? '')
    setEditInvoiceOpen(true)
  }

  const editInvoiceMutation = useMutation({
    mutationFn: () => updateServiceInvoice(resolvedInvoice!.id, {
      amount_paid: Number(editInvoiceAmountPaid || 0),
      status: editInvoiceStatus || undefined,
      due_date: editInvoiceDueDate || undefined,
      notes: editInvoiceNotes || undefined,
    }),
    onSuccess: (updated) => {
      toast.success('Invoice updated')
      setEditInvoiceOpen(false)
      queryClient.setQueryData(['service-request', id], (old: any) =>
        old ? { ...old, service_invoice: updated } : old
      )
      queryClient.setQueryData(['service-invoices-for-sr', id], { items: [updated], total: 1 })
      queryClient.invalidateQueries({ queryKey: ['service-invoices'] })
      queryClient.invalidateQueries({ queryKey: ['billing-service-invoices'] })
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to update invoice')
    },
  })

  const handleAdvanceStatus = () => {
    if (!sr) return
    const next = NEXT_STATUS[sr.status]
    if (!next) return

    const payload: ServiceRequestUpdate = { status: next as SRStatus }

    // If moving to assigned, require technician
    if (next === 'assigned') {
      if (!technicianId) {
        toast.warning('Please select a technician before assigning')
        return
      }
      payload.assigned_technician_id = technicianId as number
    }

    updateMutation.mutate(payload)
  }

  const handleStatusOnlyWorkOrderUpdate = () => {
    if (!sr) return
    if (serviceWorkflowStatus === sr.status) {
      toast.info('Select a different status first')
      return
    }
    if (serviceWorkflowStatus === 'completed') {
      if (timeSpentHours <= 0) {
        toast.warning('Save at least one work session before completing')
        return
      }
    }
    updateMutation.mutate({ status: serviceWorkflowStatus })
  }

  const handleUpdateWorkOrder = () => {
    const manualHoursProvided = sessionTotalWorkHours.trim() !== ''
    const manualHours = manualHoursProvided ? Number(sessionTotalWorkHours) : 0
    if (manualHoursProvided) {
      if (Number.isNaN(manualHours) || manualHours <= 0) {
        toast.error('Total working hours must be greater than zero')
        return
      }
    } else {
      if (!sessionStartTime || !sessionEndTime) {
        toast.error('Start/end time or total working hours is required')
        return
      }
      const start = new Date(sessionStartTime)
      const end = new Date(sessionEndTime)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
        toast.error('End time must be after start time')
        return
      }
    }
    if (Number(sessionBreakMinutes || 0) < 0) {
      toast.error('Break time cannot be negative')
      return
    }
    if (sessionTotalMileage.trim() !== '') {
      const mileage = Number(sessionTotalMileage)
      if (Number.isNaN(mileage) || mileage < 0) {
        toast.error('Total mileage cannot be negative')
        return
      }
    }
    if (!sessionDiagnosis.trim() && !sessionWorkDone.trim() && !sessionNotes.trim() && selectedTestEquipmentIds.length === 0) {
      toast.info('Add diagnosis, work done, notes, or test equipment before updating the work order')
      return
    }
    workSessionMutation.mutate()
  }

  const handleCancel = () => {
    updateMutation.mutate({ status: 'cancelled' })
    setCancelOpen(false)
  }

  const handleChangeTechnician = () => {
    if (!technicianId) {
      toast.warning('Select a technician first')
      return
    }
    updateMutation.mutate({ assigned_technician_id: technicianId as number })
  }



  const handleUpdateFlag = (payload: Partial<ServiceRequestUpdate>) => {
    updateMutation.mutate(payload)
  }

  const handleSaveTime = () => {
    const newHours = parseFloat(editTimeValue)
    if (isNaN(newHours) || newHours < 0) {
      toast.error('Enter a valid number of hours (e.g. 2.5)')
      return
    }
    updateMutation.mutate({ time_spent_hours: Math.round(newHours * 100) / 100 }, {
      onSuccess: () => setEditingTime(false),
    })
  }

  const billableQuotations = useMemo(
    () => (sr?.quotations || []).filter(q => !['paid', 'partially_paid', 'included_in_invoice', 'cancelled', 'rejected'].includes(String(q.status || '').toLowerCase())),
    [sr?.quotations]
  )
  const paidQuotations = useMemo(
    () => (sr?.quotations || [])
      .filter(q => String(q.status || '').toLowerCase() === 'paid')
      .map(q => ({
        ...q,
        paidAmount: (q.payments || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
      })),
    [sr?.quotations]
  )

  const formatDateTime = (d: string | null) => {
    if (!d) return '—'
    const utc = /Z|[+-]\d{2}:/.test(d) ? d : d + 'Z'
    return new Date(utc).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const getHistoryChanges = (changes: unknown): Record<string, unknown> => {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return {}
    return changes as Record<string, unknown>
  }

  const formatHistoryValue = (value: unknown, field?: string) => {
    if (value === null || value === undefined || value === '') return '---'
    if (field && HISTORY_DATE_FIELDS.has(field) && typeof value === 'string') return formatDateTime(value)
    if (field === 'break_minutes') return `${Number(value || 0)} min`
    if (field === 'total_mileage') return `${Number(value || 0).toFixed(2)} mi`
    if (field === 'duration_hours' || field === 'total_hours') return `${Number(value || 0).toFixed(2)} hrs`
    if (field === 'status' && typeof value === 'string') return STATUS_LABELS[value] || value.replace(/_/g, ' ')
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value)
      } catch {
        return String(value)
      }
    }
    return String(value)
  }

  const renderHistoryChange = (field: string, change: unknown) => {
    if (change && typeof change === 'object' && !Array.isArray(change) && ('from' in change || 'to' in change)) {
      const pair = change as { from?: unknown; to?: unknown }
      return `${formatHistoryValue(pair.from, field)} -> ${formatHistoryValue(pair.to, field)}`
    }
    return formatHistoryValue(change, field)
  }

  const renderTestEquipmentHistory = (value: unknown) => {
    const items = Array.isArray(value) ? value : []
    if (!items.length) return null
    return (
      <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        <Typography sx={{ color: '#475569', fontSize: '0.75rem', fontWeight: 900 }}>
          Test Equipment Used
        </Typography>
        <Box sx={{ display: 'grid', gap: 0.75 }}>
          {items.map((raw: any, itemIndex: number) => (
            <Box
              key={`${raw?.id || raw?.serial_number || 'test-equipment'}-${itemIndex}`}
              sx={{
                display: 'flex',
                gap: 1,
                alignItems: 'center',
                p: 1,
                borderRadius: '10px',
                bgcolor: '#FAF5FF',
                border: '1px solid #EDE9FE',
              }}
            >
              <Avatar
                src={resolveUploadUrl(raw?.image_url)}
                variant="rounded"
                sx={{ width: 38, height: 38, bgcolor: '#F5F3FF', color: '#7C3AED', borderRadius: '9px' }}
              >
                <AssessmentIcon fontSize="small" />
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ color: '#1E1B4B', fontSize: '0.78rem', fontWeight: 900 }}>
                  {raw?.tem || raw?.description || 'Test Equipment'}
                </Typography>
                <Typography sx={{ color: '#64748B', fontSize: '0.72rem' }}>
                  {[raw?.mrf, raw?.model, raw?.serial_number].filter(Boolean).join(' / ') || raw?.asset || 'No details'}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    )
  }

  const displayedHistory = useMemo(() => {
    const history = sr?.history || []
    const completedSessionIds = new Set(
      history
        .filter((entry) => entry.action === 'technician_clock_out' || entry.action === 'technician_work_session')
        .map((entry) => getHistoryChanges(entry.changes).session_id)
        .filter(Boolean)
    )

    return history.filter((entry) => {
      if (entry.action !== 'technician_clock_in') return true
      const sessionId = getHistoryChanges(entry.changes).session_id
      return !sessionId || !completedSessionIds.has(sessionId)
    })
  }, [sr?.history])

  if (isLoading) {
    return (
      <Box sx={{ p: 3 }}>
        <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 3, mb: 3 }} />
        <Skeleton variant="rectangular" height={400} sx={{ borderRadius: 3 }} />
      </Box>
    )
  }

  if (!sr) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="h6">Service request not found</Typography>
        <Button onClick={() => navigate('/service-requests')} sx={{ mt: 2 }}>
          Back to List
        </Button>
      </Box>
    )
  }

  const pColor = PRIORITY_COLORS[sr.priority] || PRIORITY_COLORS.low
  const sColor = STATUS_COLORS[sr.status] || STATUS_COLORS.new
  const progressStatus = SERVICE_WORKFLOW_STATUS_OPTIONS.some(option => option.value === sr.status) && sr.status !== 'completed'
    ? 'in_progress'
    : sr.status
  const currentStepIndex = STATUS_STEPS.indexOf(progressStatus)
  const isTerminal = sr.status === 'completed' || sr.status === 'cancelled'
  const nextStatus = NEXT_STATUS[sr.status]
  const requestImageUrl = resolveUploadUrl(sr.request_image_url) || sr.request_image_url || ''
  const canLogWork = !isTerminal && !!sr.assigned_technician_id && (user?.role === 'superadmin' || user?.role === 'admin' || user?.id === sr.assigned_technician_id)
  const timeSpentHours = Number(sr.time_spent_hours || 0)
  const tierLaborRate = Number(sr.tier_labor_rate_per_hour || 0)
  const tierMileageRate = Number(sr.tier_mileage_rate || 0)
  const calculatedServiceCost = Number(sr.calculated_service_cost ?? (timeSpentHours * tierLaborRate))
  const totalSessionMileage = (sr.history || [])
    .filter(entry => entry.action === 'technician_clock_out' || entry.action === 'technician_work_session')
    .reduce((sum, entry) => sum + Number(getHistoryChanges(entry.changes).total_mileage || 0), 0)
  const calculatedMileageTravelCharge = totalSessionMileage * tierMileageRate
  const selectedQuotationTotal = includeQuotations
    ? billableQuotations
      .filter(q => selectedQuotationIds.includes(q.id))
      .reduce((sum, q) => sum + Number(q.amount || 0), 0)
    : 0
  const invoiceLaborAmount = invoiceLaborFees.trim() === '' ? calculatedServiceCost : Number(invoiceLaborFees || 0)
  const invoiceTravelAmount = invoiceTravelMode === 'mileage'
    ? calculatedMileageTravelCharge
    : Number(invoiceTravelCharges || 0)
  const invoicePreviewTotal = Math.max(
    invoiceLaborAmount + invoiceTravelAmount + selectedQuotationTotal + Number(invoiceTaxAmount || 0) - Number(invoiceDiscountAmount || 0),
    0
  )

  const openInvoiceDialog = () => {
    setIncludeQuotations(false)
    setSelectedQuotationIds(billableQuotations.map(q => q.id))
    setInvoiceDueDate('')
    setInvoiceTaxAmount('0')
    setInvoiceDiscountAmount('0')
    setInvoiceNotes(`Service invoice for ${sr.request_number}.`)
    setInvoiceLaborFees(calculatedServiceCost.toFixed(2))
    setInvoiceTravelMode('fixed')
    setInvoiceTravelCharges('0')
    setInvoiceOpen(true)
  }

  return (
    <Box className="page-enter">
      {/* Back Button */}
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate('/service-requests')}
        sx={{
          mb: 2, color: '#7C3AED', fontWeight: 600,
          '&:hover': { backgroundColor: '#F5F3FF' },
        }}
      >
        Back to Service Requests
      </Button>

      {/* Header Card */}
      <Card
        sx={{
          mb: 3, overflow: 'hidden',
          background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 50%, #EC4899 100%)',
          color: '#fff', position: 'relative',
          boxShadow: '0 24px 60px rgba(79,70,229,0.18)',
        }}
      >
        <Box sx={{ position: 'absolute', right: -30, top: -30, opacity: 0.08 }}>
          <BuildIcon sx={{ fontSize: '12rem' }} />
        </Box>
        <Box sx={{ p: 3, position: 'relative', zIndex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Box>
              <Typography
                sx={{
                  fontFamily: 'monospace', fontSize: '0.85rem',
                  fontWeight: 800, color: 'rgba(255,255,255,0.78)', mb: 0.5,
                }}
              >
                {sr.request_number}
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 800, color: '#fff' }}>
                Service Request
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <Chip
                label={sr.priority.charAt(0).toUpperCase() + sr.priority.slice(1)}
                sx={{
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  color: '#fff',
                  fontWeight: 700,
                  backdropFilter: 'blur(10px)',
                }}
              />
              <Chip
                label={STATUS_LABELS[sr.status] || sr.status}
                sx={{
                  backgroundColor: 'rgba(255,255,255,0.25)',
                  color: '#fff',
                  fontWeight: 700,
                  backdropFilter: 'blur(10px)',
                }}
              />
            </Box>
          </Box>

          {/* Status Progress Bar */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 2 }}>
            {STATUS_STEPS.map((step, i) => {
              const isActive = i <= currentStepIndex && sr.status !== 'cancelled'
              const isCurrent = step === progressStatus
              return (
                <Box key={step} sx={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                  <Box
                    sx={{
                      width: 28, height: 28, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      backgroundColor: isActive ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)',
                      color: isActive ? '#7C3AED' : 'rgba(255,255,255,0.5)',
                      fontWeight: 800, fontSize: '0.7rem',
                      border: isCurrent ? '2px solid #fff' : 'none',
                      boxShadow: isCurrent ? '0 0 0 4px rgba(255,255,255,0.3)' : 'none',
                      transition: 'all 0.3s',
                    }}
                  >
                    {isActive && i < currentStepIndex ? '✓' : i + 1}
                  </Box>
                  {i < STATUS_STEPS.length - 1 && (
                    <Box
                      sx={{
                        flex: 1, height: 3, mx: 0.5,
                        backgroundColor: i < currentStepIndex && sr.status !== 'cancelled'
                          ? 'rgba(255,255,255,0.8)'
                          : 'rgba(255,255,255,0.15)',
                        borderRadius: 2,
                        transition: 'all 0.3s',
                      }}
                    />
                  )}
                </Box>
              )
            })}
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
            {STATUS_STEPS.map((step) => (
              <Typography
                key={step}
                sx={{
                  flex: 1, textAlign: 'center', fontSize: '0.65rem',
                  fontWeight: 800, color: 'rgba(255,255,255,0.82)', textTransform: 'uppercase',
                  textShadow: '0 1px 8px rgba(15,23,42,0.18)',
                }}
              >
                {STATUS_LABELS[step]}
              </Typography>
            ))}
          </Box>
        </Box>
      </Card>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
        {/* Left Column — Info */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Problem Description */}
          <Card sx={{ p: 3 }}>
            <Typography sx={{ fontWeight: 700, color: '#1E1B4B', mb: 2, fontSize: '1rem' }}>
              Service Required
            </Typography>
            <Typography
              sx={{
                color: '#374151', lineHeight: 1.7, fontSize: '0.9rem',
                backgroundColor: '#F9FAFB', p: 2, borderRadius: '12px',
                border: '1px solid #F3F4F6',
              }}
            >
              {sr.service_required || sr.problem_description}
            </Typography>
          </Card>

          {/* Details Cards */}
          <Card sx={{ p: 3 }}>
            <Typography sx={{ fontWeight: 700, color: '#1E1B4B', mb: 2, fontSize: '1rem' }}>
              Details
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* Facility */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1.5, borderRadius: '12px', backgroundColor: '#F5F3FF' }}>
                <Avatar sx={{ backgroundColor: '#EDE9FE', color: '#7C3AED', width: 36, height: 36 }}>
                  <BusinessIcon sx={{ fontSize: '1.1rem' }} />
                </Avatar>
                <Box>
                  <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase' }}>
                    Facility
                  </Typography>
                  <Typography sx={{ fontWeight: 600, color: '#1E1B4B', fontSize: '0.9rem' }}>
                    {sr.facility_name || '—'}
                  </Typography>
                </Box>
              </Box>

              {/* Equipment */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1.5, borderRadius: '12px', backgroundColor: '#EFF6FF' }}>
                <Avatar sx={{ backgroundColor: '#DBEAFE', color: '#1D4ED8', width: 36, height: 36 }}>
                  <PrecisionManufacturingIcon sx={{ fontSize: '1.1rem' }} />
                </Avatar>
                <Box>
                  <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase' }}>
                    Equipment
                  </Typography>
                  <Typography sx={{ fontWeight: 600, color: '#1E1B4B', fontSize: '0.9rem' }}>
                    {sr.equipment_name || '—'}
                  </Typography>
                </Box>
              </Box>

              {/* Requester */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1.5, borderRadius: '12px', backgroundColor: '#FDF4FF' }}>
                <Avatar sx={{ backgroundColor: '#F5D0FE', color: '#A21CAF', width: 36, height: 36 }}>
                  <PersonIcon sx={{ fontSize: '1.1rem' }} />
                </Avatar>
                <Box>
                  <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase' }}>
                    Requested By
                  </Typography>
                  <Typography sx={{ fontWeight: 600, color: '#1E1B4B', fontSize: '0.9rem' }}>
                    {sr.requested_by_name || sr.requester_name || '---'}
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1.5, borderRadius: '12px', backgroundColor: '#FFF7ED' }}>
                <Avatar sx={{ backgroundColor: '#FFEDD5', color: '#C2410C', width: 36, height: 36 }}>
                  <AccessTimeIcon sx={{ fontSize: '1.1rem' }} />
                </Avatar>
                <Box>
                  <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase' }}>
                    Preferred Date / Time
                  </Typography>
                  <Typography sx={{ fontWeight: 600, color: '#1E1B4B', fontSize: '0.9rem' }}>
                    {formatDateTime(sr.preferred_datetime)}
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1.5, borderRadius: '12px', backgroundColor: '#F8FAFC' }}>
                <Avatar sx={{ backgroundColor: '#E2E8F0', color: '#475569', width: 36, height: 36 }}>
                  <ReceiptLongIcon sx={{ fontSize: '1.1rem' }} />
                </Avatar>
                <Box>
                  <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase' }}>
                    Reference #
                  </Typography>
                  <Typography sx={{ fontWeight: 600, color: '#1E1B4B', fontSize: '0.9rem' }}>
                    {sr.reference_number || '---'}
                  </Typography>
                </Box>
              </Box>

              {requestImageUrl && (
                <Button
                  variant="outlined"
                  startIcon={<ImageIcon />}
                  onClick={() => setImageOpen(true)}
                  sx={{ borderRadius: '12px', fontWeight: 700, justifyContent: 'flex-start' }}
                >
                  View Attached Image
                </Button>
              )}

              {/* Technician */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1.5, borderRadius: '12px', backgroundColor: '#F0FDF4' }}>
                <Avatar sx={{ backgroundColor: '#D1FAE5', color: '#047857', width: 36, height: 36 }}>
                  <EngineeringIcon sx={{ fontSize: '1.1rem' }} />
                </Avatar>
                <Box>
                  <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase' }}>
                    Assigned Technician
                  </Typography>
                  <Typography sx={{ fontWeight: 600, color: '#1E1B4B', fontSize: '0.9rem' }}>
                    {sr.technician_name || 'Not assigned'}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Card>

          <Card sx={{ p: 3 }}>
            <Typography sx={{ fontWeight: 700, color: '#1E1B4B', mb: 2, fontSize: '1rem' }}>
              Service Request History
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxHeight: 340, overflowY: 'auto', pr: 0.5 }}>
              {displayedHistory.length === 0 ? (
                <Typography sx={{ color: '#94A3B8', fontSize: '0.875rem' }}>No history recorded yet.</Typography>
              ) : (
                [...displayedHistory].reverse().map((entry, index) => {
                  const changes = getHistoryChanges(entry.changes)
                  const visibleChanges = Object.entries(changes)
                    .filter(([field]) => !HISTORY_HIDDEN_FIELDS.has(field))
                    .slice(0, 8)
                  return (
                    <Box key={`${entry.timestamp}-${index}`} sx={{ display: 'flex', gap: 1.5, p: 1.5, borderRadius: '12px', backgroundColor: '#F8FAFC', border: '1px solid #EEF2F7' }}>
                      <Avatar sx={{ width: 32, height: 32, backgroundColor: '#EDE9FE', color: '#7C3AED' }}>
                        <HistoryIcon sx={{ fontSize: '1rem' }} />
                      </Avatar>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 800, color: '#1E1B4B', fontSize: '0.85rem' }}>
                          {historyActionLabel(entry.action)}
                        </Typography>
                        <Typography sx={{ color: '#64748B', fontSize: '0.78rem' }}>
                          {entry.user || 'System'} - {formatDateTime(entry.timestamp)}
                        </Typography>
                        {(visibleChanges.length > 0 || Array.isArray(changes.test_equipment)) && (
                          <Box sx={{ mt: 0.75, display: 'flex', flexDirection: 'column', gap: 0.4 }}>
                            {visibleChanges.map(([field, change]) => (
                              <Typography key={field} sx={{ color: '#475569', fontSize: '0.75rem' }}>
                                <strong>{HISTORY_FIELD_LABELS[field] || field.replace(/_/g, ' ')}:</strong> {renderHistoryChange(field, change)}
                              </Typography>
                            ))}
                            {renderTestEquipmentHistory(changes.test_equipment)}
                          </Box>
                        )}
                      </Box>
                    </Box>
                  )
                })
              )}
            </Box>
          </Card>

          {/* Timestamps */}
          <Card sx={{ p: 3 }}>
            <Typography sx={{ fontWeight: 700, color: '#1E1B4B', mb: 2, fontSize: '1rem' }}>
              Timeline
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {[
                { label: 'Created', value: sr.created_at, icon: <AccessTimeIcon /> },
                { label: 'Assigned', value: sr.assigned_at, icon: <PersonIcon /> },
                { label: 'Started', value: sr.started_at, icon: <BuildIcon /> },
                { label: 'Completed', value: sr.completed_at, icon: <CheckCircleIcon /> },
              ].map((item) => (
                <Box
                  key={item.label}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1.5,
                    opacity: item.value ? 1 : 0.4,
                  }}
                >
                  <Box sx={{ color: '#7C3AED', '& svg': { fontSize: '1rem' } }}>
                    {item.icon}
                  </Box>
                  <Typography sx={{ fontWeight: 600, fontSize: '0.8rem', color: '#6B7280', minWidth: 80 }}>
                    {item.label}
                  </Typography>
                  <Typography sx={{ fontSize: '0.85rem', color: '#1E1B4B', fontWeight: 500 }}>
                    {formatDateTime(item.value)}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Card>
        </Box>

        {/* Right Column — Actions */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {canLogWork && (
            <Card sx={{ p: 3, border: '1px solid #D1FAE5' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <Avatar sx={{ bgcolor: '#D1FAE5', color: '#047857' }}>
                  <AccessTimeIcon />
                </Avatar>
                <Box>
                  <Typography sx={{ fontWeight: 800, color: '#1E1B4B', fontSize: '1rem' }}>
                    Technician Work Session
                  </Typography>
                  <Typography sx={{ color: '#64748B', fontWeight: 700, fontSize: '0.82rem' }}>
                    Enter start/end time or directly enter total working hours for the session.
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, mb: 2 }}>
                <Box sx={{ p: 1.5, borderRadius: '14px', bgcolor: '#F8FAFC', border: '1px solid #EEF2F7' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 900, color: '#64748B', textTransform: 'uppercase' }}>
                      Saved Total Time
                    </Typography>
                    {canManageServiceBilling && !editingTime && (
                      <IconButton
                        size="small"
                        onClick={() => { setEditTimeValue(timeSpentHours.toFixed(2)); setEditingTime(true) }}
                        sx={{ p: 0.25, color: '#94A3B8', '&:hover': { color: '#7C3AED' } }}
                      >
                        <EditIcon sx={{ fontSize: '0.85rem' }} />
                      </IconButton>
                    )}
                  </Box>
                  {editingTime ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.75, flexWrap: 'wrap' }}>
                      <TextField
                        size="small"
                        type="number"
                        value={editTimeValue}
                        onChange={(e) => setEditTimeValue(e.target.value)}
                        inputProps={{ min: 0, step: 0.01 }}
                        sx={{ width: 90 }}
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTime(); if (e.key === 'Escape') setEditingTime(false) }}
                      />
                      <Typography sx={{ color: '#64748B', fontSize: '0.82rem' }}>hrs</Typography>
                      <Button
                        size="small"
                        variant="contained"
                        onClick={handleSaveTime}
                        disabled={updateMutation.isPending}
                        sx={{ minWidth: 0, px: 1.5, py: 0.4, fontSize: '0.75rem', bgcolor: '#7C3AED', '&:hover': { bgcolor: '#6D28D9' } }}
                      >
                        Save
                      </Button>
                      <Button
                        size="small"
                        onClick={() => setEditingTime(false)}
                        sx={{ minWidth: 0, px: 1, py: 0.4, fontSize: '0.75rem' }}
                      >
                        Cancel
                      </Button>
                    </Box>
                  ) : (
                    <>
                      <Typography sx={{ fontWeight: 950, color: '#1E1B4B', fontSize: '1.25rem' }}>
                        {timeSpentHours.toFixed(2)} hrs
                      </Typography>
                      <Typography sx={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700 }}>
                        Completed work sessions
                      </Typography>
                    </>
                  )}
                </Box>
                <Box sx={{ p: 1.5, borderRadius: '14px', bgcolor: '#F0FDF4', border: '1px solid #EEF2F7' }}>
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 900, color: '#64748B', textTransform: 'uppercase' }}>
                    Manual Work Session
                  </Typography>
                  <Typography sx={{ fontWeight: 950, color: '#047857', fontSize: '1.25rem' }}>
                    Start / End or Total Hours
                  </Typography>
                  <Typography sx={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700 }}>
                    Save one clean ledger entry per work session.
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ p: 2, borderRadius: '16px', bgcolor: '#F8FAFC', border: '1px solid #E2E8F0', mb: 2 }}>
                <Typography sx={{ fontWeight: 900, color: '#1E1B4B', mb: 1 }}>
                  Billing Calculation
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(4, 1fr)' }, gap: 1.25 }}>
                  <Box>
                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 900, color: '#64748B', textTransform: 'uppercase' }}>
                      Asset Tier
                    </Typography>
                    <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>
                      {sr.tier_name || 'Not assigned'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 900, color: '#64748B', textTransform: 'uppercase' }}>
                      Labor Rate
                    </Typography>
                    <Typography sx={{ fontWeight: 900, color: '#047857' }}>
                      ${tierLaborRate.toFixed(2)} / hr
                    </Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 900, color: '#64748B', textTransform: 'uppercase' }}>
                      Service Cost
                    </Typography>
                    <Typography sx={{ fontWeight: 950, color: '#1E1B4B' }}>
                      ${calculatedServiceCost.toFixed(2)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 900, color: '#64748B', textTransform: 'uppercase' }}>
                      Mileage
                    </Typography>
                    <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>
                      {totalSessionMileage.toFixed(2)} mi x ${tierMileageRate.toFixed(2)}
                    </Typography>
                  </Box>
                </Box>
                {paidQuotations.length > 0 && (
                  <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid #D1FAE5' }}>
                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 950, color: '#047857', textTransform: 'uppercase', mb: 0.75 }}>
                      Paid separately — excluded from final service total
                    </Typography>
                    <Box sx={{ display: 'grid', gap: 0.7 }}>
                      {paidQuotations.map(quotation => (
                        <Box key={quotation.id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, p: 1, borderRadius: '10px', bgcolor: '#ECFDF5', border: '1px solid #A7F3D0' }}>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ color: '#065F46', fontWeight: 900, fontSize: 13 }}>{quotation.quotation_number}</Typography>
                            <Typography noWrap title={quotation.description} sx={{ color: '#64748B', fontSize: 12 }}>{quotation.description}</Typography>
                          </Box>
                          <Typography sx={{ color: '#047857', fontWeight: 950, whiteSpace: 'nowrap' }}>
                            ${quotation.paidAmount.toFixed(2)} Paid
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                )}
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 140px' }, gap: 1.25 }}>
                  <TextField
                    label="Start Time"
                    type="datetime-local"
                    value={sessionStartTime}
                    onChange={(e) => setSessionStartTime(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                  <TextField
                    label="End Time"
                    type="datetime-local"
                    value={sessionEndTime}
                    onChange={(e) => setSessionEndTime(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                  <TextField
                    label="Break Time"
                    type="number"
                    value={sessionBreakMinutes}
                    onChange={(e) => setSessionBreakMinutes(e.target.value)}
                    inputProps={{ min: 0, step: 1 }}
                    helperText="minutes"
                  />
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
                  <TextField
                    label="Total Working Hours"
                    type="number"
                    value={sessionTotalWorkHours}
                    onChange={(e) => setSessionTotalWorkHours(e.target.value)}
                    inputProps={{ min: 0, step: 0.01 }}
                    helperText="Optional. If entered, this total is used for billing instead of calculating from start/end time."
                  />
                  <TextField
                    label="Total Mileage"
                    type="number"
                    value={sessionTotalMileage}
                    onChange={(e) => setSessionTotalMileage(e.target.value)}
                    inputProps={{ min: 0, step: 0.01 }}
                    helperText="Optional. Saved with this session and used for mileage-based travel billing."
                  />
                </Box>
                <TextField
                  label="Diagnosis"
                  multiline
                  minRows={2}
                  fullWidth
                  value={sessionDiagnosis}
                  onChange={(e) => setSessionDiagnosis(e.target.value)}
                  placeholder="What was diagnosed during this session?"
                />
                <TextField
                  label="Work Done"
                  multiline
                  minRows={2}
                  fullWidth
                  value={sessionWorkDone}
                  onChange={(e) => setSessionWorkDone(e.target.value)}
                  placeholder="What work was completed during this session?"
                />
                <TextField
                  label="Additional Notes"
                  multiline
                  minRows={2}
                  fullWidth
                  value={sessionNotes}
                  onChange={(e) => setSessionNotes(e.target.value)}
                  placeholder="Parts used, follow-up needed, customer notes, etc."
                />
                <Autocomplete
                  multiple
                  options={testEquipmentOptions}
                  value={testEquipmentOptions.filter((item: TestEquipment) => selectedTestEquipmentIds.includes(item.id))}
                  onChange={(_, value) => setSelectedTestEquipmentIds(value.map((item) => item.id))}
                  getOptionLabel={(option) => `${option.tem}${option.serial_number ? ` - ${option.serial_number}` : ''}`}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                  renderOption={(props, option) => (
                    <Box component="li" {...props} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar src={resolveUploadUrl(option.image_url)} variant="rounded" sx={{ width: 34, height: 34, bgcolor: '#F5F3FF', color: '#7C3AED' }}>
                        <AssessmentIcon fontSize="small" />
                      </Avatar>
                      <Box>
                        <Typography sx={{ fontWeight: 800 }}>{option.tem}</Typography>
                        <Typography variant="caption" sx={{ color: '#6B7280' }}>
                          {[option.mrf, option.model, option.serial_number].filter(Boolean).join(' / ') || 'No details'}
                        </Typography>
                      </Box>
                    </Box>
                  )}
                  renderInput={(params) => (
                    <TextField {...params} label="Test Equipment Used" placeholder="Select equipment used in this session" />
                  )}
                />
                <FormControl fullWidth>
                  <InputLabel>Service Status</InputLabel>
                  <Select
                    value={serviceWorkflowStatus}
                    label="Service Status"
                    onChange={(e) => setServiceWorkflowStatus(e.target.value as SRStatus)}
                  >
                    {SERVICE_WORKFLOW_STATUS_OPTIONS.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  variant="contained"
                  startIcon={workSessionMutation.isPending ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <CheckCircleIcon />}
                  onClick={handleUpdateWorkOrder}
                  disabled={workSessionMutation.isPending}
                  sx={{ alignSelf: 'flex-start', borderRadius: '12px', fontWeight: 900, bgcolor: '#059669', '&:hover': { bgcolor: '#047857' } }}
                >
                  Update Work Order
                </Button>
              </Box>
            </Card>
          )}

          {/* Status Actions */}
          {!isTerminal && (
            <Card sx={{ p: 3 }}>
              <Typography sx={{ fontWeight: 700, color: '#1E1B4B', mb: 2, fontSize: '1rem' }}>
                Work Order Actions
              </Typography>

              {/* Assign Technician (for new → assigned) */}
              {sr.status === 'new' && (
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>Assign Technician</InputLabel>
                  <Select
                    value={technicianId}
                    label="Assign Technician"
                    onChange={(e) => setTechnicianId(e.target.value as number)}
                  >
                    {technicians.map((u) => (
                      <MenuItem key={u.id} value={u.id}>
                        {u.full_name} — {u.email}
                      </MenuItem>
                    ))}
                    {technicians.length === 0 && (
                      <MenuItem disabled value="">No technicians available</MenuItem>
                    )}
                  </Select>
                </FormControl>
              )}

              {sr.status !== 'new' && !canLogWork && (
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel>Service Status</InputLabel>
                  <Select
                    value={serviceWorkflowStatus}
                    label="Service Status"
                    onChange={(e) => setServiceWorkflowStatus(e.target.value as SRStatus)}
                  >
                    {SERVICE_WORKFLOW_STATUS_OPTIONS.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              {sr.status !== 'new' && !canLogWork && (
                <Box sx={{ p: 2, borderRadius: '16px', bgcolor: '#F8FAFC', border: '1px solid #E2E8F0', mb: 2 }}>
                  <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>
                    Service workflow
                  </Typography>
                  <Typography sx={{ color: '#64748B', fontSize: '0.84rem', fontWeight: 700, mt: 0.5 }}>
                    Update the request to waiting on parts, service in progress, approval, depot repair, vendor repair, or completed. Completion requires at least one saved work session.
                  </Typography>
                </Box>
              )}

              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                {sr.status === 'new' && nextStatus && (
                  <Button
                    variant="contained"
                    onClick={handleAdvanceStatus}
                    disabled={updateMutation.isPending}
                    endIcon={updateMutation.isPending ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : undefined}
                    sx={{
                      flex: 1, minWidth: 150,
                      background: 'linear-gradient(135deg, #7C3AED 0%, #F472B6 100%)',
                      boxShadow: '0 8px 24px rgba(124,58,237,0.25)',
                      borderRadius: '12px', fontWeight: 800,
                      '&:hover': {
                        background: 'linear-gradient(135deg, #6D28D9 0%, #EC4899 100%)',
                      },
                    }}
                  >
                    Assign
                  </Button>
                )}
                {sr.status !== 'new' && !canLogWork && (
                  <Button
                    variant="contained"
                    onClick={handleStatusOnlyWorkOrderUpdate}
                    disabled={updateMutation.isPending || serviceWorkflowStatus === sr.status}
                    startIcon={updateMutation.isPending ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <CheckCircleIcon />}
                    sx={{
                      flex: 1, minWidth: 180,
                      background: 'linear-gradient(135deg, #7C3AED 0%, #F472B6 100%)',
                      boxShadow: '0 8px 24px rgba(124,58,237,0.25)',
                      borderRadius: '12px', fontWeight: 800,
                      '&:hover': {
                        background: 'linear-gradient(135deg, #6D28D9 0%, #EC4899 100%)',
                      },
                    }}
                  >
                    Update Work Order
                  </Button>
                )}
                {sr.status !== 'new' && (
                  <>
                    <Button
                      variant="outlined"
                      startIcon={<AssignmentIndIcon />}
                      onClick={() => {
                        setTechnicianId(sr.assigned_technician_id || '')
                        setChangeTechOpen(true)
                      }}
                      sx={{ borderRadius: '12px', fontWeight: 600, borderColor: '#7C3AED', color: '#7C3AED' }}
                    >
                      Change Technician
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<CreditCardIcon />}
                      onClick={() => handleUpdateFlag({ cc_auth_requested: true })}
                      disabled={updateMutation.isPending || sr.cc_auth_requested}
                      sx={{ borderRadius: '12px', fontWeight: 600, borderColor: '#3B82F6', color: '#3B82F6' }}
                    >
                      {sr.cc_auth_requested ? 'CC Auth Requested' : 'Request CC Auth'}
                    </Button>
                  </>
                )}
                <Button
                  variant="outlined"
                  onClick={() => setCancelOpen(true)}
                  startIcon={<CancelIcon />}
                  sx={{
                    borderColor: '#FCA5A5', color: '#EF4444', minWidth: 120,
                    borderRadius: '12px', fontWeight: 600,
                    '&:hover': { backgroundColor: '#FEF2F2', borderColor: '#EF4444' },
                  }}
                >
                  Cancel
                </Button>
              </Box>
            </Card>
          )}

          {/* Resolution Info (if completed) */}
          {sr.status === 'completed' && (
            <Card sx={{ p: 3, border: '1px solid #D1FAE5' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <CheckCircleIcon sx={{ color: '#10B981' }} />
                <Typography sx={{ fontWeight: 700, color: '#047857', fontSize: '1rem' }}>
                  Resolved
                </Typography>
              </Box>
              {sr.resolution_description && (
                <Typography sx={{ color: '#374151', fontSize: '0.9rem', mb: 2, lineHeight: 1.7 }}>
                  {sr.resolution_description}
                </Typography>
              )}
              <Box sx={{ display: 'flex', gap: 3 }}>
                {sr.time_spent_hours != null && (
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase' }}>
                        Time Spent
                      </Typography>
                      {canManageServiceBilling && !editingTime && (
                        <IconButton
                          size="small"
                          onClick={() => { setEditTimeValue(Number(sr.time_spent_hours || 0).toFixed(2)); setEditingTime(true) }}
                          sx={{ p: 0.25, color: '#9CA3AF', '&:hover': { color: '#7C3AED' } }}
                        >
                          <EditIcon sx={{ fontSize: '0.78rem' }} />
                        </IconButton>
                      )}
                    </Box>
                    {editingTime ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.5, flexWrap: 'wrap' }}>
                        <TextField
                          size="small"
                          type="number"
                          value={editTimeValue}
                          onChange={(e) => setEditTimeValue(e.target.value)}
                          inputProps={{ min: 0, step: 0.01 }}
                          sx={{ width: 90 }}
                          autoFocus
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTime(); if (e.key === 'Escape') setEditingTime(false) }}
                        />
                        <Typography sx={{ color: '#64748B', fontSize: '0.82rem' }}>hrs</Typography>
                        <Button size="small" variant="contained" onClick={handleSaveTime} disabled={updateMutation.isPending} sx={{ minWidth: 0, px: 1.5, py: 0.4, fontSize: '0.75rem', bgcolor: '#7C3AED', '&:hover': { bgcolor: '#6D28D9' } }}>Save</Button>
                        <Button size="small" onClick={() => setEditingTime(false)} sx={{ minWidth: 0, px: 1, py: 0.4, fontSize: '0.75rem' }}>Cancel</Button>
                      </Box>
                    ) : (
                      <Typography sx={{ fontWeight: 700, color: '#1E1B4B' }}>
                        {sr.time_spent_hours} hrs
                      </Typography>
                    )}
                  </Box>
                )}
                {sr.total_cost && (
                  <Box>
                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase' }}>
                      Total Cost
                    </Typography>
                    <Typography sx={{ fontWeight: 700, color: '#1E1B4B' }}>
                      ${Number(sr.total_cost).toFixed(2)}
                    </Typography>
                  </Box>
                )}
                {paidQuotations.length > 0 && (
                  <Box sx={{ minWidth: 220 }}>
                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#047857', textTransform: 'uppercase' }}>
                      Paid Quotations · Separate
                    </Typography>
                    <Typography sx={{ fontWeight: 900, color: '#047857' }}>
                      ${paidQuotations.reduce((sum, quotation) => sum + quotation.paidAmount, 0).toFixed(2)}
                    </Typography>
                    <Typography sx={{ color: '#64748B', fontSize: 11 }}>
                      {paidQuotations.map(quotation => quotation.quotation_number).join(', ')} · not included in service total
                    </Typography>
                  </Box>
                )}
              </Box>
            </Card>
          )}

          {/* Billing & Reporting Actions (if completed — admin/superadmin only) */}
          {sr.status === 'completed' && canManageServiceBilling && (
            <Card sx={{ p: 3 }}>
              <Typography sx={{ fontWeight: 700, color: '#1E1B4B', mb: 2, fontSize: '1rem' }}>
                Billing & Reports Actions
              </Typography>
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                <Button
                  variant="outlined"
                  startIcon={<AssessmentIcon />}
                  onClick={() => navigate(`/reports?serviceRequest=${sr.id}`)}
                  sx={{ borderRadius: '12px', fontWeight: 600 }}
                >
                  View Report
                </Button>

                {resolvedInvoice && !sr.invoice_deleted ? (
                  <Button
                    variant="contained"
                    startIcon={<EditIcon />}
                    onClick={openEditInvoice}
                    sx={{
                      borderRadius: '12px',
                      fontWeight: 800,
                      background: 'linear-gradient(135deg, #059669 0%, #0891B2 100%)',
                    }}
                  >
                    Edit Invoice ({resolvedInvoice.invoice_number})
                  </Button>
                ) : (
                  <Button
                    variant="contained"
                    startIcon={<ReceiptLongIcon />}
                    onClick={openInvoiceDialog}
                    disabled={invoiceMutation.isPending || sr.invoice_deleted}
                    sx={{
                      borderRadius: '12px',
                      fontWeight: 800,
                      background: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)',
                    }}
                  >
                    Generate Invoice
                  </Button>
                )}

                <Button
                  variant="outlined"
                  color={sr.billing_status === 'approved' ? 'success' : 'primary'}
                  startIcon={<ThumbUpIcon />}
                  onClick={() => handleUpdateFlag({ billing_status: 'approved' })}
                  disabled={updateMutation.isPending || sr.billing_status === 'approved'}
                  sx={{ borderRadius: '12px', fontWeight: 600 }}
                >
                  {sr.billing_status === 'approved' ? 'Approved for Billing' : 'Approve for Billing'}
                </Button>

                <Button
                  variant="outlined"
                  color={sr.billing_status === 'not_approved' ? 'error' : 'inherit'}
                  startIcon={<ThumbDownIcon />}
                  onClick={() => handleUpdateFlag({ billing_status: 'not_approved' })}
                  disabled={updateMutation.isPending || sr.billing_status === 'not_approved'}
                  sx={{ borderRadius: '12px', fontWeight: 600 }}
                >
                  {sr.billing_status === 'not_approved' ? 'Not Approved' : 'Not Approved for Billing'}
                </Button>

                <Button
                  variant="outlined"
                  startIcon={<CreditCardIcon />}
                  onClick={() => handleUpdateFlag({ cc_auth_requested: true })}
                  disabled={updateMutation.isPending || sr.cc_auth_requested}
                  sx={{ borderRadius: '12px', fontWeight: 600 }}
                >
                  {sr.cc_auth_requested ? 'CC Auth Requested' : 'Request CC Auth'}
                </Button>

                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteOutlineIcon />}
                  onClick={() => handleUpdateFlag({ invoice_deleted: true })}
                  disabled={updateMutation.isPending || sr.invoice_deleted}
                  sx={{ borderRadius: '12px', fontWeight: 600 }}
                >
                  {sr.invoice_deleted ? 'Invoice Deleted' : 'Delete Invoice'}
                </Button>
              </Box>
            </Card>
          )}

          {/* Cancelled info */}
          {sr.status === 'cancelled' && (
            <Card sx={{ p: 3, border: '1px solid #E5E7EB' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CancelIcon sx={{ color: '#9CA3AF' }} />
                <Typography sx={{ fontWeight: 700, color: '#6B7280', fontSize: '1rem' }}>
                  This request has been cancelled
                </Typography>
              </Box>
            </Card>
          )}

          {false && !isTerminal && sr?.status !== 'new' && (
            <Card sx={{ p: 3 }}>
              <Typography sx={{ fontWeight: 700, color: '#1E1B4B', mb: 2, fontSize: '1rem' }}>
                Change Technician
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <FormControl fullWidth>
                  <InputLabel>Reassign Technician</InputLabel>
                  <Select
                    value={technicianId || sr?.assigned_technician_id || ''}
                    label="Reassign Technician"
                    onChange={(e) => setTechnicianId(e.target.value as number)}
                  >
                    {technicians.map((u) => (
                      <MenuItem key={u.id} value={u.id}>
                        {u.full_name} — {u.email}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Box sx={{ p: 1.5, borderRadius: '12px', bgcolor: '#F8FAFC', border: '1px solid #EEF2F7' }}>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 900, color: '#64748B', textTransform: 'uppercase' }}>
                    Calculated Service Time
                  </Typography>
                  <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>
                    {Number(sr?.time_spent_hours || 0).toFixed(2)} hrs
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  onClick={handleChangeTechnician}
                  disabled={updateMutation.isPending}
                  sx={{
                    borderColor: '#7C3AED', color: '#7C3AED',
                    borderRadius: '12px', fontWeight: 700,
                    '&:hover': { backgroundColor: '#F5F3FF' },
                  }}
                >
                  {updateMutation.isPending ? <CircularProgress size={20} /> : 'Save Technician'}
                </Button>
              </Box>
            </Card>
          )}

          {/* Quotation Panel */}
          <QuotationPanel
            serviceRequestId={sr.id}
            quotations={sr.quotations || []}
            isCompleted={sr.status === 'completed'}
            isCancelled={sr.status === 'cancelled'}
            canEdit={canCreateQuotation}
            queryKey={['service-request', id]}
          />
        </Box>
      </Box>

      <Dialog
        open={changeTechOpen}
        onClose={() => setChangeTechOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: '20px', p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#1E1B4B' }}>
          Change Technician
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#64748B', fontWeight: 700, mb: 2 }}>
            Reassign this service request without changing the service history, hours, or billing calculation.
          </Typography>
          <FormControl fullWidth>
            <InputLabel>Technician</InputLabel>
            <Select
              value={technicianId || sr.assigned_technician_id || ''}
              label="Technician"
              onChange={(e) => setTechnicianId(e.target.value as number)}
            >
              {technicians.map((u) => (
                <MenuItem key={u.id} value={u.id}>
                  {u.full_name} - {u.email}
                </MenuItem>
              ))}
              {technicians.length === 0 && (
                <MenuItem disabled value="">No technicians available</MenuItem>
              )}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setChangeTechOpen(false)} variant="outlined">
            Close
          </Button>
          <Button
            onClick={handleChangeTechnician}
            variant="contained"
            disabled={updateMutation.isPending}
            sx={{
              background: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)',
              borderRadius: '12px',
              fontWeight: 800,
            }}
          >
            {updateMutation.isPending ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : 'Save Technician'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={invoiceOpen}
        onClose={() => setInvoiceOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: '22px', overflow: 'hidden' } }}
      >
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>
          Generate Service Invoice
          <Typography sx={{ color: '#64748B', fontWeight: 700, fontSize: 13, mt: 0.5 }}>
            Choose whether service quotations should be included in this invoice or billed separately.
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.2fr 0.8fr' }, gap: 2.5 }}>
            <Box sx={{ display: 'grid', gap: 1.5 }}>
              <Box sx={{ p: 2, borderRadius: '16px', bgcolor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                <Typography sx={{ fontWeight: 950, color: '#1E1B4B', mb: 0.75 }}>Service Labor</Typography>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                  <Typography sx={{ color: '#64748B', fontWeight: 700 }}>
                    {timeSpentHours.toFixed(2)} hrs x ${tierLaborRate.toFixed(2)} / hr
                  </Typography>
                  <Typography sx={{ fontWeight: 950, color: '#047857' }}>
                    ${calculatedServiceCost.toFixed(2)}
                  </Typography>
                </Box>
              </Box>

              <TextField
                label="Labor Fees ($)"
                type="number"
                value={invoiceLaborFees}
                onChange={(e) => setInvoiceLaborFees(e.target.value)}
                fullWidth
                inputProps={{ min: 0, step: 0.01 }}
                helperText="Pre-filled from tier labor rate × hours. Edit to override."
              />

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: invoiceTravelMode === 'fixed' ? '1fr 1fr' : '1fr' }, gap: 1.25 }}>
                <FormControl fullWidth>
                  <InputLabel>Travel Charges</InputLabel>
                  <Select
                    label="Travel Charges"
                    value={invoiceTravelMode}
                    onChange={(e) => setInvoiceTravelMode(e.target.value as 'fixed' | 'mileage')}
                  >
                    <MenuItem value="fixed">Fixed</MenuItem>
                    <MenuItem value="mileage">Mileage</MenuItem>
                  </Select>
                </FormControl>
                {invoiceTravelMode === 'fixed' && (
                  <TextField
                    label="Fixed Travel Charges ($)"
                    type="number"
                    value={invoiceTravelCharges}
                    onChange={(e) => setInvoiceTravelCharges(e.target.value)}
                    fullWidth
                    inputProps={{ min: 0, step: 0.01 }}
                  />
                )}
              </Box>
              {invoiceTravelMode === 'mileage' && (
                <Box sx={{ p: 1.5, borderRadius: '14px', bgcolor: '#EFF6FF', border: '1px solid #BFDBFE' }}>
                  <Typography sx={{ color: '#1E40AF', fontWeight: 900 }}>
                    Mileage travel: {totalSessionMileage.toFixed(2)} mi x ${tierMileageRate.toFixed(2)} / mi = ${calculatedMileageTravelCharge.toFixed(2)}
                  </Typography>
                  <Typography sx={{ color: '#64748B', fontSize: 12, fontWeight: 700, mt: 0.5 }}>
                    Mileage is pulled from all saved technician work sessions for this service request.
                  </Typography>
                </Box>
              )}

              <Box sx={{ p: 2, borderRadius: '16px', bgcolor: '#F5F3FF', border: '1px solid #DDD6FE' }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={includeQuotations}
                      onChange={(e) => {
                        setIncludeQuotations(e.target.checked)
                        if (e.target.checked && selectedQuotationIds.length === 0) {
                          setSelectedQuotationIds(billableQuotations.map(q => q.id))
                        }
                      }}
                    />
                  }
                  label={
                    <Box>
                      <Typography sx={{ fontWeight: 950, color: '#1E1B4B' }}>Include service quotations in this invoice</Typography>
                      <Typography sx={{ color: '#64748B', fontWeight: 700, fontSize: 12 }}>
                        Leave off to bill quotations separately in Billing.
                      </Typography>
                    </Box>
                  }
                />
                {includeQuotations && (
                  <Box sx={{ mt: 1.5, display: 'grid', gap: 1 }}>
                    {billableQuotations.length === 0 ? (
                      <Typography sx={{ color: '#94A3B8', fontWeight: 700 }}>No open quotations available to include.</Typography>
                    ) : billableQuotations.map(q => (
                      <Box key={q.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, p: 1.25, borderRadius: '12px', bgcolor: '#fff', border: '1px solid #EDE9FE' }}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={selectedQuotationIds.includes(q.id)}
                              onChange={(e) => {
                                setSelectedQuotationIds(prev => (
                                  e.target.checked ? [...new Set([...prev, q.id])] : prev.filter(id => id !== q.id)
                                ))
                              }}
                            />
                          }
                          label={
                            <Box>
                              <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>{q.quotation_number}</Typography>
                              <Typography sx={{ color: '#64748B', fontSize: 12 }}>{q.description || 'Service quotation'}</Typography>
                            </Box>
                          }
                        />
                        <Typography sx={{ fontWeight: 950, color: '#047857' }}>${Number(q.amount || 0).toFixed(2)}</Typography>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>

              <TextField
                label="Invoice Notes"
                multiline
                minRows={2}
                value={invoiceNotes}
                onChange={(e) => setInvoiceNotes(e.target.value)}
                fullWidth
              />
            </Box>

            <Box sx={{ p: 2, borderRadius: '18px', bgcolor: '#fff', border: '1px solid #E5E7EB', boxShadow: '0 14px 35px rgba(15,23,42,0.08)', height: 'fit-content' }}>
              <Typography sx={{ fontWeight: 950, color: '#1E1B4B', mb: 1.5 }}>Invoice Summary</Typography>
              <TextField
                label="Due Date"
                type="date"
                value={invoiceDueDate}
                onChange={(e) => setInvoiceDueDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
                sx={{ mb: 1.5 }}
              />
              <TextField
                label="Tax Amount ($)"
                type="number"
                value={invoiceTaxAmount}
                onChange={(e) => setInvoiceTaxAmount(e.target.value)}
                fullWidth
                sx={{ mb: 1.5 }}
                inputProps={{ min: 0, step: 0.01 }}
              />
              <TextField
                label="Discount Amount ($)"
                type="number"
                value={invoiceDiscountAmount}
                onChange={(e) => setInvoiceDiscountAmount(e.target.value)}
                fullWidth
                sx={{ mb: 2 }}
                inputProps={{ min: 0, step: 0.01 }}
              />
              {[
                ['Labor Fees', Number(invoiceLaborFees || 0)],
                [invoiceTravelMode === 'mileage' ? 'Travel Charges (Mileage)' : 'Travel Charges', invoiceTravelAmount],
                ['Included quotations', selectedQuotationTotal],
                ['Tax', Number(invoiceTaxAmount || 0)],
                ['Discount', -Number(invoiceDiscountAmount || 0)],
              ].map(([label, value]) => (
                <Box key={String(label)} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75, borderBottom: '1px solid #F1F5F9' }}>
                  <Typography sx={{ color: '#64748B', fontWeight: 800 }}>{label}</Typography>
                  <Typography sx={{ color: Number(value) < 0 ? '#DC2626' : '#1E1B4B', fontWeight: 900 }}>
                    ${Number(value).toFixed(2)}
                  </Typography>
                </Box>
              ))}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1.5, p: 1.5, borderRadius: '14px', bgcolor: '#F0FDF4' }}>
                <Typography sx={{ color: '#047857', fontWeight: 950 }}>Total</Typography>
                <Typography sx={{ color: '#047857', fontWeight: 950, fontSize: 20 }}>${invoicePreviewTotal.toFixed(2)}</Typography>
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          <Button onClick={() => setInvoiceOpen(false)} variant="outlined">
            Close
          </Button>
          <Button
            onClick={() => invoiceMutation.mutate()}
            variant="contained"
            disabled={invoiceMutation.isPending}
            startIcon={invoiceMutation.isPending ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <ReceiptLongIcon />}
            sx={{ borderRadius: '12px', fontWeight: 900, background: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)' }}
          >
            Generate Invoice
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Invoice Dialog */}
      <Dialog open={editInvoiceOpen} onClose={() => setEditInvoiceOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '22px' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <EditIcon sx={{ color: '#059669' }} />
            Edit Invoice
          </Box>
          {resolvedInvoice && (
            <Typography sx={{ fontSize: 13, color: '#6B7280', mt: 0.5 }}>
              {resolvedInvoice.invoice_number} · Total <strong>${Number(resolvedInvoice.total_amount || 0).toFixed(2)}</strong>
            </Typography>
          )}
        </DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <FormControl fullWidth size="small">
            <InputLabel>Status</InputLabel>
            <Select value={editInvoiceStatus} label="Status" onChange={e => setEditInvoiceStatus(e.target.value)}>
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="paid">Paid</MenuItem>
              <MenuItem value="partially_paid">Partially Paid</MenuItem>
              <MenuItem value="overdue">Overdue</MenuItem>
              <MenuItem value="cancelled">Cancelled</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Amount Paid ($)"
            type="number"
            fullWidth
            size="small"
            value={editInvoiceAmountPaid}
            onChange={e => setEditInvoiceAmountPaid(e.target.value)}
            inputProps={{ min: 0, step: 0.01 }}
          />
          <TextField
            label="Due Date"
            type="date"
            fullWidth
            size="small"
            value={editInvoiceDueDate}
            onChange={e => setEditInvoiceDueDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Notes"
            multiline
            rows={3}
            fullWidth
            size="small"
            value={editInvoiceNotes}
            onChange={e => setEditInvoiceNotes(e.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setEditInvoiceOpen(false)} sx={{ fontWeight: 700 }}>Cancel</Button>
          <Button
            onClick={() => editInvoiceMutation.mutate()}
            variant="contained"
            disabled={editInvoiceMutation.isPending}
            startIcon={editInvoiceMutation.isPending ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <EditIcon />}
            sx={{ borderRadius: '12px', fontWeight: 900, background: 'linear-gradient(135deg, #059669 0%, #0891B2 100%)' }}
          >
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Cancel Confirmation Dialog */}
      <Dialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        PaperProps={{ sx: { borderRadius: '20px', p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, color: '#1E1B4B' }}>
          Cancel Service Request?
        </DialogTitle>
        <DialogContent>
          <Typography color="text.secondary">
            Are you sure you want to cancel <strong>{sr?.request_number}</strong>?
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button
            onClick={() => setCancelOpen(false)}
            variant="outlined"
            sx={{ borderColor: '#E5E7EB', color: '#6B7280' }}
          >
            Keep Open
          </Button>
          <Button
            onClick={handleCancel}
            variant="contained"
            color="error"
            disabled={updateMutation.isPending}
            sx={{ boxShadow: '0 4px 12px rgba(239,68,68,0.25)' }}
          >
            Cancel Request
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={imageOpen}
        onClose={() => setImageOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: '20px', overflow: 'hidden' } }}
      >
        <DialogTitle sx={{ fontWeight: 700, color: '#1E1B4B' }}>
          Attached Image
        </DialogTitle>
        <DialogContent sx={{ p: 0, backgroundColor: '#0F172A' }}>
          <Box
            component="img"
            src={requestImageUrl}
            alt="Service request attachment"
            sx={{ width: '100%', maxHeight: '72vh', objectFit: 'contain', display: 'block' }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setImageOpen(false)} variant="outlined">
            Close
          </Button>
          {!requestImageUrl.startsWith('data:') && (
            <Button href={requestImageUrl} target="_blank" rel="noreferrer" variant="contained">
              Open Original
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default ServiceRequestDetail
