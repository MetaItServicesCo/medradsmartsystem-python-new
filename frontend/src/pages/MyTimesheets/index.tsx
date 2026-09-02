import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, Paper, Tab, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Tabs, TextField,
  ListItemIcon, Menu, MenuItem,
  Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import SendIcon from '@mui/icons-material/Send'
import SaveIcon from '@mui/icons-material/Save'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import TimerIcon from '@mui/icons-material/Timer'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty'
import CancelIcon from '@mui/icons-material/Cancel'
import { toast } from 'react-toastify'
import {
  fetchMyTimesheets, createMyTimesheet, updateMyTimesheet,
  deleteMyTimesheet, submitMyTimesheet,
} from '@/api/hr'
import ContextTableRow from '@/components/ContextTableRow'

const STATUS_META: Record<string, { label: string; color: 'default' | 'warning' | 'info' | 'success' | 'error'; icon: React.ReactNode }> = {
  draft:     { label: 'Draft',     color: 'default', icon: <EditIcon fontSize="small" /> },
  submitted: { label: 'Submitted', color: 'info',    icon: <HourglassEmptyIcon fontSize="small" /> },
  approved:  { label: 'Approved',  color: 'success', icon: <CheckCircleIcon fontSize="small" /> },
  rejected:  { label: 'Rejected',  color: 'error',   icon: <CancelIcon fontSize="small" /> },
}

const TABS = ['all', 'draft', 'submitted', 'approved', 'rejected'] as const
const EMPTY_FORM = { work_date: new Date().toISOString().slice(0, 10), task_title: '', project: '', hours: '', description: '' }

