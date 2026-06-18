import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Avatar,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import BadgeIcon from '@mui/icons-material/Badge'
import CameraAltIcon from '@mui/icons-material/CameraAlt'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CoffeeIcon from '@mui/icons-material/Coffee'
import LoginIcon from '@mui/icons-material/Login'
import PeopleIcon from '@mui/icons-material/People'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { toast } from 'react-toastify'

import {
  fetchAttendanceEvents,
  fetchAttendanceProfiles,
  fetchAttendanceSummary,
  reviewAttendanceEvent,
  type AttendanceEvent,
  type AttendanceProfile,
} from '@/api/attendance'
import { resolveUploadUrl } from '@/api/users'

const todayIso = () => new Date().toISOString().slice(0, 10)

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

const EVENT_LABELS: Record<string, string> = {
  check_in: 'Check In',
  check_out: 'Check Out',
  break_start: 'Break Start',
  break_end: 'Break End',
}

const VERIFICATION_CHIP: Record<string, { label: string; bg: string; color: string }> = {
  verified: { label: 'Verified', bg: '#D1FAE5', color: '#047857' },
  needs_review: { label: 'Needs Review', bg: '#FEF3C7', color: '#B45309' },
  rejected: { label: 'Rejected', bg: '#FEE2E2', color: '#DC2626' },
}

const FACE_STATUS: Record<string, { label: string; bg: string; color: string }> = {
  enrolled: { label: 'Enrolled', bg: '#D1FAE5', color: '#047857' },
  needs_retrain: { label: 'Needs Retrain', bg: '#FEF3C7', color: '#B45309' },
  not_enrolled: { label: 'Not Enrolled', bg: '#FEE2E2', color: '#DC2626' },
}

