import { useState, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Avatar, Box, Button, Card, CardContent, Chip, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  FormControl, Grid, IconButton, InputLabel, List, MenuItem,
  Paper, Select, Tab, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Tabs, TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import AnnouncementIcon from '@mui/icons-material/Announcement'
import AssignmentIcon from '@mui/icons-material/Assignment'
import BeachAccessIcon from '@mui/icons-material/BeachAccess'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import FolderIcon from '@mui/icons-material/Folder'
import GroupsIcon from '@mui/icons-material/Groups'
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn'
import AttachMoneyIcon from '@mui/icons-material/AttachMoney'
import PeopleIcon from '@mui/icons-material/People'
import SpeedIcon from '@mui/icons-material/Speed'
import TimerIcon from '@mui/icons-material/Timer'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import VideoCallIcon from '@mui/icons-material/VideoCall'
import WorkIcon from '@mui/icons-material/Work'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
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
  fetchPayrollConfigs, createPayrollConfig, updatePayrollConfig,
  fetchPayrollRuns, createPayrollRun, updatePayrollRun, processPayrollRun,
  fetchMeetings, createMeeting, updateMeeting, deleteMeeting, upsertMeetingMinutes,
  fetchDocumentCategories, createDocumentCategory, deleteDocumentCategory,
  fetchContractTypes, createContractType, deleteContractType,
  fetchDocumentTemplates, createDocumentTemplate, updateDocumentTemplate, deleteDocumentTemplate,
  fetchContractTemplates, createContractTemplate, updateContractTemplate, deleteContractTemplate,
  fetchEmployeeDocuments, createEmployeeDocument, updateEmployeeDocument, deleteEmployeeDocument,
  fetchEmployeeContracts, createEmployeeContract, updateEmployeeContract, deleteEmployeeContract,
  fetchAcknowledgments, createAcknowledgment,
  fetchTimesheets, createTimesheet, updateTimesheet, deleteTimesheet, generateTimesheets,
  fetchEmployeeSubmissions, reviewEmployeeSubmission,
  fetchEmployeePolicyAssignments, createEmployeePolicyAssignment, deleteEmployeePolicyAssignment,
} from '@/api/hr'
import { fetchAttendanceEvents } from '@/api/attendance'

// ── Nav ──────────────────────────────────────────────────────────────────────

const NAV = [
  { key: 'dashboard',   label: 'Dashboard',         icon: <SpeedIcon /> },
  { key: 'calendar',    label: 'Calendar',           icon: <CalendarMonthIcon /> },
  { key: 'employees',   label: 'Employees',          icon: <PeopleIcon /> },
  { key: 'org',         label: 'Organization',       icon: <GroupsIcon /> },
  { key: 'attendance',  label: 'Attendance',         icon: <AccessTimeIcon /> },
  { key: 'leave',       label: 'Leave Management',   icon: <BeachAccessIcon /> },
  { key: 'timesheets',  label: 'Timesheets',         icon: <TimerIcon /> },
  { key: 'recruitment', label: 'Recruitment',        icon: <WorkIcon /> },
  { key: 'lifecycle',   label: 'Employee Lifecycle', icon: <TrendingUpIcon /> },
  { key: 'payroll',     label: 'Payroll',            icon: <MonetizationOnIcon /> },
  { key: 'meetings',    label: 'Meetings',           icon: <VideoCallIcon /> },
  { key: 'documents',   label: 'Documents',          icon: <FolderIcon /> },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (d?: string | null) => d ? new Date(d).toLocaleDateString() : '—'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

interface FieldDef { key: string; label: string; type?: 'text'|'number'|'date'|'select'|'textarea'; options?: string[] }

function CrudDeleteBtn({ onDelete }: { onDelete: () => void }) {
  return <Tooltip title="Delete"><IconButton size="small" color="error" onClick={onDelete}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
}
function CrudEditBtn({ onEdit }: { onEdit: () => void }) {
  return <Tooltip title="Edit"><IconButton size="small" onClick={onEdit}><EditIcon fontSize="small" /></IconButton></Tooltip>
}

function SimpleDialog({ open, title, fields, initial, onClose, onSave }: {
  open: boolean; title: string; fields: FieldDef[]
  initial: Record<string, any>; onClose: () => void; onSave: (d: Record<string, any>) => void
}) {
  const [form, setForm] = useState<Record<string, any>>(initial)
  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))
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
              type={f.type ?? 'text'} value={form[f.key] ?? ''}
              onChange={e => set(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)}
              InputLabelProps={f.type === 'date' ? { shrink: true } : undefined} />
          )
        })}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => { onSave(form); onClose() }}>Save</Button>
      </DialogActions>
    </Dialog>
  )
}

