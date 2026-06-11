import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Avatar,
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
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
import { fetchServiceRequests, type ServiceRequest } from '@/api/serviceRequests'

const money = (value: number | string | null | undefined) => `$${Number(value || 0).toFixed(2)}`

const formatDate = (value: string | null | undefined) => {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '-'
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface ServiceSessionReport {
  user: string
  timestamp: string
  session_id?: string
  clocked_in_at?: string
  clocked_out_at?: string
  duration_hours?: number
  total_hours?: number
  diagnosis?: string
  work_done?: string
  notes?: string
}

const serviceSessions = (report: ServiceRequest | null) =>
  (report?.history || [])
    .filter(entry => entry.action === 'technician_clock_out')
    .map((entry): ServiceSessionReport => ({
      user: entry.user || report?.technician_name || 'Technician',
      timestamp: entry.timestamp,
      ...entry.changes,
    }))

const Reports = () => {
  const [params] = useSearchParams()
  const highlightedId = Number(params.get('serviceRequest') || 0)
  const [selectedReport, setSelectedReport] = useState<ServiceRequest | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['reports', 'completed-service-requests'],
    queryFn: () => fetchServiceRequests({ status: 'completed', limit: 500 }),
  })

  const reports = data?.items ?? []
  const totalHours = reports.reduce((sum, item) => sum + Number(item.time_spent_hours || 0), 0)
  const totalCost = reports.reduce((sum, item) => sum + Number(item.total_cost || 0), 0)
  const selectedSessions = serviceSessions(selectedReport)

  useEffect(() => {
    if (!highlightedId || selectedReport) return
    const report = reports.find(item => item.id === highlightedId)
    if (report) setSelectedReport(report)
  }, [highlightedId, reports, selectedReport])

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
                        onClick={() => setSelectedReport(report)}
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

      <Dialog open={!!selectedReport} onClose={() => setSelectedReport(null)} maxWidth="lg" fullWidth PaperProps={{ sx: { borderRadius: '22px', overflow: 'hidden' } }}>
        <DialogTitle sx={{ p: 0 }}>
          <Box sx={{ p: 3, color: '#fff', background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 58%, #EC4899 100%)' }}>
            <Typography sx={{ fontWeight: 950, fontSize: 26 }}>Service Completion Report</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.82)', fontWeight: 800 }}>
              {selectedReport?.request_number} · {selectedReport?.facility_name || 'Facility'}
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ bgcolor: '#F8FAFC', p: 3 }}>
          {selectedReport && (
            <Box sx={{ display: 'grid', gap: 2.5 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 1.5 }}>
                {[
                  ['Facility', selectedReport.facility_name || '-'],
                  ['Equipment', selectedReport.equipment_name || '-'],
                  ['Technician', selectedReport.technician_name || 'Unassigned'],
                  ['Completed', formatDateTime(selectedReport.completed_at)],
                ].map(([label, value]) => (
                  <Card key={label} sx={{ p: 2, borderRadius: '16px', border: '1px solid #E5E7EB' }}>
                    <Typography sx={{ color: '#64748B', fontSize: 11, fontWeight: 950, textTransform: 'uppercase' }}>{label}</Typography>
                    <Typography sx={{ color: '#1E1B4B', fontWeight: 900 }}>{value}</Typography>
                  </Card>
                ))}
              </Box>

              <Card sx={{ p: 2.5, borderRadius: '18px', border: '1px solid #E5E7EB' }}>
                <Typography sx={{ color: '#1E1B4B', fontWeight: 950, mb: 1 }}>Service Required</Typography>
                <Typography sx={{ color: '#475569', lineHeight: 1.7 }}>{selectedReport.service_required || selectedReport.problem_description}</Typography>
              </Card>

              <Card sx={{ p: 2.5, borderRadius: '18px', border: '1px solid #E5E7EB' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2 }}>
                  <Box>
                    <Typography sx={{ color: '#1E1B4B', fontWeight: 950 }}>Technician Sessions</Typography>
                    <Typography sx={{ color: '#64748B', fontWeight: 700, fontSize: 13 }}>Each clock-out stores the completed work for that session.</Typography>
                  </Box>
                  <Chip label={`${Number(selectedReport.time_spent_hours || 0).toFixed(2)} total hrs`} sx={{ bgcolor: '#ECFDF5', color: '#047857', fontWeight: 950 }} />
                </Box>

                {selectedSessions.length === 0 ? (
                  <Typography sx={{ color: '#64748B', fontWeight: 700 }}>No technician sessions were recorded.</Typography>
                ) : (
                  <Box sx={{ display: 'grid', gap: 1.5 }}>
                    {selectedSessions.map((session, index) => (
                      <Box key={`${session.session_id || index}`} sx={{ p: 2, borderRadius: '16px', border: '1px solid #E5E7EB', bgcolor: '#fff' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                          <Typography sx={{ fontWeight: 950, color: '#1E1B4B' }}>Session {index + 1}</Typography>
                          <Chip size="small" label={`${Number(session.duration_hours || 0).toFixed(2)} hrs`} sx={{ bgcolor: '#F5F3FF', color: '#7C3AED', fontWeight: 950 }} />
                        </Box>
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5, mb: 1.5 }}>
                          <Typography sx={{ color: '#64748B', fontSize: 13 }}><strong>Clock In:</strong> {formatDateTime(session.clocked_in_at)}</Typography>
                          <Typography sx={{ color: '#64748B', fontSize: 13 }}><strong>Clock Out:</strong> {formatDateTime(session.clocked_out_at || session.timestamp)}</Typography>
                        </Box>
                        <Divider sx={{ my: 1.5 }} />
                        <Typography sx={{ color: '#64748B', fontSize: 12, fontWeight: 950, textTransform: 'uppercase' }}>Diagnosis</Typography>
                        <Typography sx={{ color: '#1F2937', mb: 1.2, whiteSpace: 'pre-wrap' }}>{session.diagnosis || '-'}</Typography>
                        <Typography sx={{ color: '#64748B', fontSize: 12, fontWeight: 950, textTransform: 'uppercase' }}>Work Done</Typography>
                        <Typography sx={{ color: '#1F2937', mb: 1.2, whiteSpace: 'pre-wrap' }}>{session.work_done || '-'}</Typography>
                        {session.notes && (
                          <>
                            <Typography sx={{ color: '#64748B', fontSize: 12, fontWeight: 950, textTransform: 'uppercase' }}>Notes</Typography>
                            <Typography sx={{ color: '#1F2937', whiteSpace: 'pre-wrap' }}>{session.notes}</Typography>
                          </>
                        )}
                      </Box>
                    ))}
                  </Box>
                )}
              </Card>

              <Card sx={{ p: 2.5, borderRadius: '18px', border: '1px solid #E5E7EB' }}>
                <Typography sx={{ color: '#1E1B4B', fontWeight: 950, mb: 1 }}>Completion Summary</Typography>
                <Typography sx={{ color: '#475569', whiteSpace: 'pre-wrap', mb: 2 }}>{selectedReport.resolution_description || 'No final resolution summary was added.'}</Typography>
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                  <Chip label={`Total Hours: ${Number(selectedReport.time_spent_hours || 0).toFixed(2)}`} sx={{ bgcolor: '#ECFDF5', color: '#047857', fontWeight: 950 }} />
                  <Chip label={`Total Cost: ${money(selectedReport.total_cost)}`} sx={{ bgcolor: '#F5F3FF', color: '#7C3AED', fontWeight: 950 }} />
                  <Chip label={`Billing: ${(selectedReport.billing_status || 'pending').replace(/_/g, ' ')}`} sx={{ bgcolor: '#EFF6FF', color: '#2563EB', fontWeight: 950 }} />
                </Box>
              </Card>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setSelectedReport(null)} sx={{ fontWeight: 900 }}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default Reports
