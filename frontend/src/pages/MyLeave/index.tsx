import { useState, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControl, IconButton, InputLabel,
  MenuItem, Paper, Select, Tab, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Tabs, TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import BeachAccessIcon from '@mui/icons-material/BeachAccess'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty'
import CancelIcon from '@mui/icons-material/Cancel'
import EventBusyIcon from '@mui/icons-material/EventBusy'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { toast } from 'react-toastify'
import { fetchLeaveRequests, createLeaveRequest, deleteLeaveRequest, fetchLeaveTypes } from '@/api/hr'

const STATUS_META: Record<string, { label: string; color: 'default' | 'warning' | 'success' | 'error' | 'info'; icon: React.ReactNode }> = {
  pending:   { label: 'Pending',   color: 'warning', icon: <HourglassEmptyIcon fontSize="small" /> },
  approved:  { label: 'Approved',  color: 'success', icon: <CheckCircleIcon fontSize="small" /> },
  rejected:  { label: 'Rejected',  color: 'error',   icon: <CancelIcon fontSize="small" /> },
  cancelled: { label: 'Cancelled', color: 'default', icon: <EventBusyIcon fontSize="small" /> },
}

const fmt = (d?: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

const EMPTY_FORM = { leave_type_id: '', start_date: '', end_date: '', reason: '' }

function KpiCard({ label, value, icon, gradient }: { label: string; value: number; icon: React.ReactNode; gradient: string }) {
  return (
    <Card sx={{ flex: 1, minWidth: 130, background: gradient, color: '#fff', borderRadius: 3 }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: '12px !important' }}>
        <Box sx={{ opacity: 0.85, fontSize: 28 }}>{icon}</Box>
        <Box>
          <Typography variant="h5" fontWeight={800} lineHeight={1}>{value}</Typography>
          <Typography variant="caption" sx={{ opacity: 0.9 }}>{label}</Typography>
        </Box>
      </CardContent>
    </Card>
  )
}

function LeaveCalendar({ approvedLeaves }: { approvedLeaves: any[] }) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())

  const leaveDates = useMemo(() => {
    const set = new Set<string>()
    for (const l of approvedLeaves) {
      const start = new Date(l.start_date + 'T00:00:00')
      const end   = new Date(l.end_date   + 'T00:00:00')
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        set.add(d.toISOString().slice(0, 10))
      }
    }
    return set
  }, [approvedLeaves])

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthName = new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' })

  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  const prev = () => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const next = () => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }

  return (
    <Paper sx={{ p: 2, borderRadius: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
        <IconButton size="small" onClick={prev}><ChevronLeftIcon /></IconButton>
        <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1, textAlign: 'center' }}>{monthName}</Typography>
        <IconButton size="small" onClick={next}><ChevronRightIcon /></IconButton>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5 }}>
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <Typography key={d} variant="caption" align="center" fontWeight={700} color="text.secondary">{d}</Typography>
        ))}
        {cells.map((day, i) => {
          if (!day) return <Box key={i} />
          const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const isLeave = leaveDates.has(key)
          const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day
          return (
            <Box key={i} sx={{
              height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 1,
              bgcolor: isLeave ? 'success.main' : isToday ? 'primary.light' : 'transparent',
              color: isLeave || isToday ? '#fff' : 'text.primary',
              fontWeight: isToday ? 700 : 400,
              fontSize: 13,
            }}>
              {day}
            </Box>
          )
        })}
      </Box>
      {leaveDates.size > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1.5 }}>
          <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: 'success.main' }} />
          <Typography variant="caption" color="text.secondary">Approved leave</Typography>
        </Box>
      )}
    </Paper>
  )
}

