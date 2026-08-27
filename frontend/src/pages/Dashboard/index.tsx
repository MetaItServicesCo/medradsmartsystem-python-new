import {
  Avatar,
  Box,
  Button,
  Card,
  Chip,
  Grid,
  IconButton,
  LinearProgress,
  MenuItem,
  Pagination,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { useEffect, useState, type MouseEvent } from 'react'
import BuildIcon from '@mui/icons-material/Build'
import AssignmentIcon from '@mui/icons-material/Assignment'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import ReceiptIcon from '@mui/icons-material/Receipt'
import BusinessIcon from '@mui/icons-material/Business'
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing'
import HistoryIcon from '@mui/icons-material/History'
import PeopleAltIcon from '@mui/icons-material/PeopleAlt'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import Inventory2Icon from '@mui/icons-material/Inventory2'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import TrendingDownIcon from '@mui/icons-material/TrendingDown'
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined'
import AssessmentIcon from '@mui/icons-material/Assessment'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import TimerIcon from '@mui/icons-material/Timer'
import BeachAccessIcon from '@mui/icons-material/BeachAccess'
import SearchIcon from '@mui/icons-material/Search'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts'
import type { AuditLogItem } from '@/api/audit'
import {
  fetchDashboardActivity,
  fetchDashboardAnalysis,
  fetchDashboardIntelligence,
  fetchDashboardSummary,
  type DashboardComparisonMode,
  type DashboardPeriodParams,
} from '@/api/dashboard'
import { useAuthStore } from '@/stores/authStore'
import { enabledPermissionCount, hasPermission, type Module } from '@/config/permissions'
import { AnimatedNumber } from '@/components/motion'
import AuroraBackground from '@/components/AuroraBackground'
import { keyframes } from '@emotion/react'
import { format, isValid, subDays } from 'date-fns'

// A calm, minimal "live" pulse for the status dot.
const livePulse = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 rgba(74,222,128,0.7); opacity: 1; }
  50%      { box-shadow: 0 0 0 6px rgba(74,222,128,0); opacity: 0.7; }
`

const safeFormatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return 'Recently'
  const date = new Date(dateStr)
  if (!isValid(date)) return 'Recently'
  return format(date, 'MMM d, yyyy h:mm a')
}

const actionColor = (action: string) => {
  if (action.includes('VIEW')) return { bg: '#EEF2FF', color: '#4F46E5' }
  if (action.includes('CREATE') || action.includes('REGISTER') || action.includes('LOGIN')) return { bg: '#ECFDF5', color: '#059669' }
  if (action.includes('DELETE') || action.includes('DEACTIVATE')) return { bg: '#FEF2F2', color: '#DC2626' }
  if (action.includes('UPDATE') || action.includes('IMPERSONATE')) return { bg: '#EFF6FF', color: '#2563EB' }
  if (action.includes('FAILED')) return { bg: '#FFF7ED', color: '#EA580C' }
  return { bg: '#F3F4F6', color: '#4B5563' }
}

const entityLabel = (tableName: string) => {
  const normalized = tableName.endsWith('_activity')
    ? tableName.replace(/_activity$/, '')
    : tableName
  return normalized
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

const parseChanges = (changesJson: string | null) => {
  if (!changesJson) return null
  try {
    return JSON.parse(changesJson)
  } catch {
    return null
  }
}

const prettyKey = (key: string) =>
  key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())

const prettyValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return 'empty'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

type AnalyticsKey =
  | 'overview'
  | 'module-health'
  | 'focus-queue'
  | `stat-${string}`
  | `compact-${string}`

const hiddenNumber = '•••'

type DashboardTooltipEntry = {
  color?: string
  name?: string
  value?: number | string
  payload?: {
    color?: string
    label?: string
    name?: string
    value?: number | string
  }
}

type DashboardTooltipProps = {
  active?: boolean
  label?: string | number
  payload?: DashboardTooltipEntry[]
  valueLabel?: string
}

const DashboardChartTooltip = ({ active, label, payload, valueLabel = 'Items' }: DashboardTooltipProps) => {
  const entry = payload?.find((item) => item.value !== null && item.value !== undefined)
  if (!active || !entry) return null

  const datum = entry.payload || {}
  const resolvedLabel = String(label || datum.name || datum.label || entry.name || 'Current value')
  const resolvedValue = entry.value ?? datum.value ?? 0
  const accent = datum.color || entry.color || '#6757D8'

  return (
    <Box
      sx={{
        minWidth: 132,
        px: 1.5,
        py: 1.15,
        bgcolor: '#FFFFFF',
        border: '1px solid #E8ECF4',
        borderRadius: '14px',
        boxShadow: '0 14px 34px rgba(15,23,42,0.16)',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: accent, flexShrink: 0 }} />
        <Typography sx={{ color: '#475569', fontSize: 11.5, fontWeight: 850, lineHeight: 1.2 }}>
          {resolvedLabel}
        </Typography>
      </Box>
      <Typography sx={{ color: '#1E1B4B', fontSize: 22, fontWeight: 950, lineHeight: 1.15, mt: 0.7 }}>
        {resolvedValue}
      </Typography>
      <Typography sx={{ color: '#94A3B8', fontSize: 10.5, fontWeight: 750 }}>{valueLabel}</Typography>
    </Box>
  )
}

const ACTIVITY_PAGE_SIZE = 10

const activityTitle = (log: AuditLogItem) => {
  const actor = log.changed_by_username || 'system'
  const changes = parseChanges(log.changes_json)

  if (changes?.activity_type === 'api_request') {
    const module = entityLabel(changes.module || log.table_name)
    if (log.action === 'VIEW_LIST') return `${actor} viewed ${module}`
    if (log.action === 'VIEW_DETAIL') return `${actor} opened ${module} record #${changes.record_id || log.record_id}`
    if (log.action === 'REQUEST_FAILED') return `${actor} had a failed ${changes.method || 'API'} request in ${module}`
    if (log.action === 'API_CREATE') return `${actor} created data in ${module}`
    if (log.action === 'API_UPDATE') return `${actor} updated data in ${module}`
    if (log.action === 'API_DELETE') return `${actor} deleted data in ${module}`
  }

  if (log.table_name === 'users') {
    if (log.action === 'LOGIN') return `${actor} signed in`
    if (log.action === 'CREATE') return `${actor} created a user account`
    if (log.action === 'UPDATE_ROLE') return `${actor} changed a user role`
    if (log.action === 'ACTIVATE' || log.action === 'DEACTIVATE') return `${actor} changed user access`
  }

  return `${actor} acted on ${entityLabel(log.table_name)}`
}

const summarizeChanges = (log: AuditLogItem) => {
  const changes = parseChanges(log.changes_json)
  if (!changes) return []

  if (changes.activity_type === 'api_request') {
    const details = [`${changes.method} ${changes.path}`, `Status ${changes.status_code}`]
    if (changes.query && Object.keys(changes.query).length > 0) details.push(`Filters ${JSON.stringify(changes.query)}`)
    if (changes.ip_address) details.push(`IP ${changes.ip_address}`)
    if (changes.user_role) details.push(`Role ${changes.user_role}`)
    return details
  }

  if (changes.before && changes.after) {
    return Object.entries(changes.after)
      .filter(([key, value]) => prettyValue(changes.before?.[key]) !== prettyValue(value))
      .slice(0, 4)
      .map(([key, value]) => `${prettyKey(key)}: ${prettyValue(changes.before?.[key])} -> ${prettyValue(value)}`)
  }

  return Object.entries(changes)
    .filter(([key]) => !['password', 'hashed_password'].includes(key))
    .slice(0, 4)
    .map(([key, value]) => `${prettyKey(key)}: ${prettyValue(value)}`)
}

const AI_SECTION_LABEL = {
  color: '#94A3B8',
  fontSize: 10.5,
  fontWeight: 900,
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  mt: 1.7,
  mb: 0.8,
}

