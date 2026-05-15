import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Box, Card, Typography, Button, Chip, Avatar, TextField,
  FormControl, InputLabel, Select, MenuItem, IconButton,
  Skeleton, Divider, CircularProgress, Dialog, DialogTitle,
  DialogContent, DialogActions,
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
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import RequestQuoteIcon from '@mui/icons-material/RequestQuote'
import CreditCardIcon from '@mui/icons-material/CreditCard'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import ThumbUpIcon from '@mui/icons-material/ThumbUp'
import ThumbDownIcon from '@mui/icons-material/ThumbDown'
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd'
import HistoryIcon from '@mui/icons-material/History'
import ImageIcon from '@mui/icons-material/Image'
import { toast } from 'react-toastify'

import {
  fetchServiceRequest,
  updateServiceRequest,
  type ServiceRequest,
  type ServiceRequestUpdate,
  type ServiceRequestStatus as SRStatus,
} from '@/api/serviceRequests'
import QuotationPanel from './QuotationPanel'
import { fetchUsers, type UserData } from '@/api/users'
import { resolveUploadUrl } from '@/api/users'
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
  completed:   { bg: '#D1FAE5', color: '#047857' },
  cancelled:   { bg: '#F3F4F6', color: '#6B7280' },
}

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

// Ordered transitions
const NEXT_STATUS: Record<string, string> = {
  new: 'assigned',
  assigned: 'in_progress',
  in_progress: 'completed',
}

const STATUS_STEPS = ['new', 'assigned', 'in_progress', 'completed']

const ServiceRequestDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [technicianId, setTechnicianId] = useState<number | ''>('')
  const [resolution, setResolution] = useState('')
  const [timeSpent, setTimeSpent] = useState('')
  const [totalCost, setTotalCost] = useState('')
  const [cancelOpen, setCancelOpen] = useState(false)
  const [imageOpen, setImageOpen] = useState(false)


  const user = useAuthStore(state => state.user)
  const canCreateQuotation = user?.role === 'superadmin' || user?.role === 'admin' || user?.role === 'technician'

  const { data: sr, isLoading } = useQuery({
    queryKey: ['service-request', id],
    queryFn: () => fetchServiceRequest(Number(id)),
    enabled: !!id,
  })

  // Fetch technicians for assignment
  const { data: usersData } = useQuery({
    queryKey: ['users-technicians'],
    queryFn: () => fetchUsers({ role: 'technician', limit: 200 }),
  })
  const technicians: UserData[] = usersData?.items ?? []

  const updateMutation = useMutation({
    mutationFn: (data: ServiceRequestUpdate) =>
      updateServiceRequest(Number(id), data),
    onSuccess: () => {
      toast.success('Service request updated')
      queryClient.invalidateQueries({ queryKey: ['service-request', id] })
      queryClient.invalidateQueries({ queryKey: ['service-requests'] })
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Update failed')
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

    // If completing, include resolution info
    if (next === 'completed') {
      if (resolution.trim()) payload.resolution_description = resolution.trim()
      if (timeSpent) payload.time_spent_hours = parseFloat(timeSpent)
      if (totalCost) payload.total_cost = parseFloat(totalCost)
    }

    updateMutation.mutate(payload)
  }

  const handleCancel = () => {
    updateMutation.mutate({ status: 'cancelled' })
    setCancelOpen(false)
  }

  const handleSaveFields = () => {
    const payload: ServiceRequestUpdate = {}
    if (technicianId) payload.assigned_technician_id = technicianId as number
    if (resolution.trim()) payload.resolution_description = resolution.trim()
    if (timeSpent) payload.time_spent_hours = parseFloat(timeSpent)
    if (totalCost) payload.total_cost = parseFloat(totalCost)
    if (Object.keys(payload).length === 0) {
      toast.info('No changes to save')
      return
    }
    updateMutation.mutate(payload)
  }



  const handleUpdateFlag = (payload: Partial<ServiceRequestUpdate>) => {
    updateMutation.mutate(payload)
  }

  const formatDateTime = (d: string | null) => {
    if (!d) return '—'
    return new Date(d).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const getHistoryChanges = (changes: unknown): Record<string, unknown> => {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return {}
    return changes as Record<string, unknown>
  }

  const formatHistoryValue = (value: unknown) => {
    if (value === null || value === undefined || value === '') return '---'
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value)
      } catch {
        return String(value)
      }
    }
    return String(value)
  }

  const renderHistoryChange = (change: unknown) => {
    if (change && typeof change === 'object' && !Array.isArray(change) && ('from' in change || 'to' in change)) {
      const pair = change as { from?: unknown; to?: unknown }
      return `${formatHistoryValue(pair.from)} -> ${formatHistoryValue(pair.to)}`
    }
    return formatHistoryValue(change)
  }

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
  const currentStepIndex = STATUS_STEPS.indexOf(sr.status)
  const isTerminal = sr.status === 'completed' || sr.status === 'cancelled'
  const nextStatus = NEXT_STATUS[sr.status]
  const requestImageUrl = resolveUploadUrl(sr.request_image_url) || sr.request_image_url || ''

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
                  fontWeight: 700, opacity: 0.7, mb: 0.5,
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
              const isCurrent = step === sr.status
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
                  fontWeight: 600, opacity: 0.7, textTransform: 'uppercase',
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
              {(sr.history || []).length === 0 ? (
                <Typography sx={{ color: '#94A3B8', fontSize: '0.875rem' }}>No history recorded yet.</Typography>
              ) : (
                [...(sr.history || [])].reverse().map((entry, index) => {
                  const changes = getHistoryChanges(entry.changes)
                  return (
                    <Box key={`${entry.timestamp}-${index}`} sx={{ display: 'flex', gap: 1.5, p: 1.5, borderRadius: '12px', backgroundColor: '#F8FAFC', border: '1px solid #EEF2F7' }}>
                      <Avatar sx={{ width: 32, height: 32, backgroundColor: '#EDE9FE', color: '#7C3AED' }}>
                        <HistoryIcon sx={{ fontSize: '1rem' }} />
                      </Avatar>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 800, color: '#1E1B4B', fontSize: '0.85rem', textTransform: 'capitalize' }}>
                          {String(entry.action || 'updated').replace(/_/g, ' ')}
                        </Typography>
                        <Typography sx={{ color: '#64748B', fontSize: '0.78rem' }}>
                          {entry.user || 'System'} - {formatDateTime(entry.timestamp)}
                        </Typography>
                        {Object.keys(changes).length > 0 && (
                          <Box sx={{ mt: 0.75, display: 'flex', flexDirection: 'column', gap: 0.4 }}>
                            {Object.entries(changes).slice(0, 4).map(([field, change]) => (
                              <Typography key={field} sx={{ color: '#475569', fontSize: '0.75rem' }}>
                                <strong>{field.replace(/_/g, ' ')}:</strong> {renderHistoryChange(change)}
                              </Typography>
                            ))}
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
          {/* Status Actions */}
          {!isTerminal && (
            <Card sx={{ p: 3 }}>
              <Typography sx={{ fontWeight: 700, color: '#1E1B4B', mb: 2, fontSize: '1rem' }}>
                Update Status
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

              {/* Resolution fields (for completing) */}
              {sr.status === 'in_progress' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
                  <TextField
                    label="Resolution Description"
                    multiline
                    rows={3}
                    fullWidth
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    placeholder="Describe what was done to resolve the issue..."
                  />
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <TextField
                      label="Time Spent (hours)"
                      type="number"
                      value={timeSpent}
                      onChange={(e) => setTimeSpent(e.target.value)}
                      inputProps={{ step: 0.5, min: 0 }}
                      sx={{ flex: 1 }}
                    />
                    <TextField
                      label="Total Cost ($)"
                      type="number"
                      value={totalCost}
                      onChange={(e) => setTotalCost(e.target.value)}
                      inputProps={{ step: 0.01, min: 0 }}
                      sx={{ flex: 1 }}
                    />
                  </Box>
                </Box>
              )}

              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                {nextStatus && (
                  <Button
                    variant="contained"
                    onClick={handleAdvanceStatus}
                    disabled={updateMutation.isPending}
                    endIcon={updateMutation.isPending ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <ArrowForwardIcon />}
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
                    {sr.status === 'new' && 'Assign'}
                    {sr.status === 'assigned' && 'Start Work'}
                    {sr.status === 'in_progress' && 'Mark Complete'}
                  </Button>
                )}
                {sr.status === 'in_progress' && (
                  <>
                    <Button
                      variant="outlined"
                      startIcon={<AssignmentIndIcon />}
                      onClick={() => {
                        const editSection = document.getElementById('edit-details-section')
                        if (editSection) {
                          editSection.scrollIntoView({ behavior: 'smooth' })
                        }
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
                {sr.time_spent_hours && (
                  <Box>
                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase' }}>
                      Time Spent
                    </Typography>
                    <Typography sx={{ fontWeight: 700, color: '#1E1B4B' }}>
                      {sr.time_spent_hours} hrs
                    </Typography>
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
              </Box>
            </Card>
          )}

          {/* Billing & Reporting Actions (if completed — admin/superadmin only) */}
          {sr.status === 'completed' && canCreateQuotation && (
            <Card sx={{ p: 3 }}>
              <Typography sx={{ fontWeight: 700, color: '#1E1B4B', mb: 2, fontSize: '1rem' }}>
                Billing & Reports Actions
              </Typography>
              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                <Button
                  variant="outlined"
                  startIcon={<ReceiptLongIcon />}
                  onClick={() => toast.info('Report generation is coming soon')}
                  sx={{ borderRadius: '12px', fontWeight: 600 }}
                >
                  View Report
                </Button>

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

          {/* Edit Fields (for non-terminal) */}
          {!isTerminal && sr.status !== 'new' && (
            <Card sx={{ p: 3 }} id="edit-details-section">
              <Typography sx={{ fontWeight: 700, color: '#1E1B4B', mb: 2, fontSize: '1rem' }}>
                Edit Details
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <FormControl fullWidth>
                  <InputLabel>Reassign Technician</InputLabel>
                  <Select
                    value={technicianId || sr.assigned_technician_id || ''}
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
                <TextField
                  label="Resolution Notes"
                  multiline
                  rows={3}
                  fullWidth
                  value={resolution || sr.resolution_description || ''}
                  onChange={(e) => setResolution(e.target.value)}
                />
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField
                    label="Time Spent (hours)"
                    type="number"
                    value={timeSpent || sr.time_spent_hours || ''}
                    onChange={(e) => setTimeSpent(e.target.value)}
                    inputProps={{ step: 0.5, min: 0 }}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    label="Total Cost ($)"
                    type="number"
                    value={totalCost || sr.total_cost || ''}
                    onChange={(e) => setTotalCost(e.target.value)}
                    inputProps={{ step: 0.01, min: 0 }}
                    sx={{ flex: 1 }}
                  />
                </Box>
                <Button
                  variant="outlined"
                  onClick={handleSaveFields}
                  disabled={updateMutation.isPending}
                  sx={{
                    borderColor: '#7C3AED', color: '#7C3AED',
                    borderRadius: '12px', fontWeight: 700,
                    '&:hover': { backgroundColor: '#F5F3FF' },
                  }}
                >
                  {updateMutation.isPending ? <CircularProgress size={20} /> : 'Save Changes'}
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