function KpiCard({ label, value, icon, gradient }: { label: string; value: any; icon: React.ReactNode; gradient: string }) {
  return (
    <Card sx={{ flex: 1, minWidth: 150 }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Avatar sx={{ background: gradient, width: 48, height: 48 }}>{icon}</Avatar>
        <Box>
          <Typography variant="h5" fontWeight={700}>{value ?? '—'}</Typography>
          <Typography variant="caption" color="text.secondary">{label}</Typography>
        </Box>
      </CardContent>
    </Card>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <TableCell sx={{
      bgcolor: 'primary.main', color: 'white', fontWeight: 700,
      fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em',
    }}>
      {children}
    </TableCell>
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
        <KpiCard label="Total Employees" value={d.total_employees} icon={<PeopleIcon />} gradient="linear-gradient(135deg,#7161D8,#9B8EF0)" />
        <KpiCard label="Pending Leaves" value={d.pending_leave_requests} icon={<BeachAccessIcon />} gradient="linear-gradient(135deg,#F05D92,#F9A8C7)" />
        <KpiCard label="Open Positions" value={d.open_job_openings} icon={<WorkIcon />} gradient="linear-gradient(135deg,#7161D8,#F05D92)" />
        <KpiCard label="Upcoming Meetings" value={d.upcoming_meetings} icon={<VideoCallIcon />} gradient="linear-gradient(135deg,#5445B3,#7161D8)" />
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
              {(d.upcoming_holidays_list ?? []).length === 0
                ? <Typography color="text.secondary" variant="body2">No upcoming holidays</Typography>
                : (d.upcoming_holidays_list ?? []).map((h: any) => (
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

type CalView = 'month' | 'week' | 'day'

interface CalEvent { id: string; date: string; endDate?: string; label: string; color: string; type: string }

function CalendarSection() {
  const [viewDate, setViewDate] = useState(new Date())
  const [view, setView] = useState<CalView>('month')
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const { data: holidays = [] } = useQuery({ queryKey: ['hr-holidays', year], queryFn: () => fetchHolidays(year) })
  const { data: meetingsData } = useQuery({ queryKey: ['hr-meetings'], queryFn: () => fetchMeetings() })
  const { data: leavesData } = useQuery({ queryKey: ['hr-leave-requests', 'approved'], queryFn: () => fetchLeaveRequests({ status: 'approved' }) })

  const events: CalEvent[] = useMemo(() => {
    const evts: CalEvent[] = []
    ;(holidays as any[]).forEach((h: any) => {
      evts.push({ id: `h-${h.id}`, date: h.date, label: h.name, color: '#2e7d32', type: 'Holiday' })
    })
    const meetings = (meetingsData as any)?.items ?? (Array.isArray(meetingsData) ? meetingsData : [])
    meetings.forEach((m: any) => {
      if (m.scheduled_at) {
        evts.push({ id: `m-${m.id}`, date: m.scheduled_at.slice(0, 10), label: m.title, color: '#1976d2', type: 'Meeting' })
      }
    })
    const leaves = (leavesData as any)?.items ?? (Array.isArray(leavesData) ? leavesData : [])
    leaves.forEach((l: any) => {
      if (l.start_date) {
        const name = l.user?.full_name ?? l.user?.email ?? 'Employee'
        const typeName = l.leave_type?.name ?? 'Leave'
        evts.push({ id: `l-${l.id}`, date: l.start_date, endDate: l.end_date, label: `${name} – ${typeName}`, color: '#ed6c02', type: 'Leave' })
      }
    })
    return evts
  }, [holidays, meetingsData, leavesData])

  const eventsForDate = (dateStr: string) => events.filter(e => {
    if (!e.endDate) return e.date === dateStr
    return dateStr >= e.date && dateStr <= e.endDate
  })

  const navigate = (dir: number) => {
    const d = new Date(viewDate)
    if (view === 'month') d.setMonth(d.getMonth() + dir)
    else if (view === 'week') d.setDate(d.getDate() + dir * 7)
    else d.setDate(d.getDate() + dir)
    setViewDate(d)
  }

  const today = new Date().toISOString().slice(0, 10)

  // Build calendar grid for month view
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (string | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push(ds)
  }
  while (cells.length % 7 !== 0) cells.push(null)

  // Week view: 7 days starting from Sunday of current week
  const weekStart = new Date(viewDate)
  weekStart.setDate(viewDate.getDate() - viewDate.getDay())
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d.toISOString().slice(0, 10)
  })

  const titleStr = view === 'month'
    ? `${MONTHS[month]} ${year}`
    : view === 'week'
    ? `Week of ${new Date(weekDays[0]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(weekDays[6]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : viewDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  const EventChip = ({ e }: { e: CalEvent }) => (
    <Box sx={{
      bgcolor: e.color, color: '#fff', borderRadius: '3px',
      px: 0.5, py: 0.1, mb: 0.25, fontSize: '11px',
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      cursor: 'default',
    }} title={`${e.type}: ${e.label}`}>
      {e.label}
    </Box>
  )

  return (
    <Box>
      {/* Legend */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        {[{ color: '#1976d2', label: 'Meetings' }, { color: '#2e7d32', label: 'Holidays' }, { color: '#ed6c02', label: 'Leaves' }].map(l => (
          <Box key={l.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: l.color }} />
            <Typography variant="body2">{l.label}</Typography>
          </Box>
        ))}
      </Box>

      {/* Controls */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1 }}>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton onClick={() => navigate(-1)} size="small" sx={{ bgcolor: 'primary.main', color: 'white', '&:hover': { bgcolor: 'primary.dark' } }}>
            <ChevronLeftIcon />
          </IconButton>
          <IconButton onClick={() => navigate(1)} size="small" sx={{ bgcolor: 'primary.main', color: 'white', '&:hover': { bgcolor: 'primary.dark' } }}>
            <ChevronRightIcon />
          </IconButton>
          <Button size="small" variant="outlined" sx={{ ml: 0.5 }} onClick={() => setViewDate(new Date())}>today</Button>
        </Box>
        <Typography variant="h6" fontWeight={700} sx={{ flex: 1, textAlign: 'center' }}>{titleStr}</Typography>
        <Box sx={{ display: 'flex', border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
          {(['month', 'week', 'day'] as CalView[]).map(v => (
            <Button key={v} size="small" onClick={() => setView(v)}
              sx={{ borderRadius: 0, bgcolor: view === v ? 'primary.main' : 'transparent', color: view === v ? 'white' : 'text.primary', minWidth: 64 }}>
              {v}
            </Button>
          ))}
        </Box>
      </Box>

      {/* Month view */}
      {view === 'month' && (
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', bgcolor: 'grey.100' }}>
            {DAYS.map(d => (
              <Box key={d} sx={{ p: 1, textAlign: 'center', fontWeight: 700, fontSize: 13 }}>{d}</Box>
            ))}
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
            {cells.map((dateStr, i) => {
              const isToday = dateStr === today
              const dayEvts = dateStr ? eventsForDate(dateStr) : []
              return (
                <Box key={i} sx={{
                  minHeight: 100, p: 0.5, borderTop: '1px solid', borderRight: i % 7 !== 6 ? '1px solid' : 'none',
                  borderColor: 'divider',
                  bgcolor: isToday ? '#fffde7' : 'transparent',
                }}>
                  {dateStr && (
                    <>
                      <Typography variant="caption" sx={{ fontWeight: isToday ? 700 : 400, color: isToday ? 'primary.main' : 'text.secondary' }}>
                        {Number(dateStr.slice(8))}
                      </Typography>
                      {dayEvts.slice(0, 3).map(e => <EventChip key={e.id} e={e} />)}
                      {dayEvts.length > 3 && <Typography variant="caption" color="text.secondary">+{dayEvts.length - 3} more</Typography>}
                    </>
                  )}
                </Box>
              )
            })}
          </Box>
        </Paper>
      )}

      {/* Week view */}
      {view === 'week' && (
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
            {weekDays.map((ds, i) => {
              const d = new Date(ds)
              const isToday = ds === today
              const dayEvts = eventsForDate(ds)
              return (
                <Box key={ds} sx={{
                  minHeight: 200, p: 1, borderRight: i < 6 ? '1px solid' : 'none', borderColor: 'divider',
                  bgcolor: isToday ? '#fffde7' : 'transparent',
                }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5, color: isToday ? 'primary.main' : 'text.secondary' }}>
                    {DAYS[d.getDay()]} {d.getDate()}
                  </Typography>
                  {dayEvts.map(e => <EventChip key={e.id} e={e} />)}
                </Box>
              )
            })}
          </Box>
        </Paper>
      )}

      {/* Day view */}
      {view === 'day' && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          {eventsForDate(viewDate.toISOString().slice(0, 10)).length === 0
            ? <Typography color="text.secondary">No events this day</Typography>
            : eventsForDate(viewDate.toISOString().slice(0, 10)).map(e => (
              <Box key={e.id} sx={{ p: 1.5, mb: 1, bgcolor: e.color, color: 'white', borderRadius: 1 }}>
                <Typography variant="body2" fontWeight={700}>{e.label}</Typography>
                <Typography variant="caption">{e.type}</Typography>
              </Box>
            ))}
        </Paper>
      )}
    </Box>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// EMPLOYEES
// ══════════════════════════════════════════════════════════════════════════════

const CURRENCIES = [
  { code: 'USD', symbol: '$',   label: 'USD — US Dollar' },
  { code: 'PKR', symbol: 'PKR', label: 'PKR — Pakistani Rupee' },
]
const currencySymbol = (code: string | null | undefined) => {
  if (!code) return '$'
  return CURRENCIES.find(c => c.code === code)?.symbol ?? code
}

const EMPTY_WAGE_FORM = { currency: 'USD', base_salary: '', hourly_rate: '', tax_percentage: '', pay_frequency: 'monthly', effective_from: new Date().toISOString().slice(0, 10) }

function EmployeesSection() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['hr-employees', search],
    queryFn: () => fetchHREmployees(search ? { search } : undefined),
  })
  const list: any[] = Array.isArray(employees) ? employees : (employees as any).items ?? []

  const { data: payrollConfigsRaw = [] } = useQuery({
    queryKey: ['hr-payroll-configs-all'],
    queryFn: () => fetchPayrollConfigs(),
  })
  const allConfigs: any[] = Array.isArray(payrollConfigsRaw) ? payrollConfigsRaw : (payrollConfigsRaw as any).items ?? []
  // latest config per employee
  const wageMap: Record<number, any> = {}
  for (const c of allConfigs) {
    if (!wageMap[c.user_id] || new Date(c.effective_from) > new Date(wageMap[c.user_id].effective_from)) {
      wageMap[c.user_id] = c
    }
  }

  const [wageDlg, setWageDlg] = useState<{ open: boolean; emp?: any }>({ open: false })
  const [wageForm, setWageForm] = useState<any>(EMPTY_WAGE_FORM)

  const openWage = (emp: any) => {
    const existing = wageMap[emp.id]
    setWageForm(existing
      ? { currency: existing.currency ?? 'USD', base_salary: existing.base_salary ?? '', hourly_rate: existing.hourly_rate ?? '', tax_percentage: existing.tax_percentage ?? '', pay_frequency: existing.pay_frequency ?? 'monthly', effective_from: existing.effective_from }
      : { ...EMPTY_WAGE_FORM })
    setWageDlg({ open: true, emp })
  }

  const wageMut = useMutation({
    mutationFn: (d: any) => createPayrollConfig(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-payroll-configs-all'] })
      toast.success('Wage saved')
      setWageDlg({ open: false })
    },
    onError: () => toast.error('Failed to save wage'),
  })

  const formatWage = (cfg: any) => {
    if (!cfg) return null
    const currency = cfg.currency || 'USD'
    const prefix = currency === 'USD' ? '$' : `${currency} `
    const tax = cfg.tax_percentage && Number(cfg.tax_percentage) > 0 ? ` · ${cfg.tax_percentage}% tax` : ''
    if (cfg.hourly_rate && Number(cfg.hourly_rate) > 0) return `${prefix}${Number(cfg.hourly_rate).toFixed(2)}/hr${tax}`
    if (cfg.base_salary && Number(cfg.base_salary) > 0) return `${prefix}${Number(cfg.base_salary).toLocaleString()}/mo${tax}`
    return null
  }

  return (
    <Box>
      <Typography variant="h6" fontWeight={700} gutterBottom>Employees</Typography>
      <TextField size="small" placeholder="Search employees…" value={search}
        onChange={e => setSearch(e.target.value)} sx={{ mb: 2, width: 320 }} />
      {isLoading ? <CircularProgress /> : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead><TableRow>
              {['#', 'Name', 'Email', 'Role', 'Department', 'Facility', 'Wage', ''].map(h => <Th key={h}>{h}</Th>)}
            </TableRow></TableHead>
            <TableBody>
              {list.length === 0
                ? <TableRow><TableCell colSpan={8} align="center">No employees found</TableCell></TableRow>
                : list.map((e: any, i: number) => {
                  const wage = formatWage(wageMap[e.id])
                  return (
                    <TableRow key={e.id} hover>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Avatar src={e.avatar_url} sx={{ width: 30, height: 30 }}>
                            {(e.full_name ?? e.email)?.[0]?.toUpperCase()}
                          </Avatar>
                          <Box>
                            <Typography variant="body2">{e.full_name ?? (`${e.first_name ?? ''} ${e.last_name ?? ''}`.trim() || e.email)}</Typography>
                            <Typography variant="caption" color="text.secondary">{e.role}</Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>{e.email}</TableCell>
                      <TableCell><Chip size="small" label={e.role} /></TableCell>
                      <TableCell>{e.department?.name ?? '—'}</TableCell>
                      <TableCell>{e.facility?.name ?? '—'}</TableCell>
                      <TableCell>
                        {wage
                          ? <Chip size="small" icon={<AttachMoneyIcon />} label={wage} sx={{ bgcolor: 'rgba(113,97,216,0.1)', color: 'primary.main', fontWeight: 700 }} />
                          : <Typography variant="caption" color="error.main">Not set</Typography>}
                      </TableCell>
                      <TableCell>
                        <Tooltip title={wage ? 'Update Wage' : 'Set Wage'}>
                          <IconButton size="small" sx={{ color: wage ? 'primary.main' : 'warning.main' }} onClick={() => openWage(e)}>
                            <AttachMoneyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  )
                })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Set Wage Dialog */}
      <Dialog open={wageDlg.open} onClose={() => setWageDlg({ open: false })} maxWidth="xs" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Avatar sx={{ bgcolor: 'primary.main', width: 36, height: 36 }}><AttachMoneyIcon fontSize="small" /></Avatar>
            <Box>
              <Typography fontWeight={700}>{wageDlg.emp?.full_name ?? wageDlg.emp?.email}</Typography>
              <Typography variant="caption" color="text.secondary">Set wage / salary</Typography>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <FormControl size="small" fullWidth>
            <InputLabel>Currency</InputLabel>
            <Select label="Currency" value={wageForm.currency}
              onChange={e => setWageForm((p: any) => ({ ...p, currency: e.target.value }))}>
              {CURRENCIES.map(c => (
                <MenuItem key={c.code} value={c.code}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography fontWeight={700} sx={{ minWidth: 28 }}>{c.symbol}</Typography>
                    <Typography variant="body2">{c.label}</Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography variant="caption" color="text.secondary">
            Hourly rate takes priority over base salary. Leave one blank if not applicable.
          </Typography>
          <TextField
            label={`Hourly Rate (${currencySymbol(wageForm.currency)})`}
            type="number" size="small" fullWidth
            value={wageForm.hourly_rate}
            inputProps={{ min: 0, step: 0.01 }}
            onChange={e => setWageForm((p: any) => ({ ...p, hourly_rate: e.target.value }))}
            helperText={`Daily rate = hourly × 8`}
          />
          <TextField
            label={`Base Monthly Salary (${currencySymbol(wageForm.currency)})`}
            type="number" size="small" fullWidth
            value={wageForm.base_salary}
            inputProps={{ min: 0, step: 1 }}
            onChange={e => setWageForm((p: any) => ({ ...p, base_salary: e.target.value }))}
            helperText="Daily rate = salary ÷ 22 working days"
          />
          <TextField
            label="Tax Percentage (%)"
            type="number" size="small" fullWidth
            value={wageForm.tax_percentage}
            inputProps={{ min: 0, max: 100, step: 0.5 }}
            onChange={e => setWageForm((p: any) => ({ ...p, tax_percentage: e.target.value }))}
            helperText="Auto-deducted from net pay every payroll run. Leave 0 to use tax brackets instead."
          />
          <TextField
            label="Effective From"
            type="date" size="small" fullWidth
            value={wageForm.effective_from}
            InputLabelProps={{ shrink: true }}
            onChange={e => setWageForm((p: any) => ({ ...p, effective_from: e.target.value }))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWageDlg({ open: false })}>Cancel</Button>
          <Button
            variant="contained"
            disabled={wageMut.isPending || (!wageForm.hourly_rate && !wageForm.base_salary)}
            onClick={() => wageMut.mutate({
              user_id: wageDlg.emp?.id,
              currency: wageForm.currency,
              hourly_rate: wageForm.hourly_rate ? Number(wageForm.hourly_rate) : null,
              base_salary: wageForm.base_salary ? Number(wageForm.base_salary) : 0,
              tax_percentage: wageForm.tax_percentage ? Number(wageForm.tax_percentage) : 0,
              pay_frequency: wageForm.pay_frequency,
              effective_from: wageForm.effective_from,
            })}
          >
            Save Wage
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ORGANIZATION
// ══════════════════════════════════════════════════════════════════════════════

function HolidaysTab() {
  const qc = useQueryClient()
  const year = new Date().getFullYear()
  const { data: holidays = [] } = useQuery({ queryKey: ['hr-holidays', year], queryFn: () => fetchHolidays(year) })
  const [dlg, setDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const FIELDS: FieldDef[] = [
    { key: 'name', label: 'Holiday Name' },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'type', label: 'Type', type: 'select', options: ['public', 'optional', 'company'] },
    { key: 'description', label: 'Description', type: 'textarea' },
  ]
  const mut = useMutation({
    mutationFn: (d: any) => dlg.item ? updateHoliday(dlg.item.id, d) : createHoliday(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-holidays'] }); toast.success('Saved') },
  })
  const del = useMutation({ mutationFn: deleteHoliday, onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-holidays'] }); toast.success('Deleted') } })
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDlg({ open: true })}>Add Holiday</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow>
            {['Name','Date','Type','Description',''].map(h => <Th key={h}>{h}</Th>)}
          </TableRow></TableHead>
          <TableBody>
            {(holidays as any[]).map((h: any) => (
              <TableRow key={h.id} hover>
                <TableCell>{h.name}</TableCell>
                <TableCell>{fmt(h.date)}</TableCell>
                <TableCell><Chip size="small" label={h.type ?? h.holiday_type} /></TableCell>
                <TableCell>{h.description ?? '—'}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
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
        onSave={d => mut.mutate(d)} />
    </Box>
  )
}

function AnnouncementsTab() {
  const qc = useQueryClient()
  const { data: announcements = [] } = useQuery({ queryKey: ['hr-announcements'], queryFn: () => fetchAnnouncements() })
  const [dlg, setDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const FIELDS: FieldDef[] = [
    { key: 'title', label: 'Title' },
    { key: 'content', label: 'Body', type: 'textarea' },
    { key: 'priority', label: 'Priority', type: 'select', options: ['low', 'normal', 'high', 'urgent'] },
    { key: 'expires_at', label: 'Expires At', type: 'date' },
  ]
  const mut = useMutation({
    mutationFn: (d: any) => dlg.item ? updateAnnouncement(dlg.item.id, d) : createAnnouncement(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-announcements'] }); toast.success('Saved') },
  })
  const del = useMutation({ mutationFn: deleteAnnouncement, onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-announcements'] }); toast.success('Deleted') } })
  const list: any[] = Array.isArray(announcements) ? announcements : (announcements as any).items ?? []
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDlg({ open: true })}>Add Announcement</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow>
            {['Title','Priority','Expires',''].map(h => <Th key={h}>{h}</Th>)}
          </TableRow></TableHead>
          <TableBody>
            {list.map((a: any) => (
              <TableRow key={a.id} hover>
                <TableCell>{a.title}</TableCell>
                <TableCell><Chip size="small" label={a.priority} color={a.priority === 'urgent' ? 'error' : a.priority === 'high' ? 'warning' : 'default'} /></TableCell>
                <TableCell>{fmt(a.expires_at)}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
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
        onSave={d => mut.mutate(d)} />
    </Box>
  )
}

function OrgSection() {
  const [tab, setTab] = useState(0)
  return (
    <Box>
      <Typography variant="h6" fontWeight={700} gutterBottom>Organization</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Holidays" /><Tab label="Announcements" />
      </Tabs>
      {tab === 0 && <HolidaysTab />}
      {tab === 1 && <AnnouncementsTab />}
    </Box>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ATTENDANCE
// ══════════════════════════════════════════════════════════════════════════════

const STATUS_ICONS: Record<string, { icon: string; color: string; title: string }> = {
  present:   { icon: '✓', color: '#2e7d32', title: 'Present' },
  absent:    { icon: '✗', color: '#d32f2f', title: 'Absent' },
  half_day:  { icon: '½', color: '#ed6c02', title: 'Half Day' },
  on_leave:  { icon: '🚩', color: '#ef5350', title: 'On Leave' },
  holiday:   { icon: '⭐', color: '#2e7d32', title: 'Holiday' },
  day_off:   { icon: '⊘', color: '#9e9e9e', title: 'Day Off' },
  future:    { icon: '–', color: '#bdbdbd', title: 'Future' },
  not_added: { icon: '○', color: '#9e9e9e', title: 'Not Added' },
}

function AttendanceRecordsTab() {
  const now = new Date()
  const [selYear, setSelYear] = useState(now.getFullYear())
  const [selMonth, setSelMonth] = useState(now.getMonth())

  const firstDate = `${selYear}-${String(selMonth + 1).padStart(2, '0')}-01`
  const lastDay = new Date(selYear, selMonth + 1, 0).getDate()
  const lastDate = `${selYear}-${String(selMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data: empData } = useQuery({ queryKey: ['hr-employees'], queryFn: () => fetchHREmployees() })
  const { data: eventsData } = useQuery({
    queryKey: ['attendance-events-month', firstDate, lastDate],
    queryFn: () => fetchAttendanceEvents({ date_from: firstDate, date_to: lastDate, limit: 5000 }),
  })
  const { data: holidaysData = [] } = useQuery({ queryKey: ['hr-holidays', selYear], queryFn: () => fetchHolidays(selYear) })
  const { data: leavesData } = useQuery({ queryKey: ['hr-leave-requests', 'approved'], queryFn: () => fetchLeaveRequests({ status: 'approved' }) })

  const employees: any[] = Array.isArray(empData) ? empData : (empData as any)?.items ?? []
  const events: any[] = (eventsData as any)?.items ?? []
  const holidays: any[] = holidaysData as any[]
  const leaves: any[] = (leavesData as any)?.items ?? (Array.isArray(leavesData) ? leavesData : [])

  const holidayDates = new Set(holidays.map((h: any) => h.date))
  const today = new Date().toISOString().slice(0, 10)

  const days = Array.from({ length: lastDay }, (_, i) => {
    const d = i + 1
    return `${selYear}-${String(selMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  })

  const getStatus = (userId: number, dateStr: string): string => {
    const dt = new Date(dateStr)
    const dow = dt.getDay()
    if (dateStr > today) return 'future'
    if (dow === 0 || dow === 6) return 'day_off'
    if (holidayDates.has(dateStr)) return 'holiday'
    const onLeave = leaves.some((l: any) =>
      l.user_id === userId && dateStr >= l.start_date && dateStr <= l.end_date
    )
    if (onLeave) return 'on_leave'
    const dayEvents = events.filter((e: any) => e.user_id === userId && e.event_time?.slice(0, 10) === dateStr)
    if (dayEvents.length === 0) return 'not_added'
    const hasCheckin = dayEvents.some((e: any) => e.event_type === 'check_in')
    if (hasCheckin) return 'present'
    return 'not_added'
  }

  const countPresent = (userId: number) =>
    days.filter(d => getStatus(userId, d) === 'present').length

  const prevMonth = () => { if (selMonth === 0) { setSelMonth(11); setSelYear(y => y - 1) } else setSelMonth(m => m - 1) }
  const nextMonth = () => { if (selMonth === 11) { setSelMonth(0); setSelYear(y => y + 1) } else setSelMonth(m => m + 1) }

  return (
    <Box>
      {/* Legend */}
      <Paper variant="outlined" sx={{ p: 1.5, mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {Object.entries(STATUS_ICONS).map(([k, v]) => (
          <Box key={k} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography sx={{ color: v.color, fontWeight: 700, fontSize: 14 }}>{v.icon}</Typography>
            <Typography variant="caption">{v.title}</Typography>
          </Box>
        ))}
      </Paper>

      {/* Month nav */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1 }}>
        <IconButton size="small" onClick={prevMonth}><ChevronLeftIcon /></IconButton>
        <Typography fontWeight={700}>{MONTHS[selMonth]} {selYear}</Typography>
        <IconButton size="small" onClick={nextMonth}><ChevronRightIcon /></IconButton>
      </Box>

      <TableContainer component={Paper} sx={{ maxHeight: 520, overflow: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ bgcolor: 'background.paper', minWidth: 200, fontWeight: 700, position: 'sticky', left: 0, zIndex: 3 }}>
                Employee
              </TableCell>
              {days.map(d => {
                const dt = new Date(d)
                const dow = dt.getDay()
                const isWeekend = dow === 0 || dow === 6
                return (
                  <TableCell key={d} align="center" sx={{
                    bgcolor: isWeekend ? 'grey.100' : 'background.paper',
                    fontWeight: 600, minWidth: 36, px: 0.5,
                  }}>
                    <Typography variant="caption" display="block" sx={{ fontWeight: 700 }}>{dt.getDate()}</Typography>
                    <Typography variant="caption" display="block" color="text.secondary" sx={{ fontSize: 9 }}>{DAYS[dow].slice(0, 3)}</Typography>
                  </TableCell>
                )
              })}
              <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 700, minWidth: 80 }}>Total</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {employees.map((emp: any) => {
              const present = countPresent(emp.id)
              return (
                <TableRow key={emp.id} hover>
                  <TableCell sx={{ position: 'sticky', left: 0, bgcolor: 'background.paper', zIndex: 1, borderRight: '1px solid', borderColor: 'divider' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Avatar src={emp.avatar_url} sx={{ width: 28, height: 28, fontSize: 12 }}>
                        {(emp.full_name ?? emp.email)?.[0]?.toUpperCase()}
                      </Avatar>
                      <Box>
                        <Typography variant="body2" sx={{ lineHeight: 1.2 }}>{emp.full_name ?? emp.email}</Typography>
                        <Typography variant="caption" color="text.secondary">{emp.role}</Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  {days.map(d => {
                    const status = getStatus(emp.id, d)
                    const si = STATUS_ICONS[status] ?? STATUS_ICONS.not_added
                    return (
                      <TableCell key={d} align="center" sx={{ px: 0.25, py: 0.5 }}>
                        <Tooltip title={si.title}>
                          <Typography sx={{ color: si.color, fontWeight: 700, fontSize: 14, lineHeight: 1 }}>{si.icon}</Typography>
                        </Tooltip>
                      </TableCell>
                    )
                  })}
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>{present}/{days.filter(d => { const dow = new Date(d).getDay(); return dow !== 0 && dow !== 6 && !holidayDates.has(d) && d <= today }).length}</Typography>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}

const SHIFT_PRESETS = [
  { label: 'Pakistan (6PM–3AM PKT)', start: '18:00', end: '03:00', tz: 'Asia/Karachi' },
  { label: 'US Central (9AM–5PM CT)', start: '09:00', end: '17:00', tz: 'America/Chicago' },
]

function AttendancePoliciesTab() {
  const qc = useQueryClient()
  const { data: rawPolicies = [] } = useQuery({ queryKey: ['hr-attendance-policies'], queryFn: fetchAttendancePolicies })
  const list: any[] = Array.isArray(rawPolicies) ? rawPolicies : (rawPolicies as any).items ?? []

  const [dlg, setDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const [form, setForm] = useState<any>({
    name: '', shift_start_time: '', shift_end_time: '', timezone: 'UTC',
    late_arrival_grace_minutes: 15, early_departure_grace_minutes: 15,
    overtime_rate_per_hour: '', consecutive_late_limit: 3,
    late_strike_action: 'full_day', is_active: true, description: '',
  })
  const openAdd = () => { setForm({ name: '', shift_start_time: '', shift_end_time: '', timezone: 'UTC', late_arrival_grace_minutes: 15, early_departure_grace_minutes: 15, overtime_rate_per_hour: '', consecutive_late_limit: 3, late_strike_action: 'full_day', is_active: true, description: '' }); setDlg({ open: true }) }
  const openEdit = (p: any) => { setForm({ ...p, overtime_rate_per_hour: p.overtime_rate_per_hour ?? '' }); setDlg({ open: true, item: p }) }
  const set = (k: string, v: any) => setForm((prev: any) => ({ ...prev, [k]: v }))

  const mut = useMutation({
    mutationFn: (d: any) => dlg.item ? updateAttendancePolicy(dlg.item.id, d) : createAttendancePolicy(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-attendance-policies'] }); toast.success('Saved'); setDlg({ open: false }) },
  })
  const del = useMutation({ mutationFn: deleteAttendancePolicy, onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-attendance-policies'] }); toast.success('Deleted') } })
  const setAsDefault = (p: any) => {
    updateAttendancePolicy(p.id, { is_default: true }).then(() => {
      qc.invalidateQueries({ queryKey: ['hr-attendance-policies'] })
      toast.success(`"${p.name}" is now the global policy`)
    })
  }

  // KPI summary
  const globalPolicy = list.find(p => p.is_default)
  const avgGrace = list.length ? Math.round(list.reduce((s, p) => s + (p.late_arrival_grace_minutes ?? 0), 0) / list.length) : 0
  const avgOT = list.filter(p => p.overtime_rate_per_hour).length
    ? (list.filter(p => p.overtime_rate_per_hour).reduce((s, p) => s + Number(p.overtime_rate_per_hour), 0) / list.filter(p => p.overtime_rate_per_hour).length)
    : 0

  return (
    <Box>
      {/* KPI Cards */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Policies', value: list.length, icon: '🛡️' },
          { label: 'Global Policy', value: globalPolicy?.name ?? 'Not set', icon: '🌐' },
          { label: 'Avg Late Grace', value: `${avgGrace} min`, icon: '⏰' },
          { label: 'Avg Overtime Rate', value: avgOT > 0 ? `$${avgOT.toFixed(2)}/hr` : '—', icon: '💵' },
        ].map(k => (
          <Card key={k.label} sx={{ flex: 1, minWidth: 160 }}>
            <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="caption" color="text.secondary">{k.label}</Typography>
                <Typography variant="h5" fontWeight={800}>{k.value}</Typography>
              </Box>
              <Typography fontSize={28}>{k.icon}</Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* Add button */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button startIcon={<AddIcon />} variant="contained" onClick={openAdd}>Add Policy</Button>
      </Box>

      {/* Policy Cards Grid */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 2 }}>
        {list.map((p: any) => (
          <Card key={p.id} sx={{ position: 'relative', borderLeft: `4px solid ${p.is_default ? '#F05D92' : p.is_active ? '#7161D8' : '#e0e0e0'}` }}>
            <CardContent>
              {/* Header row */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                  <Avatar sx={{ bgcolor: 'rgba(113,97,216,0.12)', width: 44, height: 44 }}>
                    <Typography fontSize={20}>🛡️</Typography>
                  </Avatar>
                  <Typography variant="subtitle1" fontWeight={800} sx={{ lineHeight: 1.3 }}>{p.name}</Typography>
                </Box>
                {/* Action icons */}
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <Tooltip title="Edit"><IconButton size="small" sx={{ color: 'warning.main' }} onClick={() => openEdit(p)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                  <Tooltip title={p.is_default ? 'Currently applied to all employees' : 'Apply to all employees'}>
                    <IconButton size="small" sx={{ color: p.is_default ? 'primary.main' : 'text.disabled' }} onClick={() => !p.is_default && setAsDefault(p)}>
                      <CheckIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete"><IconButton size="small" sx={{ color: 'error.main' }} onClick={() => del.mutate(p.id)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                </Box>
              </Box>

              {/* Status badges */}
              <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
                <Chip size="small" label={p.is_active ? 'Active' : 'Inactive'} color={p.is_active ? 'success' : 'default'} />
                {p.is_default && <Chip size="small" label="Global" sx={{ bgcolor: 'primary.main', color: 'white', fontWeight: 700 }} />}
              </Box>

              {/* Shift info */}
              {p.shift_start_time && (
                <Typography variant="caption" color="primary.main" sx={{ display: 'block', mb: 1, fontWeight: 700 }}>
                  🕐 {p.shift_start_time} – {p.shift_end_time} ({p.timezone})
                </Typography>
              )}

              {/* Grace / Rate grid */}
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 1 }}>
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography fontSize={14}>⏰</Typography>
                    <Typography variant="body2" fontWeight={700}>{p.late_arrival_grace_minutes ?? p.grace_period_minutes ?? 0} minutes</Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary">Late Arrival Grace</Typography>
                </Box>
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography fontSize={14} color="success.main">💵</Typography>
                    <Typography variant="body2" fontWeight={700}>
                      {p.overtime_rate_per_hour ? `$${Number(p.overtime_rate_per_hour).toFixed(2)}/hr` : '—'}
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary">Overtime Rate</Typography>
                </Box>
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography fontSize={14} color="info.main">⏱</Typography>
                    <Typography variant="body2" fontWeight={700}>{p.early_departure_grace_minutes ?? 0} minutes</Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary">Early Departure Grace</Typography>
                </Box>
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography fontSize={14} color="error.main">⚠️</Typography>
                    <Typography variant="body2" fontWeight={700}>{p.consecutive_late_limit ?? 3} days → {p.late_strike_action === 'full_day' ? '1 day deducted' : p.late_strike_action === 'half_day' ? 'half day deducted' : 'flagged'}</Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary">Consecutive Late Rule</Typography>
                </Box>
              </Box>

              {p.description && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', borderTop: '1px solid', borderColor: 'divider', pt: 1 }}>
                  {p.description.length > 80 ? p.description.slice(0, 80) + '…' : p.description}
                </Typography>
              )}
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* Add/Edit Dialog */}
      <Dialog open={dlg.open} onClose={() => setDlg({ open: false })} fullWidth maxWidth="sm">
        <DialogTitle>{dlg.item ? 'Edit Policy' : 'Add Attendance Policy'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField label="Policy Name" size="small" value={form.name} onChange={e => set('name', e.target.value)} />

          {/* Shift presets */}
          {!dlg.item && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              {SHIFT_PRESETS.map(s => (
                <Button key={s.label} size="small" variant="outlined" onClick={() => setForm((p: any) => ({ ...p, shift_start_time: s.start, shift_end_time: s.end, timezone: s.tz }))}>
                  {s.label}
                </Button>
              ))}
            </Box>
          )}

          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField label="Shift Start (HH:MM)" size="small" sx={{ flex: 1 }} value={form.shift_start_time} onChange={e => set('shift_start_time', e.target.value)} placeholder="09:00" />
            <TextField label="Shift End (HH:MM)" size="small" sx={{ flex: 1 }} value={form.shift_end_time} onChange={e => set('shift_end_time', e.target.value)} placeholder="17:00" />
          </Box>
          <FormControl size="small" fullWidth>
            <InputLabel>Timezone</InputLabel>
            <Select label="Timezone" value={form.timezone ?? 'UTC'} onChange={e => set('timezone', e.target.value)}>
              {['UTC','Asia/Karachi','America/Chicago','America/New_York','America/Los_Angeles','Europe/London'].map(tz => <MenuItem key={tz} value={tz}>{tz}</MenuItem>)}
            </Select>
          </FormControl>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField label="Late Arrival Grace (min)" size="small" type="number" sx={{ flex: 1 }} value={form.late_arrival_grace_minutes} onChange={e => set('late_arrival_grace_minutes', Number(e.target.value))} />
            <TextField label="Early Departure Grace (min)" size="small" type="number" sx={{ flex: 1 }} value={form.early_departure_grace_minutes} onChange={e => set('early_departure_grace_minutes', Number(e.target.value))} />
          </Box>
          <TextField label="Overtime Rate ($/hr)" size="small" type="number" value={form.overtime_rate_per_hour} onChange={e => set('overtime_rate_per_hour', e.target.value)} />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField label="Consecutive Late Days Limit" size="small" type="number" sx={{ flex: 1 }} value={form.consecutive_late_limit} onChange={e => set('consecutive_late_limit', Number(e.target.value))} />
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>Strike Action</InputLabel>
              <Select label="Strike Action" value={form.late_strike_action ?? 'full_day'} onChange={e => set('late_strike_action', e.target.value)}>
                <MenuItem value="none">Flag only (no deduction)</MenuItem>
                <MenuItem value="half_day">Deduct half day</MenuItem>
                <MenuItem value="full_day">Deduct full day</MenuItem>
              </Select>
            </FormControl>
          </Box>
          <TextField label="Description" size="small" multiline rows={2} value={form.description} onChange={e => set('description', e.target.value)} />
          <FormControl size="small" fullWidth>
            <InputLabel>Status</InputLabel>
            <Select label="Status" value={form.is_active ? 'active' : 'inactive'} onChange={e => set('is_active', e.target.value === 'active')}>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="inactive">Inactive</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDlg({ open: false })}>Cancel</Button>
          <Button variant="contained" onClick={() => mut.mutate(form)} disabled={mut.isPending}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

function PolicyAssignmentsTab() {
  const qc = useQueryClient()
  const { data: assignments = [] } = useQuery({ queryKey: ['hr-employee-policy-assignments'], queryFn: fetchEmployeePolicyAssignments })
  const { data: empData } = useQuery({ queryKey: ['hr-employees'], queryFn: () => fetchHREmployees() })
  const { data: policyData = [] } = useQuery({ queryKey: ['hr-attendance-policies'], queryFn: fetchAttendancePolicies })
  const employees: any[] = Array.isArray(empData) ? empData : (empData as any)?.items ?? []
  const policies: any[] = Array.isArray(policyData) ? policyData : (policyData as any)?.items ?? []
  const list: any[] = Array.isArray(assignments) ? assignments : (assignments as any)?.items ?? []

  const globalPolicy = policies.find((p: any) => p.is_default)

  const [dlg, setDlg] = useState(false)
  const [form, setForm] = useState<any>({ user_id: '', policy_id: '', effective_from: new Date().toISOString().slice(0, 10) })

  const mut = useMutation({
    mutationFn: (d: any) => createEmployeePolicyAssignment(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-employee-policy-assignments'] }); toast.success('Policy assigned'); setDlg(false) },
  })
  const del = useMutation({
    mutationFn: deleteEmployeePolicyAssignment,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-employee-policy-assignments'] }); toast.success('Removed — employee will use global policy') },
  })

  const assignedMap = Object.fromEntries(list.map((a: any) => [a.user_id, a]))

  return (
    <Box>
      {globalPolicy && (
        <Box sx={{ mb: 2, p: 1.5, borderRadius: 1, bgcolor: 'rgba(113,97,216,0.07)', border: '1px solid', borderColor: 'primary.light', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography fontSize={18}>🌐</Typography>
          <Typography variant="body2">
            Global default: <strong>{globalPolicy.name}</strong> — applies to all employees without a specific assignment.
          </Typography>
        </Box>
      )}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => { setForm({ user_id: '', policy_id: '', effective_from: new Date().toISOString().slice(0, 10) }); setDlg(true) }}>Assign Policy</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow>
            {['Employee', 'Assigned Policy', 'Shift', 'Effective From', ''].map(h => <Th key={h}>{h}</Th>)}
          </TableRow></TableHead>
          <TableBody>
            {employees.map((emp: any) => {
              const a = assignedMap[emp.id]
              const effectivePolicy = a?.policy ?? globalPolicy
              const isOverride = !!a
              return (
                <TableRow key={emp.id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Avatar src={emp.avatar_url} sx={{ width: 28, height: 28, fontSize: 11, background: 'linear-gradient(135deg,#7161D8,#F05D92)' }}>
                        {(emp.full_name ?? emp.email)?.[0]?.toUpperCase()}
                      </Avatar>
                      <Typography variant="body2">{emp.full_name ?? emp.email}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    {effectivePolicy
                      ? <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Chip size="small" label={effectivePolicy.name} sx={{ bgcolor: isOverride ? 'secondary.main' : 'primary.main', color: 'white' }} />
                          {!isOverride && <Chip size="small" label="global" variant="outlined" />}
                        </Box>
                      : <Typography variant="caption" color="text.secondary">No policy</Typography>}
                  </TableCell>
                  <TableCell>
                    {effectivePolicy?.shift_start_time
                      ? <Typography variant="caption">{effectivePolicy.shift_start_time}–{effectivePolicy.shift_end_time} ({effectivePolicy.timezone})</Typography>
                      : '—'}
                  </TableCell>
                  <TableCell>{a ? new Date(a.effective_from).toLocaleDateString() : <Typography variant="caption" color="text.secondary">—</Typography>}</TableCell>
                  <TableCell>
                    {isOverride
                      ? <Tooltip title="Remove override (revert to global)">
                          <IconButton size="small" sx={{ color: 'error.main' }} onClick={() => del.mutate(a.id)}><DeleteIcon fontSize="small" /></IconButton>
                        </Tooltip>
                      : <Button size="small" variant="outlined" sx={{ fontSize: 11 }}
                          onClick={() => { setForm({ user_id: emp.id, policy_id: '', effective_from: new Date().toISOString().slice(0, 10) }); setDlg(true) }}>
                          Override
                        </Button>}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dlg} onClose={() => setDlg(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Assign Attendance Policy</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <FormControl size="small" fullWidth>
            <InputLabel>Employee</InputLabel>
            <Select label="Employee" value={form.user_id} onChange={e => setForm((p: any) => ({ ...p, user_id: e.target.value }))}>
              {employees.map((e: any) => <MenuItem key={e.id} value={e.id}>{e.full_name ?? e.email}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" fullWidth>
            <InputLabel>Policy</InputLabel>
            <Select label="Policy" value={form.policy_id} onChange={e => setForm((p: any) => ({ ...p, policy_id: e.target.value }))}>
              {policies.map((p: any) => <MenuItem key={p.id} value={p.id}>{p.name}{p.is_default ? ' (Global)' : ''}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField label="Effective From" type="date" size="small" value={form.effective_from} InputLabelProps={{ shrink: true }}
            onChange={e => setForm((p: any) => ({ ...p, effective_from: e.target.value }))} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDlg(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => mut.mutate(form)} disabled={mut.isPending}>Assign</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

function AttendanceSection() {
  const [tab, setTab] = useState(0)
  return (
    <Box>
      <Typography variant="h6" fontWeight={700} gutterBottom>Attendance</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Attendance Records" /><Tab label="Policies" /><Tab label="Policy Assignments" />
      </Tabs>
      {tab === 0 && <AttendanceRecordsTab />}
      {tab === 1 && <AttendancePoliciesTab />}
      {tab === 2 && <PolicyAssignmentsTab />}
    </Box>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// LEAVE MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

function LeaveRequestsTab() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<string>('pending')
  const [reviewDlg, setReviewDlg] = useState<{ open: boolean; item?: any; action?: 'approved' | 'rejected' }>({ open: false })
  const [comments, setComments] = useState('')

  const { data: requests } = useQuery({
    queryKey: ['hr-leave-requests', statusFilter],
    queryFn: () => fetchLeaveRequests(statusFilter ? { status: statusFilter } : undefined),
  })

  const reviewMut = useMutation({
    mutationFn: ({ id, status, comments }: { id: number; status: string; comments: string }) =>
      updateLeaveRequest(id, { status, comments }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-leave-requests'] })
      toast.success(reviewDlg.action === 'approved' ? 'Leave approved' : 'Leave rejected')
      setReviewDlg({ open: false })
      setComments('')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Action failed'),
  })

  const list: any[] = (requests as any)?.items ?? (Array.isArray(requests) ? requests : [])

  const sColor = (s: string) => s === 'approved' ? 'success' : s === 'rejected' ? 'error' : s === 'cancelled' ? 'default' : 'warning'

  const openReview = (item: any, action: 'approved' | 'rejected') => {
    setComments('')
    setReviewDlg({ open: true, item, action })
  }

  const STATUS_FILTERS = ['pending', 'approved', 'rejected', 'cancelled', '']
  const STATUS_LABELS  = ['Pending', 'Approved', 'Rejected', 'Cancelled', 'All']

  return (
    <Box>
      {/* Status filter chips */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        {STATUS_FILTERS.map((s, i) => (
          <Chip
            key={s}
            label={STATUS_LABELS[i]}
            onClick={() => setStatusFilter(s)}
            color={statusFilter === s ? (s === 'approved' ? 'success' : s === 'rejected' ? 'error' : s === 'cancelled' ? 'default' : 'primary') : 'default'}
            variant={statusFilter === s ? 'filled' : 'outlined'}
            size="small"
          />
        ))}
      </Box>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow>
            {['Employee', 'Type', 'From', 'To', 'Days', 'Reason', 'Status', 'Reviewed By', ''].map(h => <Th key={h}>{h}</Th>)}
          </TableRow></TableHead>
          <TableBody>
            {list.length === 0
              ? <TableRow><TableCell colSpan={9} align="center" sx={{ py: 4, color: 'text.secondary' }}>No {statusFilter || ''} leave requests.</TableCell></TableRow>
              : list.map((r: any) => (
                <TableRow key={r.id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Avatar sx={{ width: 26, height: 26, fontSize: 11, bgcolor: 'primary.light' }}>
                        {(r.user?.full_name ?? r.user?.email ?? '?')[0]?.toUpperCase()}
                      </Avatar>
                      <Typography variant="body2">{r.user?.full_name ?? r.user?.email ?? r.user_id}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: r.leave_type?.color ?? '#7161D8', flexShrink: 0 }} />
                      <Typography variant="body2">{r.leave_type?.name ?? '—'}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>{fmt(r.start_date)}</TableCell>
                  <TableCell>{fmt(r.end_date)}</TableCell>
                  <TableCell><Typography variant="body2" fontWeight={600}>{r.total_days}</Typography></TableCell>
                  <TableCell>
                    {r.reason
                      ? <Tooltip title={r.reason}><Typography variant="caption" color="text.secondary" sx={{ maxWidth: 120, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason}</Typography></Tooltip>
                      : <Typography variant="caption" color="text.disabled">—</Typography>}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={r.status} color={sColor(r.status) as any} sx={{ fontWeight: 600 }} />
                    {r.comments && (
                      <Tooltip title={`HR note: ${r.comments}`}>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.comments}
                        </Typography>
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.approved_by
                      ? <Box>
                          <Typography variant="caption" fontWeight={500}>{r.approved_by.full_name ?? r.approved_by.email}</Typography>
                          <Typography variant="caption" color="text.secondary" display="block">
                            {r.approved_at ? new Date(r.approved_at).toLocaleDateString() : ''}
                          </Typography>
                        </Box>
                      : <Typography variant="caption" color="text.disabled">—</Typography>}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {r.status === 'pending' && (
                      <>
                        <Tooltip title="Approve">
                          <Button size="small" variant="contained" color="success" sx={{ mr: 0.5, fontSize: 11, minWidth: 'auto', px: 1 }}
                            onClick={() => openReview(r, 'approved')}>
                            ✓
                          </Button>
                        </Tooltip>
                        <Tooltip title="Reject">
                          <Button size="small" variant="contained" color="error" sx={{ fontSize: 11, minWidth: 'auto', px: 1 }}
                            onClick={() => openReview(r, 'rejected')}>
                            ✕
                          </Button>
                        </Tooltip>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Approve / Reject dialog */}
      <Dialog open={reviewDlg.open} onClose={() => setReviewDlg({ open: false })} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ color: reviewDlg.action === 'approved' ? 'success.main' : 'error.main' }}>
          {reviewDlg.action === 'approved' ? 'Approve Leave' : 'Reject Leave'}
        </DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          {reviewDlg.item && (
            <Box sx={{ mb: 2, p: 1.5, bgcolor: 'grey.50', borderRadius: 1 }}>
              <Typography variant="body2" fontWeight={600}>{reviewDlg.item.user?.full_name ?? reviewDlg.item.user?.email}</Typography>
              <Typography variant="caption" color="text.secondary">
                {reviewDlg.item.leave_type?.name} · {fmt(reviewDlg.item.start_date)} – {fmt(reviewDlg.item.end_date)} ({reviewDlg.item.total_days} day(s))
              </Typography>
            </Box>
          )}
          <TextField
            label="Comments (optional)"
            multiline rows={3} fullWidth size="small"
            value={comments}
            onChange={e => setComments(e.target.value)}
            placeholder={reviewDlg.action === 'rejected' ? 'Reason for rejection...' : 'Any notes for the employee...'}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReviewDlg({ open: false })}>Cancel</Button>
          <Button
            variant="contained"
            color={reviewDlg.action === 'approved' ? 'success' : 'error'}
            disabled={reviewMut.isPending}
            onClick={() => reviewMut.mutate({ id: reviewDlg.item.id, status: reviewDlg.action!, comments })}
          >
            {reviewDlg.action === 'approved' ? 'Approve' : 'Reject'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

function LeaveTypesTab() {
  const qc = useQueryClient()
  const { data: types = [] } = useQuery({ queryKey: ['hr-leave-types'], queryFn: fetchLeaveTypes })
  const [dlg, setDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const FIELDS: FieldDef[] = [
    { key: 'name', label: 'Name' },
    { key: 'max_days_per_year', label: 'Max Days/Year', type: 'number' },
    { key: 'is_paid', label: 'Paid?', type: 'select', options: ['true','false'] },
    { key: 'description', label: 'Description', type: 'textarea' },
  ]
  const mut = useMutation({
    mutationFn: (d: any) => { const data = { ...d, is_paid: d.is_paid === 'true' }; return dlg.item ? updateLeaveType(dlg.item.id, data) : createLeaveType(data) },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-leave-types'] }); toast.success('Saved') },
  })
  const del = useMutation({ mutationFn: deleteLeaveType, onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-leave-types'] }); toast.success('Deleted') } })
  const list: any[] = Array.isArray(types) ? types : (types as any).items ?? []
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDlg({ open: true })}>Add Type</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow>
            {['Name','Max Days','Paid','Description',''].map(h => <Th key={h}>{h}</Th>)}
          </TableRow></TableHead>
          <TableBody>
            {list.map((t: any) => (
              <TableRow key={t.id} hover>
                <TableCell>{t.name}</TableCell>
                <TableCell>{t.max_days_per_year}</TableCell>
                <TableCell><Chip size="small" label={t.is_paid ? 'Yes' : 'No'} color={t.is_paid ? 'success' : 'default'} /></TableCell>
                <TableCell>{t.description ?? '—'}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
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
        onSave={d => mut.mutate(d)} />
    </Box>
  )
}

function LeavePoliciesTab() {
  const qc = useQueryClient()
  const { data: policies = [] } = useQuery({ queryKey: ['hr-leave-policies'], queryFn: fetchLeavePolicies })
  const [dlg, setDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const FIELDS: FieldDef[] = [
    { key: 'name', label: 'Policy Name' },
    { key: 'days_allowed', label: 'Days Allowed', type: 'number' },
    { key: 'description', label: 'Description', type: 'textarea' },
  ]
  const mut = useMutation({
    mutationFn: (d: any) => dlg.item ? updateLeavePolicy(dlg.item.id, d) : createLeavePolicy(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-leave-policies'] }); toast.success('Saved') },
  })
  const del = useMutation({ mutationFn: deleteLeavePolicy, onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-leave-policies'] }); toast.success('Deleted') } })
  const list: any[] = Array.isArray(policies) ? policies : (policies as any).items ?? []
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDlg({ open: true })}>Add Policy</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow>
            {['Name','Days Allowed','Description',''].map(h => <Th key={h}>{h}</Th>)}
          </TableRow></TableHead>
          <TableBody>
            {list.map((p: any) => (
              <TableRow key={p.id} hover>
                <TableCell>{p.name}</TableCell>
                <TableCell>{p.days_allowed}</TableCell>
                <TableCell>{p.description ?? '—'}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
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
        onSave={d => mut.mutate(d)} />
    </Box>
  )
}

function LeaveSection() {
  const [tab, setTab] = useState(0)
  return (
    <Box>
      <Typography variant="h6" fontWeight={700} gutterBottom>Leave Management</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Requests" /><Tab label="Leave Types" /><Tab label="Policies" />
      </Tabs>
      {tab === 0 && <LeaveRequestsTab />}
      {tab === 1 && <LeaveTypesTab />}
      {tab === 2 && <LeavePoliciesTab />}
    </Box>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TIMESHEETS
// ══════════════════════════════════════════════════════════════════════════════

const DAY_STATUS_META: Record<string, { label: string; color: 'success'|'error'|'warning'|'info'|'default' }> = {
  full_day:    { label: 'Full Day',    color: 'success' },
  half_day:    { label: 'Half Day',    color: 'warning' },
  early_leave: { label: 'Early Leave', color: 'info' },
  absent:      { label: 'Absent',      color: 'error' },
  on_leave:    { label: 'On Leave',    color: 'default' },
  holiday:     { label: 'Holiday',     color: 'default' },
}

function EmployeeSubmissionsTab() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<string>('submitted')
  const [reviewDlg, setReviewDlg] = useState<{ open: boolean; item?: any; action?: 'approve' | 'reject' }>({ open: false })
  const [notes, setNotes] = useState('')

  // Always fetch all for KPI counts
  const { data: allRaw } = useQuery({
    queryKey: ['hr-employee-submissions-all'],
    queryFn: () => fetchEmployeeSubmissions({ limit: 500 }),
    staleTime: 0,
  })
  const allList: any[] = (allRaw as any)?.items ?? (Array.isArray(allRaw) ? allRaw : [])

  // Filtered list for the table
  const { data: raw, isLoading } = useQuery({
    queryKey: ['hr-employee-submissions', statusFilter],
    queryFn: () => fetchEmployeeSubmissions(statusFilter ? { status: statusFilter, limit: 200 } : { limit: 200 }),
    staleTime: 0,
  })
  const list: any[] = (raw as any)?.items ?? (Array.isArray(raw) ? raw : [])

  const reviewMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      reviewEmployeeSubmission(id, { status, review_notes: notes || undefined }),
    onSuccess: (_, { status }) => {
      qc.invalidateQueries({ queryKey: ['hr-employee-submissions'] })
      toast.success(status === 'approved' ? 'Timesheet approved' : 'Timesheet rejected')
      setReviewDlg({ open: false })
      setNotes('')
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Error'),
  })

  const pendingCnt  = allList.filter(i => i.status === 'submitted').length
  const approvedCnt = allList.filter(i => i.status === 'approved').length
  const totalHours  = allList.filter(i => i.status === 'approved').reduce((s: number, i: any) => s + (Number(i.hours) || 0), 0)

  const FILTERS = [
    { value: 'submitted', label: `Pending Review${pendingCnt > 0 ? ` (${pendingCnt})` : ''}`, color: 'warning' as const },
    { value: 'approved',  label: 'Approved',  color: 'success' as const },
    { value: 'rejected',  label: 'Rejected',  color: 'error' as const },
    { value: '',          label: 'All',       color: 'default' as const },
  ]

  return (
    <Box>
      {/* KPIs */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        {[
          { label: 'Pending Review',       value: pendingCnt,               color: '#f59e0b' },
          { label: 'Approved',             value: approvedCnt,              color: '#22c55e' },
          { label: 'Total Approved Hours', value: `${totalHours.toFixed(1)}h`, color: '#7161D8' },
          { label: 'Total Entries',        value: allList.length,           color: '#6b7280' },
        ].map(k => (
          <Card key={k.label} sx={{ flex: 1, minWidth: 140 }}>
            <CardContent sx={{ py: '12px !important' }}>
              <Typography variant="caption" color="text.secondary">{k.label}</Typography>
              <Typography variant="h5" fontWeight={800} sx={{ color: k.color }}>{k.value}</Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* Status filter chips */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <Chip
            key={f.value}
            label={f.label}
            onClick={() => setStatusFilter(f.value)}
            color={statusFilter === f.value ? f.color : 'default'}
            variant={statusFilter === f.value ? 'filled' : 'outlined'}
            size="small"
          />
        ))}
      </Box>

      {isLoading ? <CircularProgress /> : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead><TableRow>
              {['Employee', 'Date', 'Task', 'Project', 'Hours', 'Submitted', 'Status', 'HR Notes', ''].map(h => <Th key={h}>{h}</Th>)}
            </TableRow></TableHead>
            <TableBody>
              {list.length === 0
                ? <TableRow><TableCell colSpan={9} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    {statusFilter === 'submitted' ? 'No pending submissions — all caught up!' : `No ${statusFilter || ''} timesheets found.`}
                  </TableCell></TableRow>
                : list.map((ts: any) => (
                  <TableRow key={ts.id} hover sx={ts.status === 'submitted' ? { bgcolor: 'rgba(245,158,11,0.04)' } : undefined}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Avatar sx={{ width: 26, height: 26, fontSize: 11, background: 'linear-gradient(135deg,#7161D8,#F05D92)' }}>
                          {(ts.user?.full_name ?? ts.user?.email ?? '?')[0]?.toUpperCase()}
                        </Avatar>
                        <Typography variant="body2">{ts.user?.full_name ?? ts.user?.email ?? ts.user_id}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>{fmt(ts.work_date)}</TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{ts.task_title ?? '—'}</Typography>
                      {ts.description && (
                        <Tooltip title={ts.description}>
                          <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 160, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'help' }}>
                            {ts.description}
                          </Typography>
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell>
                      {ts.project
                        ? <Chip size="small" label={ts.project} variant="outlined" sx={{ borderColor: 'primary.main', color: 'primary.main' }} />
                        : <Typography variant="caption" color="text.disabled">—</Typography>}
                    </TableCell>
                    <TableCell><Typography variant="body2" fontWeight={700}>{ts.hours}h</Typography></TableCell>
                    <TableCell>
                      <Typography variant="caption">{ts.submitted_at ? new Date(ts.submitted_at).toLocaleDateString() : '—'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip size="small"
                        label={ts.status === 'submitted' ? 'Pending' : ts.status}
                        color={ts.status === 'approved' ? 'success' : ts.status === 'rejected' ? 'error' : ts.status === 'submitted' ? 'warning' : 'default'}
                        sx={{ fontWeight: 600 }}
                      />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 130 }}>
                      {ts.review_notes
                        ? <Tooltip title={ts.review_notes}>
                            <Typography variant="caption" sx={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', cursor: 'help', color: 'text.secondary' }}>
                              {ts.review_notes}
                            </Typography>
                          </Tooltip>
                        : <Typography variant="caption" color="text.disabled">—</Typography>}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {ts.status === 'submitted' && (
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <Tooltip title="Approve">
                            <Button size="small" variant="contained" color="success" sx={{ fontSize: 11, minWidth: 'auto', px: 1.5 }}
                              onClick={() => { setNotes(''); setReviewDlg({ open: true, item: ts, action: 'approve' }) }}>
                              ✓
                            </Button>
                          </Tooltip>
                          <Tooltip title="Reject">
                            <Button size="small" variant="contained" color="error" sx={{ fontSize: 11, minWidth: 'auto', px: 1.5 }}
                              onClick={() => { setNotes(''); setReviewDlg({ open: true, item: ts, action: 'reject' }) }}>
                              ✕
                            </Button>
                          </Tooltip>
                        </Box>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Review Dialog */}
      <Dialog open={reviewDlg.open} onClose={() => setReviewDlg({ open: false })} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ color: reviewDlg.action === 'approve' ? 'success.main' : 'error.main' }}>
          {reviewDlg.action === 'approve' ? 'Approve Timesheet' : 'Reject Timesheet'}
        </DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          {reviewDlg.item && (
            <Box sx={{ mb: 2, p: 1.5, bgcolor: 'grey.50', borderRadius: 1 }}>
              <Typography variant="body2" fontWeight={600}>{reviewDlg.item.user?.full_name ?? reviewDlg.item.user?.email}</Typography>
              <Typography variant="caption" color="text.secondary">
                {reviewDlg.item.task_title} · {fmt(reviewDlg.item.work_date)} · {reviewDlg.item.hours}h
              </Typography>
              {reviewDlg.item.description && (
                <Typography variant="caption" color="text.secondary" display="block">{reviewDlg.item.description}</Typography>
              )}
            </Box>
          )}
          <TextField
            label={reviewDlg.action === 'reject' ? 'Reason for rejection (required)' : 'Notes for employee (optional)'}
            size="small" fullWidth multiline rows={3}
            value={notes} onChange={e => setNotes(e.target.value)}
            placeholder={reviewDlg.action === 'reject' ? 'Explain why this is being rejected...' : 'Any feedback for the employee...'}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReviewDlg({ open: false })}>Cancel</Button>
          <Button
            variant="contained"
            color={reviewDlg.action === 'approve' ? 'success' : 'error'}
            disabled={reviewMut.isPending || (reviewDlg.action === 'reject' && !notes.trim())}
            onClick={() => reviewMut.mutate({ id: reviewDlg.item!.id, status: reviewDlg.action === 'approve' ? 'approved' : 'rejected' })}
          >
            {reviewDlg.action === 'approve' ? 'Approve' : 'Reject'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

function AttendanceTimesheetsTab() {
  const qc = useQueryClient()
  const now = new Date()
  const [filterYear, setFilterYear]   = useState(now.getFullYear())
  const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1)

  const dateFrom = `${filterYear}-${String(filterMonth).padStart(2,'0')}-01`
  const dateTo   = new Date(filterYear, filterMonth, 0).toISOString().slice(0,10)

  const { data: tsData, isLoading } = useQuery({
    queryKey: ['hr-timesheets', filterYear, filterMonth],
    queryFn: () => fetchTimesheets({ date_from: dateFrom, date_to: dateTo, limit: 500 }),
  })
  const list: any[] = (tsData as any)?.items ?? (Array.isArray(tsData) ? tsData : [])

  // Manual add/edit dialog
  const [dlg, setDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const [form, setForm] = useState<any>({})
  const openAdd = () => { setForm({}); setDlg({ open: true }) }
  const openEdit = (ts: any) => { setForm({ ...ts, work_date: ts.work_date }); setDlg({ open: true, item: ts }) }

  // Generate from attendance dialog
  const [genDlg, setGenDlg] = useState(false)
  const [genYear, setGenYear]   = useState(now.getFullYear())
  const [genMonth, setGenMonth] = useState(now.getMonth() + 1)

  const mut = useMutation({
    mutationFn: (d: any) => dlg.item ? updateTimesheet(dlg.item.id, d) : createTimesheet(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-timesheets'] }); toast.success('Saved'); setDlg({ open: false }) },
    onError: () => toast.error('Save failed'),
  })
  const del = useMutation({
    mutationFn: deleteTimesheet,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-timesheets'] }); toast.success('Deleted') },
  })
  const genMut = useMutation({
    mutationFn: () => generateTimesheets({ year: genYear, month: genMonth }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['hr-timesheets'] })
      toast.success(`Generated: ${r.created} new, ${r.updated} updated`)
      setGenDlg(false)
    },
    onError: () => toast.error('Generation failed'),
  })

  const approve = (id: number) => updateTimesheet(id, { status: 'approved' }).then(() => { qc.invalidateQueries({ queryKey: ['hr-timesheets'] }); toast.success('Approved') })
  const reject  = (id: number) => updateTimesheet(id, { status: 'rejected' }).then(() => { qc.invalidateQueries({ queryKey: ['hr-timesheets'] }); toast.success('Rejected') })

  const reviewColor = (s: string) => s === 'approved' ? 'success' : s === 'rejected' ? 'error' : s === 'submitted' ? 'warning' : 'default'

  // Monthly totals
  const totalWage    = list.reduce((s, t) => s + (t.daily_wage_earned ?? 0), 0)
  const totalHours   = list.reduce((s, t) => s + (t.hours_worked ?? t.hours ?? 0), 0)
  const fullDays     = list.filter(t => t.day_status === 'full_day').length
  const halfDays     = list.filter(t => t.day_status === 'half_day').length
  const earlyLeaves  = list.filter(t => t.day_status === 'early_leave').length
  const absences     = list.filter(t => t.day_status === 'absent').length

  return (
    <Box>
      {/* Actions */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mb: 2 }}>
        <Button variant="outlined" size="small" onClick={() => setGenDlg(true)}>Generate from Attendance</Button>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={openAdd}>Add Manual</Button>
      </Box>

      {/* Month filter */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 100 }}>
          <InputLabel>Month</InputLabel>
          <Select label="Month" value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => <MenuItem key={i} value={i+1}>{m}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 90 }}>
          <InputLabel>Year</InputLabel>
          <Select label="Year" value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}>
            {[now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1].map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
          </Select>
        </FormControl>

        {/* Summary chips */}
        {list.length > 0 && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Chip size="small" label={`✓ ${fullDays} Full`} color="success" />
            <Chip size="small" label={`½ ${halfDays} Half`} color="warning" />
            <Chip size="small" label={`←| ${earlyLeaves} Early`} color="info" />
            <Chip size="small" label={`✗ ${absences} Absent`} color="error" />
            <Chip size="small" label={`${totalHours.toFixed(1)}h total`} sx={{ bgcolor: 'primary.main', color: 'white' }} />
            <Chip size="small" label={`$${totalWage.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} earned`} sx={{ bgcolor: 'secondary.main', color: 'white' }} />
          </Box>
        )}
      </Box>

      {isLoading ? <CircularProgress /> : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead><TableRow>
              {['#','Employee','Date','Day Status','Hours','Daily Wage','Project','Review Status','Actions'].map(h => <Th key={h}>{h}</Th>)}
            </TableRow></TableHead>
            <TableBody>
              {list.length === 0
                ? <TableRow><TableCell colSpan={9} align="center" sx={{ py: 4 }}>No timesheet records for this month. Use "Generate from Attendance" to auto-populate.</TableCell></TableRow>
                : list.map((ts: any, i: number) => {
                  const ds = DAY_STATUS_META[ts.day_status] ?? { label: ts.day_status ?? '—', color: 'default' }
                  return (
                    <TableRow key={ts.id} hover>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Avatar sx={{ width: 26, height: 26, fontSize: 11, background: 'linear-gradient(135deg,#7161D8,#F05D92)' }}>
                            {(ts.user?.full_name ?? ts.user?.email ?? '?')[0]?.toUpperCase()}
                          </Avatar>
                          <Typography variant="body2">{ts.user?.full_name ?? ts.user?.email ?? ts.user_id}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell>{fmt(ts.work_date)}</TableCell>
                      <TableCell>
                        {ts.day_status
                          ? <Chip size="small" label={ds.label} color={ds.color} />
                          : <Typography variant="caption" color="text.secondary">Manual</Typography>}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, color: 'primary.main' }}>
                        {(ts.hours_worked ?? ts.hours ?? 0).toFixed(2)}h
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>
                        {ts.daily_wage_earned != null
                          ? `$${Number(ts.daily_wage_earned).toFixed(2)}`
                          : '—'}
                      </TableCell>
                      <TableCell>
                        {ts.project
                          ? <Chip size="small" label={ts.project} variant="outlined" sx={{ borderColor: 'primary.main', color: 'primary.main' }} />
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={ts.status} color={reviewColor(ts.status) as any} />
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(ts)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                        {ts.status === 'submitted' && (
                          <>
                            <Tooltip title="Approve"><IconButton size="small" color="success" onClick={() => approve(ts.id)}><CheckIcon fontSize="small" /></IconButton></Tooltip>
                            <Tooltip title="Reject"><IconButton size="small" color="error" onClick={() => reject(ts.id)}><CloseIcon fontSize="small" /></IconButton></Tooltip>
                          </>
                        )}
                        <CrudDeleteBtn onDelete={() => del.mutate(ts.id)} />
                      </TableCell>
                    </TableRow>
                  )
                })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Manual add/edit dialog */}
      <Dialog open={dlg.open} onClose={() => setDlg({ open: false })} fullWidth maxWidth="sm">
        <DialogTitle>{dlg.item ? 'Edit Timesheet Entry' : 'Add Manual Timesheet Entry'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          {!dlg.item && (
            <TextField label="Employee ID" size="small" type="number" value={form.user_id ?? ''}
              onChange={e => setForm((p: any) => ({ ...p, user_id: Number(e.target.value) }))} />
          )}
          <TextField label="Work Date" size="small" type="date" value={form.work_date ?? ''} InputLabelProps={{ shrink: true }}
            onChange={e => setForm((p: any) => ({ ...p, work_date: e.target.value }))} />
          <TextField label="Hours Worked" size="small" type="number" value={form.hours ?? ''}
            onChange={e => setForm((p: any) => ({ ...p, hours: Number(e.target.value), hours_worked: Number(e.target.value) }))} />
          <FormControl size="small" fullWidth>
            <InputLabel>Day Status</InputLabel>
            <Select label="Day Status" value={form.day_status ?? ''} onChange={e => setForm((p: any) => ({ ...p, day_status: e.target.value }))}>
              {Object.entries(DAY_STATUS_META).map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField label="Project" size="small" value={form.project ?? ''}
            onChange={e => setForm((p: any) => ({ ...p, project: e.target.value }))} />
          <TextField label="Description" size="small" multiline rows={2} value={form.description ?? ''}
            onChange={e => setForm((p: any) => ({ ...p, description: e.target.value }))} />
          <FormControl size="small" fullWidth>
            <InputLabel>Review Status</InputLabel>
            <Select label="Review Status" value={form.status ?? 'draft'} onChange={e => setForm((p: any) => ({ ...p, status: e.target.value }))}>
              {['draft','submitted','approved','rejected'].map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDlg({ open: false })}>Cancel</Button>
          <Button variant="contained" onClick={() => mut.mutate(form)} disabled={mut.isPending}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Generate from Attendance dialog */}
      <Dialog open={genDlg} onClose={() => setGenDlg(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Generate Timesheets from Attendance</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <Typography variant="body2" color="text.secondary">
            Reads each employee's clock-in / clock-out events and creates timesheet entries.<br />
            Rules: ≥9h = Full Day · &gt;4h = Early Leave (full pay, flagged) · ≤4h = Half Day · No punch = Absent
          </Typography>
          <FormControl size="small" fullWidth>
            <InputLabel>Month</InputLabel>
            <Select label="Month" value={genMonth} onChange={e => setGenMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => <MenuItem key={i} value={i+1}>{m}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" fullWidth>
            <InputLabel>Year</InputLabel>
            <Select label="Year" value={genYear} onChange={e => setGenYear(Number(e.target.value))}>
              {[now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1].map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGenDlg(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => genMut.mutate()} disabled={genMut.isPending}>
            {genMut.isPending ? 'Generating…' : 'Generate'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

function TimesheetsSection() {
  const [tab, setTab] = useState(0)
  return (
    <Box>
      <Typography variant="h6" fontWeight={700} gutterBottom>Timesheets</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Attendance Records" />
        <Tab label="Employee Submissions" />
      </Tabs>
      {tab === 0 && <AttendanceTimesheetsTab />}
      {tab === 1 && <EmployeeSubmissionsTab />}
    </Box>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// RECRUITMENT
// ══════════════════════════════════════════════════════════════════════════════

function JobOpeningsTab() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['hr-job-openings'], queryFn: () => fetchJobOpenings() })
  const list: any[] = (data as any)?.items ?? (Array.isArray(data) ? data : [])
  const [dlg, setDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const FIELDS: FieldDef[] = [
    { key: 'title', label: 'Job Title' }, { key: 'department', label: 'Department' }, { key: 'location', label: 'Location' },
    { key: 'status', label: 'Status', type: 'select', options: ['open','closed','on_hold','filled'] },
    { key: 'description', label: 'Description', type: 'textarea' },
    { key: 'closes_at', label: 'Closing Date', type: 'date' },
  ]
  const mut = useMutation({ mutationFn: (d: any) => dlg.item ? updateJobOpening(dlg.item.id, d) : createJobOpening(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-job-openings'] }); toast.success('Saved') } })
  const del = useMutation({ mutationFn: deleteJobOpening, onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-job-openings'] }); toast.success('Deleted') } })
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDlg({ open: true })}>Add Opening</Button>
      </Box>
      <TableContainer component={Paper}><Table size="small">
        <TableHead><TableRow>{['Title','Department','Location','Status','Closing',''].map(h => <Th key={h}>{h}</Th>)}</TableRow></TableHead>
        <TableBody>{list.map((o: any) => (
          <TableRow key={o.id} hover>
            <TableCell>{o.title}</TableCell><TableCell>{o.department ?? '—'}</TableCell><TableCell>{o.location ?? '—'}</TableCell>
            <TableCell><Chip size="small" label={o.status} color={o.status === 'open' ? 'success' : 'default'} /></TableCell>
            <TableCell>{fmt(o.closes_at)}</TableCell>
            <TableCell sx={{ whiteSpace: 'nowrap' }}><CrudEditBtn onEdit={() => setDlg({ open: true, item: o })} /><CrudDeleteBtn onDelete={() => del.mutate(o.id)} /></TableCell>
          </TableRow>
        ))}</TableBody>
      </Table></TableContainer>
      <SimpleDialog open={dlg.open} title={dlg.item ? 'Edit Opening' : 'Add Opening'} fields={FIELDS} initial={dlg.item ?? {}} onClose={() => setDlg({ open: false })} onSave={d => mut.mutate(d)} />
    </Box>
  )
}

function CandidatesTab() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['hr-candidates'], queryFn: () => fetchCandidates() })
  const list: any[] = (data as any)?.items ?? (Array.isArray(data) ? data : [])
  const [dlg, setDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const FIELDS: FieldDef[] = [
    { key: 'first_name', label: 'First Name' }, { key: 'last_name', label: 'Last Name' },
    { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' },
    { key: 'status', label: 'Status', type: 'select', options: ['applied','screening','interview','offered','hired','rejected'] },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ]
  const mut = useMutation({ mutationFn: (d: any) => dlg.item ? updateCandidate(dlg.item.id, d) : createCandidate(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-candidates'] }); toast.success('Saved') } })
  const del = useMutation({ mutationFn: deleteCandidate, onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-candidates'] }); toast.success('Deleted') } })
  const sColor = (s: string) => s === 'hired' ? 'success' : s === 'rejected' ? 'error' : 'default'
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}><Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDlg({ open: true })}>Add Candidate</Button></Box>
      <TableContainer component={Paper}><Table size="small">
        <TableHead><TableRow>{['Name','Email','Phone','Status',''].map(h => <Th key={h}>{h}</Th>)}</TableRow></TableHead>
        <TableBody>{list.map((c: any) => (
          <TableRow key={c.id} hover>
            <TableCell>{c.first_name} {c.last_name}</TableCell><TableCell>{c.email}</TableCell><TableCell>{c.phone ?? '—'}</TableCell>
            <TableCell><Chip size="small" label={c.status} color={sColor(c.status) as any} /></TableCell>
            <TableCell sx={{ whiteSpace: 'nowrap' }}><CrudEditBtn onEdit={() => setDlg({ open: true, item: c })} /><CrudDeleteBtn onDelete={() => del.mutate(c.id)} /></TableCell>
          </TableRow>
        ))}</TableBody>
      </Table></TableContainer>
      <SimpleDialog open={dlg.open} title={dlg.item ? 'Edit Candidate' : 'Add Candidate'} fields={FIELDS} initial={dlg.item ?? {}} onClose={() => setDlg({ open: false })} onSave={d => mut.mutate(d)} />
    </Box>
  )
}

function RecruitmentSection() {
  const [tab, setTab] = useState(0)
  return (
    <Box>
      <Typography variant="h6" fontWeight={700} gutterBottom>Recruitment</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Job Openings" /><Tab label="Candidates" />
      </Tabs>
      {tab === 0 && <JobOpeningsTab />}
      {tab === 1 && <CandidatesTab />}
    </Box>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// LIFECYCLE
// ══════════════════════════════════════════════════════════════════════════════

function mkLifecycleTab(
  label: string, queryKey: string, fetcher: () => Promise<any>,
  creator: (d: any) => Promise<any>, updater: (id: number, d: any) => Promise<any>,
  deleter: (id: number) => Promise<any>, fields: FieldDef[],
  columns: { key: string; label: string; render?: (row: any) => React.ReactNode }[]
) {
  return function Tab() {
    const qc = useQueryClient()
    const { data } = useQuery({ queryKey: [queryKey], queryFn: fetcher })
    const list: any[] = (data as any)?.items ?? (Array.isArray(data) ? data : [])
    const [dlg, setDlg] = useState<{ open: boolean; item?: any }>({ open: false })
    const mut = useMutation({ mutationFn: (d: any) => dlg.item ? updater(dlg.item.id, d) : creator(d), onSuccess: () => { qc.invalidateQueries({ queryKey: [queryKey] }); toast.success('Saved') } })
    const del = useMutation({ mutationFn: deleter, onSuccess: () => { qc.invalidateQueries({ queryKey: [queryKey] }); toast.success('Deleted') } })
    return (
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}><Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDlg({ open: true })}>Add {label}</Button></Box>
        <TableContainer component={Paper}><Table size="small">
          <TableHead><TableRow>{[...columns.map(c => c.label), ''].map(h => <Th key={h}>{h}</Th>)}</TableRow></TableHead>
          <TableBody>{list.map((row: any) => (
            <TableRow key={row.id} hover>
              {columns.map(c => <TableCell key={c.key}>{c.render ? c.render(row) : (row[c.key] ?? '—')}</TableCell>)}
              <TableCell sx={{ whiteSpace: 'nowrap' }}><CrudEditBtn onEdit={() => setDlg({ open: true, item: row })} /><CrudDeleteBtn onDelete={() => del.mutate(row.id)} /></TableCell>
            </TableRow>
          ))}</TableBody>
        </Table></TableContainer>
        <SimpleDialog open={dlg.open} title={dlg.item ? `Edit ${label}` : `Add ${label}`} fields={fields} initial={dlg.item ?? {}} onClose={() => setDlg({ open: false })} onSave={d => mut.mutate(d)} />
      </Box>
    )
  }
}

const AwardsTab = mkLifecycleTab('Award', 'hr-awards', () => fetchAwards(), createAward, updateAward, deleteAward,
  [{ key: 'title', label: 'Award Name' }, { key: 'award_date', label: 'Award Date', type: 'date' }, { key: 'description', label: 'Description', type: 'textarea' }],
  [{ key: 'emp', label: 'Employee', render: (r) => r.user?.full_name ?? r.user?.email ?? r.user_id }, { key: 'title', label: 'Award' }, { key: 'award_date', label: 'Date', render: (r) => fmt(r.award_date) }]
)

const PromotionsTab = mkLifecycleTab('Promotion', 'hr-promotions', () => fetchPromotions(), createPromotion, updatePromotion, deletePromotion,
  [{ key: 'previous_title', label: 'Previous Title' }, { key: 'new_title', label: 'New Title' }, { key: 'effective_date', label: 'Effective Date', type: 'date' }],
  [{ key: 'emp', label: 'Employee', render: (r) => r.user?.full_name ?? r.user?.email ?? r.user_id }, { key: 'previous_title', label: 'From' }, { key: 'new_title', label: 'To' }, { key: 'effective_date', label: 'Effective', render: (r) => fmt(r.effective_date) }]
)

const ResignationsTab = mkLifecycleTab('Resignation', 'hr-resignations', () => fetchResignations(), createResignation, updateResignation, deleteResignation,
  [{ key: 'last_working_day', label: 'Last Working Day', type: 'date' }, { key: 'reason', label: 'Reason', type: 'textarea' }, { key: 'status', label: 'Status', type: 'select', options: ['submitted','accepted','rejected','withdrawn'] }],
  [{ key: 'emp', label: 'Employee', render: (r) => r.user?.full_name ?? r.user?.email ?? r.user_id }, { key: 'submitted_at', label: 'Submitted', render: (r) => fmt(r.submitted_at) }, { key: 'last_working_day', label: 'Last Day', render: (r) => fmt(r.last_working_day) }, { key: 'status', label: 'Status', render: (r) => <Chip size="small" label={r.status} /> }]
)

const TerminationsTab = mkLifecycleTab('Termination', 'hr-terminations', () => fetchTerminations(), createTermination, updateTermination, deleteTermination,
  [{ key: 'termination_date', label: 'Date', type: 'date' }, { key: 'termination_type', label: 'Type', type: 'select', options: ['voluntary','involuntary','retirement','redundancy'] }, { key: 'reason', label: 'Reason', type: 'textarea' }],
  [{ key: 'emp', label: 'Employee', render: (r) => r.user?.full_name ?? r.user?.email ?? r.user_id }, { key: 'termination_date', label: 'Date', render: (r) => fmt(r.termination_date) }, { key: 'termination_type', label: 'Type', render: (r) => <Chip size="small" label={r.termination_type} /> }]
)

function LifecycleSection() {
  const [tab, setTab] = useState(0)
  return (
    <Box>
      <Typography variant="h6" fontWeight={700} gutterBottom>Employee Lifecycle</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Awards" /><Tab label="Promotions" /><Tab label="Resignations" /><Tab label="Terminations" />
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

function PayrollSection() {
  const qc = useQueryClient()
  const { data: runsData } = useQuery({ queryKey: ['hr-payroll-runs'], queryFn: () => fetchPayrollRuns() })
  const [runDlg, setRunDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const [slipRun, setSlipRun] = useState<any>(null)

  const runs: any[] = (runsData as any)?.items ?? (Array.isArray(runsData) ? runsData : [])

  const runMut = useMutation({ mutationFn: (d: any) => runDlg.item ? updatePayrollRun(runDlg.item.id, d) : createPayrollRun(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-payroll-runs'] }); toast.success('Saved'); setRunDlg({ open: false }) } })
  const processMut = useMutation({
    mutationFn: processPayrollRun,
    onSuccess: (updated: any) => {
      qc.invalidateQueries({ queryKey: ['hr-payroll-runs'] })
      setSlipRun(updated)
      toast.success(`Payroll processed — ${updated.payslips?.length ?? 0} payslips generated`)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? 'Processing failed'),
  })

  const sColor = (s: string) => s === 'paid' ? 'success' : s === 'approved' ? 'info' : s === 'processed' ? 'warning' : 'default'

  return (
    <Box>
      <Typography variant="h6" fontWeight={700} gutterBottom>Payroll</Typography>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setRunDlg({ open: true })}>New Payroll Run</Button>
      </Box>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead><TableRow>
            {['Period', 'Employees', 'Total Gross', 'Deductions', 'Tax', 'Total Net', 'Status', 'Run Date', ''].map(h => <Th key={h}>{h}</Th>)}
          </TableRow></TableHead>
          <TableBody>
            {runs.length === 0
              ? <TableRow><TableCell colSpan={9} align="center" sx={{ py: 4, color: 'text.secondary' }}>No payroll runs yet. Create one and process it to generate payslips.</TableCell></TableRow>
              : runs.map((r: any) => {
                const totalDeductions = (r.payslips ?? []).reduce((s: number, p: any) => s + Number(p.deductions ?? 0), 0)
                return (
                  <TableRow key={r.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>{fmt(r.period_start)} – {fmt(r.period_end)}</Typography>
                    </TableCell>
                    <TableCell>{r.payslips?.length ?? 0}</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{Number(r.total_gross ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell sx={{ color: 'error.main' }}>{totalDeductions > 0 ? `−${totalDeductions.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}</TableCell>
                    <TableCell sx={{ color: 'warning.main' }}>{Number(r.total_tax ?? 0) > 0 ? `−${Number(r.total_tax).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: 'success.main' }}>{Number(r.total_net ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell><Chip size="small" label={r.status} color={sColor(r.status) as any} /></TableCell>
                    <TableCell><Typography variant="caption">{r.run_date ? new Date(r.run_date).toLocaleDateString() : '—'}</Typography></TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {r.status === 'draft' && (
                        <Tooltip title="Process payroll — sums attendance timesheets for this period">
                          <Button size="small" variant="contained" sx={{ mr: 0.5, fontSize: 11 }}
                            disabled={processMut.isPending}
                            onClick={() => processMut.mutate(r.id)}>
                            Process
                          </Button>
                        </Tooltip>
                      )}
                      {(r.payslips?.length ?? 0) > 0 && (
                        <Tooltip title="View payslips">
                          <Button size="small" variant="outlined" sx={{ fontSize: 11 }} onClick={() => setSlipRun(r)}>
                            Payslips
                          </Button>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* New Run Dialog */}
      <Dialog open={runDlg.open} onClose={() => setRunDlg({ open: false })} maxWidth="xs" fullWidth>
        <DialogTitle>{runDlg.item ? 'Edit Payroll Run' : 'New Payroll Run'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField label="Period Start" type="date" size="small" InputLabelProps={{ shrink: true }}
            defaultValue={runDlg.item?.period_start ?? ''}
            onChange={e => setRunDlg(p => ({ ...p, item: { ...p.item, period_start: e.target.value } }))} />
          <TextField label="Period End" type="date" size="small" InputLabelProps={{ shrink: true }}
            defaultValue={runDlg.item?.period_end ?? ''}
            onChange={e => setRunDlg(p => ({ ...p, item: { ...p.item, period_end: e.target.value } }))} />
          <TextField label="Notes" size="small" multiline rows={2}
            defaultValue={runDlg.item?.notes ?? ''}
            onChange={e => setRunDlg(p => ({ ...p, item: { ...p.item, notes: e.target.value } }))} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRunDlg({ open: false })}>Cancel</Button>
          <Button variant="contained" onClick={() => runMut.mutate({ period_start: runDlg.item?.period_start, period_end: runDlg.item?.period_end, notes: runDlg.item?.notes })} disabled={runMut.isPending}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Payslips Dialog */}
      <Dialog open={!!slipRun} onClose={() => setSlipRun(null)} maxWidth="md" fullWidth>
        <DialogTitle>
          Payslips — {slipRun ? `${fmt(slipRun.period_start)} to ${fmt(slipRun.period_end)}` : ''}
          <Chip size="small" label={slipRun?.status} color={sColor(slipRun?.status ?? '')} sx={{ ml: 1 }} />
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <TableContainer>
            <Table size="small">
              <TableHead><TableRow>
                {['Employee', 'Hours', 'Gross Pay', 'Deductions', 'Tax', 'Net Pay', ''].map(h => <Th key={h}>{h}</Th>)}
              </TableRow></TableHead>
              <TableBody>
                {(slipRun?.payslips ?? []).map((p: any) => (
                  <TableRow key={p.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Avatar sx={{ width: 26, height: 26, fontSize: 11, background: 'linear-gradient(135deg,#7161D8,#F05D92)' }}>
                          {(p.user?.full_name ?? p.user?.email ?? '?')[0]?.toUpperCase()}
                        </Avatar>
                        <Typography variant="body2">{p.user?.full_name ?? p.user?.email}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>{Number(p.work_hours ?? 0).toFixed(1)}h</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{Number(p.gross_pay ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell sx={{ color: Number(p.deductions) > 0 ? 'error.main' : 'text.secondary' }}>
                      {Number(p.deductions ?? 0) > 0 ? `−${Number(p.deductions).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                    </TableCell>
                    <TableCell>
                      {Number(p.tax_amount ?? 0) > 0
                        ? <Tooltip title={p.notes ?? ''}>
                            <Typography variant="body2" color="warning.main" sx={{ fontWeight: 600, cursor: p.notes ? 'help' : 'default' }}>
                              −{Number(p.tax_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </Typography>
                          </Tooltip>
                        : <Typography variant="caption" color="text.disabled">—</Typography>}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 800, color: 'success.main' }}>
                      {Number(p.net_pay ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))}
                {(slipRun?.payslips?.length ?? 0) > 0 && (() => {
                  const totalDed = (slipRun.payslips ?? []).reduce((s: number, p: any) => s + Number(p.deductions ?? 0), 0)
                  const totalHrs = (slipRun.payslips ?? []).reduce((s: number, p: any) => s + Number(p.work_hours ?? 0), 0)
                  return (
                    <TableRow sx={{ bgcolor: 'rgba(113,97,216,0.07)' }}>
                      <TableCell><Typography fontWeight={800}>Total</Typography></TableCell>
                      <TableCell><Typography fontWeight={700}>{totalHrs.toFixed(1)}h</Typography></TableCell>
                      <TableCell><Typography fontWeight={700}>{Number(slipRun.total_gross ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Typography></TableCell>
                      <TableCell><Typography fontWeight={700} color="error.main">{totalDed > 0 ? `−${totalDed.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}</Typography></TableCell>
                      <TableCell><Typography fontWeight={700} color="warning.main">{Number(slipRun.total_tax ?? 0) > 0 ? `−${Number(slipRun.total_tax).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}</Typography></TableCell>
                      <TableCell><Typography fontWeight={800} color="success.main">{Number(slipRun.total_net ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Typography></TableCell>
                      <TableCell />
                    </TableRow>
                  )
                })()}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSlipRun(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MEETINGS
// ══════════════════════════════════════════════════════════════════════════════

function MeetingsSection() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['hr-meetings'], queryFn: () => fetchMeetings() })
  const list: any[] = (data as any)?.items ?? (Array.isArray(data) ? data : [])
  const [dlg, setDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const [minDlg, setMinDlg] = useState<{ open: boolean; meeting?: any }>({ open: false })
  const [minText, setMinText] = useState('')
  const mut = useMutation({ mutationFn: (d: any) => dlg.item ? updateMeeting(dlg.item.id, d) : createMeeting(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-meetings'] }); toast.success('Saved') } })
  const del = useMutation({ mutationFn: deleteMeeting, onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-meetings'] }); toast.success('Deleted') } })
  const minMut = useMutation({ mutationFn: ({ id, content }: any) => upsertMeetingMinutes(id, { content }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-meetings'] }); toast.success('Minutes saved'); setMinDlg({ open: false }) } })
  const sColor = (s: string) => s === 'completed' ? 'success' : s === 'cancelled' ? 'error' : 'default'
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6" fontWeight={700}>Meetings</Typography>
        <Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDlg({ open: true })}>Schedule Meeting</Button>
      </Box>
      <TableContainer component={Paper}><Table size="small">
        <TableHead><TableRow>{['Title','Scheduled','Location','Status','Minutes',''].map(h => <Th key={h}>{h}</Th>)}</TableRow></TableHead>
        <TableBody>{list.map((m: any) => (
          <TableRow key={m.id} hover>
            <TableCell>{m.title}</TableCell>
            <TableCell>{fmt(m.scheduled_at)}</TableCell>
            <TableCell>{m.location ?? '—'}</TableCell>
            <TableCell><Chip size="small" label={m.status} color={sColor(m.status) as any} /></TableCell>
            <TableCell><Button size="small" variant="outlined" onClick={() => { setMinText(m.minutes?.content ?? ''); setMinDlg({ open: true, meeting: m }) }}>{m.minutes ? 'View/Edit' : 'Add'}</Button></TableCell>
            <TableCell sx={{ whiteSpace: 'nowrap' }}><CrudEditBtn onEdit={() => setDlg({ open: true, item: m })} /><CrudDeleteBtn onDelete={() => del.mutate(m.id)} /></TableCell>
          </TableRow>
        ))}</TableBody>
      </Table></TableContainer>
      <SimpleDialog open={dlg.open} title={dlg.item ? 'Edit Meeting' : 'Schedule Meeting'}
        fields={[{ key: 'title', label: 'Title' }, { key: 'scheduled_at', label: 'Scheduled At', type: 'date' }, { key: 'location', label: 'Location' }, { key: 'status', label: 'Status', type: 'select', options: ['scheduled','in_progress','completed','cancelled'] }, { key: 'description', label: 'Description', type: 'textarea' }]}
        initial={dlg.item ?? {}} onClose={() => setDlg({ open: false })} onSave={d => mut.mutate(d)} />
      <Dialog open={minDlg.open} onClose={() => setMinDlg({ open: false })} fullWidth maxWidth="md">
        <DialogTitle>Meeting Minutes — {minDlg.meeting?.title}</DialogTitle>
        <DialogContent sx={{ pt: '16px !important' }}>
          <TextField multiline rows={12} fullWidth value={minText} onChange={e => setMinText(e.target.value)} placeholder="Enter meeting minutes…" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMinDlg({ open: false })}>Cancel</Button>
          <Button variant="contained" onClick={() => minMut.mutate({ id: minDlg.meeting.id, content: minText })}>Save Minutes</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// DOCUMENTS (abbreviated but complete)
// ══════════════════════════════════════════════════════════════════════════════

function DocumentsSection() {
  const qc = useQueryClient()
  const [tab, setTab] = useState(0)
  const { data: docsData } = useQuery({ queryKey: ['hr-employee-documents'], queryFn: () => fetchEmployeeDocuments() })
  const { data: contractsData } = useQuery({ queryKey: ['hr-employee-contracts'], queryFn: () => fetchEmployeeContracts() })
  const { data: acksData } = useQuery({ queryKey: ['hr-acknowledgments'], queryFn: () => fetchAcknowledgments() })
  const { data: docTmplData = [] } = useQuery({ queryKey: ['hr-document-templates'], queryFn: () => fetchDocumentTemplates() })
  const { data: ctrTmplData = [] } = useQuery({ queryKey: ['hr-contract-templates'], queryFn: () => fetchContractTemplates() })
  const { data: catsData = [] } = useQuery({ queryKey: ['hr-doc-categories'], queryFn: fetchDocumentCategories })
  const { data: ctypesData = [] } = useQuery({ queryKey: ['hr-contract-types'], queryFn: fetchContractTypes })

  const docs: any[] = (docsData as any)?.items ?? (Array.isArray(docsData) ? docsData : [])
  const contracts: any[] = (contractsData as any)?.items ?? (Array.isArray(contractsData) ? contractsData : [])
  const acks: any[] = (acksData as any)?.items ?? (Array.isArray(acksData) ? acksData : [])
  const docTmpls: any[] = Array.isArray(docTmplData) ? docTmplData : []
  const ctrTmpls: any[] = Array.isArray(ctrTmplData) ? ctrTmplData : []
  const cats: any[] = Array.isArray(catsData) ? catsData : []
  const ctypes: any[] = Array.isArray(ctypesData) ? ctypesData : []

  const [docDlg, setDocDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const [ctrDlg, setCtrDlg] = useState<{ open: boolean; item?: any }>({ open: false })
  const [ackDlg, setAckDlg] = useState(false)
  const [catName, setCatName] = useState(''); const [catDlg, setCatDlg] = useState(false)
  const [ctName, setCtName] = useState(''); const [ctDlg, setCtDlg] = useState(false)

  const docMut = useMutation({ mutationFn: (d: any) => docDlg.item ? updateEmployeeDocument(docDlg.item.id, d) : createEmployeeDocument(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-employee-documents'] }); toast.success('Saved') } })
  const docDel = useMutation({ mutationFn: deleteEmployeeDocument, onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-employee-documents'] }); toast.success('Deleted') } })
  const ctrMut = useMutation({ mutationFn: (d: any) => ctrDlg.item ? updateEmployeeContract(ctrDlg.item.id, d) : createEmployeeContract(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-employee-contracts'] }); toast.success('Saved') } })
  const ctrDel = useMutation({ mutationFn: deleteEmployeeContract, onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-employee-contracts'] }); toast.success('Deleted') } })
  const ackMut = useMutation({ mutationFn: createAcknowledgment, onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-acknowledgments'] }); toast.success('Saved') } })
  const catMut = useMutation({ mutationFn: () => createDocumentCategory({ name: catName }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-doc-categories'] }); setCatDlg(false); setCatName('') } })
  const catDel = useMutation({ mutationFn: deleteDocumentCategory, onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-doc-categories'] }); toast.success('Deleted') } })
  const ctMut = useMutation({ mutationFn: () => createContractType({ name: ctName }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-contract-types'] }); setCtDlg(false); setCtName('') } })
  const ctDel = useMutation({ mutationFn: deleteContractType, onSuccess: () => { qc.invalidateQueries({ queryKey: ['hr-contract-types'] }); toast.success('Deleted') } })

  const sColor = (s: string) => s === 'active' ? 'success' : s === 'expired' || s === 'terminated' ? 'error' : 'default'

  return (
    <Box>
      <Typography variant="h6" fontWeight={700} gutterBottom>Documents</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }} variant="scrollable">
        <Tab label="HR Documents" /><Tab label="Contracts" /><Tab label="Acknowledgments" /><Tab label="Categories & Types" />
      </Tabs>

      {tab === 0 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}><Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setDocDlg({ open: true })}>Add Document</Button></Box>
          <TableContainer component={Paper}><Table size="small">
            <TableHead><TableRow>{['Title','Employee','Category',''].map(h => <Th key={h}>{h}</Th>)}</TableRow></TableHead>
            <TableBody>{docs.map((d: any) => (
              <TableRow key={d.id} hover>
                <TableCell>{d.title}</TableCell><TableCell>{d.user?.full_name ?? d.user?.email ?? d.user_id}</TableCell>
                <TableCell>{d.category?.name ?? '—'}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}><CrudEditBtn onEdit={() => setDocDlg({ open: true, item: d })} /><CrudDeleteBtn onDelete={() => docDel.mutate(d.id)} /></TableCell>
              </TableRow>
            ))}</TableBody>
          </Table></TableContainer>
          <SimpleDialog open={docDlg.open} title={docDlg.item ? 'Edit Document' : 'Add Document'}
            fields={[{ key: 'title', label: 'Title' }, { key: 'file_url', label: 'File URL' }, { key: 'description', label: 'Description', type: 'textarea' }]}
            initial={docDlg.item ?? {}} onClose={() => setDocDlg({ open: false })} onSave={d => docMut.mutate(d)} />
        </Box>
      )}

      {tab === 1 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}><Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setCtrDlg({ open: true })}>New Contract</Button></Box>
          <TableContainer component={Paper}><Table size="small">
            <TableHead><TableRow>{['Title','Employee','Start','End','Status',''].map(h => <Th key={h}>{h}</Th>)}</TableRow></TableHead>
            <TableBody>{contracts.map((c: any) => (
              <TableRow key={c.id} hover>
                <TableCell>{c.title}</TableCell><TableCell>{c.user?.full_name ?? c.user?.email ?? c.user_id}</TableCell>
                <TableCell>{fmt(c.start_date)}</TableCell><TableCell>{fmt(c.end_date)}</TableCell>
                <TableCell><Chip size="small" label={c.status} color={sColor(c.status) as any} /></TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}><CrudEditBtn onEdit={() => setCtrDlg({ open: true, item: c })} /><CrudDeleteBtn onDelete={() => ctrDel.mutate(c.id)} /></TableCell>
              </TableRow>
            ))}</TableBody>
          </Table></TableContainer>
          <SimpleDialog open={ctrDlg.open} title={ctrDlg.item ? 'Edit Contract' : 'New Contract'}
            fields={[{ key: 'title', label: 'Title' }, { key: 'start_date', label: 'Start Date', type: 'date' }, { key: 'end_date', label: 'End Date', type: 'date' }, { key: 'status', label: 'Status', type: 'select', options: ['draft','active','expired','terminated'] }, { key: 'notes', label: 'Notes', type: 'textarea' }]}
            initial={ctrDlg.item ?? {}} onClose={() => setCtrDlg({ open: false })} onSave={d => ctrMut.mutate(d)} />
        </Box>
      )}

      {tab === 2 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}><Button startIcon={<AddIcon />} variant="contained" size="small" onClick={() => setAckDlg(true)}>Record Acknowledgment</Button></Box>
          <TableContainer component={Paper}><Table size="small">
            <TableHead><TableRow>{['Employee','Acknowledged','Notes'].map(h => <Th key={h}>{h}</Th>)}</TableRow></TableHead>
            <TableBody>{acks.map((a: any) => (
              <TableRow key={a.id} hover>
                <TableCell>{a.user?.full_name ?? a.user?.email ?? a.user_id}</TableCell>
                <TableCell>{fmt(a.acknowledged_at)}</TableCell><TableCell>{a.notes ?? '—'}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table></TableContainer>
          <SimpleDialog open={ackDlg} title="Record Acknowledgment"
            fields={[{ key: 'document_id', label: 'Document ID', type: 'number' }, { key: 'notes', label: 'Notes', type: 'textarea' }]}
            initial={{}} onClose={() => setAckDlg(false)} onSave={d => ackMut.mutate(d)} />
        </Box>
      )}

      {tab === 3 && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Card><CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography fontWeight={700}>Document Categories</Typography>
                <Button size="small" startIcon={<AddIcon />} onClick={() => setCatDlg(true)}>Add</Button>
              </Box>
              {cats.map((c: any) => (
                <Box key={c.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                  <Typography variant="body2">{c.name}</Typography>
                  <CrudDeleteBtn onDelete={() => catDel.mutate(c.id)} />
                </Box>
              ))}
            </CardContent></Card>
            <Dialog open={catDlg} onClose={() => setCatDlg(false)}><DialogTitle>Add Category</DialogTitle>
              <DialogContent sx={{ pt: '16px !important' }}><TextField autoFocus label="Name" size="small" fullWidth value={catName} onChange={e => setCatName(e.target.value)} /></DialogContent>
              <DialogActions><Button onClick={() => setCatDlg(false)}>Cancel</Button><Button variant="contained" onClick={() => catMut.mutate()}>Save</Button></DialogActions>
            </Dialog>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card><CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography fontWeight={700}>Contract Types</Typography>
                <Button size="small" startIcon={<AddIcon />} onClick={() => setCtDlg(true)}>Add</Button>
              </Box>
              {ctypes.map((t: any) => (
                <Box key={t.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5 }}>
                  <Typography variant="body2">{t.name}</Typography>
                  <CrudDeleteBtn onDelete={() => ctDel.mutate(t.id)} />
                </Box>
              ))}
            </CardContent></Card>
            <Dialog open={ctDlg} onClose={() => setCtDlg(false)}><DialogTitle>Add Contract Type</DialogTitle>
              <DialogContent sx={{ pt: '16px !important' }}><TextField autoFocus label="Name" size="small" fullWidth value={ctName} onChange={e => setCtName(e.target.value)} /></DialogContent>
              <DialogActions><Button onClick={() => setCtDlg(false)}>Cancel</Button><Button variant="contained" onClick={() => ctMut.mutate()}>Save</Button></DialogActions>
            </Dialog>
          </Grid>
        </Grid>
      )}
    </Box>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════

const SECTIONS: Record<string, React.FC> = {
  dashboard: DashboardSection,
  calendar: CalendarSection,
  employees: EmployeesSection,
  org: OrgSection,
  attendance: AttendanceSection,
  leave: LeaveSection,
  timesheets: TimesheetsSection,
  recruitment: RecruitmentSection,
  lifecycle: LifecycleSection,
  payroll: PayrollSection,
  meetings: MeetingsSection,
  documents: DocumentsSection,
}

export default function HR() {
  const [active, setActive] = useState('dashboard')
  const Active = SECTIONS[active]
  return (
    <Box sx={{ display: 'flex', height: '100%', minHeight: 0 }}>
      <Paper elevation={2} sx={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRadius: 0, borderRight: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle1" fontWeight={700} color="primary">HR Module</Typography>
        </Box>
        <Box sx={{ flex: 1, overflow: 'auto', py: 1 }}>
          {NAV.map(n => (
            <Box key={n.key} onClick={() => setActive(n.key)} sx={{
              display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1, mx: 0.5, mb: 0.25,
              borderRadius: 1, cursor: 'pointer', transition: 'all .15s',
              bgcolor: active === n.key ? 'primary.main' : 'transparent',
              color: active === n.key ? 'white' : 'text.primary',
              '&:hover': { bgcolor: active === n.key ? 'primary.dark' : 'action.hover' },
              '& svg': { fontSize: 20, color: active === n.key ? 'white' : 'text.secondary' },
            }}>
              {n.icon}
              <Typography variant="body2">{n.label}</Typography>
            </Box>
          ))}
        </Box>
      </Paper>
      <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
        {Active ? <Active /> : null}
      </Box>
    </Box>
  )
}
