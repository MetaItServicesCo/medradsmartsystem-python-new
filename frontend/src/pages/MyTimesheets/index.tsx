import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Avatar, Box, Button, Card, CardContent, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, Paper, Tab, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Tabs, TextField,
  Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import SendIcon from '@mui/icons-material/Send'
import TimerIcon from '@mui/icons-material/Timer'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty'
import CancelIcon from '@mui/icons-material/Cancel'
import { toast } from 'react-toastify'
import { useAuthStore } from '@/stores/authStore'
import {
  fetchMyTimesheets, createMyTimesheet, updateMyTimesheet,
  deleteMyTimesheet, submitMyTimesheet,
} from '@/api/hr'

const STATUS_META: Record<string, { label: string; color: 'default' | 'warning' | 'info' | 'success' | 'error'; icon: React.ReactNode }> = {
  draft:     { label: 'Draft',     color: 'default',  icon: <EditIcon fontSize="small" /> },
  submitted: { label: 'Submitted', color: 'info',     icon: <HourglassEmptyIcon fontSize="small" /> },
  approved:  { label: 'Approved',  color: 'success',  icon: <CheckCircleIcon fontSize="small" /> },
  rejected:  { label: 'Rejected',  color: 'error',    icon: <CancelIcon fontSize="small" /> },
}

const EMPTY_FORM = { work_date: new Date().toISOString().slice(0, 10), task_title: '', project: '', hours: '', description: '' }

