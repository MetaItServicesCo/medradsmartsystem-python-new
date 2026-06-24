import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Avatar, Box, Button, Card, CardContent, Chip, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  FormControl, Grid, IconButton, InputLabel, List, ListItemButton,
  ListItemIcon, ListItemText, MenuItem, Paper, Select, Tab, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs,
  TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import AssignmentIcon from '@mui/icons-material/Assignment'
import BeachAccessIcon from '@mui/icons-material/BeachAccess'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import CardGiftcardIcon from '@mui/icons-material/CardGiftcard'
import DescriptionIcon from '@mui/icons-material/Description'
import EditIcon from '@mui/icons-material/Edit'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import ExitToAppIcon from '@mui/icons-material/ExitToApp'
import FolderIcon from '@mui/icons-material/Folder'
import GavelIcon from '@mui/icons-material/Gavel'
import GroupsIcon from '@mui/icons-material/Groups'
import HowToRegIcon from '@mui/icons-material/HowToReg'
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn'
import PeopleIcon from '@mui/icons-material/People'
import PolicyIcon from '@mui/icons-material/Policy'
import SpeedIcon from '@mui/icons-material/Speed'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import VideoCallIcon from '@mui/icons-material/VideoCall'
import WorkIcon from '@mui/icons-material/Work'
import DeleteIcon from '@mui/icons-material/Delete'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import AnnouncementIcon from '@mui/icons-material/Announcement'
import { toast } from 'react-toastify'
import {
  fetchHRDashboard, fetchHREmployees,
  fetchLeaveTypes, createLeaveType, updateLeaveType, deleteLeaveType,
  fetchLeavePolicies, createLeavePolicy, updateLeavePolicy, deleteLeavePolicy,
  fetchLeaveRequests, createLeaveRequest, updateLeaveRequest, deleteLeaveRequest,
  fetchAttendancePolicies, createAttendancePolicy, updateAttendancePolicy, deleteAttendancePolicy,
  fetchHolidays, createHoliday, updateHoliday, deleteHoliday,
  fetchAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement,
  fetchJobOpenings, createJobOpening, updateJobOpening, deleteJobOpening,
  fetchCandidates, createCandidate, updateCandidate, deleteCandidate,
  fetchJobOffers, createJobOffer, updateJobOffer, deleteJobOffer,
  fetchOnboardingChecklists, createOnboardingChecklist, updateOnboardingChecklist, deleteOnboardingChecklist,
  fetchAwards, createAward, updateAward, deleteAward,
  fetchPromotions, createPromotion, updatePromotion, deletePromotion,
  fetchResignations, createResignation, updateResignation, deleteResignation,
  fetchTerminations, createTermination, updateTermination, deleteTermination,
  fetchTaxBrackets, createTaxBracket, updateTaxBracket, deleteTaxBracket,
  fetchPayrollConfigs, createPayrollConfig, updatePayrollConfig,
  fetchPayrollRuns, createPayrollRun, updatePayrollRun,
  fetchMeetings, createMeeting, updateMeeting, deleteMeeting, upsertMeetingMinutes,
  fetchDocumentCategories, createDocumentCategory, deleteDocumentCategory,
  fetchContractTypes, createContractType, deleteContractType,
  fetchDocumentTemplates, createDocumentTemplate, updateDocumentTemplate, deleteDocumentTemplate,
  fetchContractTemplates, createContractTemplate, updateContractTemplate, deleteContractTemplate,
  fetchEmployeeDocuments, createEmployeeDocument, updateEmployeeDocument, deleteEmployeeDocument,
  fetchEmployeeContracts, createEmployeeContract, updateEmployeeContract, deleteEmployeeContract,
  fetchAcknowledgments, createAcknowledgment,
} from '@/api/hr'

// ── Nav items ───────────────────────────────────────────────────────────────

const NAV = [
  { key: 'dashboard',   label: 'Dashboard',          icon: <SpeedIcon /> },
  { key: 'calendar',    label: 'Calendar',            icon: <CalendarMonthIcon /> },
  { key: 'employees',   label: 'Employees',           icon: <PeopleIcon /> },
  { key: 'org',         label: 'Organization',        icon: <GroupsIcon /> },
  { key: 'attendance',  label: 'Attendance',          icon: <AccessTimeIcon /> },
  { key: 'leave',       label: 'Leave Management',    icon: <BeachAccessIcon /> },
  { key: 'recruitment', label: 'Recruitment',         icon: <WorkIcon /> },
  { key: 'lifecycle',   label: 'Employee Lifecycle',  icon: <TrendingUpIcon /> },
  { key: 'payroll',     label: 'Payroll',             icon: <MonetizationOnIcon /> },
  { key: 'meetings',    label: 'Meetings',            icon: <VideoCallIcon /> },
  { key: 'documents',   label: 'Documents',           icon: <FolderIcon /> },
]

// ── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (d?: string | null) => d ? new Date(d).toLocaleDateString() : '—'

function useCrud<T = any>(queryKey: string[], fetcher: () => Promise<T[]>) {
  return useQuery({ queryKey, queryFn: fetcher })
}

function CrudDeleteBtn({ onDelete }: { onDelete: () => void }) {
  return (
    <Tooltip title="Delete">
      <IconButton size="small" color="error" onClick={onDelete}><DeleteIcon fontSize="small" /></IconButton>
    </Tooltip>
  )
}

function CrudEditBtn({ onEdit }: { onEdit: () => void }) {
  return (
    <Tooltip title="Edit">
      <IconButton size="small" onClick={onEdit}><EditIcon fontSize="small" /></IconButton>
    </Tooltip>
  )
}

// ── Simple field dialog ──────────────────────────────────────────────────────

interface FieldDef { key: string; label: string; type?: 'text' | 'number' | 'date' | 'select' | 'textarea'; options?: string[] }

function SimpleDialog({
  open, title, fields, initial, onClose, onSave,
}: {
  open: boolean; title: string; fields: FieldDef[]
  initial: Record<string, any>; onClose: () => void; onSave: (data: Record<string, any>) => void
}) {
  const [form, setForm] = useState<Record<string, any>>(initial)
  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = () => {
    onSave(form)
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        {fields.map(f => {
          if (f.type === 'select') return (
            <FormControl key={f.key} fullWidth size="small">
              <InputLabel>{f.label}</InputLabel>
              <Select label={f.label} value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)}>
                {f.options?.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
              </Select>
            </FormControl>
          )
          if (f.type === 'textarea') return (
            <TextField key={f.key} label={f.label} multiline rows={3} size="small" fullWidth
              value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} />
          )
          return (
            <TextField key={f.key} label={f.label} size="small" fullWidth
              type={f.type ?? 'text'}
              value={form[f.key] ?? ''}
              onChange={e => set(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)}
              InputLabelProps={f.type === 'date' ? { shrink: true } : undefined}
            />
          )
        })}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave}>Save</Button>
      </DialogActions>
    </Dialog>
  )
}