export default function MyLeave() {
  const qc = useQueryClient()
  const [tab, setTab] = useState(0)
  const [dlg, setDlg] = useState(false)
  const [form, setForm] = useState<any>(EMPTY_FORM)
  const [cancelId, setCancelId] = useState<number | null>(null)

  const statusFilter = (['', 'pending', 'approved', 'rejected', 'cancelled'] as const)[tab] || undefined

  const { data: raw } = useQuery({
    queryKey: ['my-leave-requests', statusFilter],
    queryFn: () => fetchLeaveRequests(statusFilter ? { status: statusFilter } : undefined),
  })
  const { data: leaveTypesRaw } = useQuery({ queryKey: ['leave-types'], queryFn: fetchLeaveTypes })
  const { data: approvedRaw } = useQuery({
    queryKey: ['my-leave-requests', 'approved'],
    queryFn: () => fetchLeaveRequests({ status: 'approved' }),
  })

  const items: any[]       = Array.isArray(raw) ? raw : raw?.items ?? []
  const leaveTypes: any[]  = Array.isArray(leaveTypesRaw) ? leaveTypesRaw : leaveTypesRaw?.items ?? []
  const approved: any[]    = Array.isArray(approvedRaw) ? approvedRaw : approvedRaw?.items ?? []

  const counts = useMemo(() => {
    const allItems: any[] = Array.isArray(raw) ? raw : raw?.items ?? []
    return {
      total:    allItems.length,
      pending:  allItems.filter(r => r.status === 'pending').length,
      approved: allItems.filter(r => r.status === 'approved').length,
      rejected: allItems.filter(r => r.status === 'rejected').length,
    }
  }, [raw])

  const createMut = useMutation({
    mutationFn: createLeaveRequest,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-leave-requests'] })
      toast.success('Leave request submitted')
      setDlg(false)
      setForm(EMPTY_FORM)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Failed to submit'),
  })

  const cancelMut = useMutation({
    mutationFn: deleteLeaveRequest,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-leave-requests'] })
      toast.success('Request cancelled')
      setCancelId(null)
    },
  })

  const handleSubmit = () => {
    if (!form.leave_type_id || !form.start_date || !form.end_date) {
      toast.error('Leave type, start date, and end date are required')
      return
    }
    if (new Date(form.end_date) < new Date(form.start_date)) {
      toast.error('End date cannot be before start date')
      return
    }
    createMut.mutate({ leave_type_id: Number(form.leave_type_id), start_date: form.start_date, end_date: form.end_date, reason: form.reason || undefined })
  }

  const f = (k: string) => (e: any) => setForm((p: any) => ({ ...p, [k]: e.target.value }))

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <BeachAccessIcon sx={{ color: 'primary.main', fontSize: 28 }} />
          <Typography variant="h5" fontWeight={800}>My Leave</Typography>
        </Box>
        <Button startIcon={<AddIcon />} variant="contained" onClick={() => setDlg(true)}>Apply for Leave</Button>
      </Box>

      {/* KPI Cards */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <KpiCard label="Total Requests" value={counts.total} icon={<BeachAccessIcon />} gradient="linear-gradient(135deg,#7161D8,#9B8EE8)" />
        <KpiCard label="Pending"        value={counts.pending}  icon={<HourglassEmptyIcon />} gradient="linear-gradient(135deg,#f57c00,#ffa726)" />
        <KpiCard label="Approved"       value={counts.approved} icon={<CheckCircleIcon />}     gradient="linear-gradient(135deg,#2e7d32,#43a047)" />
        <KpiCard label="Rejected"       value={counts.rejected} icon={<CancelIcon />}          gradient="linear-gradient(135deg,#c62828,#e53935)" />
      </Box>

      <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Table side */}
        <Box sx={{ flex: 1, minWidth: 480 }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
            <Tab label="All" />
            <Tab label="Pending" />
            <Tab label="Approved" />
            <Tab label="Rejected" />
            <Tab label="Cancelled" />
          </Tabs>

          <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Type', 'From', 'To', 'Days', 'Status', 'HR Note', ''].map(h => (
                    <TableCell key={h} sx={{ fontWeight: 700, bgcolor: 'grey.50', fontSize: 12 }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                      No leave requests yet. Click "Apply for Leave" to get started.
                    </TableCell>
                  </TableRow>
                ) : items.map((r: any) => {
                  const meta = STATUS_META[r.status] ?? STATUS_META.pending
                  return (
                    <TableRow key={r.id} hover>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: r.leave_type?.color ?? '#7161D8', flexShrink: 0 }} />
                          <Typography variant="body2" fontWeight={500}>{r.leave_type?.name ?? '—'}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell><Typography variant="body2">{fmt(r.start_date)}</Typography></TableCell>
                      <TableCell><Typography variant="body2">{fmt(r.end_date)}</Typography></TableCell>
                      <TableCell><Typography variant="body2" fontWeight={600}>{r.total_days}</Typography></TableCell>
                      <TableCell>
                        <Chip size="small" label={meta.label} color={meta.color} icon={meta.icon as any} sx={{ fontWeight: 600 }} />
                      </TableCell>
                      <TableCell>
                        {r.comments
                          ? <Tooltip title={r.comments}><Typography variant="caption" color="text.secondary" sx={{ maxWidth: 140, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.comments}</Typography></Tooltip>
                          : <Typography variant="caption" color="text.disabled">—</Typography>}
                      </TableCell>
                      <TableCell>
                        {r.status === 'pending' && (
                          <Tooltip title="Cancel request">
                            <IconButton size="small" color="error" onClick={() => setCancelId(r.id)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        {/* Calendar side */}
        <Box sx={{ width: 280, flexShrink: 0 }}>
          <Typography variant="subtitle2" fontWeight={700} gutterBottom>Approved Leave Calendar</Typography>
          <LeaveCalendar approvedLeaves={approved} />
        </Box>
      </Box>

      {/* Apply Dialog */}
      <Dialog open={dlg} onClose={() => setDlg(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Apply for Leave</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <FormControl size="small" fullWidth required>
            <InputLabel>Leave Type</InputLabel>
            <Select value={form.leave_type_id} label="Leave Type" onChange={f('leave_type_id')}>
              {leaveTypes.filter((t: any) => t.is_active !== false).map((t: any) => (
                <MenuItem key={t.id} value={t.id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: t.color ?? '#7161D8' }} />
                    {t.name} {t.max_days_per_year > 0 ? `(max ${t.max_days_per_year}d/yr)` : ''}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField label="Start Date" type="date" size="small" fullWidth required InputLabelProps={{ shrink: true }}
            value={form.start_date} onChange={f('start_date')} />
          <TextField label="End Date" type="date" size="small" fullWidth required InputLabelProps={{ shrink: true }}
            value={form.end_date} onChange={f('end_date')}
            inputProps={{ min: form.start_date }}
          />
          {form.start_date && form.end_date && new Date(form.end_date) >= new Date(form.start_date) && (
            <Alert severity="info" sx={{ py: 0.5 }}>
              {Math.max(1, Math.round((new Date(form.end_date).getTime() - new Date(form.start_date).getTime()) / 86400000) + 1)} day(s) requested
            </Alert>
          )}
          <TextField label="Reason (optional)" multiline rows={3} size="small" fullWidth
            value={form.reason} onChange={f('reason')} placeholder="Describe the reason for your leave..." />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDlg(false); setForm(EMPTY_FORM) }}>Cancel</Button>
          <Button variant="contained" onClick={handleSubmit} disabled={createMut.isPending}>Submit Request</Button>
        </DialogActions>
      </Dialog>

      {/* Cancel confirm dialog */}
      <Dialog open={cancelId !== null} onClose={() => setCancelId(null)} maxWidth="xs">
        <DialogTitle>Cancel Leave Request?</DialogTitle>
        <DialogContent>
          <Typography>This will remove your pending leave request. This cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelId(null)}>Keep it</Button>
          <Button color="error" variant="contained" onClick={() => cancelMut.mutate(cancelId!)} disabled={cancelMut.isPending}>
            Cancel Request
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
