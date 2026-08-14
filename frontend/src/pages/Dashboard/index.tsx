import {
  Avatar,
  Box,
  Button,
  Card,
  Chip,
  Grid,
  IconButton,
  LinearProgress,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import { useState, type MouseEvent } from 'react'
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
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined'
import AssessmentIcon from '@mui/icons-material/Assessment'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import TimerIcon from '@mui/icons-material/Timer'
import BeachAccessIcon from '@mui/icons-material/BeachAccess'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts'
import { fetchAuditLogs, type AuditLogItem } from '@/api/audit'
import { fetchDashboardSummary } from '@/api/dashboard'
import { useAuthStore } from '@/stores/authStore'
import { enabledPermissionCount, hasPermission, type Module } from '@/config/permissions'
import { AnimatedNumber } from '@/components/motion'
import AuroraBackground from '@/components/AuroraBackground'
import { keyframes } from '@emotion/react'
import { format, isValid } from 'date-fns'

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

const Dashboard = () => {
  const navigate = useNavigate()
  const currentUser = useAuthStore((s) => s.user)
  const isSuperAdmin = currentUser?.role === 'superadmin'
  const [hiddenAnalytics, setHiddenAnalytics] = useState<Record<string, boolean>>({})
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
    queryKey: ['dashboard-summary'],
    queryFn: fetchDashboardSummary,
  })

  const { data: logData, isLoading: logsLoading } = useQuery({
    queryKey: ['audit-logs-dashboard'],
    queryFn: () => fetchAuditLogs({ limit: 50 }),
    enabled: isSuperAdmin,
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

  return (
    <Box sx={{ maxWidth: 1440, mx: 'auto' }}>
      <Grid container spacing={3}>
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
                    <RechartsTooltip contentStyle={{ border: 0, borderRadius: 12, boxShadow: '0 12px 30px rgba(15,23,42,0.16)' }} />
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
              <Grid item xs={12} md={4} key={stat.label}>
                <Card
                  onClick={() => navigate(stat.path)}
                  sx={{
                    p: 2,
                    borderRadius: '22px',
                    border: '1px solid #EEF0F6',
                    boxShadow: '0 14px 34px rgba(49,46,129,0.07)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                  }}
                >
                  <Avatar sx={{ bgcolor: `${stat.color}16`, color: stat.color, borderRadius: '16px' }}>{stat.icon}</Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ color: '#1E1B4B', fontWeight: 900 }}>{stat.label}</Typography>
                    <Typography sx={{ color: '#8B95A7', fontSize: 12, fontWeight: 700 }}>{cardHidden ? 'Analytics hidden' : stat.detail}</Typography>
                  </Box>
                  <Stack direction="row" spacing={0.8} alignItems="center">
                    {renderAnalyticsToggle(`compact-${stat.key}`, `${stat.label} analytics`)}
                    <Typography sx={{ color: stat.color, fontSize: 26, fontWeight: 900 }}>{summaryLoading ? '-' : cardHidden ? hiddenNumber : <AnimatedNumber value={stat.value} />}</Typography>
                  </Stack>
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
                            <RechartsTooltip cursor={{ fill: 'rgba(113,97,216,0.06)' }} contentStyle={{ border: 0, borderRadius: 12, boxShadow: '0 12px 30px rgba(15,23,42,0.14)' }} />
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
                              <RechartsTooltip contentStyle={{ border: 0, borderRadius: 12, boxShadow: '0 12px 30px rgba(15,23,42,0.14)' }} />
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

            {isSuperAdmin && (
              <Card sx={{ p: 2.5, borderRadius: '28px', border: '1px solid #EEF0F6', boxShadow: '0 18px 45px rgba(49,46,129,0.08)' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, mb: 2 }}>
                  <Avatar sx={{ bgcolor: '#F0EDFF', color: '#6757D8', borderRadius: '14px' }}><HistoryIcon /></Avatar>
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ color: '#1E1B4B', fontWeight: 900 }}>Recent Activity</Typography>
                    <Typography sx={{ color: '#8B95A7', fontSize: 12, fontWeight: 700 }}>User actions and system events</Typography>
                  </Box>
                </Box>

                {logsLoading ? (
                  <Stack spacing={1.2}>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} variant="rounded" height={72} sx={{ borderRadius: '16px' }} />)}</Stack>
                ) : logs.length === 0 ? (
                  <Typography variant="body2" sx={{ color: '#9CA3AF', py: 2 }}>No recent activity found.</Typography>
                ) : (
                  <Stack
                    spacing={1.2}
                    sx={{
                      maxHeight: 460,
                      overflowY: 'auto',
                      pr: 0.5,
                      '&::-webkit-scrollbar': { width: 7 },
                      '&::-webkit-scrollbar-track': { backgroundColor: '#F3F4F6', borderRadius: 8 },
                      '&::-webkit-scrollbar-thumb': { backgroundColor: '#CBD5E1', borderRadius: 8 },
                    }}
                  >
                    {logs.map((log) => {
                      const colors = actionColor(log.action)
                      const details = summarizeChanges(log)
                      return (
                        <Box key={log.id} sx={{ p: 1.6, borderRadius: '18px', bgcolor: '#F8FAFC', border: '1px solid #EEF2F7' }}>
                          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 0.8 }}>
                            <Chip label={log.action} size="small" sx={{ height: 22, bgcolor: colors.bg, color: colors.color, fontSize: 10, fontWeight: 900 }} />
                            <Typography sx={{ color: '#94A3B8', fontSize: 11, fontWeight: 700 }}>{safeFormatDate(log.timestamp)}</Typography>
                          </Box>
                          <Typography sx={{ color: '#1E1B4B', fontSize: 13, fontWeight: 900 }}>{activityTitle(log)}</Typography>
                          {details[0] && (
                            <Typography sx={{ color: '#8B95A7', fontSize: 11, fontWeight: 700, mt: 0.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {details[0]}
                            </Typography>
                          )}
                        </Box>
                      )
                    })}
                  </Stack>
                )}
              </Card>
            )}
          </Stack>
        </Grid>
      </Grid>
    </Box>
  )
}

export default Dashboard