const Dashboard = () => {
  const navigate = useNavigate()
  const currentUser = useAuthStore((s) => s.user)
  const isSuperAdmin = currentUser?.role === 'superadmin'
  const [hiddenAnalytics, setHiddenAnalytics] = useState<Record<string, boolean>>({})
  const [activityPage, setActivityPage] = useState(1)
  const [activitySearchInput, setActivitySearchInput] = useState('')
  const [activitySearch, setActivitySearch] = useState('')
  const [activityAction, setActivityAction] = useState('')
  const [activityFrom, setActivityFrom] = useState('')
  const [activityTo, setActivityTo] = useState('')
  const [dashboardFrom, setDashboardFrom] = useState(() => format(subDays(new Date(), 29), 'yyyy-MM-dd'))
  const [dashboardTo, setDashboardTo] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [comparisonMode, setComparisonMode] = useState<DashboardComparisonMode>('previous_period')
  const [comparisonFrom, setComparisonFrom] = useState('')
  const [comparisonTo, setComparisonTo] = useState('')
  const canAccess = (module: Module) => hasPermission(currentUser, module)
  const isAnalyticsHidden = (key: AnalyticsKey) => Boolean(hiddenAnalytics[key])
  const toggleAnalytics = (key: AnalyticsKey) => (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    setHiddenAnalytics((prev) => ({ ...prev, [key]: !prev[key] }))
  }
  const renderAnalyticsToggle = (key: AnalyticsKey, label = 'analytics') => {
    const hidden = isAnalyticsHidden(key)
    return (
      <Tooltip title={hidden ? `Show ${label}` : `Hide ${label}`}>
        <IconButton
          size="small"
          onClick={toggleAnalytics(key)}
          sx={{
            width: 34,
            height: 34,
            bgcolor: hidden ? '#F8FAFC' : 'rgba(255,255,255,0.78)',
            color: hidden ? '#64748B' : '#6757D8',
            border: '1px solid rgba(226,232,240,0.86)',
            '&:hover': { bgcolor: hidden ? '#EEF2F7' : '#fff' },
          }}
        >
          {hidden ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
    )
  }

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['dashboard-summary', currentUser?.id],
    queryFn: fetchDashboardSummary,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })

  const dashboardDatesValid = Boolean(
    dashboardFrom
    && dashboardTo
    && dashboardFrom <= dashboardTo
    && (comparisonMode !== 'custom' || (comparisonFrom && comparisonTo && comparisonFrom <= comparisonTo)),
  )
  const dashboardParams: DashboardPeriodParams = {
    date_from: dashboardFrom || undefined,
    date_to: dashboardTo || undefined,
    comparison: comparisonMode,
    comparison_from: comparisonMode === 'custom' ? comparisonFrom || undefined : undefined,
    comparison_to: comparisonMode === 'custom' ? comparisonTo || undefined : undefined,
  }
  const { data: intelligence, isLoading: intelligenceLoading } = useQuery({
    queryKey: ['dashboard-intelligence', currentUser?.id, dashboardFrom, dashboardTo, comparisonMode, comparisonFrom, comparisonTo],
    queryFn: () => fetchDashboardIntelligence(dashboardParams),
    enabled: dashboardDatesValid,
    staleTime: 45_000,
    refetchInterval: 75_000,
    refetchIntervalInBackground: false,
  })
  const {
    data: aiAnalysis,
    isFetching: aiAnalysisLoading,
    refetch: generateAiAnalysis,
  } = useQuery({
    queryKey: ['dashboard-ai-analysis', currentUser?.id, dashboardFrom, dashboardTo, comparisonMode, comparisonFrom, comparisonTo],
    queryFn: () => fetchDashboardAnalysis(dashboardParams),
    enabled: false,
    staleTime: 15 * 60_000,
  })

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setActivitySearch(activitySearchInput.trim())
      setActivityPage(1)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [activitySearchInput])

  const activityDatesValid = !activityFrom || !activityTo || activityFrom <= activityTo

  const { data: logData, isLoading: logsLoading, isError: logsError } = useQuery({
    queryKey: ['dashboard-activity', currentUser?.id, activityPage, activitySearch, activityAction, activityFrom, activityTo],
    queryFn: () => fetchDashboardActivity({
      skip: (activityPage - 1) * ACTIVITY_PAGE_SIZE,
      limit: ACTIVITY_PAGE_SIZE,
      search: activitySearch || undefined,
      action: activityAction || undefined,
      from_date: activityFrom || undefined,
      to_date: activityTo || undefined,
    }),
    enabled: activityDatesValid,
    staleTime: 30_000,
    refetchInterval: 90_000,
    refetchIntervalInBackground: false,
  })

  const stats = [
    {
      key: 'facilities',
      module: 'facilities' as Module,
      label: 'Facilities',
      value: summary?.facilities.total ?? 0,
      detail: `${summary?.facilities.active ?? 0} active`,
      progress: summary?.facilities.total ? Math.round((summary.facilities.active / summary.facilities.total) * 100) : 0,
      icon: <BusinessIcon />,
      color: '#6757D8',
      soft: '#F0EDFF',
      path: '/facilities',
    },
    {
      key: 'service-requests',
      module: 'service-requests' as Module,
      label: 'Service Requests',
      value: summary?.service_requests.open ?? 0,
      detail: `${summary?.service_requests.critical ?? 0} critical`,
      progress: summary?.service_requests.total ? Math.round((summary.service_requests.open / summary.service_requests.total) * 100) : 0,
      icon: <BuildIcon />,
      color: '#F0528A',
      soft: '#FFF0F6',
      path: '/service-requests',
    },
    {
      key: 'equipment',
      module: 'facility-inventory' as Module,
      label: 'Equipment',
      value: summary?.equipment.total ?? 0,
      detail: `${summary?.equipment.in_maintenance ?? 0} in maintenance`,
      progress: summary?.equipment.total ? Math.round((summary.equipment.active / summary.equipment.total) * 100) : 0,
      icon: <PrecisionManufacturingIcon />,
      color: '#13A77B',
      soft: '#EAFBF5',
      path: '/facilities',
    },
    {
      key: 'invoices',
      module: 'sales' as Module,
      label: 'Invoices',
      value: summary?.invoices.pending ?? 0,
      detail: `${summary?.invoices.overdue ?? 0} overdue`,
      progress: summary?.invoices.pending ? Math.max(8, 100 - Math.min(summary.invoices.overdue * 10, 90)) : 0,
      icon: <ReceiptIcon />,
      color: '#E39B23',
      soft: '#FFF6E7',
      path: '/sales/invoices',
    },
  ]

  const compactStats = [
    {
      key: 'permissions',
      module: 'dashboard' as Module,
      label: 'Permissions',
      value: enabledPermissionCount(currentUser),
      detail: 'enabled actions',
      icon: <PeopleAltIcon />,
      color: '#7C3AED',
      path: '/dashboard',
    },
    {
      key: 'inspections',
      module: 'inspections' as Module,
      label: 'Inspections',
      value: summary?.inspections.total ?? 0,
      detail: `${summary?.inspections.upcoming ?? 0} upcoming`,
      icon: <AssignmentIcon />,
      color: '#3B82F6',
      path: '/inspections',
    },
    {
      key: 'rentals',
      module: 'rentals' as Module,
      label: 'Rentals',
      value: summary?.rentals.active ?? 0,
      detail: 'active agreements',
      icon: <LocalShippingIcon />,
      color: '#7C3AED',
      path: '/rentals',
    },
    {
      key: 'users',
      module: 'users' as Module,
      label: 'Users',
      value: summary?.user_assignments.total ?? 0,
      detail: `${summary?.user_assignments.multi_facility ?? 0} facility links`,
      icon: <PeopleAltIcon />,
      color: '#0F766E',
      path: '/users',
    },
  ]

  const chartData = [
    { name: 'Facilities', value: summary?.facilities.total ?? 0, module: 'facilities' as Module },
    { name: 'Equipment', value: summary?.equipment.total ?? 0, module: 'facility-inventory' as Module },
    { name: 'Requests', value: summary?.service_requests.total ?? 0, module: 'service-requests' as Module },
    { name: 'Inspections', value: summary?.inspections.total ?? 0, module: 'inspections' as Module },
    { name: 'Assignments', value: summary?.user_assignments.total ?? 0, module: 'users' as Module },
    { name: 'Invoices', value: summary?.invoices.pending ?? 0, module: 'sales' as Module },
  ]

  const focusItems = [
    {
      key: 'critical-service',
      module: 'service-requests' as Module,
      label: 'Critical service requests',
      value: summary?.service_requests.critical ?? 0,
      icon: <WarningAmberIcon />,
      color: '#E11D48',
      path: '/service-requests',
    },
    {
      key: 'overdue-inspections',
      module: 'inspections' as Module,
      label: 'Overdue inspections',
      value: summary?.inspections.overdue ?? 0,
      icon: <AssignmentIcon />,
      color: '#F59E0B',
      path: '/inspections',
    },
    {
      key: 'low-stock-parts',
      module: 'inventory' as Module,
      label: 'Low stock parts',
      value: summary?.inventory.low_stock_parts ?? 0,
      icon: <Inventory2Icon />,
      color: '#7C3AED',
      path: '/inventory',
    },
    {
      key: 'expiring-parts',
      module: 'inventory' as Module,
      label: 'Expiring parts',
      value: summary?.inventory.expiring_parts ?? 0,
      icon: <Inventory2Icon />,
      color: '#0891B2',
      path: '/inventory',
    },
  ]

  const pipelineItems = [
    { label: 'Service Open', value: summary?.service_requests.open ?? 0, color: '#F05D92', path: '/service-requests', module: 'service-requests' as Module },
    { label: 'Service Critical', value: summary?.service_requests.critical ?? 0, color: '#E11D48', path: '/service-requests', module: 'service-requests' as Module },
    { label: 'Inspection Upcoming', value: summary?.inspections.upcoming ?? 0, color: '#3B82F6', path: '/inspections', module: 'inspections' as Module },
    { label: 'Inspection Overdue', value: summary?.inspections.overdue ?? 0, color: '#F59E0B', path: '/inspections', module: 'inspections' as Module },
  ]

  const riskMix = [
    { name: 'Service Critical', value: summary?.service_requests.critical ?? 0, color: '#E11D48', module: 'service-requests' as Module },
    { name: 'Inspection Overdue', value: summary?.inspections.overdue ?? 0, color: '#F59E0B', module: 'inspections' as Module },
    { name: 'Inventory Low Stock', value: summary?.inventory.low_stock_parts ?? 0, color: '#7C3AED', module: 'inventory' as Module },
    { name: 'Inventory Expiring', value: summary?.inventory.expiring_parts ?? 0, color: '#0891B2', module: 'inventory' as Module },
  ]

  const quickActions = [
    { label: 'New Request', detail: 'Create service work', icon: <BuildIcon />, path: '/service-requests', module: 'service-requests' as Module },
    { label: 'Facility Inventory', detail: 'Track facility assets', icon: <PrecisionManufacturingIcon />, path: '/facilities', module: 'facility-inventory' as Module },
    { label: 'Parts Inventory', detail: 'Review parts stock health', icon: <Inventory2Icon />, path: '/inventory', module: 'inventory' as Module },
    { label: 'Sales Invoices', detail: 'Check invoices', icon: <ReceiptIcon />, path: '/sales/invoices', module: 'sales' as Module },
    { label: 'Reports', detail: 'Open analytics', icon: <AssessmentIcon />, path: '/reports', module: 'reports' as Module },
    { label: 'My Timesheets', detail: 'Log working hours', icon: <TimerIcon />, path: '/my-timesheets', module: 'my-timesheets' as Module },
    { label: 'My Leave', detail: 'Review leave requests', icon: <BeachAccessIcon />, path: '/my-leave', module: 'my-leave' as Module },
    { label: 'Chat', detail: 'Team conversations', icon: <ChatBubbleOutlineIcon />, path: '/chat', module: 'chat' as Module },
    { label: 'Calendar', detail: 'Schedule work', icon: <CalendarMonthIcon />, path: '/calendar', module: 'calendar' as Module },
  ]

  const overviewMetrics = [
    { label: 'Open Requests', value: summary?.service_requests.open ?? 0, module: 'service-requests' as Module },
    { label: 'Active Equipment', value: summary?.equipment.active ?? 0, module: 'facility-inventory' as Module },
    { label: 'Low Stock', value: summary?.inventory.low_stock_parts ?? 0, module: 'inventory' as Module },
  ]

  const visibleStats = stats.filter((stat) => canAccess(stat.module))
  const visibleCompactStats = compactStats.filter((stat) => canAccess(stat.module))
  const visibleChartData = chartData.filter((item) => canAccess(item.module))
  const visibleFocusItems = focusItems.filter((item) => canAccess(item.module))
  const visiblePipelineItems = pipelineItems.filter((item) => canAccess(item.module))
  const visibleRiskMix = riskMix.filter((item) => canAccess(item.module))
  const visibleQuickActions = quickActions.filter((action) => canAccess(action.module))
  const visibleOverviewMetrics = overviewMetrics.filter((item) => canAccess(item.module))
  const riskTotal = visibleRiskMix.reduce((total, item) => total + item.value, 0)
  const overviewHidden = isAnalyticsHidden('overview')
  const moduleHealthHidden = isAnalyticsHidden('module-health')
  const focusHidden = isAnalyticsHidden('focus-queue')

  const logs = logData?.items || []
  const activityTotal = logData?.total || 0
  const activityPageCount = Math.max(1, Math.ceil(activityTotal / ACTIVITY_PAGE_SIZE))
  const comparisonLabel = comparisonMode === 'previous_year'
    ? 'same period last year'
    : comparisonMode === 'custom'
      ? 'custom comparison period'
      : 'previous period'
  const trajectoryDirection = intelligence?.trajectory.direction || 'stable'
  const trajectoryPresentation = trajectoryDirection === 'upward'
    ? { label: 'Upward trajectory', color: '#059669', soft: '#ECFDF5', icon: <TrendingUpIcon /> }
    : trajectoryDirection === 'downward'
      ? { label: 'Downward trajectory', color: '#DC2626', soft: '#FEF2F2', icon: <TrendingDownIcon /> }
      : { label: 'Stable trajectory', color: '#6757D8', soft: '#F0EDFF', icon: <TrendingFlatIcon /> }
  const comparisonMetrics = [
    { key: 'net_revenue', label: 'Net revenue collected', module: 'billing' as Module, currency: true, color: '#059669' },
    { key: 'completed_service_requests', label: 'Services completed', module: 'service-requests' as Module, currency: false, color: '#F0528A' },
    { key: 'completed_inspections', label: 'Inspections completed', module: 'inspections' as Module, currency: false, color: '#3B82F6' },
    { key: 'new_facilities', label: 'New facilities', module: 'facilities' as Module, currency: false, color: '#6757D8' },
  ].filter((item) => canAccess(item.module) && intelligence?.metrics[item.key])

  const setDashboardPreset = (days: number) => {
    const to = new Date()
    setDashboardTo(format(to, 'yyyy-MM-dd'))
    setDashboardFrom(format(subDays(to, days - 1), 'yyyy-MM-dd'))
  }

  return (
    <Box sx={{ maxWidth: 1440, mx: 'auto' }}>
      <Card sx={{ p: { xs: 1.7, md: 2 }, mb: 3, borderRadius: '22px', border: '1px solid #EEF0F6', boxShadow: '0 12px 30px rgba(49,46,129,0.06)' }}>
        <Box sx={{ display: 'flex', alignItems: { xs: 'stretch', lg: 'center' }, flexDirection: { xs: 'column', lg: 'row' }, gap: 1.4 }}>
          <Box sx={{ flex: 1, minWidth: 210 }}>
            <Typography sx={{ color: '#1E1B4B', fontWeight: 950 }}>Dashboard period</Typography>
            <Typography sx={{ color: '#8B95A7', fontSize: 12, fontWeight: 700 }}>Compare operational performance without changing any source records.</Typography>
          </Box>
          <Stack direction="row" spacing={0.7} sx={{ flexWrap: 'wrap', rowGap: 0.7 }}>
            {[7, 30, 90].map((days) => (
              <Button key={days} size="small" variant="outlined" onClick={() => setDashboardPreset(days)} sx={{ borderRadius: '11px', fontWeight: 850 }}>
                {days} days
              </Button>
            ))}
          </Stack>
          <TextField
            size="small"
            type="date"
            label="From"
            value={dashboardFrom}
            onChange={(event) => setDashboardFrom(event.target.value)}
            InputLabelProps={{ shrink: true }}
            inputProps={{ max: dashboardTo || undefined }}
            sx={{ minWidth: 155 }}
          />
          <TextField
            size="small"
            type="date"
            label="To"
            value={dashboardTo}
            onChange={(event) => setDashboardTo(event.target.value)}
            InputLabelProps={{ shrink: true }}
            inputProps={{ min: dashboardFrom || undefined }}
            sx={{ minWidth: 155 }}
          />
          <TextField
            select
            size="small"
            label="Compare with"
            value={comparisonMode}
            onChange={(event) => setComparisonMode(event.target.value as DashboardComparisonMode)}
            sx={{ minWidth: 190 }}
          >
            <MenuItem value="previous_period">Previous period</MenuItem>
            <MenuItem value="previous_year">Same period last year</MenuItem>
            <MenuItem value="custom">Custom dates</MenuItem>
          </TextField>
          {comparisonMode === 'custom' && (
            <>
              <TextField
                size="small"
                type="date"
                label="Compare from"
                value={comparisonFrom}
                onChange={(event) => setComparisonFrom(event.target.value)}
                InputLabelProps={{ shrink: true }}
                inputProps={{ max: comparisonTo || undefined }}
                sx={{ minWidth: 155 }}
              />
              <TextField
                size="small"
                type="date"
                label="Compare to"
                value={comparisonTo}
                onChange={(event) => setComparisonTo(event.target.value)}
                InputLabelProps={{ shrink: true }}
                inputProps={{ min: comparisonFrom || undefined }}
                sx={{ minWidth: 155 }}
              />
            </>
          )}
        </Box>
        {!dashboardDatesValid && (
          <Typography sx={{ color: '#C2410C', fontSize: 12, fontWeight: 850, mt: 1 }}>Choose a valid From and To date.</Typography>
        )}
      </Card>
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Grid container spacing={2.2}>
            <Grid item xs={12} lg={3.2}>
              <Card sx={{ p: 2.3, height: '100%', minHeight: 164, borderRadius: '24px', border: `1px solid ${trajectoryPresentation.color}22`, bgcolor: trajectoryPresentation.soft, boxShadow: 'none' }}>
                {intelligenceLoading ? (
                  <Stack spacing={1.3}><Skeleton variant="rounded" height={48} /><Skeleton variant="rounded" height={55} /></Stack>
                ) : (
                  <>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                      <Avatar sx={{ bgcolor: '#fff', color: trajectoryPresentation.color, borderRadius: '14px' }}>{trajectoryPresentation.icon}</Avatar>
                      <Box>
                        <Typography sx={{ color: trajectoryPresentation.color, fontWeight: 950, fontSize: 17 }}>{trajectoryPresentation.label}</Typography>
                        <Typography sx={{ color: '#64748B', fontSize: 11.5, fontWeight: 750 }}>versus {comparisonLabel}</Typography>
                      </Box>
                    </Box>
                    <Typography sx={{ color: '#475569', fontSize: 12.5, fontWeight: 700, mt: 2, lineHeight: 1.5 }}>
                      Based only on the permission-scoped metrics available to your account for the selected dates.
                    </Typography>
                  </>
                )}
              </Card>
            </Grid>
            <Grid item xs={12} lg={8.8}>
              <Grid container spacing={1.5} sx={{ height: '100%' }}>
                {intelligenceLoading && Array.from({ length: 4 }).map((_, index) => (
                  <Grid item xs={12} sm={6} md={3} key={index}><Skeleton variant="rounded" height={164} sx={{ borderRadius: '20px' }} /></Grid>
                ))}
                {!intelligenceLoading && comparisonMetrics.map((item) => {
                  const value = intelligence!.metrics[item.key]
                  const favorable = value.direction === 'up'
                  const directionColor = value.direction === 'flat' ? '#64748B' : favorable ? '#059669' : '#DC2626'
                  const formattedCurrent = item.currency ? `$${value.current.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : value.current.toLocaleString()
                  const changeLabel = value.change_percent === null ? 'New in this period' : `${value.change_percent > 0 ? '+' : ''}${value.change_percent}%`
                  return (
                    <Grid item xs={12} sm={6} md={3} key={item.key}>
                      <Card sx={{ p: 2, height: '100%', minHeight: 164, borderRadius: '20px', border: '1px solid #EEF2F7', boxShadow: '0 10px 24px rgba(49,46,129,0.05)' }}>
                        <Box sx={{ width: 9, height: 9, bgcolor: item.color, borderRadius: '50%', mb: 1.3 }} />
                        <Typography sx={{ color: '#64748B', fontSize: 11.5, fontWeight: 850, minHeight: 34 }}>{item.label}</Typography>
                        <Typography sx={{ color: '#1E1B4B', fontSize: 24, fontWeight: 950, mt: 0.5 }}>{formattedCurrent}</Typography>
                        <Chip label={changeLabel} size="small" sx={{ mt: 1, bgcolor: `${directionColor}12`, color: directionColor, fontWeight: 900, height: 25 }} />
                      </Card>
                    </Grid>
                  )
                })}
                {!intelligenceLoading && comparisonMetrics.length === 0 && (
                  <Grid item xs={12}>
                    <Box sx={{ height: 164, borderRadius: '20px', bgcolor: '#F8FAFC', border: '1px solid #EEF2F7', display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2 }}>
                      <Typography sx={{ color: '#64748B', fontSize: 13, fontWeight: 800, textAlign: 'center' }}>No comparison metrics are available for this account's module permissions.</Typography>
                    </Box>
                  </Grid>
                )}
              </Grid>
            </Grid>
          </Grid>
        </Grid>
        <Grid item xs={12} lg={8.4}>
          <Card
            sx={{
              p: 3,
              minHeight: 304,
              borderRadius: '28px',
              border: '1px solid rgba(255,255,255,0.72)',
              color: '#fff',
              overflow: 'hidden',
              position: 'relative',
              background: 'linear-gradient(135deg, #5D4FCF 0%, #7C5DD8 54%, #F15F96 135%)',
              boxShadow: '0 24px 60px rgba(89,76,190,0.28)',
            }}
          >
            <AuroraBackground colors={['rgba(255,255,255,0.24)', 'rgba(255,255,255,0.10)', 'rgba(240,95,150,0.26)']} blur={60} opacity={0.65} />
            <Box sx={{ position: 'relative', zIndex: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mb: 1 }}>
              <Box>
                <Typography sx={{ color: 'rgba(255,255,255,0.72)', fontWeight: 800, fontSize: 12, textTransform: 'uppercase' }}>
                  Primary Dashboard
                </Typography>
                <Typography variant="h4" sx={{ color: '#fff', fontWeight: 900, mt: 0.5 }}>
                  Operational Overview
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip
                  label={(
                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.9 }}>
                      <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#4ADE80', animation: `${livePulse} 1.8s ease-in-out infinite` }} />
                      Live system data
                    </Box>
                  )}
                  sx={{ bgcolor: 'rgba(255,255,255,0.16)', color: '#fff', fontWeight: 800, backdropFilter: 'blur(10px)' }}
                />
                {renderAnalyticsToggle('overview', 'overview analytics')}
              </Stack>
            </Box>

            <Box sx={{ height: 156, mt: 1 }}>
              {summaryLoading ? (
                <Skeleton variant="rounded" height={156} sx={{ bgcolor: 'rgba(255,255,255,0.18)', borderRadius: '18px' }} />
              ) : overviewHidden ? (
                <Box sx={{ height: '100%', borderRadius: '18px', bgcolor: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography sx={{ color: 'rgba(255,255,255,0.78)', fontWeight: 900 }}>Analytics hidden</Typography>
                </Box>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={visibleChartData} margin={{ top: 16, right: 12, left: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="dashboardArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#fff" stopOpacity={0.42} />
                        <stop offset="95%" stopColor="#fff" stopOpacity={0.04} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.16)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.72)', fontSize: 11 }} tickLine={false} axisLine={false} />
                    <RechartsTooltip content={<DashboardChartTooltip valueLabel="Records" />} />
                    <Area type="monotone" dataKey="value" stroke="#FFFFFF" strokeWidth={3} fill="url(#dashboardArea)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </Box>

            <Grid container spacing={1.5} sx={{ mt: 1 }}>
              {visibleOverviewMetrics.map(({ label, value }) => (
                <Grid item xs={12} sm={visibleOverviewMetrics.length === 1 ? 12 : 4} key={label}>
                  <Box sx={{ p: 1.5, borderRadius: '18px', bgcolor: 'rgba(255,255,255,0.13)', backdropFilter: 'blur(12px)' }}>
                    <Typography sx={{ color: 'rgba(255,255,255,0.68)', fontSize: 12, fontWeight: 700 }}>{label}</Typography>
                    <Typography sx={{ color: '#fff', fontSize: 28, lineHeight: 1.1, fontWeight: 900 }}>{summaryLoading ? '-' : overviewHidden ? hiddenNumber : <AnimatedNumber value={value} />}</Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
            </Box>
          </Card>

          <Grid container spacing={2.5} sx={{ mt: 0 }}>
            {visibleStats.map((stat) => {
              const cardHidden = isAnalyticsHidden(`stat-${stat.key}`)
              return (
              <Grid item xs={12} sm={6} md={3} key={stat.label}>
                <Card
                  onClick={() => navigate(stat.path)}
                  sx={{
                    p: 2.2,
                    height: '100%',
                    minHeight: 172,
                    borderRadius: '22px',
                    border: '1px solid #EEF0F6',
                    boxShadow: '0 18px 40px rgba(49,46,129,0.08)',
                    cursor: 'pointer',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                    '&:hover': { transform: 'translateY(-4px)', boxShadow: '0 24px 50px rgba(49,46,129,0.13)' },
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Avatar sx={{ width: 44, height: 44, bgcolor: stat.soft, color: stat.color, borderRadius: '16px' }}>{stat.icon}</Avatar>
                    <Stack direction="row" spacing={0.8} alignItems="center">
                      {renderAnalyticsToggle(`stat-${stat.key}`, `${stat.label} analytics`)}
                      <ArrowForwardIcon sx={{ color: '#CBD5E1', fontSize: 18 }} />
                    </Stack>
                  </Box>
                  <Typography sx={{ color: '#6B7280', fontSize: 13, fontWeight: 800 }}>{stat.label}</Typography>
                  {summaryLoading ? (
                    <Skeleton variant="text" width={72} height={42} />
                  ) : (
                    <Typography sx={{ color: '#1E1B4B', fontSize: 34, lineHeight: 1, fontWeight: 900, mt: 0.5 }}>{cardHidden ? hiddenNumber : <AnimatedNumber value={stat.value} />}</Typography>
                  )}
                  <Typography sx={{ color: '#8B95A7', fontSize: 12, fontWeight: 700, mt: 0.8 }}>{cardHidden ? 'Analytics hidden' : stat.detail}</Typography>
                  <LinearProgress
                    variant="determinate"
                    value={cardHidden ? 0 : Math.min(stat.progress, 100)}
                    sx={{ mt: 1.6, height: 6, borderRadius: 999, bgcolor: '#EEF2F7', '& .MuiLinearProgress-bar': { bgcolor: stat.color, borderRadius: 999 } }}
                  />
                </Card>
              </Grid>
              )
            })}
          </Grid>

          <Grid container spacing={2.5} sx={{ mt: 0 }}>
            {visibleCompactStats.map((stat) => {
              const cardHidden = isAnalyticsHidden(`compact-${stat.key}`)
              return (
              <Grid item xs={12} sm={6} md={3} key={stat.label}>
                <Card
                  onClick={() => navigate(stat.path)}
                  sx={{
                    p: 2.2,
                    height: '100%',
                    minHeight: 172,
                    borderRadius: '22px',
                    border: '1px solid #EEF0F6',
                    boxShadow: '0 18px 40px rgba(49,46,129,0.08)',
                    cursor: 'pointer',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                    '&:hover': { transform: 'translateY(-4px)', boxShadow: '0 24px 50px rgba(49,46,129,0.13)' },
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Avatar sx={{ width: 44, height: 44, bgcolor: `${stat.color}18`, color: stat.color, borderRadius: '16px' }}>{stat.icon}</Avatar>
                    <Stack direction="row" spacing={0.8} alignItems="center">
                      {renderAnalyticsToggle(`compact-${stat.key}`, `${stat.label} analytics`)}
                      <ArrowForwardIcon sx={{ color: '#CBD5E1', fontSize: 18 }} />
                    </Stack>
                  </Box>
                  <Typography sx={{ color: '#6B7280', fontSize: 13, fontWeight: 800 }}>{stat.label}</Typography>
                  {summaryLoading ? (
                    <Skeleton variant="text" width={72} height={42} />
                  ) : (
                    <Typography sx={{ color: '#1E1B4B', fontSize: 34, lineHeight: 1, fontWeight: 900, mt: 0.5 }}>{cardHidden ? hiddenNumber : <AnimatedNumber value={stat.value} />}</Typography>
                  )}
                  <Typography sx={{ color: '#8B95A7', fontSize: 12, fontWeight: 700, mt: 0.8 }}>{cardHidden ? 'Analytics hidden' : stat.detail}</Typography>
                </Card>
              </Grid>
              )
            })}
          </Grid>

          <Grid container spacing={2.5} sx={{ mt: 0 }}>
            <Grid item xs={12} md={7}>
              <Card sx={{ p: 2.5, height: '100%', minHeight: 300, borderRadius: '28px', border: '1px solid #EEF0F6', boxShadow: '0 18px 45px rgba(49,46,129,0.08)' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2 }}>
                  <Box>
                    <Typography sx={{ color: '#1E1B4B', fontWeight: 900, fontSize: 18 }}>Module Health Charts</Typography>
                    <Typography sx={{ color: '#8B95A7', fontSize: 13, fontWeight: 700, mt: 0.4 }}>Service Requests, Inspections, and Inventory risk from live data</Typography>
                  </Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip label="Today" sx={{ bgcolor: '#F0EDFF', color: '#6757D8', fontWeight: 900 }} />
                    {renderAnalyticsToggle('module-health', 'module health analytics')}
                  </Stack>
                </Box>

                <Grid container spacing={2}>
                  <Grid item xs={12} md={7}>
                    <Box sx={{ height: 214, borderRadius: '22px', bgcolor: '#F8FAFC', border: '1px solid #EEF2F7', p: 1.5 }}>
                      {summaryLoading ? (
                        <Skeleton variant="rounded" height="100%" sx={{ borderRadius: '18px' }} />
                      ) : moduleHealthHidden || visiblePipelineItems.length === 0 ? (
                        <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', px: 2 }}>
                          <Typography sx={{ color: '#8B95A7', fontWeight: 900 }}>
                            {moduleHealthHidden ? 'Analytics hidden' : 'No module chart data for this role'}
                          </Typography>
                        </Box>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={visiblePipelineItems} margin={{ top: 12, right: 8, left: -22, bottom: 8 }}>
                            <CartesianGrid stroke="#E8ECF4" vertical={false} />
                            <XAxis dataKey="label" hide />
                            <YAxis allowDecimals={false} tick={{ fill: '#A3ADBD', fontSize: 10 }} tickLine={false} axisLine={false} />
                            <RechartsTooltip cursor={{ fill: 'rgba(113,97,216,0.06)' }} content={<DashboardChartTooltip />} />
                            <Bar dataKey="value" radius={[10, 10, 4, 4]}>
                              {visiblePipelineItems.map((entry) => (
                                <Cell key={entry.label} fill={entry.color} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </Box>
                    <Grid container spacing={1} sx={{ mt: 1 }}>
                      {visiblePipelineItems.map((item) => (
                        <Grid item xs={6} key={item.label}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.7 }}>
                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: item.color, flexShrink: 0 }} />
                            <Typography sx={{ color: '#6B7280', fontSize: 11, fontWeight: 800, lineHeight: 1.2 }}>
                              {item.label}: {summaryLoading ? '-' : moduleHealthHidden ? hiddenNumber : item.value}
                            </Typography>
                          </Box>
                        </Grid>
                      ))}
                    </Grid>
                  </Grid>

                  <Grid item xs={12} md={5}>
                    <Box sx={{ height: 214, borderRadius: '22px', bgcolor: '#F8FAFC', border: '1px solid #EEF2F7', p: 1.5, position: 'relative' }}>
                      {summaryLoading ? (
                        <Skeleton variant="rounded" height="100%" sx={{ borderRadius: '18px' }} />
                      ) : moduleHealthHidden ? (
                        <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Typography sx={{ color: '#8B95A7', fontWeight: 900 }}>Analytics hidden</Typography>
                        </Box>
                      ) : (
                        <>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={riskTotal > 0 ? visibleRiskMix : [{ name: 'Clear', value: 1, color: '#E8ECF4' }]}
                                dataKey="value"
                                nameKey="name"
                                innerRadius="58%"
                                outerRadius="82%"
                                paddingAngle={4}
                                stroke="none"
                              >
                                {(riskTotal > 0 ? visibleRiskMix : [{ name: 'Clear', value: 1, color: '#E8ECF4' }]).map((entry) => (
                                  <Cell key={entry.name} fill={entry.color} />
                                ))}
                              </Pie>
                              <RechartsTooltip content={<DashboardChartTooltip valueLabel="Risk items" />} />
                            </PieChart>
                          </ResponsiveContainer>
                          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                            <Box sx={{ textAlign: 'center' }}>
                              <Typography sx={{ color: '#1E1B4B', fontSize: 30, lineHeight: 1, fontWeight: 900 }}><AnimatedNumber value={riskTotal} /></Typography>
                              <Typography sx={{ color: '#8B95A7', fontSize: 11, fontWeight: 800 }}>risk items</Typography>
                            </Box>
                          </Box>
                        </>
                      )}
                    </Box>
                  </Grid>
                </Grid>

                <Stack direction="row" spacing={1.2} sx={{ mt: 1.6, flexWrap: 'wrap', rowGap: 1 }}>
                  {visibleRiskMix.map((item) => (
                    <Chip
                      key={item.name}
                      label={`${item.name}: ${summaryLoading ? '-' : moduleHealthHidden ? hiddenNumber : item.value}`}
                      size="small"
                      sx={{ bgcolor: `${item.color}14`, color: item.color, fontWeight: 900 }}
                    />
                  ))}
                </Stack>
              </Card>
            </Grid>

            <Grid item xs={12} md={5}>
              <Card sx={{ p: 2.5, height: '100%', minHeight: 260, borderRadius: '28px', border: '1px solid #EEF0F6', boxShadow: '0 18px 45px rgba(49,46,129,0.08)' }}>
                <Typography sx={{ color: '#1E1B4B', fontWeight: 900, fontSize: 18 }}>Quick Actions</Typography>
                <Typography sx={{ color: '#8B95A7', fontSize: 13, fontWeight: 700, mt: 0.4, mb: 2 }}>Jump into common daily workflows</Typography>
                <Stack spacing={1.3}>
                  {visibleQuickActions.map((action) => (
                    <Box
                      key={action.label}
                      onClick={() => navigate(action.path)}
                      sx={{
                        p: 1.6,
                        borderRadius: '18px',
                        bgcolor: '#fff',
                        border: '1px solid #EEF2F7',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.4,
                        cursor: 'pointer',
                        '&:hover': { bgcolor: '#F8FAFC' },
                      }}
                    >
                      <Avatar sx={{ width: 40, height: 40, bgcolor: '#F0EDFF', color: '#6757D8', borderRadius: '14px' }}>{action.icon}</Avatar>
                      <Box sx={{ flex: 1 }}>
                        <Typography sx={{ color: '#1E1B4B', fontWeight: 900 }}>{action.label}</Typography>
                        <Typography sx={{ color: '#8B95A7', fontSize: 12, fontWeight: 700 }}>{action.detail}</Typography>
                      </Box>
                      <ArrowForwardIcon sx={{ color: '#CBD5E1', fontSize: 18 }} />
                    </Box>
                  ))}
                </Stack>
              </Card>
            </Grid>
          </Grid>
        </Grid>

        <Grid item xs={12} lg={3.6}>
          <Stack spacing={2.5}>
            <Card sx={{ p: 2.5, borderRadius: '28px', border: '1px solid #EEF0F6', boxShadow: '0 18px 45px rgba(49,46,129,0.08)' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                <Avatar sx={{ bgcolor: '#FFF7ED', color: '#EA580C', borderRadius: '14px' }}><NotificationsActiveIcon /></Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ color: '#1E1B4B', fontWeight: 950, fontSize: 18 }}>Operational Alerts</Typography>
                  <Typography sx={{ color: '#8B95A7', fontSize: 12, fontWeight: 700 }}>Refreshes automatically</Typography>
                </Box>
                <Chip label={`${intelligence?.alerts.length || 0} active`} size="small" sx={{ bgcolor: '#FFF7ED', color: '#C2410C', fontWeight: 900 }} />
              </Box>
              <Stack spacing={1.1} sx={{ mt: 2 }}>
                {intelligenceLoading && Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} variant="rounded" height={76} sx={{ borderRadius: '16px' }} />)}
                {!intelligenceLoading && (intelligence?.alerts.length || 0) === 0 && (
                  <Box sx={{ p: 1.8, borderRadius: '17px', bgcolor: '#ECFDF5', border: '1px solid #D1FAE5' }}>
                    <Typography sx={{ color: '#047857', fontSize: 13, fontWeight: 900 }}>No active operational alerts.</Typography>
                  </Box>
                )}
                {!intelligenceLoading && intelligence?.alerts.slice(0, 5).map((alert) => {
                  const color = alert.severity === 'critical' ? '#DC2626' : alert.severity === 'warning' ? '#D97706' : '#2563EB'
                  return (
                    <Box key={alert.key} onClick={() => navigate(alert.route)} sx={{ p: 1.5, borderRadius: '17px', bgcolor: `${color}08`, border: `1px solid ${color}20`, cursor: 'pointer', '&:hover': { bgcolor: `${color}10` } }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ flex: 1, color: '#1E1B4B', fontSize: 12.5, fontWeight: 900 }}>{alert.title}</Typography>
                        <Chip label={alert.count} size="small" sx={{ bgcolor: `${color}14`, color, fontWeight: 950, height: 24 }} />
                      </Box>
                      <Typography sx={{ color: '#7C8799', fontSize: 11, fontWeight: 700, mt: 0.6, lineHeight: 1.4 }}>{alert.detail}</Typography>
                    </Box>
                  )
                })}
              </Stack>
            </Card>

            <Card sx={{ p: 2.5, borderRadius: '28px', border: '1px solid #EDE9FE', background: 'linear-gradient(145deg, #FFFFFF 0%, #F8F5FF 100%)', boxShadow: '0 18px 45px rgba(49,46,129,0.08)' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                <Avatar sx={{ bgcolor: '#EEEAFE', color: '#7C3AED', borderRadius: '14px' }}><AutoAwesomeIcon /></Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ color: '#1E1B4B', fontWeight: 950, fontSize: 18 }}>AI Business Analysis</Typography>
                  <Typography sx={{ color: '#8B95A7', fontSize: 11.5, fontWeight: 700 }}>Aggregated metrics only</Typography>
                </Box>
              </Box>
              {aiAnalysis ? (
                <Box sx={{ mt: 1.8 }}>
                  <Typography sx={{ color: '#5B42C5', fontSize: 14, fontWeight: 950, lineHeight: 1.4 }}>{aiAnalysis.headline}</Typography>
                  <Typography sx={{ color: '#64748B', fontSize: 12, fontWeight: 700, mt: 0.7, lineHeight: 1.55 }}>{aiAnalysis.summary}</Typography>

                  {aiAnalysis.positives.length > 0 && (
                    <>
                      <Typography sx={AI_SECTION_LABEL}>Strengths</Typography>
                      <Stack spacing={0.7}>
                        {aiAnalysis.positives.map((item, index) => (
                          <Box key={`pos-${index}`} sx={{ display: 'flex', gap: 0.9, alignItems: 'flex-start', p: 1.1, borderRadius: '14px', bgcolor: '#F0FDF4', border: '1px solid #DCFCE7' }}>
                            <TrendingUpIcon sx={{ fontSize: 16, color: '#059669', mt: '1px', flexShrink: 0 }} />
                            <Typography sx={{ color: '#065F46', fontSize: 11.5, fontWeight: 800, lineHeight: 1.4 }}>{item}</Typography>
                          </Box>
                        ))}
                      </Stack>
                    </>
                  )}

                  {aiAnalysis.risks.length > 0 && (
                    <>
                      <Typography sx={AI_SECTION_LABEL}>Risks</Typography>
                      <Stack spacing={0.7}>
                        {aiAnalysis.risks.map((item, index) => (
                          <Box key={`risk-${index}`} sx={{ display: 'flex', gap: 0.9, alignItems: 'flex-start', p: 1.1, borderRadius: '14px', bgcolor: '#FEF2F2', border: '1px solid #FEE2E2' }}>
                            <WarningAmberIcon sx={{ fontSize: 16, color: '#DC2626', mt: '1px', flexShrink: 0 }} />
                            <Typography sx={{ color: '#991B1B', fontSize: 11.5, fontWeight: 800, lineHeight: 1.4 }}>{item}</Typography>
                          </Box>
                        ))}
                      </Stack>
                    </>
                  )}

                  {aiAnalysis.actions.length > 0 && (
                    <>
                      <Typography sx={AI_SECTION_LABEL}>Recommended actions</Typography>
                      <Stack spacing={0.9}>
                        {aiAnalysis.actions.map((action, index) => (
                          <Box key={`${action}-${index}`} sx={{ display: 'flex', gap: 0.9, alignItems: 'flex-start' }}>
                            <Box sx={{ width: 19, height: 19, borderRadius: '7px', bgcolor: '#EEEAFE', color: '#7C3AED', fontSize: 11, fontWeight: 950, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, mt: '1px' }}>{index + 1}</Box>
                            <Typography sx={{ color: '#475569', fontSize: 11.5, fontWeight: 750, lineHeight: 1.45 }}>{action}</Typography>
                          </Box>
                        ))}
                      </Stack>
                    </>
                  )}
                  {!aiAnalysis.available && <Chip label="Calculated fallback" size="small" sx={{ mt: 1.5, bgcolor: '#F1F5F9', color: '#64748B', fontWeight: 850 }} />}
                </Box>
              ) : (
                <Typography sx={{ color: '#64748B', fontSize: 12, fontWeight: 700, mt: 1.8, lineHeight: 1.55 }}>
                  Generate a concise explanation of trajectory, risks, and recommended next actions for the selected period.
                </Typography>
              )}
              <Button
                fullWidth
                variant="contained"
                startIcon={<AutoAwesomeIcon />}
                disabled={!dashboardDatesValid || aiAnalysisLoading}
                onClick={() => generateAiAnalysis()}
                sx={{ mt: 1.8, borderRadius: '13px', fontWeight: 900, boxShadow: 'none', background: 'linear-gradient(135deg, #7257D8, #E44F92)' }}
              >
                {aiAnalysisLoading ? 'Analyzing...' : aiAnalysis ? 'Refresh analysis' : 'Generate analysis'}
              </Button>
            </Card>

            <Card sx={{ p: 2.5, borderRadius: '28px', border: '1px solid #EEF0F6', boxShadow: '0 18px 45px rgba(49,46,129,0.08)' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'flex-start' }}>
                <Box>
                  <Typography sx={{ color: '#1E1B4B', fontWeight: 900, fontSize: 18 }}>Focus Queue</Typography>
                  <Typography sx={{ color: '#8B95A7', fontSize: 13, fontWeight: 700, mt: 0.5 }}>Items needing attention today</Typography>
                </Box>
                {renderAnalyticsToggle('focus-queue', 'focus queue analytics')}
              </Box>
              <Stack spacing={1.3} sx={{ mt: 2.2 }}>
                {visibleFocusItems.length === 0 && (
                  <Box sx={{ p: 1.8, borderRadius: '18px', bgcolor: '#F8FAFC', border: '1px solid #EEF2F7' }}>
                    <Typography sx={{ color: '#8B95A7', fontSize: 13, fontWeight: 800 }}>No focus items for this role.</Typography>
                  </Box>
                )}
                {visibleFocusItems.map((item) => (
                  <Box
                    key={item.label}
                    onClick={() => navigate(item.path)}
                    sx={{
                      p: 1.6,
                      borderRadius: '18px',
                      bgcolor: '#F8FAFC',
                      border: '1px solid #EEF2F7',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.4,
                      cursor: 'pointer',
                      '&:hover': { bgcolor: '#F3F4F8' },
                    }}
                    >
                      <Avatar sx={{ width: 38, height: 38, bgcolor: `${item.color}14`, color: item.color, borderRadius: '14px' }}>{item.icon}</Avatar>
                      <Typography sx={{ flex: 1, color: '#374151', fontSize: 13, fontWeight: 800 }}>{item.label}</Typography>
                    <Typography sx={{ color: item.color, fontSize: 22, fontWeight: 900 }}>{summaryLoading ? '-' : focusHidden ? hiddenNumber : <AnimatedNumber value={item.value} />}</Typography>
                  </Box>
                ))}
              </Stack>
            </Card>

          </Stack>
        </Grid>

        <Grid item xs={12}>
            <Card sx={{ p: { xs: 2, md: 2.7 }, borderRadius: '28px', border: '1px solid #EEF0F6', boxShadow: '0 18px 45px rgba(49,46,129,0.08)' }}>
              <Box sx={{ display: 'flex', alignItems: { xs: 'flex-start', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 1.4, mb: 2.2 }}>
                <Avatar sx={{ bgcolor: '#F0EDFF', color: '#6757D8', borderRadius: '14px' }}><HistoryIcon /></Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ color: '#1E1B4B', fontWeight: 950, fontSize: 19 }}>{isSuperAdmin ? 'System Activity' : 'Recent Activity'}</Typography>
                  <Typography sx={{ color: '#8B95A7', fontSize: 12.5, fontWeight: 700 }}>
                    {isSuperAdmin ? 'Read-only audit trail across all users and system events' : 'Read-only history of activity performed by your account'}
                  </Typography>
                </Box>
                <Chip
                  label={`${activityTotal.toLocaleString()} ${logData?.scope === 'global' ? 'global' : 'personal'} events`}
                  sx={{ bgcolor: '#F0EDFF', color: '#6757D8', fontWeight: 900 }}
                />
              </Box>

              <Grid container spacing={1.4} sx={{ mb: 2 }}>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    size="small"
                    value={activitySearchInput}
                    onChange={(event) => setActivitySearchInput(event.target.value)}
                    placeholder="Search user, module, action, or record"
                    InputProps={{ startAdornment: <SearchIcon sx={{ color: '#94A3B8', fontSize: 20, mr: 1 }} /> }}
                  />
                </Grid>
                <Grid item xs={12} sm={4} md={2}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    label="Event type"
                    value={activityAction}
                    onChange={(event) => {
                      setActivityAction(event.target.value)
                      setActivityPage(1)
                    }}
                  >
                    <MenuItem value="">All events</MenuItem>
                    <MenuItem value="VIEW">Views</MenuItem>
                    <MenuItem value="CREATE">Created</MenuItem>
                    <MenuItem value="UPDATE">Updated</MenuItem>
                    <MenuItem value="DELETE">Deleted</MenuItem>
                    <MenuItem value="FAILED">Failed</MenuItem>
                    <MenuItem value="LOGIN">Sign-ins</MenuItem>
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={4} md={2}>
                  <TextField
                    fullWidth
                    size="small"
                    type="date"
                    label="From"
                    value={activityFrom}
                    onChange={(event) => {
                      setActivityFrom(event.target.value)
                      setActivityPage(1)
                    }}
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ max: activityTo || undefined }}
                  />
                </Grid>
                <Grid item xs={12} sm={4} md={2}>
                  <TextField
                    fullWidth
                    size="small"
                    type="date"
                    label="To"
                    value={activityTo}
                    onChange={(event) => {
                      setActivityTo(event.target.value)
                      setActivityPage(1)
                    }}
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ min: activityFrom || undefined }}
                  />
                </Grid>
                <Grid item xs={12} md={2}>
                  <Button
                    fullWidth
                    variant="outlined"
                    disabled={!activitySearchInput && !activityAction && !activityFrom && !activityTo}
                    onClick={() => {
                      setActivitySearchInput('')
                      setActivitySearch('')
                      setActivityAction('')
                      setActivityFrom('')
                      setActivityTo('')
                      setActivityPage(1)
                    }}
                    sx={{ minHeight: 40, borderRadius: '12px', fontWeight: 850 }}
                  >
                    Clear filters
                  </Button>
                </Grid>
              </Grid>

              {!activityDatesValid ? (
                <Box sx={{ p: 2, borderRadius: '16px', bgcolor: '#FFF7ED', border: '1px solid #FED7AA' }}>
                  <Typography sx={{ color: '#C2410C', fontSize: 13, fontWeight: 850 }}>The From date must be before or equal to the To date.</Typography>
                </Box>
              ) : logsLoading ? (
                <Stack spacing={1}>{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} variant="rounded" height={76} sx={{ borderRadius: '16px' }} />)}</Stack>
              ) : logsError ? (
                <Box sx={{ p: 2, borderRadius: '16px', bgcolor: '#FEF2F2', border: '1px solid #FECACA' }}>
                  <Typography sx={{ color: '#B91C1C', fontSize: 13, fontWeight: 850 }}>System activity could not be loaded. Please refresh and try again.</Typography>
                </Box>
              ) : logs.length === 0 ? (
                <Box sx={{ py: 4, textAlign: 'center', borderRadius: '18px', bgcolor: '#F8FAFC', border: '1px solid #EEF2F7' }}>
                  <HistoryIcon sx={{ color: '#CBD5E1', fontSize: 34 }} />
                  <Typography sx={{ color: '#64748B', fontWeight: 850, mt: 0.8 }}>No activity matches these filters.</Typography>
                </Box>
              ) : (
                <Stack spacing={1}>
                  {logs.map((log) => {
                    const colors = actionColor(log.action)
                    const details = summarizeChanges(log)
                    const actor = log.changed_by_username || 'system'
                    return (
                      <Box
                        key={log.id}
                        sx={{
                          display: 'flex',
                          alignItems: { xs: 'flex-start', md: 'center' },
                          flexDirection: { xs: 'column', md: 'row' },
                          gap: { xs: 1.2, md: 1.6 },
                          p: 1.5,
                          borderRadius: '18px',
                          bgcolor: '#F8FAFC',
                          border: '1px solid #EEF2F7',
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.1, width: { xs: '100%', md: 190 }, flexShrink: 0 }}>
                          <Avatar sx={{ width: 38, height: 38, bgcolor: '#EEEAFE', color: '#6757D8', fontSize: 14, fontWeight: 950 }}>
                            {actor.charAt(0).toUpperCase()}
                          </Avatar>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography noWrap sx={{ color: '#1E1B4B', fontSize: 13, fontWeight: 900 }}>{actor}</Typography>
                            <Typography sx={{ color: '#94A3B8', fontSize: 10.5, fontWeight: 750 }}>User activity</Typography>
                          </Box>
                        </Box>

                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, flexWrap: 'wrap', mb: 0.55 }}>
                            <Chip
                              label={log.action.replace(/_/g, ' ')}
                              size="small"
                              sx={{ height: 23, bgcolor: colors.bg, color: colors.color, fontSize: 10, fontWeight: 900 }}
                            />
                            <Chip
                              label={entityLabel(log.table_name)}
                              size="small"
                              variant="outlined"
                              sx={{ height: 23, borderColor: '#E2E8F0', color: '#64748B', fontSize: 10, fontWeight: 850 }}
                            />
                            {log.record_id > 0 && (
                              <Typography sx={{ color: '#94A3B8', fontSize: 10.5, fontWeight: 750 }}>Record #{log.record_id}</Typography>
                            )}
                          </Box>
                          <Typography sx={{ color: '#1E1B4B', fontSize: 13, fontWeight: 900 }}>{activityTitle(log)}</Typography>
                          {details.length > 0 && (
                            <Tooltip title={details.join(' · ')} placement="top-start">
                              <Typography noWrap sx={{ color: '#7C8799', fontSize: 11.5, fontWeight: 700, mt: 0.35 }}>
                                {details.slice(0, 2).join(' · ')}
                              </Typography>
                            </Tooltip>
                          )}
                        </Box>

                        <Typography sx={{ color: '#64748B', fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {safeFormatDate(log.timestamp)}
                        </Typography>
                      </Box>
                    )
                  })}
                </Stack>
              )}

              {activityDatesValid && !logsLoading && !logsError && activityTotal > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.2, mt: 2 }}>
                  <Typography sx={{ color: '#8B95A7', fontSize: 12, fontWeight: 750 }}>
                    Showing {((activityPage - 1) * ACTIVITY_PAGE_SIZE) + 1}–{Math.min(activityPage * ACTIVITY_PAGE_SIZE, activityTotal)} of {activityTotal.toLocaleString()}
                  </Typography>
                  <Pagination
                    count={activityPageCount}
                    page={Math.min(activityPage, activityPageCount)}
                    onChange={(_, page) => setActivityPage(page)}
                    color="primary"
                    shape="rounded"
                    size="small"
                  />
                </Box>
              )}
            </Card>
        </Grid>
      </Grid>
    </Box>
  )
}

export default Dashboard