const ACTION_MENU_PAPER = {
  elevation: 12,
  sx: {
    minWidth: 210,
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

export default function MyTimesheets() {
  const qc = useQueryClient()
  const [tab, setTab]   = useState(0)
  const [dlg, setDlg]   = useState<{ open: boolean; item?: any }>({ open: false })
  const [form, setForm] = useState<any>(EMPTY_FORM)
  const [actionAnchor, setActionAnchor] = useState<HTMLElement | null>(null)
  const [actionItem, setActionItem] = useState<any | null>(null)

  const statusFilter = TABS[tab] === 'all' ? undefined : TABS[tab]

  // Always fetch ALL entries for KPI counts (separate from the filtered view)
  const { data: allRaw } = useQuery({
    queryKey: ['my-timesheets-all'],
    queryFn: () => fetchMyTimesheets(),
    staleTime: 0,
  })
  const allItems: any[] = Array.isArray(allRaw) ? allRaw : (allRaw as any)?.items ?? []

  // Fetch filtered entries for the table
  const { data: raw, isLoading } = useQuery({
    queryKey: ['my-timesheets', statusFilter ?? 'all'],
    queryFn: () => fetchMyTimesheets(statusFilter ? { status: statusFilter } : undefined),
    staleTime: 0,
  })
  const items: any[] = Array.isArray(raw) ? raw : (raw as any)?.items ?? []

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['my-timesheets'] })
    qc.invalidateQueries({ queryKey: ['my-timesheets-all'] })
  }

  const openAdd  = () => { setForm(EMPTY_FORM); setDlg({ open: true }) }
  const openEdit = (item: any) => {
    setForm({
      work_date:   item.work_date   ?? '',
      task_title:  item.task_title  ?? '',
      project:     item.project     ?? '',
      hours:       item.hours       ?? '',
      description: item.description ?? '',
    })
    setDlg({ open: true, item })
  }
  const closeDialog = () => { setDlg({ open: false }); setForm(EMPTY_FORM) }
  const openActions = (event: React.MouseEvent<HTMLElement>, item: any) => {
    event.stopPropagation()
    setActionAnchor(event.currentTarget)
    setActionItem(item)
  }
  const closeActions = () => {
    setActionAnchor(null)
    setActionItem(null)
  }
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p: any) => ({ ...p, [k]: e.target.value }))

  // Save as draft only
  const saveMut = useMutation({
    mutationFn: (d: any) => dlg.item ? updateMyTimesheet(dlg.item.id, d) : createMyTimesheet(d),
    onSuccess: () => { invalidate(); toast.success('Saved as draft'); closeDialog() },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Error saving'),
  })

  // Save then immediately submit (or just submit if already a draft being re-edited)
  const submitMut = useMutation({
    mutationFn: async (d: any) => {
      let id = dlg.item?.id
      if (dlg.item) {
        // editing a rejected draft — update then submit
        await updateMyTimesheet(id, d)
      } else {
        // new entry — create first, then submit
        const created = await createMyTimesheet(d)
        id = created.id
      }
      return submitMyTimesheet(id)
    },
    onSuccess: () => {
      invalidate()
      toast.success('Submitted for HR review')
      closeDialog()
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Submission failed'),
  })

  // Submit an existing draft from the table row
  const quickSubmitMut = useMutation({
    mutationFn: submitMyTimesheet,
    onSuccess: () => { invalidate(); toast.success('Submitted for HR review') },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Error'),
  })

  const deleteMut = useMutation({
    mutationFn: deleteMyTimesheet,
    onSuccess: () => { invalidate(); toast.success('Deleted') },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Cannot delete'),
  })

  const payload = { ...form, hours: Number(form.hours) }
  const canSubmit = !!form.task_title && !!form.hours
  const isPending = saveMut.isPending || submitMut.isPending

  // KPIs always from full dataset
  const totalHours  = allItems.reduce((s: number, i: any) => s + (Number(i.hours) || 0), 0)
  const approvedCnt = allItems.filter((i: any) => i.status === 'approved').length
  const pendingCnt  = allItems.filter((i: any) => i.status === 'submitted').length
  const draftCnt    = allItems.filter((i: any) => i.status === 'draft').length

  return (
    <Box sx={{ p: { xs: 1.5, sm: 3 }, maxWidth: 1100, mx: 'auto', minWidth: 0 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Box sx={{ width: 48, height: 48, borderRadius: 2, background: 'linear-gradient(135deg,#7161D8,#F05D92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <TimerIcon sx={{ color: '#fff', fontSize: 28 }} />
        </Box>
        <Box>
          <Typography variant="h5" fontWeight={800}>My Timesheets</Typography>
          <Typography variant="body2" color="text.secondary">Log your daily work — HR reviews and approves each submission</Typography>
        </Box>
        <Button startIcon={<AddIcon />} variant="contained" sx={{ ml: 'auto' }} onClick={openAdd}>
          Log Time
        </Button>
      </Box>

      {/* KPI cards — always from full dataset */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Hours',    value: `${totalHours.toFixed(1)}h`, color: '#7161D8' },
          { label: 'Drafts',         value: draftCnt,    color: '#6b7280' },
          { label: 'Pending Review', value: pendingCnt,  color: '#f59e0b' },
          { label: 'Approved',       value: approvedCnt, color: '#22c55e' },
        ].map(k => (
          <Card key={k.label} sx={{ flex: 1, minWidth: 130 }}>
            <CardContent sx={{ py: '12px !important' }}>
              <Typography variant="caption" color="text.secondary">{k.label}</Typography>
              <Typography variant="h5" fontWeight={800} sx={{ color: k.color }}>{k.value}</Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* Status tabs */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="All" />
        <Tab label={`Drafts${draftCnt > 0 ? ` (${draftCnt})` : ''}`} />
        <Tab label={`Submitted${pendingCnt > 0 ? ` (${pendingCnt})` : ''}`} />
        <Tab label="Approved" />
        <Tab label="Rejected" />
      </Tabs>

      {/* Table */}
      {isLoading ? (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>Loading…</Typography>
      ) : items.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
          <TimerIcon sx={{ fontSize: 48, mb: 1, opacity: 0.3 }} />
          <Typography variant="body1">
            {tab === 0 ? 'No entries yet. Click "Log Time" to add your first timesheet.' : `No ${TABS[tab]} timesheets.`}
          </Typography>
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {['Date', 'Task', 'Project', 'Hours', 'Status', 'HR Notes', 'Actions'].map(h => (
                  <TableCell key={h} sx={{ bgcolor: 'primary.main', color: '#fff', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item: any) => {
                const meta     = STATUS_META[item.status] ?? STATUS_META.draft
                const isDraft  = item.status === 'draft'
                const isRejected = item.status === 'rejected'
                return (
                  <ContextTableRow
                    key={item.id}
                    recordKey={`timesheet-${item.id}`}
                    recordLabel={item.task_title}
                    hover
                  >
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {new Date(item.work_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{item.task_title}</Typography>
                      {item.description && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.description}
                        </Typography>
                      )}
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
                    <TableCell sx={{ maxWidth: 160 }}>
                      {item.review_notes
                        ? <Tooltip title={item.review_notes}>
                            <Typography variant="caption" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'help' }}>
                              {item.review_notes}
                            </Typography>
                          </Tooltip>
                        : <Typography variant="caption" color="text.disabled">—</Typography>}
                    </TableCell>
                    <TableCell>
                      {isDraft || isRejected ? (
                        <Tooltip title="Actions">
                          <IconButton size="small" onClick={(event) => openActions(event, item)} sx={{ bgcolor: '#F4F1FF', color: '#7C3AED', '&:hover': { bgcolor: '#EDE9FE' } }}>
                            <MoreVertIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Typography variant="caption" color="text.disabled">—</Typography>
                      )}
                    </TableCell>
                  </ContextTableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Menu anchorEl={actionAnchor} open={Boolean(actionAnchor)} onClose={closeActions} PaperProps={ACTION_MENU_PAPER}>
        {(actionItem?.status === 'draft' || actionItem?.status === 'rejected') && (
          <MenuItem
            sx={ACTION_MENU_ITEM}
            onClick={() => {
              const item = actionItem
              closeActions()
              if (item) openEdit(item)
            }}
          >
            <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
            {actionItem?.status === 'rejected' ? 'Edit and Resubmit' : 'Edit Draft'}
          </MenuItem>
        )}
        {actionItem?.status === 'draft' && (
          <MenuItem
            sx={ACTION_MENU_ITEM}
            disabled={quickSubmitMut.isPending}
            onClick={() => {
              const item = actionItem
              closeActions()
              if (item) quickSubmitMut.mutate(item.id)
            }}
          >
            <ListItemIcon><SendIcon fontSize="small" /></ListItemIcon>
            Submit for Review
          </MenuItem>
        )}
        {(actionItem?.status === 'draft' || actionItem?.status === 'rejected') && (
          <MenuItem
            sx={{ ...ACTION_MENU_ITEM, color: '#DC2626' }}
            onClick={() => {
              const item = actionItem
              closeActions()
              if (item) deleteMut.mutate(item.id)
            }}
          >
            <ListItemIcon><DeleteIcon fontSize="small" /></ListItemIcon>
            Delete
          </MenuItem>
        )}
      </Menu>

      {/* Add / Edit Dialog */}
      <Dialog open={dlg.open} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          {dlg.item ? (dlg.item.status === 'rejected' ? 'Edit & Resubmit' : 'Edit Draft') : 'Log Time'}
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
          {dlg.item?.status === 'rejected' && dlg.item?.review_notes && (
            <Alert severity="error" sx={{ py: 0.5 }}>
              <strong>HR feedback:</strong> {dlg.item.review_notes}
            </Alert>
          )}
          <TextField
            label="Date" type="date" size="small" fullWidth required
            value={form.work_date} InputLabelProps={{ shrink: true }}
            onChange={set('work_date')}
          />
          <TextField
            label="Task Title" size="small" fullWidth required
            value={form.task_title} placeholder="e.g. Dashboard UI redesign"
            onChange={set('task_title')}
          />
          <TextField
            label="Project / Category" size="small" fullWidth
            value={form.project} placeholder="e.g. HR Module"
            onChange={set('project')}
          />
          <TextField
            label="Hours Worked" type="number" size="small" fullWidth required
            value={form.hours} inputProps={{ min: 0.25, max: 24, step: 0.25 }}
            onChange={set('hours')}
          />
          <TextField
            label="Description / Notes" size="small" fullWidth multiline rows={3}
            value={form.description} placeholder="What did you work on?"
            onChange={set('description')}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={closeDialog} disabled={isPending}>Cancel</Button>
          <Button
            startIcon={<SaveIcon />}
            variant="outlined"
            disabled={isPending || !canSubmit}
            onClick={() => saveMut.mutate(payload)}
          >
            Save as Draft
          </Button>
          <Button
            startIcon={<SendIcon />}
            variant="contained"
            disabled={isPending || !canSubmit}
            onClick={() => submitMut.mutate(payload)}
          >
            {dlg.item?.status === 'rejected' ? 'Resubmit' : 'Submit'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
