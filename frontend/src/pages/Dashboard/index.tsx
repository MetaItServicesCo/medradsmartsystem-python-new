import { Box, Card, Typography, Grid } from '@mui/material'
import BuildIcon from '@mui/icons-material/Build'
import AssignmentIcon from '@mui/icons-material/Assignment'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import ReceiptIcon from '@mui/icons-material/Receipt'
import BusinessIcon from '@mui/icons-material/Business'
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing'
import HistoryIcon from '@mui/icons-material/History'
import { useQuery } from '@tanstack/react-query'
import { fetchAuditLogs } from '@/api/audit'
import { useAuthStore } from '@/stores/authStore'
import { format, isValid } from 'date-fns'

const safeFormatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return 'Recently'
  const date = new Date(dateStr)
  if (!isValid(date)) return 'Recently'
  return format(date, 'MMM d, h:mm a')
}

const stats = [
  { label: 'Facilities', value: '—', icon: <BusinessIcon />, bg: 'linear-gradient(135deg, #4F46E5 0%, #3730A3 100%)' },
  { label: 'Service Requests', value: '24', icon: <BuildIcon />, bg: 'linear-gradient(135deg, #EC4899 0%, #BE185D 100%)' },
  { label: 'Inspections', value: '12', icon: <AssignmentIcon />, bg: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)' },
  { label: 'Active Rentals', value: '8', icon: <LocalShippingIcon />, bg: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)' },
  { label: 'Equipment', value: '—', icon: <PrecisionManufacturingIcon />, bg: 'linear-gradient(135deg, #10B981 0%, #047857 100%)' },
  { label: 'User Assignments', value: '—', icon: <AssignmentIcon />, bg: '#1E1B4B' }, // Dark separate color
  { label: 'Pending Invoices', value: '15', icon: <ReceiptIcon />, bg: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)' },
]



const Dashboard = () => {
  const currentUser = useAuthStore((s) => s.user)
  const isSuperAdmin = currentUser?.role === 'superadmin'

  const { data: logData, isLoading: logsLoading } = useQuery({
    queryKey: ['audit-logs-dashboard'],
    queryFn: () => fetchAuditLogs({ limit: 10 }),
    enabled: isSuperAdmin,
  })

  const logs = logData?.items || []

  return (
    <Box className="page-enter">
      <Typography variant="body2" sx={{ color: '#9CA3AF', mb: 3 }}>
        Welcome back — here's what's happening across your facilities.
      </Typography>
      <Grid container spacing={2.5}>
        {stats.map((stat) => (
          <Grid item xs={12} sm={6} md={3} key={stat.label}>
            <Card
              sx={{
                p: 2.2,
                background: stat.bg,
                color: '#fff',
                position: 'relative',
                overflow: 'hidden',
                cursor: 'pointer',
                transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: '0 12px 24px rgba(0,0,0,0.1)',
                  '& .stat-icon-bg': {
                    transform: 'scale(1.1)',
                    opacity: 0.15,
                  }
                },
              }}
            >
              <Box 
                className="stat-icon-bg"
                sx={{
                  position: 'absolute', right: -12, top: -12, opacity: 0.1,
                  transition: 'all 0.5s ease',
                  '& svg': { fontSize: '4.5rem' },
                }}
              >
                {stat.icon}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                <Box sx={{
                  width: 36, height: 36, borderRadius: '10px',
                  background: 'rgba(255,255,255,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  '& svg': { fontSize: '1.2rem', color: '#fff' },
                }}>
                  {stat.icon}
                </Box>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {stat.label}
                </Typography>
              </Box>
              <Typography variant="h3" sx={{ fontWeight: 800, color: '#fff' }}>
                {stat.value}
              </Typography>
            </Card>
          </Grid>
        ))}
      </Grid>

      {isSuperAdmin && (
        <Grid container spacing={2.5} sx={{ mt: 3 }}>
          <Grid item xs={12}>
            <Card sx={{ p: 3, borderRadius: '16px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                <Box sx={{ 
                  width: 40, height: 40, borderRadius: '12px', 
                  background: 'rgba(124, 58, 237, 0.1)', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#7C3AED'
                }}>
                  <HistoryIcon />
                </Box>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: '#111827' }}>
                    Recent System Activity
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#6B7280' }}>
                    Latest administrative actions across the platform.
                  </Typography>
                </Box>
              </Box>

              {logsLoading ? (
                <Typography variant="body2" sx={{ color: '#9CA3AF', py: 2 }}>Loading activity...</Typography>
              ) : logs.length === 0 ? (
                <Typography variant="body2" sx={{ color: '#9CA3AF', py: 2 }}>No recent activity found.</Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {logs.map((log) => (
                    <Box key={log.id} sx={{ 
                      display: 'flex', alignItems: 'center', gap: 2, 
                      p: 2, borderRadius: '12px', backgroundColor: '#F9FAFB',
                      border: '1px solid #F3F4F6',
                      transition: 'all 0.2s ease',
                      '&:hover': { backgroundColor: '#F3F4F6', transform: 'translateX(4px)' }
                    }}>
                      <Box sx={{ 
                        px: 1.5, py: 0.5, borderRadius: '6px', 
                        fontSize: '0.7rem', fontWeight: 700,
                        backgroundColor: 
                          log.action === 'CREATE' ? '#ECFDF5' : 
                          log.action === 'DELETE' ? '#FEF2F2' : 
                          log.action === 'UPDATE' ? '#EFF6FF' : '#F3F4F6',
                        color: 
                          log.action === 'CREATE' ? '#059669' : 
                          log.action === 'DELETE' ? '#DC2626' : 
                          log.action === 'UPDATE' ? '#2563EB' : '#4B5563',
                      }}>
                        {log.action}
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#374151' }}>
                          {log.changed_by_username} <span style={{ fontWeight: 400, color: '#6B7280' }}>
                           on {log.table_name}
                          </span>
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#9CA3AF' }}>
                          Record ID: #{log.record_id}
                        </Typography>
                      </Box>
                      <Typography variant="caption" sx={{ color: '#9CA3AF', fontWeight: 500 }}>
                        {safeFormatDate(log.timestamp)}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  )
}

export default Dashboard