// ── KPI card ────────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon, color }: { label: string; value: any; icon: React.ReactNode; color: string }) {
  return (
    <Card sx={{ flex: 1, minWidth: 160 }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Avatar sx={{ bgcolor: color, width: 48, height: 48 }}>{icon}</Avatar>
        <Box>
          <Typography variant="h5" fontWeight={700}>{value ?? '—'}</Typography>
          <Typography variant="caption" color="text.secondary">{label}</Typography>
        </Box>
      </CardContent>
    </Card>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════

function DashboardSection() {
  const { data, isLoading } = useQuery({ queryKey: ['hr-dashboard'], queryFn: fetchHRDashboard })
  if (isLoading) return <CircularProgress sx={{ m: 4 }} />
  const d = data ?? {}
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Typography variant="h6" fontWeight={700}>HR Dashboard</Typography>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <KpiCard label="Total Employees" value={d.total_employees} icon={<PeopleIcon />} color="#1976d2" />
        <KpiCard label="Pending Leaves" value={d.pending_leave_requests} icon={<BeachAccessIcon />} color="#ed6c02" />
        <KpiCard label="Open Positions" value={d.open_positions} icon={<WorkIcon />} color="#2e7d32" />
        <KpiCard label="Meetings This Month" value={d.meetings_this_month} icon={<VideoCallIcon />} color="#7b1fa2" />
      </Box>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>Recent Announcements</Typography>
              {(d.recent_announcements ?? []).length === 0
                ? <Typography color="text.secondary" variant="body2">No announcements</Typography>
                : (d.recent_announcements ?? []).map((a: any) => (
                  <Box key={a.id} sx={{ mb: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                    <Typography variant="body2" fontWeight={600}>{a.title}</Typography>
                    <Typography variant="caption" color="text.secondary">{fmt(a.created_at)}</Typography>
                  </Box>
                ))}
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} gutterBottom>Upcoming Holidays</Typography>
              {(d.upcoming_holidays ?? []).length === 0
                ? <Typography color="text.secondary" variant="body2">No upcoming holidays</Typography>
                : (d.upcoming_holidays ?? []).map((h: any) => (
                  <Box key={h.id} sx={{ mb: 1, display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2">{h.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{fmt(h.date)}</Typography>
                  </Box>
                ))}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// CALENDAR
// ══════════════════════════════════════════════════════════════════════════════

function CalendarSection() {
  const year = new Date().getFullYear()
  const { data: holidays = [] } = useQuery({ queryKey: ['hr-holidays', year], queryFn: () => fetchHolidays(year) })
  const { data: meetings = [] } = useQuery({ queryKey: ['hr-meetings'], queryFn: () => fetchMeetings() })
  const events = [
    ...(holidays as any[]).map((h: any) => ({ date: h.date, label: h.name, color: '#2e7d32' })),
    ...(meetings as any[]).map((m: any) => ({ date: m.scheduled_at?.slice(0, 10), label: m.title, color: '#1976d2' })),
  ].filter(e => e.date).sort((a, b) => a.date.localeCompare(b.date))

  return (
    <Box>
      <Typography variant="h6" fontWeight={700} gutterBottom>HR Calendar</Typography>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'primary.main' }}>
              <TableCell sx={{ color: 'white' }}>Date</TableCell>
              <TableCell sx={{ color: 'white' }}>Event</TableCell>
              <TableCell sx={{ color: 'white' }}>Type</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {events.length === 0
              ? <TableRow><TableCell colSpan={3} align="center">No events</TableCell></TableRow>
              : events.map((e, i) => (
                <TableRow key={i}>
                  <TableCell>{fmt(e.date)}</TableCell>
                  <TableCell>{e.label}</TableCell>
                  <TableCell>
                    <Chip size="small" label={e.color === '#2e7d32' ? 'Holiday' : 'Meeting'}
                      sx={{ bgcolor: e.color, color: 'white' }} />
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// EMPLOYEES
// ══════════════════════════════════════════════════════════════════════════════

function EmployeesSection() {
  const [search, setSearch] = useState('')
  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['hr-employees', search], queryFn: () => fetchHREmployees(search ? { search } : undefined),
  })
  return (
    <Box>
      <Typography variant="h6" fontWeight={700} gutterBottom>Employees</Typography>
      <TextField size="small" placeholder="Search employees…" value={search}
        onChange={e => setSearch(e.target.value)} sx={{ mb: 2, width: 320 }} />
      {isLoading ? <CircularProgress /> : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'primary.main' }}>
                {['Name', 'Email', 'Role', 'Department', 'Facility'].map(h => (
                  <TableCell key={h} sx={{ color: 'white' }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {(employees as any[]).length === 0
                ? <TableRow><TableCell colSpan={5} align="center">No employees found</TableCell></TableRow>
                : (employees as any[]).map((e: any) => (
                  <TableRow key={e.id} hover>
                    <TableCell>{e.full_name ?? `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim()}</TableCell>
                    <TableCell>{e.email}</TableCell>
                    <TableCell><Chip size="small" label={e.role} /></TableCell>
                    <TableCell>{e.department?.name ?? '—'}</TableCell>
                    <TableCell>{e.facility?.name ?? '—'}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ORGANIZATION (Holidays + Announcements)
// ══════════════════════════════════════════════════════════════════════════════

function HolidaysTab() {
  const qc = useQueryClient()
  const year = new Date().getFullYear()
  const { data: holidays = [] } = useQuery({ queryKey: ['hr-holidays', year], queryFn: () => fetchHolidays(year) })
  const [dlg, setDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const FIELDS: FieldDef[] = [
    { key: 'name', label: 'Holiday Name' },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'holiday_type', label: 'Type', type: 'select', options: ['public', 'optional', 'company'] },
    { key: 'description', label: 'Description', type: 'textarea' },
  ]
  const mut = useMutation({
    mutationFn: (data: any) => dlg.item ? updateHoliday(dlg.item.id, data) : createHoliday(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-holidays'] }); toast.success('Saved') },
  })
  const del = useMutation({
    mutationFn: deleteHoliday,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-holidays'] }); toast.success('Deleted') },
  })
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDlg({ open: true })}>Add Holiday</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow sx={{ bgcolor: 'primary.main' }}>
            {['Name', 'Date', 'Type', 'Description', ''].map(h => <TableCell key={h} sx={{ color: 'white' }}>{h}</TableCell>)}
          </TableRow></TableHead>
          <TableBody>
            {(holidays as any[]).map((h: any) => (
              <TableRow key={h.id} hover>
                <TableCell>{h.name}</TableCell>
                <TableCell>{fmt(h.date)}</TableCell>
                <TableCell><Chip size="small" label={h.holiday_type} /></TableCell>
                <TableCell>{h.description ?? '—'}</TableCell>
                <TableCell>
                  <CrudEditBtn onEdit={() => setDlg({ open: true, item: h })} />
                  <CrudDeleteBtn onDelete={() => del.mutate(h.id)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <SimpleDialog open={dlg.open} title={dlg.item ? 'Edit Holiday' : 'Add Holiday'}
        fields={FIELDS} initial={dlg.item ?? {}} onClose={() => setDlg({ open: false })}
        onSave={data => mut.mutate(data)} />
    </Box>
  )
}

function AnnouncementsTab() {
  const qc = useQueryClient()
  const { data: announcements = [] } = useQuery({ queryKey: ['hr-announcements'], queryFn: () => fetchAnnouncements() })
  const [dlg, setDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const FIELDS: FieldDef[] = [
    { key: 'title', label: 'Title' },
    { key: 'body', label: 'Body', type: 'textarea' },
    { key: 'priority', label: 'Priority', type: 'select', options: ['low', 'normal', 'high', 'urgent'] },
    { key: 'expires_at', label: 'Expires At', type: 'date' },
  ]
  const mut = useMutation({
    mutationFn: (data: any) => dlg.item ? updateAnnouncement(dlg.item.id, data) : createAnnouncement(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-announcements'] }); toast.success('Saved') },
  })
  const del = useMutation({
    mutationFn: deleteAnnouncement,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-announcements'] }); toast.success('Deleted') },
  })
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDlg({ open: true })}>Add Announcement</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow sx={{ bgcolor: 'primary.main' }}>
            {['Title', 'Priority', 'Expires', ''].map(h => <TableCell key={h} sx={{ color: 'white' }}>{h}</TableCell>)}
          </TableRow></TableHead>
          <TableBody>
            {(announcements as any[]).map((a: any) => (
              <TableRow key={a.id} hover>
                <TableCell>{a.title}</TableCell>
                <TableCell><Chip size="small" label={a.priority} color={a.priority === 'urgent' ? 'error' : 'default'} /></TableCell>
                <TableCell>{fmt(a.expires_at)}</TableCell>
                <TableCell>
                  <CrudEditBtn onEdit={() => setDlg({ open: true, item: a })} />
                  <CrudDeleteBtn onDelete={() => del.mutate(a.id)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <SimpleDialog open={dlg.open} title={dlg.item ? 'Edit Announcement' : 'Add Announcement'}
        fields={FIELDS} initial={dlg.item ?? {}} onClose={() => setDlg({ open: false })}
        onSave={data => mut.mutate(data)} />
    </Box>
  )
}

function OrgSection() {
  const [tab, setTab] = useState(0)
  return (
    <Box>
      <Typography variant="h6" fontWeight={700} gutterBottom>Organization</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Holidays" />
        <Tab label="Announcements" />
      </Tabs>
      {tab === 0 && <HolidaysTab />}
      {tab === 1 && <AnnouncementsTab />}
    </Box>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ATTENDANCE
// ══════════════════════════════════════════════════════════════════════════════

function AttendancePoliciesTab() {
  const qc = useQueryClient()
  const { data: policies = [] } = useQuery({ queryKey: ['hr-attendance-policies'], queryFn: fetchAttendancePolicies })
  const [dlg, setDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const FIELDS: FieldDef[] = [
    { key: 'name', label: 'Policy Name' },
    { key: 'work_start_time', label: 'Work Start Time' },
    { key: 'work_end_time', label: 'Work End Time' },
    { key: 'grace_minutes', label: 'Grace Minutes', type: 'number' },
    { key: 'weekly_hours', label: 'Weekly Hours', type: 'number' },
  ]
  const mut = useMutation({
    mutationFn: (data: any) => dlg.item ? updateAttendancePolicy(dlg.item.id, data) : createAttendancePolicy(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-attendance-policies'] }); toast.success('Saved') },
  })
  const del = useMutation({
    mutationFn: deleteAttendancePolicy,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-attendance-policies'] }); toast.success('Deleted') },
  })
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDlg({ open: true })}>Add Policy</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow sx={{ bgcolor: 'primary.main' }}>
            {['Name', 'Start', 'End', 'Grace (min)', 'Weekly Hours', ''].map(h => <TableCell key={h} sx={{ color: 'white' }}>{h}</TableCell>)}
          </TableRow></TableHead>
          <TableBody>
            {(policies as any[]).map((p: any) => (
              <TableRow key={p.id} hover>
                <TableCell>{p.name}</TableCell>
                <TableCell>{p.work_start_time ?? '—'}</TableCell>
                <TableCell>{p.work_end_time ?? '—'}</TableCell>
                <TableCell>{p.grace_minutes ?? '—'}</TableCell>
                <TableCell>{p.weekly_hours ?? '—'}</TableCell>
                <TableCell>
                  <CrudEditBtn onEdit={() => setDlg({ open: true, item: p })} />
                  <CrudDeleteBtn onDelete={() => del.mutate(p.id)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <SimpleDialog open={dlg.open} title={dlg.item ? 'Edit Policy' : 'Add Policy'}
        fields={FIELDS} initial={dlg.item ?? {}} onClose={() => setDlg({ open: false })}
        onSave={data => mut.mutate(data)} />
    </Box>
  )
}

function AttendanceSection() {
  const [tab, setTab] = useState(0)
  return (
    <Box>
      <Typography variant="h6" fontWeight={700} gutterBottom>Attendance</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Policies" />
      </Tabs>
      {tab === 0 && <AttendancePoliciesTab />}
    </Box>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// LEAVE MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

function LeaveRequestsTab() {
  const qc = useQueryClient()
  const { data: requests = [] } = useQuery({ queryKey: ['hr-leave-requests'], queryFn: () => fetchLeaveRequests() })
  const { data: leaveTypes = [] } = useQuery({ queryKey: ['hr-leave-types'], queryFn: fetchLeaveTypes })
  const [dlg, setDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const FIELDS: FieldDef[] = [
    { key: 'start_date', label: 'Start Date', type: 'date' },
    { key: 'end_date', label: 'End Date', type: 'date' },
    { key: 'reason', label: 'Reason', type: 'textarea' },
    { key: 'status', label: 'Status', type: 'select', options: ['pending', 'approved', 'rejected', 'cancelled'] },
  ]
  const mut = useMutation({
    mutationFn: (data: any) => dlg.item ? updateLeaveRequest(dlg.item.id, data) : createLeaveRequest(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-leave-requests'] }); toast.success('Saved') },
  })
  const del = useMutation({
    mutationFn: deleteLeaveRequest,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-leave-requests'] }); toast.success('Deleted') },
  })
  const statusColor = (s: string) => s === 'approved' ? 'success' : s === 'rejected' ? 'error' : s === 'cancelled' ? 'default' : 'warning'
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDlg({ open: true })}>New Request</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow sx={{ bgcolor: 'primary.main' }}>
            {['Employee', 'Type', 'From', 'To', 'Status', ''].map(h => <TableCell key={h} sx={{ color: 'white' }}>{h}</TableCell>)}
          </TableRow></TableHead>
          <TableBody>
            {(requests as any[]).map((r: any) => (
              <TableRow key={r.id} hover>
                <TableCell>{r.user?.full_name ?? r.user?.email ?? r.user_id}</TableCell>
                <TableCell>{r.leave_type?.name ?? '—'}</TableCell>
                <TableCell>{fmt(r.start_date)}</TableCell>
                <TableCell>{fmt(r.end_date)}</TableCell>
                <TableCell><Chip size="small" label={r.status} color={statusColor(r.status) as any} /></TableCell>
                <TableCell>
                  <CrudEditBtn onEdit={() => setDlg({ open: true, item: r })} />
                  <CrudDeleteBtn onDelete={() => del.mutate(r.id)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <SimpleDialog open={dlg.open} title={dlg.item ? 'Edit Request' : 'New Leave Request'}
        fields={FIELDS} initial={dlg.item ?? {}} onClose={() => setDlg({ open: false })}
        onSave={data => mut.mutate(data)} />
    </Box>
  )
}

function LeaveTypesTab() {
  const qc = useQueryClient()
  const { data: types = [] } = useQuery({ queryKey: ['hr-leave-types'], queryFn: fetchLeaveTypes })
  const [dlg, setDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const FIELDS: FieldDef[] = [
    { key: 'name', label: 'Name' },
    { key: 'max_days_per_year', label: 'Max Days / Year', type: 'number' },
    { key: 'is_paid', label: 'Paid?', type: 'select', options: ['true', 'false'] },
    { key: 'description', label: 'Description', type: 'textarea' },
  ]
  const mut = useMutation({
    mutationFn: (data: any) => {
      const d = { ...data, is_paid: data.is_paid === 'true' }
      return dlg.item ? updateLeaveType(dlg.item.id, d) : createLeaveType(d)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-leave-types'] }); toast.success('Saved') },
  })
  const del = useMutation({
    mutationFn: deleteLeaveType,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-leave-types'] }); toast.success('Deleted') },
  })
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDlg({ open: true })}>Add Type</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow sx={{ bgcolor: 'primary.main' }}>
            {['Name', 'Max Days', 'Paid', 'Description', ''].map(h => <TableCell key={h} sx={{ color: 'white' }}>{h}</TableCell>)}
          </TableRow></TableHead>
          <TableBody>
            {(types as any[]).map((t: any) => (
              <TableRow key={t.id} hover>
                <TableCell>{t.name}</TableCell>
                <TableCell>{t.max_days_per_year ?? '—'}</TableCell>
                <TableCell><Chip size="small" label={t.is_paid ? 'Yes' : 'No'} color={t.is_paid ? 'success' : 'default'} /></TableCell>
                <TableCell>{t.description ?? '—'}</TableCell>
                <TableCell>
                  <CrudEditBtn onEdit={() => setDlg({ open: true, item: { ...t, is_paid: String(t.is_paid) } })} />
                  <CrudDeleteBtn onDelete={() => del.mutate(t.id)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <SimpleDialog open={dlg.open} title={dlg.item ? 'Edit Leave Type' : 'Add Leave Type'}
        fields={FIELDS} initial={dlg.item ?? {}} onClose={() => setDlg({ open: false })}
        onSave={data => mut.mutate(data)} />
    </Box>
  )
}

function LeavePoliciesTab() {
  const qc = useQueryClient()
  const { data: policies = [] } = useQuery({ queryKey: ['hr-leave-policies'], queryFn: fetchLeavePolicies })
  const [dlg, setDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const FIELDS: FieldDef[] = [
    { key: 'name', label: 'Policy Name' },
    { key: 'accrual_rate', label: 'Accrual Rate', type: 'number' },
    { key: 'max_carry_forward', label: 'Max Carry Forward', type: 'number' },
    { key: 'description', label: 'Description', type: 'textarea' },
  ]
  const mut = useMutation({
    mutationFn: (data: any) => dlg.item ? updateLeavePolicy(dlg.item.id, data) : createLeavePolicy(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-leave-policies'] }); toast.success('Saved') },
  })
  const del = useMutation({
    mutationFn: deleteLeavePolicy,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-leave-policies'] }); toast.success('Deleted') },
  })
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDlg({ open: true })}>Add Policy</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow sx={{ bgcolor: 'primary.main' }}>
            {['Name', 'Accrual Rate', 'Max Carry Forward', ''].map(h => <TableCell key={h} sx={{ color: 'white' }}>{h}</TableCell>)}
          </TableRow></TableHead>
          <TableBody>
            {(policies as any[]).map((p: any) => (
              <TableRow key={p.id} hover>
                <TableCell>{p.name}</TableCell>
                <TableCell>{p.accrual_rate ?? '—'}</TableCell>
                <TableCell>{p.max_carry_forward ?? '—'}</TableCell>
                <TableCell>
                  <CrudEditBtn onEdit={() => setDlg({ open: true, item: p })} />
                  <CrudDeleteBtn onDelete={() => del.mutate(p.id)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <SimpleDialog open={dlg.open} title={dlg.item ? 'Edit Policy' : 'Add Policy'}
        fields={FIELDS} initial={dlg.item ?? {}} onClose={() => setDlg({ open: false })}
        onSave={data => mut.mutate(data)} />
    </Box>
  )
}

function LeaveSection() {
  const [tab, setTab] = useState(0)
  return (
    <Box>
      <Typography variant="h6" fontWeight={700} gutterBottom>Leave Management</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Requests" />
        <Tab label="Leave Types" />
        <Tab label="Policies" />
      </Tabs>
      {tab === 0 && <LeaveRequestsTab />}
      {tab === 1 && <LeaveTypesTab />}
      {tab === 2 && <LeavePoliciesTab />}
    </Box>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// RECRUITMENT
// ══════════════════════════════════════════════════════════════════════════════

function JobOpeningsTab() {
  const qc = useQueryClient()
  const { data: openings = [] } = useQuery({ queryKey: ['hr-job-openings'], queryFn: () => fetchJobOpenings() })
  const [dlg, setDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const FIELDS: FieldDef[] = [
    { key: 'title', label: 'Job Title' },
    { key: 'department', label: 'Department' },
    { key: 'location', label: 'Location' },
    { key: 'status', label: 'Status', type: 'select', options: ['open', 'closed', 'on_hold', 'filled'] },
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'posted_date', label: 'Posted Date', type: 'date' },
    { key: 'closing_date', label: 'Closing Date', type: 'date' },
  ]
  const mut = useMutation({
    mutationFn: (data: any) => dlg.item ? updateJobOpening(dlg.item.id, data) : createJobOpening(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-job-openings'] }); toast.success('Saved') },
  })
  const del = useMutation({
    mutationFn: deleteJobOpening,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-job-openings'] }); toast.success('Deleted') },
  })
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDlg({ open: true })}>Add Opening</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow sx={{ bgcolor: 'primary.main' }}>
            {['Title', 'Department', 'Location', 'Status', 'Closing', ''].map(h => <TableCell key={h} sx={{ color: 'white' }}>{h}</TableCell>)}
          </TableRow></TableHead>
          <TableBody>
            {(openings as any[]).map((o: any) => (
              <TableRow key={o.id} hover>
                <TableCell>{o.title}</TableCell>
                <TableCell>{o.department ?? '—'}</TableCell>
                <TableCell>{o.location ?? '—'}</TableCell>
                <TableCell><Chip size="small" label={o.status} color={o.status === 'open' ? 'success' : 'default'} /></TableCell>
                <TableCell>{fmt(o.closing_date)}</TableCell>
                <TableCell>
                  <CrudEditBtn onEdit={() => setDlg({ open: true, item: o })} />
                  <CrudDeleteBtn onDelete={() => del.mutate(o.id)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <SimpleDialog open={dlg.open} title={dlg.item ? 'Edit Opening' : 'Add Job Opening'}
        fields={FIELDS} initial={dlg.item ?? {}} onClose={() => setDlg({ open: false })}
        onSave={data => mut.mutate(data)} />
    </Box>
  )
}

function CandidatesTab() {
  const qc = useQueryClient()
  const { data: candidates = [] } = useQuery({ queryKey: ['hr-candidates'], queryFn: () => fetchCandidates() })
  const [dlg, setDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const FIELDS: FieldDef[] = [
    { key: 'full_name', label: 'Full Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'status', label: 'Status', type: 'select', options: ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'] },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ]
  const mut = useMutation({
    mutationFn: (data: any) => dlg.item ? updateCandidate(dlg.item.id, data) : createCandidate(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-candidates'] }); toast.success('Saved') },
  })
  const del = useMutation({
    mutationFn: deleteCandidate,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-candidates'] }); toast.success('Deleted') },
  })
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDlg({ open: true })}>Add Candidate</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow sx={{ bgcolor: 'primary.main' }}>
            {['Name', 'Email', 'Phone', 'Status', ''].map(h => <TableCell key={h} sx={{ color: 'white' }}>{h}</TableCell>)}
          </TableRow></TableHead>
          <TableBody>
            {(candidates as any[]).map((c: any) => (
              <TableRow key={c.id} hover>
                <TableCell>{c.full_name}</TableCell>
                <TableCell>{c.email ?? '—'}</TableCell>
                <TableCell>{c.phone ?? '—'}</TableCell>
                <TableCell><Chip size="small" label={c.status} color={c.status === 'hired' ? 'success' : c.status === 'rejected' ? 'error' : 'default'} /></TableCell>
                <TableCell>
                  <CrudEditBtn onEdit={() => setDlg({ open: true, item: c })} />
                  <CrudDeleteBtn onDelete={() => del.mutate(c.id)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <SimpleDialog open={dlg.open} title={dlg.item ? 'Edit Candidate' : 'Add Candidate'}
        fields={FIELDS} initial={dlg.item ?? {}} onClose={() => setDlg({ open: false })}
        onSave={data => mut.mutate(data)} />
    </Box>
  )
}

function OffersTab() {
  const qc = useQueryClient()
  const { data: offers = [] } = useQuery({ queryKey: ['hr-job-offers'], queryFn: () => fetchJobOffers() })
  const [dlg, setDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const FIELDS: FieldDef[] = [
    { key: 'position_title', label: 'Position Title' },
    { key: 'salary_offered', label: 'Salary', type: 'number' },
    { key: 'offer_date', label: 'Offer Date', type: 'date' },
    { key: 'expiry_date', label: 'Expiry Date', type: 'date' },
    { key: 'status', label: 'Status', type: 'select', options: ['draft', 'sent', 'accepted', 'declined', 'expired'] },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ]
  const mut = useMutation({
    mutationFn: (data: any) => dlg.item ? updateJobOffer(dlg.item.id, data) : createJobOffer(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-job-offers'] }); toast.success('Saved') },
  })
  const del = useMutation({
    mutationFn: deleteJobOffer,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-job-offers'] }); toast.success('Deleted') },
  })
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDlg({ open: true })}>New Offer</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow sx={{ bgcolor: 'primary.main' }}>
            {['Position', 'Salary', 'Offer Date', 'Expiry', 'Status', ''].map(h => <TableCell key={h} sx={{ color: 'white' }}>{h}</TableCell>)}
          </TableRow></TableHead>
          <TableBody>
            {(offers as any[]).map((o: any) => (
              <TableRow key={o.id} hover>
                <TableCell>{o.position_title}</TableCell>
                <TableCell>{o.salary_offered ? `$${Number(o.salary_offered).toLocaleString()}` : '—'}</TableCell>
                <TableCell>{fmt(o.offer_date)}</TableCell>
                <TableCell>{fmt(o.expiry_date)}</TableCell>
                <TableCell><Chip size="small" label={o.status} color={o.status === 'accepted' ? 'success' : o.status === 'declined' ? 'error' : 'default'} /></TableCell>
                <TableCell>
                  <CrudEditBtn onEdit={() => setDlg({ open: true, item: o })} />
                  <CrudDeleteBtn onDelete={() => del.mutate(o.id)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <SimpleDialog open={dlg.open} title={dlg.item ? 'Edit Offer' : 'New Job Offer'}
        fields={FIELDS} initial={dlg.item ?? {}} onClose={() => setDlg({ open: false })}
        onSave={data => mut.mutate(data)} />
    </Box>
  )
}

function OnboardingTab() {
  const qc = useQueryClient()
  const { data: checklists = [] } = useQuery({ queryKey: ['hr-onboarding-checklists'], queryFn: fetchOnboardingChecklists })
  const [dlg, setDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const FIELDS: FieldDef[] = [
    { key: 'title', label: 'Checklist Title' },
    { key: 'description', label: 'Description', type: 'textarea' },
  ]
  const mut = useMutation({
    mutationFn: (data: any) => dlg.item ? updateOnboardingChecklist(dlg.item.id, data) : createOnboardingChecklist(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-onboarding-checklists'] }); toast.success('Saved') },
  })
  const del = useMutation({
    mutationFn: deleteOnboardingChecklist,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-onboarding-checklists'] }); toast.success('Deleted') },
  })
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDlg({ open: true })}>New Checklist</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow sx={{ bgcolor: 'primary.main' }}>
            {['Title', 'Description', 'Items', ''].map(h => <TableCell key={h} sx={{ color: 'white' }}>{h}</TableCell>)}
          </TableRow></TableHead>
          <TableBody>
            {(checklists as any[]).map((c: any) => (
              <TableRow key={c.id} hover>
                <TableCell>{c.title}</TableCell>
                <TableCell>{c.description ?? '—'}</TableCell>
                <TableCell>{c.items?.length ?? 0}</TableCell>
                <TableCell>
                  <CrudEditBtn onEdit={() => setDlg({ open: true, item: c })} />
                  <CrudDeleteBtn onDelete={() => del.mutate(c.id)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <SimpleDialog open={dlg.open} title={dlg.item ? 'Edit Checklist' : 'New Checklist'}
        fields={FIELDS} initial={dlg.item ?? {}} onClose={() => setDlg({ open: false })}
        onSave={data => mut.mutate(data)} />
    </Box>
  )
}

function RecruitmentSection() {
  const [tab, setTab] = useState(0)
  return (
    <Box>
      <Typography variant="h6" fontWeight={700} gutterBottom>Recruitment</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Job Openings" />
        <Tab label="Candidates" />
        <Tab label="Offers" />
        <Tab label="Onboarding" />
      </Tabs>
      {tab === 0 && <JobOpeningsTab />}
      {tab === 1 && <CandidatesTab />}
      {tab === 2 && <OffersTab />}
      {tab === 3 && <OnboardingTab />}
    </Box>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// EMPLOYEE LIFECYCLE
// ══════════════════════════════════════════════════════════════════════════════

function AwardsTab() {
  const qc = useQueryClient()
  const { data: awards = [] } = useQuery({ queryKey: ['hr-awards'], queryFn: () => fetchAwards() })
  const [dlg, setDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const FIELDS: FieldDef[] = [
    { key: 'award_name', label: 'Award Name' },
    { key: 'award_date', label: 'Award Date', type: 'date' },
    { key: 'description', label: 'Description', type: 'textarea' },
  ]
  const mut = useMutation({
    mutationFn: (data: any) => dlg.item ? updateAward(dlg.item.id, data) : createAward(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-awards'] }); toast.success('Saved') },
  })
  const del = useMutation({
    mutationFn: deleteAward,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-awards'] }); toast.success('Deleted') },
  })
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDlg({ open: true })}>Add Award</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow sx={{ bgcolor: 'primary.main' }}>
            {['Award', 'Employee', 'Date', 'Description', ''].map(h => <TableCell key={h} sx={{ color: 'white' }}>{h}</TableCell>)}
          </TableRow></TableHead>
          <TableBody>
            {(awards as any[]).map((a: any) => (
              <TableRow key={a.id} hover>
                <TableCell>{a.award_name}</TableCell>
                <TableCell>{a.user?.full_name ?? a.user?.email ?? a.user_id}</TableCell>
                <TableCell>{fmt(a.award_date)}</TableCell>
                <TableCell>{a.description ?? '—'}</TableCell>
                <TableCell>
                  <CrudEditBtn onEdit={() => setDlg({ open: true, item: a })} />
                  <CrudDeleteBtn onDelete={() => del.mutate(a.id)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <SimpleDialog open={dlg.open} title={dlg.item ? 'Edit Award' : 'Add Award'}
        fields={FIELDS} initial={dlg.item ?? {}} onClose={() => setDlg({ open: false })}
        onSave={data => mut.mutate(data)} />
    </Box>
  )
}

function PromotionsTab() {
  const qc = useQueryClient()
  const { data: promotions = [] } = useQuery({ queryKey: ['hr-promotions'], queryFn: () => fetchPromotions() })
  const [dlg, setDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const FIELDS: FieldDef[] = [
    { key: 'old_title', label: 'Previous Title' },
    { key: 'new_title', label: 'New Title' },
    { key: 'effective_date', label: 'Effective Date', type: 'date' },
    { key: 'salary_change', label: 'Salary Change', type: 'number' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ]
  const mut = useMutation({
    mutationFn: (data: any) => dlg.item ? updatePromotion(dlg.item.id, data) : createPromotion(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-promotions'] }); toast.success('Saved') },
  })
  const del = useMutation({
    mutationFn: deletePromotion,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-promotions'] }); toast.success('Deleted') },
  })
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDlg({ open: true })}>Add Promotion</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow sx={{ bgcolor: 'primary.main' }}>
            {['Employee', 'From', 'To', 'Effective', 'Salary Change', ''].map(h => <TableCell key={h} sx={{ color: 'white' }}>{h}</TableCell>)}
          </TableRow></TableHead>
          <TableBody>
            {(promotions as any[]).map((p: any) => (
              <TableRow key={p.id} hover>
                <TableCell>{p.user?.full_name ?? p.user?.email ?? p.user_id}</TableCell>
                <TableCell>{p.old_title ?? '—'}</TableCell>
                <TableCell>{p.new_title}</TableCell>
                <TableCell>{fmt(p.effective_date)}</TableCell>
                <TableCell>{p.salary_change != null ? `$${Number(p.salary_change).toLocaleString()}` : '—'}</TableCell>
                <TableCell>
                  <CrudEditBtn onEdit={() => setDlg({ open: true, item: p })} />
                  <CrudDeleteBtn onDelete={() => del.mutate(p.id)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <SimpleDialog open={dlg.open} title={dlg.item ? 'Edit Promotion' : 'Add Promotion'}
        fields={FIELDS} initial={dlg.item ?? {}} onClose={() => setDlg({ open: false })}
        onSave={data => mut.mutate(data)} />
    </Box>
  )
}

function ResignationsTab() {
  const qc = useQueryClient()
  const { data: resignations = [] } = useQuery({ queryKey: ['hr-resignations'], queryFn: () => fetchResignations() })
  const [dlg, setDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const FIELDS: FieldDef[] = [
    { key: 'resignation_date', label: 'Resignation Date', type: 'date' },
    { key: 'last_working_date', label: 'Last Working Date', type: 'date' },
    { key: 'reason', label: 'Reason', type: 'textarea' },
    { key: 'status', label: 'Status', type: 'select', options: ['pending', 'accepted', 'rejected', 'withdrawn'] },
  ]
  const mut = useMutation({
    mutationFn: (data: any) => dlg.item ? updateResignation(dlg.item.id, data) : createResignation(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-resignations'] }); toast.success('Saved') },
  })
  const del = useMutation({
    mutationFn: deleteResignation,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-resignations'] }); toast.success('Deleted') },
  })
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDlg({ open: true })}>Record Resignation</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow sx={{ bgcolor: 'primary.main' }}>
            {['Employee', 'Resigned', 'Last Day', 'Status', ''].map(h => <TableCell key={h} sx={{ color: 'white' }}>{h}</TableCell>)}
          </TableRow></TableHead>
          <TableBody>
            {(resignations as any[]).map((r: any) => (
              <TableRow key={r.id} hover>
                <TableCell>{r.user?.full_name ?? r.user?.email ?? r.user_id}</TableCell>
                <TableCell>{fmt(r.resignation_date)}</TableCell>
                <TableCell>{fmt(r.last_working_date)}</TableCell>
                <TableCell><Chip size="small" label={r.status} color={r.status === 'accepted' ? 'warning' : 'default'} /></TableCell>
                <TableCell>
                  <CrudEditBtn onEdit={() => setDlg({ open: true, item: r })} />
                  <CrudDeleteBtn onDelete={() => del.mutate(r.id)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <SimpleDialog open={dlg.open} title={dlg.item ? 'Edit Resignation' : 'Record Resignation'}
        fields={FIELDS} initial={dlg.item ?? {}} onClose={() => setDlg({ open: false })}
        onSave={data => mut.mutate(data)} />
    </Box>
  )
}

function TerminationsTab() {
  const qc = useQueryClient()
  const { data: terminations = [] } = useQuery({ queryKey: ['hr-terminations'], queryFn: () => fetchTerminations() })
  const [dlg, setDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const FIELDS: FieldDef[] = [
    { key: 'termination_date', label: 'Termination Date', type: 'date' },
    { key: 'termination_type', label: 'Type', type: 'select', options: ['voluntary', 'involuntary', 'layoff', 'contract_end', 'retirement'] },
    { key: 'reason', label: 'Reason', type: 'textarea' },
  ]
  const mut = useMutation({
    mutationFn: (data: any) => dlg.item ? updateTermination(dlg.item.id, data) : createTermination(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-terminations'] }); toast.success('Saved') },
  })
  const del = useMutation({
    mutationFn: deleteTermination,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-terminations'] }); toast.success('Deleted') },
  })
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDlg({ open: true })}>Record Termination</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow sx={{ bgcolor: 'primary.main' }}>
            {['Employee', 'Date', 'Type', 'Reason', ''].map(h => <TableCell key={h} sx={{ color: 'white' }}>{h}</TableCell>)}
          </TableRow></TableHead>
          <TableBody>
            {(terminations as any[]).map((t: any) => (
              <TableRow key={t.id} hover>
                <TableCell>{t.user?.full_name ?? t.user?.email ?? t.user_id}</TableCell>
                <TableCell>{fmt(t.termination_date)}</TableCell>
                <TableCell><Chip size="small" label={t.termination_type} /></TableCell>
                <TableCell>{t.reason ?? '—'}</TableCell>
                <TableCell>
                  <CrudEditBtn onEdit={() => setDlg({ open: true, item: t })} />
                  <CrudDeleteBtn onDelete={() => del.mutate(t.id)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <SimpleDialog open={dlg.open} title={dlg.item ? 'Edit Termination' : 'Record Termination'}
        fields={FIELDS} initial={dlg.item ?? {}} onClose={() => setDlg({ open: false })}
        onSave={data => mut.mutate(data)} />
    </Box>
  )
}

function LifecycleSection() {
  const [tab, setTab] = useState(0)
  return (
    <Box>
      <Typography variant="h6" fontWeight={700} gutterBottom>Employee Lifecycle</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Awards" />
        <Tab label="Promotions" />
        <Tab label="Resignations" />
        <Tab label="Terminations" />
      </Tabs>
      {tab === 0 && <AwardsTab />}
      {tab === 1 && <PromotionsTab />}
      {tab === 2 && <ResignationsTab />}
      {tab === 3 && <TerminationsTab />}
    </Box>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// PAYROLL
// ══════════════════════════════════════════════════════════════════════════════

function TaxBracketsTab() {
  const qc = useQueryClient()
  const { data: brackets = [] } = useQuery({ queryKey: ['hr-tax-brackets'], queryFn: fetchTaxBrackets })
  const [dlg, setDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const FIELDS: FieldDef[] = [
    { key: 'name', label: 'Bracket Name' },
    { key: 'min_income', label: 'Min Income', type: 'number' },
    { key: 'max_income', label: 'Max Income', type: 'number' },
    { key: 'tax_rate', label: 'Tax Rate (%)', type: 'number' },
    { key: 'filing_status', label: 'Filing Status', type: 'select', options: ['single', 'married', 'head_of_household'] },
    { key: 'tax_year', label: 'Tax Year', type: 'number' },
  ]
  const mut = useMutation({
    mutationFn: (data: any) => dlg.item ? updateTaxBracket(dlg.item.id, data) : createTaxBracket(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-tax-brackets'] }); toast.success('Saved') },
  })
  const del = useMutation({
    mutationFn: deleteTaxBracket,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-tax-brackets'] }); toast.success('Deleted') },
  })
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDlg({ open: true })}>Add Bracket</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow sx={{ bgcolor: 'primary.main' }}>
            {['Name', 'Min Income', 'Max Income', 'Rate', 'Filing', 'Year', ''].map(h => <TableCell key={h} sx={{ color: 'white' }}>{h}</TableCell>)}
          </TableRow></TableHead>
          <TableBody>
            {(brackets as any[]).map((b: any) => (
              <TableRow key={b.id} hover>
                <TableCell>{b.name}</TableCell>
                <TableCell>${Number(b.min_income ?? 0).toLocaleString()}</TableCell>
                <TableCell>{b.max_income ? `$${Number(b.max_income).toLocaleString()}` : '∞'}</TableCell>
                <TableCell>{b.tax_rate}%</TableCell>
                <TableCell>{b.filing_status ?? '—'}</TableCell>
                <TableCell>{b.tax_year ?? '—'}</TableCell>
                <TableCell>
                  <CrudEditBtn onEdit={() => setDlg({ open: true, item: b })} />
                  <CrudDeleteBtn onDelete={() => del.mutate(b.id)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <SimpleDialog open={dlg.open} title={dlg.item ? 'Edit Tax Bracket' : 'Add Tax Bracket'}
        fields={FIELDS} initial={dlg.item ?? {}} onClose={() => setDlg({ open: false })}
        onSave={data => mut.mutate(data)} />
    </Box>
  )
}

function PayrollRunsTab() {
  const qc = useQueryClient()
  const { data: runs = [] } = useQuery({ queryKey: ['hr-payroll-runs'], queryFn: () => fetchPayrollRuns() })
  const [dlg, setDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const FIELDS: FieldDef[] = [
    { key: 'pay_period_start', label: 'Period Start', type: 'date' },
    { key: 'pay_period_end', label: 'Period End', type: 'date' },
    { key: 'pay_date', label: 'Pay Date', type: 'date' },
    { key: 'status', label: 'Status', type: 'select', options: ['draft', 'processing', 'completed', 'cancelled'] },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ]
  const mut = useMutation({
    mutationFn: (data: any) => dlg.item ? updatePayrollRun(dlg.item.id, data) : createPayrollRun(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-payroll-runs'] }); toast.success('Saved') },
  })
  const statusColor = (s: string) => s === 'completed' ? 'success' : s === 'cancelled' ? 'error' : s === 'processing' ? 'warning' : 'default'
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDlg({ open: true })}>New Payroll Run</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow sx={{ bgcolor: 'primary.main' }}>
            {['Period Start', 'Period End', 'Pay Date', 'Total', 'Status', ''].map(h => <TableCell key={h} sx={{ color: 'white' }}>{h}</TableCell>)}
          </TableRow></TableHead>
          <TableBody>
            {(runs as any[]).map((r: any) => (
              <TableRow key={r.id} hover>
                <TableCell>{fmt(r.pay_period_start)}</TableCell>
                <TableCell>{fmt(r.pay_period_end)}</TableCell>
                <TableCell>{fmt(r.pay_date)}</TableCell>
                <TableCell>{r.total_gross != null ? `$${Number(r.total_gross).toLocaleString()}` : '—'}</TableCell>
                <TableCell><Chip size="small" label={r.status} color={statusColor(r.status) as any} /></TableCell>
                <TableCell>
                  <CrudEditBtn onEdit={() => setDlg({ open: true, item: r })} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <SimpleDialog open={dlg.open} title={dlg.item ? 'Edit Payroll Run' : 'New Payroll Run'}
        fields={FIELDS} initial={dlg.item ?? {}} onClose={() => setDlg({ open: false })}
        onSave={data => mut.mutate(data)} />
    </Box>
  )
}

function PayrollConfigsTab() {
  const qc = useQueryClient()
  const { data: configs = [] } = useQuery({ queryKey: ['hr-payroll-configs'], queryFn: () => fetchPayrollConfigs() })
  const [dlg, setDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const FIELDS: FieldDef[] = [
    { key: 'base_salary', label: 'Base Salary', type: 'number' },
    { key: 'pay_frequency', label: 'Pay Frequency', type: 'select', options: ['weekly', 'biweekly', 'semimonthly', 'monthly'] },
    { key: 'overtime_rate', label: 'Overtime Rate', type: 'number' },
    { key: 'effective_date', label: 'Effective Date', type: 'date' },
  ]
  const mut = useMutation({
    mutationFn: (data: any) => dlg.item ? updatePayrollConfig(dlg.item.id, data) : createPayrollConfig(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-payroll-configs'] }); toast.success('Saved') },
  })
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDlg({ open: true })}>Add Config</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow sx={{ bgcolor: 'primary.main' }}>
            {['Employee', 'Base Salary', 'Pay Frequency', 'Effective', ''].map(h => <TableCell key={h} sx={{ color: 'white' }}>{h}</TableCell>)}
          </TableRow></TableHead>
          <TableBody>
            {(configs as any[]).map((c: any) => (
              <TableRow key={c.id} hover>
                <TableCell>{c.user?.full_name ?? c.user?.email ?? c.user_id}</TableCell>
                <TableCell>{c.base_salary ? `$${Number(c.base_salary).toLocaleString()}` : '—'}</TableCell>
                <TableCell>{c.pay_frequency ?? '—'}</TableCell>
                <TableCell>{fmt(c.effective_date)}</TableCell>
                <TableCell>
                  <CrudEditBtn onEdit={() => setDlg({ open: true, item: c })} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <SimpleDialog open={dlg.open} title={dlg.item ? 'Edit Config' : 'Add Payroll Config'}
        fields={FIELDS} initial={dlg.item ?? {}} onClose={() => setDlg({ open: false })}
        onSave={data => mut.mutate(data)} />
    </Box>
  )
}

function PayrollSection() {
  const [tab, setTab] = useState(0)
  return (
    <Box>
      <Typography variant="h6" fontWeight={700} gutterBottom>Payroll</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Payroll Runs" />
        <Tab label="Employee Config" />
        <Tab label="Tax Brackets" />
      </Tabs>
      {tab === 0 && <PayrollRunsTab />}
      {tab === 1 && <PayrollConfigsTab />}
      {tab === 2 && <TaxBracketsTab />}
    </Box>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MEETINGS
// ══════════════════════════════════════════════════════════════════════════════

function MeetingsSection() {
  const qc = useQueryClient()
  const { data: meetings = [] } = useQuery({ queryKey: ['hr-meetings'], queryFn: () => fetchMeetings() })
  const [dlg, setDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const [minutesDlg, setMinutesDlg] = useState<{ open: boolean; meeting?: any }>({ open: false })
  const [minutesText, setMinutesText] = useState('')

  const FIELDS: FieldDef[] = [
    { key: 'title', label: 'Meeting Title' },
    { key: 'scheduled_at', label: 'Scheduled At', type: 'date' },
    { key: 'location', label: 'Location' },
    { key: 'status', label: 'Status', type: 'select', options: ['scheduled', 'in_progress', 'completed', 'cancelled'] },
    { key: 'description', label: 'Description', type: 'textarea' },
  ]
  const mut = useMutation({
    mutationFn: (data: any) => dlg.item ? updateMeeting(dlg.item.id, data) : createMeeting(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-meetings'] }); toast.success('Saved') },
  })
  const del = useMutation({
    mutationFn: deleteMeeting,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-meetings'] }); toast.success('Deleted') },
  })
  const minutesMut = useMutation({
    mutationFn: ({ id, content }: { id: number; content: string }) => upsertMeetingMinutes(id, { content }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-meetings'] }); toast.success('Minutes saved'); setMinutesDlg({ open: false }) },
  })

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" fontWeight={700}>Meetings</Typography>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDlg({ open: true })}>Schedule Meeting</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow sx={{ bgcolor: 'primary.main' }}>
            {['Title', 'Scheduled', 'Location', 'Status', 'Minutes', ''].map(h => <TableCell key={h} sx={{ color: 'white' }}>{h}</TableCell>)}
          </TableRow></TableHead>
          <TableBody>
            {(meetings as any[]).map((m: any) => (
              <TableRow key={m.id} hover>
                <TableCell>{m.title}</TableCell>
                <TableCell>{fmt(m.scheduled_at)}</TableCell>
                <TableCell>{m.location ?? '—'}</TableCell>
                <TableCell><Chip size="small" label={m.status} color={m.status === 'completed' ? 'success' : m.status === 'cancelled' ? 'error' : 'default'} /></TableCell>
                <TableCell>
                  <Button size="small" variant="outlined" onClick={() => {
                    setMinutesText(m.minutes?.content ?? '')
                    setMinutesDlg({ open: true, meeting: m })
                  }}>
                    {m.minutes ? 'View/Edit' : 'Add'}
                  </Button>
                </TableCell>
                <TableCell>
                  <CrudEditBtn onEdit={() => setDlg({ open: true, item: m })} />
                  <CrudDeleteBtn onDelete={() => del.mutate(m.id)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <SimpleDialog open={dlg.open} title={dlg.item ? 'Edit Meeting' : 'Schedule Meeting'}
        fields={FIELDS} initial={dlg.item ?? {}} onClose={() => setDlg({ open: false })}
        onSave={data => mut.mutate(data)} />

      <Dialog open={minutesDlg.open} onClose={() => setMinutesDlg({ open: false })} fullWidth maxWidth="md">
        <DialogTitle>Meeting Minutes — {minutesDlg.meeting?.title}</DialogTitle>
        <DialogContent sx={{ pt: '16px !important' }}>
          <TextField multiline rows={12} fullWidth value={minutesText}
            onChange={e => setMinutesText(e.target.value)} placeholder="Enter meeting minutes…" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMinutesDlg({ open: false })}>Cancel</Button>
          <Button variant="contained" onClick={() => minutesMut.mutate({ id: minutesDlg.meeting.id, content: minutesText })}>Save Minutes</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// DOCUMENTS
// ══════════════════════════════════════════════════════════════════════════════

function HRDocsTab() {
  const qc = useQueryClient()
  const { data: docs = [] } = useQuery({ queryKey: ['hr-employee-documents'], queryFn: () => fetchEmployeeDocuments() })
  const [dlg, setDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const FIELDS: FieldDef[] = [
    { key: 'title', label: 'Document Title' },
    { key: 'document_url', label: 'Document URL / Path' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ]
  const mut = useMutation({
    mutationFn: (data: any) => dlg.item ? updateEmployeeDocument(dlg.item.id, data) : createEmployeeDocument(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-employee-documents'] }); toast.success('Saved') },
  })
  const del = useMutation({
    mutationFn: deleteEmployeeDocument,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-employee-documents'] }); toast.success('Deleted') },
  })
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDlg({ open: true })}>Add Document</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow sx={{ bgcolor: 'primary.main' }}>
            {['Title', 'Employee', 'Category', 'Notes', ''].map(h => <TableCell key={h} sx={{ color: 'white' }}>{h}</TableCell>)}
          </TableRow></TableHead>
          <TableBody>
            {(docs as any[]).map((d: any) => (
              <TableRow key={d.id} hover>
                <TableCell>{d.title}</TableCell>
                <TableCell>{d.user?.full_name ?? d.user?.email ?? d.user_id}</TableCell>
                <TableCell>{d.category?.name ?? '—'}</TableCell>
                <TableCell>{d.notes ?? '—'}</TableCell>
                <TableCell>
                  <CrudEditBtn onEdit={() => setDlg({ open: true, item: d })} />
                  <CrudDeleteBtn onDelete={() => del.mutate(d.id)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <SimpleDialog open={dlg.open} title={dlg.item ? 'Edit Document' : 'Add Document'}
        fields={FIELDS} initial={dlg.item ?? {}} onClose={() => setDlg({ open: false })}
        onSave={data => mut.mutate(data)} />
    </Box>
  )
}

function ContractsTab() {
  const qc = useQueryClient()
  const { data: contracts = [] } = useQuery({ queryKey: ['hr-employee-contracts'], queryFn: () => fetchEmployeeContracts() })
  const [dlg, setDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const FIELDS: FieldDef[] = [
    { key: 'title', label: 'Contract Title' },
    { key: 'start_date', label: 'Start Date', type: 'date' },
    { key: 'end_date', label: 'End Date', type: 'date' },
    { key: 'status', label: 'Status', type: 'select', options: ['draft', 'active', 'expired', 'terminated'] },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ]
  const mut = useMutation({
    mutationFn: (data: any) => dlg.item ? updateEmployeeContract(dlg.item.id, data) : createEmployeeContract(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-employee-contracts'] }); toast.success('Saved') },
  })
  const del = useMutation({
    mutationFn: deleteEmployeeContract,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-employee-contracts'] }); toast.success('Deleted') },
  })
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDlg({ open: true })}>New Contract</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow sx={{ bgcolor: 'primary.main' }}>
            {['Title', 'Employee', 'Start', 'End', 'Status', ''].map(h => <TableCell key={h} sx={{ color: 'white' }}>{h}</TableCell>)}
          </TableRow></TableHead>
          <TableBody>
            {(contracts as any[]).map((c: any) => (
              <TableRow key={c.id} hover>
                <TableCell>{c.title}</TableCell>
                <TableCell>{c.user?.full_name ?? c.user?.email ?? c.user_id}</TableCell>
                <TableCell>{fmt(c.start_date)}</TableCell>
                <TableCell>{fmt(c.end_date)}</TableCell>
                <TableCell><Chip size="small" label={c.status} color={c.status === 'active' ? 'success' : c.status === 'expired' ? 'error' : 'default'} /></TableCell>
                <TableCell>
                  <CrudEditBtn onEdit={() => setDlg({ open: true, item: c })} />
                  <CrudDeleteBtn onDelete={() => del.mutate(c.id)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <SimpleDialog open={dlg.open} title={dlg.item ? 'Edit Contract' : 'New Contract'}
        fields={FIELDS} initial={dlg.item ?? {}} onClose={() => setDlg({ open: false })}
        onSave={data => mut.mutate(data)} />
    </Box>
  )
}

function AcknowledgmentsTab() {
  const qc = useQueryClient()
  const { data: acks = [] } = useQuery({ queryKey: ['hr-acknowledgments'], queryFn: () => fetchAcknowledgments() })
  const [dlg, setDlg] = useState<{ open: boolean }>({ open: false })
  const FIELDS: FieldDef[] = [
    { key: 'document_title', label: 'Document Title' },
    { key: 'acknowledged_at', label: 'Acknowledged At', type: 'date' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ]
  const mut = useMutation({
    mutationFn: createAcknowledgment,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-acknowledgments'] }); toast.success('Saved') },
  })
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDlg({ open: true })}>Record Acknowledgment</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow sx={{ bgcolor: 'primary.main' }}>
            {['Document', 'Employee', 'Acknowledged', 'Notes'].map(h => <TableCell key={h} sx={{ color: 'white' }}>{h}</TableCell>)}
          </TableRow></TableHead>
          <TableBody>
            {(acks as any[]).map((a: any) => (
              <TableRow key={a.id} hover>
                <TableCell>{a.document_title ?? a.document?.title ?? '—'}</TableCell>
                <TableCell>{a.user?.full_name ?? a.user?.email ?? a.user_id}</TableCell>
                <TableCell>{fmt(a.acknowledged_at)}</TableCell>
                <TableCell>{a.notes ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <SimpleDialog open={dlg.open} title="Record Acknowledgment"
        fields={FIELDS} initial={{}} onClose={() => setDlg({ open: false })}
        onSave={data => mut.mutate(data)} />
    </Box>
  )
}

function DocTemplatesTab() {
  const qc = useQueryClient()
  const { data: templates = [] } = useQuery({ queryKey: ['hr-document-templates'], queryFn: () => fetchDocumentTemplates() })
  const [dlg, setDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const FIELDS: FieldDef[] = [
    { key: 'name', label: 'Template Name' },
    { key: 'content', label: 'Content', type: 'textarea' },
    { key: 'description', label: 'Description', type: 'textarea' },
  ]
  const mut = useMutation({
    mutationFn: (data: any) => dlg.item ? updateDocumentTemplate(dlg.item.id, data) : createDocumentTemplate(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-document-templates'] }); toast.success('Saved') },
  })
  const del = useMutation({
    mutationFn: deleteDocumentTemplate,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-document-templates'] }); toast.success('Deleted') },
  })
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDlg({ open: true })}>New Template</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow sx={{ bgcolor: 'primary.main' }}>
            {['Name', 'Description', ''].map(h => <TableCell key={h} sx={{ color: 'white' }}>{h}</TableCell>)}
          </TableRow></TableHead>
          <TableBody>
            {(templates as any[]).map((t: any) => (
              <TableRow key={t.id} hover>
                <TableCell>{t.name}</TableCell>
                <TableCell>{t.description ?? '—'}</TableCell>
                <TableCell>
                  <CrudEditBtn onEdit={() => setDlg({ open: true, item: t })} />
                  <CrudDeleteBtn onDelete={() => del.mutate(t.id)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <SimpleDialog open={dlg.open} title={dlg.item ? 'Edit Template' : 'New Document Template'}
        fields={FIELDS} initial={dlg.item ?? {}} onClose={() => setDlg({ open: false })}
        onSave={data => mut.mutate(data)} />
    </Box>
  )
}

function ContractTemplatesTab() {
  const qc = useQueryClient()
  const { data: templates = [] } = useQuery({ queryKey: ['hr-contract-templates'], queryFn: () => fetchContractTemplates() })
  const [dlg, setDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const FIELDS: FieldDef[] = [
    { key: 'name', label: 'Template Name' },
    { key: 'content', label: 'Content', type: 'textarea' },
    { key: 'description', label: 'Description', type: 'textarea' },
  ]
  const mut = useMutation({
    mutationFn: (data: any) => dlg.item ? updateContractTemplate(dlg.item.id, data) : createContractTemplate(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-contract-templates'] }); toast.success('Saved') },
  })
  const del = useMutation({
    mutationFn: deleteContractTemplate,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-contract-templates'] }); toast.success('Deleted') },
  })
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDlg({ open: true })}>New Template</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow sx={{ bgcolor: 'primary.main' }}>
            {['Name', 'Description', ''].map(h => <TableCell key={h} sx={{ color: 'white' }}>{h}</TableCell>)}
          </TableRow></TableHead>
          <TableBody>
            {(templates as any[]).map((t: any) => (
              <TableRow key={t.id} hover>
                <TableCell>{t.name}</TableCell>
                <TableCell>{t.description ?? '—'}</TableCell>
                <TableCell>
                  <CrudEditBtn onEdit={() => setDlg({ open: true, item: t })} />
                  <CrudDeleteBtn onDelete={() => del.mutate(t.id)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <SimpleDialog open={dlg.open} title={dlg.item ? 'Edit Template' : 'New Contract Template'}
        fields={FIELDS} initial={dlg.item ?? {}} onClose={() => setDlg({ open: false })}
        onSave={data => mut.mutate(data)} />
    </Box>
  )
}

function CategoriesTab() {
  const qc = useQueryClient()
  const { data: categories = [] } = useQuery({ queryKey: ['hr-doc-categories'], queryFn: fetchDocumentCategories })
  const { data: contractTypes = [] } = useQuery({ queryKey: ['hr-contract-types'], queryFn: fetchContractTypes })
  const [catDlg, setCatDlg] = useState(false)
  const [catName, setCatName] = useState('')
  const [ctDlg, setCtDlg] = useState(false)
  const [ctName, setCtName] = useState('')
  const createCat = useMutation({
    mutationFn: () => createDocumentCategory({ name: catName }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-doc-categories'] }); toast.success('Category created'); setCatDlg(false); setCatName('') },
  })
  const delCat = useMutation({
    mutationFn: deleteDocumentCategory,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-doc-categories'] }); toast.success('Deleted') },
  })
  const createCt = useMutation({
    mutationFn: () => createContractType({ name: ctName }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-contract-types'] }); toast.success('Type created'); setCtDlg(false); setCtName('') },
  })
  const delCt = useMutation({
    mutationFn: deleteContractType,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-contract-types'] }); toast.success('Deleted') },
  })
  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="subtitle1" fontWeight={700}>Document Categories</Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={() => setCatDlg(true)}>Add</Button>
            </Box>
            <List dense>
              {(categories as any[]).map((c: any) => (
                <Box key={c.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                  <Typography variant="body2">{c.name}</Typography>
                  <CrudDeleteBtn onDelete={() => delCat.mutate(c.id)} />
                </Box>
              ))}
            </List>
          </CardContent>
        </Card>
        <Dialog open={catDlg} onClose={() => setCatDlg(false)}>
          <DialogTitle>Add Category</DialogTitle>
          <DialogContent sx={{ pt: '16px !important' }}>
            <TextField autoFocus label="Name" size="small" fullWidth value={catName} onChange={e => setCatName(e.target.value)} />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCatDlg(false)}>Cancel</Button>
            <Button variant="contained" onClick={() => createCat.mutate()}>Save</Button>
          </DialogActions>
        </Dialog>
      </Grid>
      <Grid item xs={12} md={6}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="subtitle1" fontWeight={700}>Contract Types</Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={() => setCtDlg(true)}>Add</Button>
            </Box>
            <List dense>
              {(contractTypes as any[]).map((t: any) => (
                <Box key={t.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                  <Typography variant="body2">{t.name}</Typography>
                  <CrudDeleteBtn onDelete={() => delCt.mutate(t.id)} />
                </Box>
              ))}
            </List>
          </CardContent>
        </Card>
        <Dialog open={ctDlg} onClose={() => setCtDlg(false)}>
          <DialogTitle>Add Contract Type</DialogTitle>
          <DialogContent sx={{ pt: '16px !important' }}>
            <TextField autoFocus label="Name" size="small" fullWidth value={ctName} onChange={e => setCtName(e.target.value)} />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCtDlg(false)}>Cancel</Button>
            <Button variant="contained" onClick={() => createCt.mutate()}>Save</Button>
          </DialogActions>
        </Dialog>
      </Grid>
    </Grid>
  )
}

function DocumentsSection() {
  const [tab, setTab] = useState(0)
  return (
    <Box>
      <Typography variant="h6" fontWeight={700} gutterBottom>Documents</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }} variant="scrollable">
        <Tab label="HR Documents" />
        <Tab label="Contracts" />
        <Tab label="Acknowledgments" />
        <Tab label="Document Templates" />
        <Tab label="Contract Templates" />
        <Tab label="Categories & Types" />
      </Tabs>
      {tab === 0 && <HRDocsTab />}
      {tab === 1 && <ContractsTab />}
      {tab === 2 && <AcknowledgmentsTab />}
      {tab === 3 && <DocTemplatesTab />}
      {tab === 4 && <ContractTemplatesTab />}
      {tab === 5 && <CategoriesTab />}
    </Box>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

const SECTION_COMPONENTS: Record<string, React.FC> = {
  dashboard: DashboardSection,
  calendar: CalendarSection,
  employees: EmployeesSection,
  org: OrgSection,
  attendance: AttendanceSection,
  leave: LeaveSection,
  recruitment: RecruitmentSection,
  lifecycle: LifecycleSection,
  payroll: PayrollSection,
  meetings: MeetingsSection,
  documents: DocumentsSection,
}

export default function HR() {
  const [active, setActive] = useState('dashboard')
  const ActiveSection = SECTION_COMPONENTS[active]

  return (
    <Box sx={{ display: 'flex', height: '100%', minHeight: 0 }}>
      {/* Sidebar */}
      <Paper
        elevation={2}
        sx={{
          width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column',
          borderRight: '1px solid', borderColor: 'divider', borderRadius: 0,
        }}
      >
        <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle1" fontWeight={700} color="primary">HR Module</Typography>
        </Box>
        <List dense sx={{ flex: 1, overflow: 'auto', py: 1 }}>
          {NAV.map(n => (
            <ListItemButton
              key={n.key}
              selected={active === n.key}
              onClick={() => setActive(n.key)}
              sx={{
                borderRadius: 1, mx: 0.5, mb: 0.25,
                '&.Mui-selected': { bgcolor: 'primary.main', color: 'white', '& .MuiListItemIcon-root': { color: 'white' } },
                '&.Mui-selected:hover': { bgcolor: 'primary.dark' },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>{n.icon}</ListItemIcon>
              <ListItemText primary={n.label} primaryTypographyProps={{ variant: 'body2' }} />
            </ListItemButton>
          ))}
        </List>
      </Paper>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
        {ActiveSection ? <ActiveSection /> : null}
      </Box>
    </Box>
  )
}