export default function MyTimesheets() {
  const user = useAuthStore(s => s.user)
  const qc = useQueryClient()

  const [tab, setTab] = useState(0)
  const [dlg, setDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const [form, setForm] = useState<any>(EMPTY_FORM)

  const statusFilter = ['', 'draft', 'submitted', 'approved', 'rejected'][tab] || undefined

  const { data: raw, isLoading } = useQuery({
    queryKey: ['my-timesheets', statusFilter],
    queryFn: () => fetchMyTimesheets(statusFilter ? { status: statusFilter } : undefined),
  })
  const items: any[] = Array.isArray(raw) ? raw : raw?.items ?? []

  const openAdd = () => { setForm(EMPTY_FORM); setDlg({ open: true }) }
  const openEdit = (item: any) => {
    setForm({
      work_date: item.work_date,
      task_title: item.task_title ?? '',
      project: item.project ?? '',
      hours: item.hours,
      description: item.description ?? '',
    })
    setDlg({ open: true, item })
  }
  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }))

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['my-timesheets'] })
  }

  const saveMut = useMutation({
    mutationFn: (d: any) =>
      dlg.item ? updateMyTimesheet(dlg.item.id, d) : createMyTimesheet(d),
    onSuccess: () => { invalidate(); toast.success('Saved'); setDlg({ open: false }) },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Error saving'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteMyTimesheet,
    onSuccess: () => { invalidate(); toast.success('Deleted') },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Cannot delete'),
  })

  const submitMut = useMutation({
    mutationFn: submitMyTimesheet,
    onSuccess: () => { invalidate(); toast.success('Submitted for HR review') },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Error'),
  })

  const totalHours = items.reduce((s: number, i: any) => s + (i.hours ?? 0), 0)
  const approved = items.filter(i => i.status === 'approved').length
  const pending = items.filter(i => i.status === 'submitted').length

  return (
    <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Avatar sx={{ background: 'linear-gradient(135deg,#7161D8,#F05D92)', width: 48, height: 48 }}>
          <TimerIcon />
        </Avatar>
        <Box>
          <Typography variant="h5" fontWeight={800}>My Timesheets</Typography>
          <Typography variant="body2" color="text.secondary">
            Log your daily work — HR reviews and approves each submission
          </Typography>
        </Box>
        <Box sx={{ ml: 'auto' }}>
          <Button startIcon={<AddIcon />} variant="contained" onClick={openAdd}>
            Log Time
          </Button>
        </Box>
      </Box>

      {/* KPI cards */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Entries', value: items.length, color: '#7161D8' },
          { label: 'Total Hours', value: `${totalHours.toFixed(1)}h`, color: '#F05D92' },
          { label: 'Approved', value: approved, color: '#22c55e' },
          { label: 'Pending Review', value: pending, color: '#f59e0b' },
        ].map(k => (
          <Card key={k.label} sx={{ flex: 1, minWidth: 140 }}>
            <CardContent sx={{ py: '12px !important' }}>
              <Typography variant="caption" color="text.secondary">{k.label}</Typography>
              <Typography variant="h5" fontWeight={800} sx={{ color: k.color }}>{k.value}</Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* Tabs */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="All" />
        <Tab label="Drafts" />
        <Tab label="Submitted" />
        <Tab label="Approved" />
        <Tab label="Rejected" />
      </Tabs>

      {/* Table */}
      {isLoading ? (
        <Typography color="text.secondary">Loading…</Typography>
      ) : items.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
          <TimerIcon sx={{ fontSize: 48, mb: 1, opacity: 0.3 }} />
          <Typography>No entries yet. Click "Log Time" to add your first timesheet.</Typography>
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {['Date', 'Task', 'Project', 'Hours', 'Status', 'HR Notes', ''].map(h => (
                  <TableCell key={h} sx={{ bgcolor: 'primary.main', color: 'white', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item: any) => {
                const meta = STATUS_META[item.status] ?? STATUS_META.draft
                const isDraft = item.status === 'draft'
                const isRejected = item.status === 'rejected'
                return (
                  <TableRow key={item.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {new Date(item.work_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{item.task_title}</Typography>
                    </TableCell>
                    <TableCell>
                      {item.project
                        ? <Chip size="small" label={item.project} variant="outlined" sx={{ borderColor: 'primary.main', color: 'primary.main' }} />
                        : <Typography variant="caption" color="text.disabled">—</Typography>}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={700}>{item.hours}h</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" icon={meta.icon as any} label={meta.label} color={meta.color} />
                    </TableCell>
                    <TableCell>
                      {item.review_notes
                        ? <Tooltip title={item.review_notes}><Typography variant="caption" sx={{ maxWidth: 160, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.review_notes}</Typography></Tooltip>
                        : <Typography variant="caption" color="text.disabled">—</Typography>}
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                        {isDraft && (
                          <>
                            <Tooltip title="Edit">
                              <IconButton size="small" sx={{ color: 'warning.main' }} onClick={() => openEdit(item)}>
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Submit for Review">
                              <IconButton size="small" sx={{ color: 'primary.main' }} onClick={() => submitMut.mutate(item.id)}>
                                <SendIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete">
                              <IconButton size="small" sx={{ color: 'error.main' }} onClick={() => deleteMut.mutate(item.id)}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                        {isRejected && (
                          <>
                            <Tooltip title="Edit & Resubmit">
                              <IconButton size="small" sx={{ color: 'warning.main' }} onClick={() => openEdit(item)}>
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete">
                              <IconButton size="small" sx={{ color: 'error.main' }} onClick={() => deleteMut.mutate(item.id)}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dlg.open} onClose={() => setDlg({ open: false })} maxWidth="sm" fullWidth>
        <DialogTitle>{dlg.item ? 'Edit Timesheet Entry' : 'Log Time'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            label="Date" type="date" size="small" fullWidth
            value={form.work_date} InputLabelProps={{ shrink: true }}
            onChange={e => set('work_date', e.target.value)}
          />
          <TextField
            label="Task Title" size="small" fullWidth required
            value={form.task_title} placeholder="e.g. Dashboard UI redesign"
            onChange={e => set('task_title', e.target.value)}
          />
          <TextField
            label="Project / Category" size="small" fullWidth
            value={form.project} placeholder="e.g. HR Module"
            onChange={e => set('project', e.target.value)}
          />
          <TextField
            label="Hours Worked" type="number" size="small" fullWidth required
            value={form.hours} inputProps={{ min: 0.25, max: 24, step: 0.25 }}
            onChange={e => set('hours', e.target.value)}
          />
          <TextField
            label="Description / Notes" size="small" fullWidth multiline rows={3}
            value={form.description} placeholder="What did you work on?"
            onChange={e => set('description', e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDlg({ open: false })}>Cancel</Button>
          <Button
            variant="contained"
            disabled={saveMut.isPending || !form.task_title || !form.hours}
            onClick={() => saveMut.mutate({ ...form, hours: Number(form.hours) })}
          >
            Save as Draft
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