const HR = () => {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState(0)
  const [selectedDate, setSelectedDate] = useState(todayIso())
  const [reviewDialog, setReviewDialog] = useState<AttendanceEvent | null>(null)
  const [reviewRemark, setReviewRemark] = useState('')

  const summaryQ = useQuery({
    queryKey: ['hr-summary', selectedDate],
    queryFn: () => fetchAttendanceSummary(selectedDate),
  })

  const reviewQ = useQuery({
    queryKey: ['hr-review-queue'],
    queryFn: () => fetchAttendanceEvents({ verification_status: 'needs_review', limit: 200 }),
  })

  const profilesQ = useQuery({
    queryKey: ['hr-profiles'],
    queryFn: () => fetchAttendanceProfiles({ limit: 200 }),
  })

  const eventsQ = useQuery({
    queryKey: ['hr-events', selectedDate],
    queryFn: () => fetchAttendanceEvents({ date_from: selectedDate, date_to: selectedDate, limit: 200 }),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['hr-review-queue'] })
    queryClient.invalidateQueries({ queryKey: ['hr-summary'] })
    queryClient.invalidateQueries({ queryKey: ['hr-events'] })
    queryClient.invalidateQueries({ queryKey: ['attendance-summary'] })
    queryClient.invalidateQueries({ queryKey: ['attendance-events'] })
  }

  const reviewMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'verified' | 'rejected' }) =>
      reviewAttendanceEvent(id, { verification_status: status, remark: reviewRemark || undefined }),
    onSuccess: (_, vars) => {
      toast.success(vars.status === 'verified' ? 'Event verified' : 'Event rejected')
      setReviewDialog(null)
      setReviewRemark('')
      invalidate()
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Review action failed'),
  })

  const stats = summaryQ.data
  const reviewItems = reviewQ.data?.items || []
  const profiles = profilesQ.data?.items || []
  const events = eventsQ.data?.items || []

  const renderKpi = (label: string, value: number | undefined, icon: JSX.Element, color: string) => (
    <Card sx={{ p: 2.4, borderRadius: '20px', border: '1px solid #E9E5FF', boxShadow: '0 18px 45px rgba(49,46,129,0.08)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ width: 48, height: 48, borderRadius: '16px', display: 'grid', placeItems: 'center', background: `${color}16`, color }}>
          {icon}
        </Box>
        <Box>
          <Typography sx={{ color: '#8B95A7', fontWeight: 900, fontSize: 12, textTransform: 'uppercase' }}>{label}</Typography>
          <Typography sx={{ color: '#1E1B4B', fontWeight: 900, fontSize: 28 }}>{value ?? 0}</Typography>
        </Box>
      </Box>
    </Card>
  )

  return (
    <Box sx={{ p: 4, minHeight: '100vh', background: '#F8FAFF' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center', mb: 3, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 900, color: '#1E1B4B' }}>HR Management</Typography>
          <Typography sx={{ color: '#6B7280', fontWeight: 700 }}>Review attendance events, manage employee enrollment, and monitor workforce.</Typography>
        </Box>
        <TextField
          type="date"
          size="small"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          sx={{ width: 180, '& .MuiOutlinedInput-root': { borderRadius: '14px', background: '#fff' } }}
        />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(5, 1fr)' }, gap: 2, mb: 3 }}>
        {renderKpi('Total Employees', stats?.total_employees, <PeopleIcon />, '#7C3AED')}
        {renderKpi('Face Enrolled', stats?.enrolled_faces, <CameraAltIcon />, '#EC4899')}
        {renderKpi('Checked In', stats?.checked_in, <LoginIcon />, '#059669')}
        {renderKpi('On Break', stats?.on_break, <CoffeeIcon />, '#D97706')}
        {renderKpi('Needs Review', reviewItems.length || stats?.needs_review, <WarningAmberIcon />, '#DC2626')}
      </Box>

      <Card sx={{ borderRadius: '24px', border: '1px solid #E9E5FF', overflow: 'hidden', boxShadow: '0 20px 55px rgba(49,46,129,0.08)' }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ px: 2, borderBottom: '1px solid #EEF0F6', '& .Mui-selected': { color: '#7C3AED !important', fontWeight: 900 } }}
        >
          <Tab label={`Review Queue (${reviewItems.length})`} />
          <Tab label="Employees" />
          <Tab label="Events" />
        </Tabs>

        {tab === 0 && (
          <Box sx={{ p: 3 }}>
            {reviewQ.isLoading ? (
              <CircularProgress size={24} />
            ) : reviewItems.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 6 }}>
                <CheckCircleIcon sx={{ fontSize: 48, color: '#10B981', mb: 1 }} />
                <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>No pending reviews</Typography>
                <Typography sx={{ color: '#6B7280' }}>All face recognition events have been reviewed.</Typography>
              </Box>
            ) : (
              <TableContainer className="list-scroll-panel">
                <Table stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Employee</TableCell>
                      <TableCell>Event</TableCell>
                      <TableCell>Time</TableCell>
                      <TableCell>Confidence</TableCell>
                      <TableCell>Facility</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {reviewItems.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell sx={{ fontWeight: 900, color: '#1E1B4B' }}>{event.user.full_name}</TableCell>
                        <TableCell>
                          <Chip label={EVENT_LABELS[event.event_type] || event.event_type} size="small" sx={{ fontWeight: 900 }} />
                        </TableCell>
                        <TableCell>{formatDateTime(event.event_time)}</TableCell>
                        <TableCell>
                          {event.confidence != null ? (
                            <Chip
                              label={`${Math.round(event.confidence * 100)}%`}
                              size="small"
                              sx={{ bgcolor: '#FEF3C7', color: '#B45309', fontWeight: 900 }}
                            />
                          ) : '-'}
                        </TableCell>
                        <TableCell>{event.facility?.name || '-'}</TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                            <Button
                              size="small"
                              variant="contained"
                              onClick={() => { setReviewDialog(event); setReviewRemark('') }}
                              sx={{ fontWeight: 900, background: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)', borderRadius: '10px' }}
                            >
                              Review
                            </Button>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}

        {tab === 1 && (
          <Box sx={{ p: 3 }}>
            <TableContainer className="list-scroll-panel">
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Employee</TableCell>
                    <TableCell>Facility</TableCell>
                    <TableCell>Employee Code</TableCell>
                    <TableCell>Face Status</TableCell>
                    <TableCell>Samples</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {profiles.map((profile: AttendanceProfile) => {
                    const status = FACE_STATUS[profile.face_status] || FACE_STATUS.not_enrolled
                    return (
                      <TableRow key={`${profile.user_id}-${profile.id}`}>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Avatar src={resolveUploadUrl(profile.user.avatar_url)}>{profile.user.full_name.charAt(0)}</Avatar>
                            <Box>
                              <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>{profile.user.full_name}</Typography>
                              <Typography sx={{ color: '#8B95A7', fontSize: 13 }}>{profile.user.email}</Typography>
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell>{profile.facility?.name || '-'}</TableCell>
                        <TableCell>{profile.employee_code || profile.user_id}</TableCell>
                        <TableCell>
                          <Chip label={status.label} size="small" sx={{ bgcolor: status.bg, color: status.color, fontWeight: 900 }} />
                        </TableCell>
                        <TableCell>{profile.face_samples_count}</TableCell>
                      </TableRow>
                    )
                  })}
                  {profilesQ.isLoading && <TableRow><TableCell colSpan={5}><CircularProgress size={22} /></TableCell></TableRow>}
                  {!profilesQ.isLoading && profiles.length === 0 && (
                    <TableRow><TableCell colSpan={5}>No employees found</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {tab === 2 && (
          <Box sx={{ p: 3 }}>
            <TableContainer className="list-scroll-panel">
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Employee</TableCell>
                    <TableCell>Event</TableCell>
                    <TableCell>Time</TableCell>
                    <TableCell>Source</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Confidence</TableCell>
                    <TableCell>Remark</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {events.map((event: AttendanceEvent) => {
                    const vs = VERIFICATION_CHIP[event.verification_status] || { label: event.verification_status, bg: '#F3F4F6', color: '#374151' }
                    return (
                      <TableRow key={event.id}>
                        <TableCell sx={{ fontWeight: 900, color: '#1E1B4B' }}>{event.user.full_name}</TableCell>
                        <TableCell>
                          <Chip label={EVENT_LABELS[event.event_type] || event.event_type} size="small" sx={{ fontWeight: 900 }} />
                        </TableCell>
                        <TableCell>{formatDateTime(event.event_time)}</TableCell>
                        <TableCell sx={{ textTransform: 'capitalize' }}>{event.source}</TableCell>
                        <TableCell>
                          <Chip label={vs.label} size="small" sx={{ bgcolor: vs.bg, color: vs.color, fontWeight: 900 }} />
                        </TableCell>
                        <TableCell>{event.confidence != null ? `${Math.round(event.confidence * 100)}%` : '-'}</TableCell>
                        <TableCell>{event.remark || '-'}</TableCell>
                      </TableRow>
                    )
                  })}
                  {eventsQ.isLoading && <TableRow><TableCell colSpan={7}><CircularProgress size={22} /></TableCell></TableRow>}
                  {!eventsQ.isLoading && events.length === 0 && (
                    <TableRow><TableCell colSpan={7}>No events for selected date</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </Card>

      <Dialog open={Boolean(reviewDialog)} onClose={() => { setReviewDialog(null); setReviewRemark('') }} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '22px' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>Review Attendance Event</DialogTitle>
        <DialogContent dividers sx={{ display: 'grid', gap: 2 }}>
          {reviewDialog && (
            <>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <BadgeIcon sx={{ color: '#7C3AED' }} />
                <Box>
                  <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>{reviewDialog.user.full_name}</Typography>
                  <Typography sx={{ color: '#6B7280', fontSize: 13 }}>
                    {EVENT_LABELS[reviewDialog.event_type]} · {formatDateTime(reviewDialog.event_time)} · Confidence {reviewDialog.confidence != null ? `${Math.round(reviewDialog.confidence * 100)}%` : 'N/A'}
                  </Typography>
                </Box>
              </Box>
              <TextField
                label="Remark (optional)"
                value={reviewRemark}
                onChange={(e) => setReviewRemark(e.target.value)}
                multiline
                rows={2}
                placeholder="Add a note about this decision..."
              />
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          <Button onClick={() => { setReviewDialog(null); setReviewRemark('') }} sx={{ fontWeight: 900 }}>Cancel</Button>
          <Button
            variant="outlined"
            color="error"
            disabled={reviewMut.isPending}
            onClick={() => reviewDialog && reviewMut.mutate({ id: reviewDialog.id, status: 'rejected' })}
            sx={{ fontWeight: 900, borderRadius: '12px' }}
          >
            Reject
          </Button>
          <Button
            variant="contained"
            disabled={reviewMut.isPending}
            onClick={() => reviewDialog && reviewMut.mutate({ id: reviewDialog.id, status: 'verified' })}
            sx={{ fontWeight: 900, borderRadius: '12px', background: 'linear-gradient(135deg, #7C3AED 0%, #059669 100%)' }}
          >
            Verify
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default HR
