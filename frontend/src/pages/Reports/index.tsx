import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Avatar,
  Box,
  Button,
  Card,
  Chip,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import AssessmentIcon from '@mui/icons-material/Assessment'
import BuildIcon from '@mui/icons-material/Build'
import BusinessIcon from '@mui/icons-material/Business'
import EngineeringIcon from '@mui/icons-material/Engineering'
import VisibilityIcon from '@mui/icons-material/Visibility'
import { fetchServiceRequests } from '@/api/serviceRequests'

const money = (value: number | string | null | undefined) => `$${Number(value || 0).toFixed(2)}`

const formatDate = (value: string | null | undefined) => {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const Reports = () => {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const highlightedId = Number(params.get('serviceRequest') || 0)

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'completed-service-requests'],
    queryFn: () => fetchServiceRequests({ status: 'completed', limit: 500 }),
  })

  const reports = data?.items ?? []
  const totalHours = reports.reduce((sum, item) => sum + Number(item.time_spent_hours || 0), 0)
  const totalCost = reports.reduce((sum, item) => sum + Number(item.total_cost || 0), 0)

  return (
    <Box className="page-enter" sx={{ maxWidth: 1440, mx: 'auto' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.6fr 1fr 1fr' }, gap: 2.5, mb: 3 }}>
        <Card sx={{ p: 3, borderRadius: '24px', color: '#fff', background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 52%, #EC4899 100%)', overflow: 'hidden', position: 'relative' }}>
          <AssessmentIcon sx={{ position: 'absolute', right: -20, top: -22, fontSize: 170, opacity: 0.12 }} />
          <Typography sx={{ fontWeight: 950, fontSize: 28, position: 'relative' }}>Reports</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.78)', fontWeight: 700, maxWidth: 620, position: 'relative' }}>
            Completed service work reports generated from technician notes, clock sessions, request details, and billing data.
          </Typography>
        </Card>
        <Card sx={{ p: 2.5, borderRadius: '22px', border: '1px solid #EEF2F7' }}>
          <Avatar sx={{ bgcolor: '#EDE9FE', color: '#7C3AED', borderRadius: '16px', mb: 2 }}><BuildIcon /></Avatar>
          <Typography sx={{ color: '#64748B', fontWeight: 900, fontSize: 12, textTransform: 'uppercase' }}>Completed Services</Typography>
          <Typography sx={{ color: '#1E1B4B', fontWeight: 950, fontSize: 32 }}>{isLoading ? '-' : reports.length}</Typography>
        </Card>
        <Card sx={{ p: 2.5, borderRadius: '22px', border: '1px solid #EEF2F7' }}>
          <Avatar sx={{ bgcolor: '#D1FAE5', color: '#047857', borderRadius: '16px', mb: 2 }}><EngineeringIcon /></Avatar>
          <Typography sx={{ color: '#64748B', fontWeight: 900, fontSize: 12, textTransform: 'uppercase' }}>Logged Hours / Cost</Typography>
          <Typography sx={{ color: '#1E1B4B', fontWeight: 950, fontSize: 24 }}>{totalHours.toFixed(2)} hrs</Typography>
          <Typography sx={{ color: '#047857', fontWeight: 900 }}>{money(totalCost)}</Typography>
        </Card>
      </Box>

      <Card sx={{ borderRadius: '24px', border: '1px solid #EEF2F7', boxShadow: '0 18px 45px rgba(49,46,129,0.08)', overflow: 'hidden' }}>
        <Box sx={{ p: 2.5, borderBottom: '1px solid #EEF2F7', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Box>
            <Typography sx={{ fontWeight: 950, color: '#1E1B4B', fontSize: 20 }}>Completed Service Reports</Typography>
            <Typography sx={{ color: '#64748B', fontWeight: 700, fontSize: 13 }}>A report appears here once a service request is marked complete.</Typography>
          </Box>
          <Chip label="Live Data" sx={{ bgcolor: '#F5F3FF', color: '#7C3AED', fontWeight: 900 }} />
        </Box>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Report #</TableCell>
                <TableCell>Facility</TableCell>
                <TableCell>Equipment</TableCell>
                <TableCell>Technician</TableCell>
                <TableCell>Hours</TableCell>
                <TableCell>Completed</TableCell>
                <TableCell>Total Cost</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={index}>
                    {Array.from({ length: 8 }).map((__, cell) => <TableCell key={cell}><Skeleton /></TableCell>)}
                  </TableRow>
                ))
              ) : reports.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 7 }}>
                    <AssessmentIcon sx={{ fontSize: 58, color: '#DDD6FE', mb: 1 }} />
                    <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>No completed service reports yet</Typography>
                    <Typography sx={{ color: '#64748B' }}>Complete a service request to generate its report.</Typography>
                  </TableCell>
                </TableRow>
              ) : reports.map(report => {
                const selected = highlightedId === report.id
                return (
                  <TableRow
                    key={report.id}
                    sx={{
                      bgcolor: selected ? '#F5F3FF' : 'inherit',
                      boxShadow: selected ? 'inset 4px 0 0 #7C3AED' : 'none',
                      '&:hover': { bgcolor: selected ? '#F5F3FF' : '#F8FAFC' },
                    }}
                  >
                    <TableCell>
                      <Typography sx={{ fontFamily: 'monospace', fontWeight: 950, color: '#6757D8' }}>{report.request_number}</Typography>
                      {selected && <Chip size="small" label="Selected" sx={{ mt: 0.7, bgcolor: '#EDE9FE', color: '#7C3AED', fontWeight: 900 }} />}
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <BusinessIcon sx={{ color: '#94A3B8', fontSize: 18 }} />
                        <Typography sx={{ fontWeight: 700 }}>{report.facility_name || '-'}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>{report.equipment_name || '-'}</TableCell>
                    <TableCell>{report.technician_name || 'Unassigned'}</TableCell>
                    <TableCell>
                      <Chip label={`${Number(report.time_spent_hours || 0).toFixed(2)} hrs`} sx={{ bgcolor: '#ECFDF5', color: '#047857', fontWeight: 900 }} />
                    </TableCell>
                    <TableCell>{formatDate(report.completed_at)}</TableCell>
                    <TableCell>
                      <Typography sx={{ color: '#047857', fontWeight: 950 }}>{money(report.total_cost)}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<VisibilityIcon />}
                        onClick={() => navigate(`/service-requests/${report.id}`)}
                        sx={{ borderRadius: '12px', fontWeight: 900, borderColor: '#7C3AED', color: '#7C3AED' }}
                      >
                        View Report
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </Box>
  )
}

export default Reports
