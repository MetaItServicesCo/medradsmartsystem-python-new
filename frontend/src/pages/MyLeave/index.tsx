import { useState, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControl, IconButton, InputLabel,
  ListItemIcon, Menu, MenuItem, Paper, Select, Tab, Table, TableBody, TableCell,
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
import MoreVertIcon from '@mui/icons-material/MoreVert'
import { toast } from 'react-toastify'
import { fetchLeaveRequests, createLeaveRequest, deleteLeaveRequest, fetchLeaveTypes } from '@/api/hr'

const STATUS_META: Record<string, { label: string; color: 'default' | 'warning' | 'success' | 'error' | 'info'; icon: React.ReactNode }> = {
  pending:   { label: 'Pending',   color: 'warning', icon: <HourglassEmptyIcon fontSize="small" /> },
  approved:  { label: 'Approved',  color: 'success', icon: <CheckCircleIcon fontSize="small" /> },
  rejected:  { label: 'Rejected',  color: 'error',   icon: <CancelIcon fontSize="small" /> },
  cancelled: { label: 'Cancelled', color: 'default', icon: <EventBusyIcon fontSize="small" /> },
}

const CUSTOM_VALUE = '__custom__'
const fmt = (d?: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
const EMPTY_FORM = { leave_type_id: '', custom_leave_name: '', start_date: '', end_date: '', reason: '' }

const ACTION_MENU_PAPER = {
  elevation: 12,
  sx: {
    minWidth: 190,
    borderRadius: '18px',
    border: '1px solid rgba(124,58,237,0.14)',
    boxShadow: '0 24px 60px rgba(30,27,75,0.18)',
    overflow: 'hidden',
  },
}

const ACTION_MENU_ITEM = {
  gap: 1,
  px: 2,
  py: 1.2,
  fontWeight: 800,
  color: '#1E1B4B',
  '& .MuiListItemIcon-root': { minWidth: 30, color: 'inherit' },
}

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
  const [actionAnchor, setActionAnchor] = useState<HTMLElement | null>(null)
  const [actionItem, setActionItem] = useState<any | null>(null)

  const statusFilter = (['', 'pending', 'approved', 'rejected', 'cancelled'] as const)[tab] || undefined

  // Unfiltered — for KPI counts only
  const { data: allRaw } = useQuery({
    queryKey: ['my-leave-requests', 'all'],
    queryFn: () => fetchLeaveRequests(),
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
  const allItems: any[] = Array.isArray(allRaw) ? allRaw : (allRaw as any)?.items ?? []

  // Filtered — for the table
  const { data: raw } = useQuery({
    queryKey: ['my-leave-requests', statusFilter ?? ''],
    queryFn: () => fetchLeaveRequests(statusFilter ? { status: statusFilter } : undefined),
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
  const items: any[] = Array.isArray(raw) ? raw : (raw as any)?.items ?? []

  const { data: leaveTypesRaw } = useQuery({ queryKey: ['leave-types'], queryFn: fetchLeaveTypes })
  const leaveTypes: any[] = Array.isArray(leaveTypesRaw) ? leaveTypesRaw : (leaveTypesRaw as any)?.items ?? []
  const activeTypes = leaveTypes.filter((t: any) => t.is_active !== false)

  const { data: approvedRaw } = useQuery({
    queryKey: ['my-leave-requests', 'approved'],
    queryFn: () => fetchLeaveRequests({ status: 'approved' }),
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
  const approved: any[] = Array.isArray(approvedRaw) ? approvedRaw : (approvedRaw as any)?.items ?? []

  const counts = useMemo(() => ({
    total:    allItems.length,
    pending:  allItems.filter((r: any) => r.status === 'pending').length,
    approved: allItems.filter((r: any) => r.status === 'approved').length,
    rejected: allItems.filter((r: any) => r.status === 'rejected').length,
  }), [allItems])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['my-leave-requests'] })

  const createMut = useMutation({
    mutationFn: createLeaveRequest,
    onSuccess: () => {
      invalidate()
      toast.success('Leave request submitted')
      setDlg(false)
      setForm(EMPTY_FORM)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Failed to submit'),
  })

  const cancelMut = useMutation({
    mutationFn: deleteLeaveRequest,
    onSuccess: () => {
      invalidate()
      toast.success('Request cancelled')
      setCancelId(null)
    },
  })

  const isCustom = form.leave_type_id === CUSTOM_VALUE

  const handleSubmit = () => {
    if (!form.leave_type_id || !form.start_date || !form.end_date) {
      toast.error('Leave type, start date, and end date are required')
      return
    }
    if (isCustom && !form.custom_leave_name.trim()) {
      toast.error('Please enter a name for your custom leave')
      return
    }
    if (new Date(form.end_date) < new Date(form.start_date)) {
      toast.error('End date cannot be before start date')
      return
    }
    const reason = isCustom
      ? `${form.custom_leave_name.trim()}${form.reason ? ': ' + form.reason : ''}`
      : (form.reason || undefined)
    createMut.mutate({
      leave_type_id: isCustom ? null : Number(form.leave_type_id),
      start_date: form.start_date,
      end_date: form.end_date,
      reason,
    } as any)
  }

  const f = (k: string) => (e: any) => setForm((p: any) => ({ ...p, [k]: e.target.value }))
  const openActions = (event: React.MouseEvent<HTMLElement>, item: any) => {
    event.stopPropagation()
    setActionAnchor(event.currentTarget)
    setActionItem(item)
  }
  const closeActions = () => {
    setActionAnchor(null)
    setActionItem(null)
  }

  const dayCount = form.start_date && form.end_date && new Date(form.end_date) >= new Date(form.start_date)
    ? Math.round((new Date(form.end_date).getTime() - new Date(form.start_date).getTime()) / 86400000) + 1
    : 0

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

      {/* KPI Cards — always from unfiltered dataset */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <KpiCard label="Total Requests" value={counts.total}    icon={<BeachAccessIcon />}      gradient="linear-gradient(135deg,#7161D8,#9B8EE8)" />
        <KpiCard label="Pending"        value={counts.pending}  icon={<HourglassEmptyIcon />}   gradient="linear-gradient(135deg,#f57c00,#ffa726)" />
        <KpiCard label="Approved"       value={counts.approved} icon={<CheckCircleIcon />}       gradient="linear-gradient(135deg,#2e7d32,#43a047)" />
        <KpiCard label="Rejected"       value={counts.rejected} icon={<CancelIcon />}            gradient="linear-gradient(135deg,#c62828,#e53935)" />
      </Box>

      {/* Available leave types banner */}
      {activeTypes.length > 0 && (
        <Paper sx={{ p: 2, mb: 3, borderRadius: 2, bgcolor: 'grey.50' }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Leave Types Offered by HR
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {activeTypes.map((t: any) => (
              <Chip
                key={t.id}
                size="small"
                label={`${t.name}${t.max_days_per_year > 0 ? ` · ${t.max_days_per_year}d/yr` : ''}${t.is_paid ? ' · Paid' : ' · Unpaid'}`}
                sx={{ bgcolor: t.color ? `${t.color}22` : 'primary.50', color: t.color ?? 'primary.main', border: `1px solid ${t.color ?? '#7161D8'}44`, fontWeight: 600 }}
              />
            ))}
          </Box>
        </Paper>
      )}

      <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Table side */}
        <Box sx={{ flex: 1, minWidth: 480 }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
            <Tab label="All" />
            <Tab label={`Pending${counts.pending > 0 ? ` (${counts.pending})` : ''}`} />
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
                  const typeName = r.leave_type?.name ?? null
                  const isCustomLeave = !typeName
                  const displayName = typeName ?? (r.reason ? r.reason.split(':')[0] : 'Custom')
                  return (
                    <TableRow key={r.id} hover>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: r.leave_type?.color ?? (isCustomLeave ? '#6b7280' : '#7161D8'), flexShrink: 0 }} />
                          <Typography variant="body2" fontWeight={500} sx={{ color: isCustomLeave ? 'text.secondary' : 'text.primary', fontStyle: isCustomLeave ? 'italic' : 'normal' }}>
                            {displayName}
                          </Typography>
                          {isCustomLeave && <Chip size="small" label="Custom" sx={{ fontSize: 10, height: 16, ml: 0.5 }} />}
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
                          <Tooltip title="Actions">
                            <IconButton size="small" onClick={(event) => openActions(event, r)} sx={{ bgcolor: '#F4F1FF', color: '#7C3AED', '&:hover': { bgcolor: '#EDE9FE' } }}>
                              <MoreVertIcon fontSize="small" />
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

      <Menu anchorEl={actionAnchor} open={Boolean(actionAnchor)} onClose={closeActions} PaperProps={ACTION_MENU_PAPER}>
        {actionItem?.status === 'pending' && (
          <MenuItem
            sx={{ ...ACTION_MENU_ITEM, color: '#DC2626' }}
            onClick={() => {
              const item = actionItem
              closeActions()
              if (item) setCancelId(item.id)
            }}
          >
            <ListItemIcon><DeleteIcon fontSize="small" /></ListItemIcon>
            Cancel Request
          </MenuItem>
        )}
      </Menu>

      {/* Apply Dialog */}
      <Dialog open={dlg} onClose={() => { setDlg(false); setForm(EMPTY_FORM) }} maxWidth="xs" fullWidth>
        <DialogTitle>Apply for Leave</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <FormControl size="small" fullWidth required>
            <InputLabel>Leave Type</InputLabel>
            <Select value={form.leave_type_id} label="Leave Type" onChange={f('leave_type_id')}>
              {activeTypes.map((t: any) => (
                <MenuItem key={t.id} value={t.id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: t.color ?? '#7161D8', flexShrink: 0 }} />
                    {t.name} {t.max_days_per_year > 0 ? `(max ${t.max_days_per_year}d/yr)` : ''}
                    {!t.is_paid && <Chip size="small" label="Unpaid" sx={{ ml: 0.5, fontSize: 10, height: 16 }} />}
                  </Box>
                </MenuItem>
              ))}
              <MenuItem value={CUSTOM_VALUE}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#6b7280', flexShrink: 0 }} />
                  Other / Custom
                </Box>
              </MenuItem>
            </Select>
          </FormControl>

          {isCustom && (
            <TextField
              label="Leave Name" size="small" fullWidth required
              value={form.custom_leave_name}
              onChange={f('custom_leave_name')}
              placeholder="e.g. Personal errand, Family emergency…"
            />
          )}

          <TextField label="Start Date" type="date" size="small" fullWidth required InputLabelProps={{ shrink: true }}
            value={form.start_date} onChange={f('start_date')} />
          <TextField label="End Date" type="date" size="small" fullWidth required InputLabelProps={{ shrink: true }}
            value={form.end_date} onChange={f('end_date')}
            inputProps={{ min: form.start_date }}
          />

          {dayCount > 0 && (
            <Alert severity="info" sx={{ py: 0.5 }}>
              {dayCount} day{dayCount !== 1 ? 's' : ''} requested
            </Alert>
          )}

          <TextField
            label={isCustom ? 'Reason (required for custom leave)' : 'Reason (optional)'}
            multiline rows={3} size="small" fullWidth
            value={form.reason} onChange={f('reason')}
            placeholder="Describe the reason for your leave…"
          />
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
