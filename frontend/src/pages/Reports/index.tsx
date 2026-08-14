import { type MouseEvent, type ReactNode, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Avatar, Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, Menu, MenuItem, Pagination, Skeleton, Tab, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material'
import AssessmentIcon from '@mui/icons-material/Assessment'
import BuildIcon from '@mui/icons-material/Build'
import ChecklistIcon from '@mui/icons-material/Checklist'
import DownloadIcon from '@mui/icons-material/Download'
import HistoryIcon from '@mui/icons-material/History'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import PrintIcon from '@mui/icons-material/Print'
import SearchIcon from '@mui/icons-material/Search'
import VisibilityIcon from '@mui/icons-material/Visibility'

import ClippedTooltipText from '@/components/ClippedTooltipText'
import ContextTableRow from '@/components/ContextTableRow'
import { buildInspectionReportDocumentHtml, buildInspectionSingleReportHtml, buildInspectionBatchReportHtml, printInspectionRecord, resolveReportInvoice } from '@/utils/inspectionReportHtml'
import { buildServiceReportDocument, printServiceReportSheet } from '@/utils/serviceReportHtml'
import { AnimatedNumber } from '@/components/motion'
import { fetchFacility } from '@/api/facilities'
import { fetchInspectionBatch } from '@/api/inspections'
import {
  fetchInspectionReports,
  fetchReportsSummary,
  fetchServiceHistoryReports,
  fetchServiceReports,
  type InspectionReport,
  type ReportListParams,
  type ServiceHistoryReport,
  type ServiceReport,
} from '@/api/reports'

const TABS = ['service', 'inspection', 'history'] as const
type ReportTab = typeof TABS[number]

const LIMIT = 25
const GRADIENT = 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 52%, #EC4899 100%)'

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

const statusChip = (value?: string | null) => {
  const key = String(value || '').toLowerCase()
  const map: Record<string, { bg: string; color: string }> = {
    completed: { bg: '#D1FAE5', color: '#047857' },
    pass: { bg: '#D1FAE5', color: '#047857' },
    fail: { bg: '#FEE2E2', color: '#DC2626' },
    pending: { bg: '#EEF2FF', color: '#4338CA' },
    paid: { bg: '#D1FAE5', color: '#047857' },
    partially_paid: { bg: '#FEF3C7', color: '#B45309' },
    overdue: { bg: '#FEE2E2', color: '#DC2626' },
  }
  return map[key] || { bg: '#F3F4F6', color: '#374151' }
}

const csvEscape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`

const downloadCsv = (filename: string, headers: string[], rows: unknown[][]) => {
  const csv = [headers.map(csvEscape).join(','), ...rows.map(row => row.map(csvEscape).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const printServiceReport = (report: ServiceReport) => {
  void printServiceReportSheet(report)
}

const printInspectionReport = (report: InspectionReport) => {
  void printInspectionRecord(report)
}

const historyActionLabel = (action?: string) =>
  String(action || 'updated').replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())

const formatChangeValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

const Reports = () => {
  const [params, setParams] = useSearchParams()
  const highlightedServiceRequestId = Number(params.get('serviceRequest') || 0)
  const requestedTab = params.get('tab') as ReportTab | null
  const tab: ReportTab = requestedTab && TABS.includes(requestedTab) ? requestedTab : 'service'
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const dateFrom = params.get('date_from') || ''
  const dateTo = params.get('date_to') || ''
  const invalidDateRange = Boolean(dateFrom && dateTo && dateFrom > dateTo)
  const [result, setResult] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [selectedService, setSelectedService] = useState<ServiceReport | null>(null)
  const [selectedInspection, setSelectedInspection] = useState<InspectionReport | null>(null)
  const [selectedHistory, setSelectedHistory] = useState<ServiceHistoryReport | null>(null)
  const [actionAnchor, setActionAnchor] = useState<HTMLElement | null>(null)
  const [actionItem, setActionItem] = useState<ServiceReport | InspectionReport | ServiceHistoryReport | null>(null)

  const selectTab = (nextTab: ReportTab) => {
    const next = new URLSearchParams(params)
    if (nextTab === 'service') next.delete('tab')
    else next.set('tab', nextTab)
    setParams(next, { replace: true })
  }

  const changeDateFilter = (key: 'date_from' | 'date_to', value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const clearDateFilters = () => {
    const next = new URLSearchParams(params)
    next.delete('date_from')
    next.delete('date_to')
    setParams(next, { replace: true })
  }

  useEffect(() => {
    setPage(1)
  }, [tab, search, dateFrom, dateTo, result, actionFilter])

  const commonParams: ReportListParams = useMemo(() => ({
    search: search.trim() || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    skip: (page - 1) * LIMIT,
    limit: LIMIT,
  }), [dateFrom, dateTo, page, search])

  const summaryQ = useQuery({
    queryKey: ['reports-summary', dateFrom, dateTo],
    queryFn: () => fetchReportsSummary({ date_from: dateFrom || undefined, date_to: dateTo || undefined }),
    enabled: !invalidDateRange,
  })
  const serviceQ = useQuery({
    queryKey: ['reports', 'service', commonParams],
    queryFn: () => fetchServiceReports(commonParams),
    enabled: tab === 'service' && !invalidDateRange,
  })
  const inspectionQ = useQuery({
    queryKey: ['reports', 'inspection', commonParams, result],
    queryFn: () => fetchInspectionReports({ ...commonParams, result: result || undefined }),
    enabled: tab === 'inspection' && !invalidDateRange,
  })
  const historyQ = useQuery({
    queryKey: ['reports', 'history', commonParams, actionFilter],
    queryFn: () => fetchServiceHistoryReports({ ...commonParams, action: actionFilter || undefined }),
    enabled: tab === 'history' && !invalidDateRange,
  })

  const activeData = tab === 'service' ? serviceQ.data : tab === 'inspection' ? inspectionQ.data : historyQ.data
  const isLoading = tab === 'service' ? serviceQ.isLoading : tab === 'inspection' ? inspectionQ.isLoading : historyQ.isLoading
  const totalPages = Math.max(1, Math.ceil((activeData?.total || 0) / LIMIT))
  const kpis = [
    { label: 'Service Reports', value: summaryQ.data?.service_reports ?? '-', icon: <BuildIcon />, color: '#7C3AED', tab: 'service' as ReportTab },
    { label: 'Inspection Reports', value: summaryQ.data?.inspection_reports ?? '-', icon: <ChecklistIcon />, color: '#3B82F6', tab: 'inspection' as ReportTab },
    { label: 'Service History', value: summaryQ.data?.service_history ?? '-', icon: <HistoryIcon />, color: '#10B981', tab: 'history' as ReportTab },
  ]

  useEffect(() => {
    if (!highlightedServiceRequestId || tab !== 'service' || selectedService) return
    const report = serviceQ.data?.items.find(item => item.id === highlightedServiceRequestId)
    if (report) setSelectedService(report)
  }, [highlightedServiceRequestId, selectedService, serviceQ.data?.items, tab])

  const openActions = (event: MouseEvent<HTMLElement>, item: ServiceReport | InspectionReport | ServiceHistoryReport) => {
    setActionAnchor(event.currentTarget)
    setActionItem(item)
  }

  const closeActions = () => {
    setActionAnchor(null)
    setActionItem(null)
  }

  const viewActionItem = () => {
    if (!actionItem) return
    if ('request_number' in actionItem && 'sessions' in actionItem) setSelectedService(actionItem)
    else if ('inspection_number' in actionItem) setSelectedInspection(actionItem)
    else setSelectedHistory(actionItem)
    closeActions()
  }

  const printActionItem = () => {
    if (!actionItem) return
    if ('request_number' in actionItem && 'sessions' in actionItem) printServiceReport(actionItem)
    else if ('inspection_number' in actionItem) printInspectionReport(actionItem)
    closeActions()
  }

  const exportCurrentCsv = () => {
    if (tab === 'service') {
      downloadCsv('service-reports.csv', ['Service #', 'Facility', 'Equipment', 'Technician', 'Hours', 'Cost', 'Completed', 'Invoice'], (serviceQ.data?.items || []).map(item => [
        item.request_number, item.facility_name, item.equipment_name, item.technician_name, item.time_spent_hours, item.total_cost, item.completed_at, item.invoice?.invoice_number,
      ]))
    } else if (tab === 'inspection') {
      downloadCsv('inspection-reports.csv', ['Inspection #', 'Facility', 'Asset', 'Technician', 'Result', 'Form', 'Completed', 'Invoice'], (inspectionQ.data?.items || []).map(item => [
        item.inspection_number, item.facility_name, item.asset_name, item.technician_name, item.result, item.form_template_name, item.completed_at, item.invoice?.invoice_number,
      ]))
    } else {
      downloadCsv('service-request-history.csv', ['Date', 'Service #', 'Facility', 'User', 'Action', 'Summary'], (historyQ.data?.items || []).map(item => [
        item.timestamp, item.request_number, item.facility_name, item.user, historyActionLabel(item.action), item.summary,
      ]))
    }
  }

  return (
    <Box className="page-enter" sx={{ maxWidth: 1500, mx: 'auto' }}>
      <Card sx={{ p: 3, mb: 3, borderRadius: '26px', color: '#fff', background: GRADIENT, overflow: 'hidden', position: 'relative', boxShadow: '0 24px 60px rgba(79,70,229,0.16)' }}>
        <AssessmentIcon sx={{ position: 'absolute', right: -24, top: -28, fontSize: 180, opacity: 0.12 }} />
        <Typography sx={{ fontWeight: 950, fontSize: 30, position: 'relative' }}>Reports Module</Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.8)', fontWeight: 700, maxWidth: 780, position: 'relative' }}>
          Centralized, read-only service reports, inspection reports, and service request history with facility-aware access.
        </Typography>
      </Card>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2, mb: 3 }}>
        {kpis.map((item) => (
          <Card
            key={item.label}
            role="button"
            tabIndex={0}
            aria-pressed={tab === item.tab}
            onClick={() => selectTab(item.tab)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                selectTab(item.tab)
              }
            }}
            sx={{
              p: 2.5,
              borderRadius: '22px',
              border: tab === item.tab ? `2px solid ${item.color}` : '1px solid #EEF2F7',
              boxShadow: tab === item.tab ? `0 18px 42px ${item.color}24` : 'none',
              cursor: 'pointer',
              transform: tab === item.tab ? 'translateY(-2px)' : 'none',
              transition: 'transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease',
              '&:hover': { transform: 'translateY(-3px)', boxShadow: `0 18px 42px ${item.color}20` },
              '&:focus-visible': { outline: `3px solid ${item.color}35`, outlineOffset: 2 },
            }}
          >
            <Avatar sx={{ bgcolor: `${item.color}18`, color: item.color, borderRadius: '16px', mb: 1.5 }}>{item.icon}</Avatar>
            <Typography sx={{ color: '#64748B', fontWeight: 900, fontSize: 12, textTransform: 'uppercase' }}>{item.label}</Typography>
            <Typography sx={{ color: '#1E1B4B', fontWeight: 950, fontSize: 30 }}>{typeof item.value === 'number' ? <AnimatedNumber value={item.value} /> : item.value}</Typography>
          </Card>
        ))}
      </Box>

      <Card sx={{ borderRadius: '24px', border: '1px solid #EEF2F7', boxShadow: '0 18px 45px rgba(49,46,129,0.08)', overflow: 'hidden' }}>
        <Tabs value={TABS.indexOf(tab)} onChange={(_, value) => selectTab(TABS[value] || 'service')} variant="scrollable" sx={{ px: 2, borderBottom: '1px solid #EEF2F7' }}>
          <Tab icon={<BuildIcon />} iconPosition="start" label="Service Reports" />
          <Tab icon={<ChecklistIcon />} iconPosition="start" label="Inspection Reports" />
          <Tab icon={<HistoryIcon />} iconPosition="start" label="Service Request History" />
        </Tabs>

        <Box sx={{
          p: 2.5,
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: tab === 'service'
              ? `minmax(240px, 1fr) 180px 180px auto${dateFrom || dateTo ? ' auto' : ''}`
              : `minmax(240px, 1fr) 180px 180px 180px auto${dateFrom || dateTo ? ' auto' : ''}`,
          },
          gap: 1.5,
          alignItems: 'center',
        }}>
          <TextField
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search reports by number, facility, asset, technician..."
            InputProps={{ startAdornment: <SearchIcon sx={{ color: '#94A3B8', mr: 1 }} /> }}
          />
          <TextField
            label="From"
            type="date"
            value={dateFrom}
            onChange={(event) => changeDateFilter('date_from', event.target.value)}
            InputLabelProps={{ shrink: true }}
            inputProps={{ max: dateTo || undefined }}
            error={invalidDateRange}
          />
          <TextField
            label="To"
            type="date"
            value={dateTo}
            onChange={(event) => changeDateFilter('date_to', event.target.value)}
            InputLabelProps={{ shrink: true }}
            inputProps={{ min: dateFrom || undefined }}
            error={invalidDateRange}
            helperText={invalidDateRange ? 'Invalid range' : undefined}
          />
          {tab === 'inspection' && (
            <TextField select label="Result" value={result} onChange={(event) => setResult(event.target.value)}>
              <MenuItem value="">All Results</MenuItem>
              <MenuItem value="pass">Pass</MenuItem>
              <MenuItem value="fail">Fail</MenuItem>
              <MenuItem value="pending">Pending</MenuItem>
            </TextField>
          )}
          {tab === 'history' && (
            <TextField select label="Action" value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
              <MenuItem value="">All Actions</MenuItem>
              <MenuItem value="technician_work_session">Work Session</MenuItem>
              <MenuItem value="status_changed">Status Changed</MenuItem>
              <MenuItem value="updated">Updated</MenuItem>
              <MenuItem value="service_invoice_generated">Invoice Generated</MenuItem>
            </TextField>
          )}
          <Button startIcon={<DownloadIcon />} onClick={exportCurrentCsv} variant="outlined" sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none' }}>
            Export CSV
          </Button>
          {(dateFrom || dateTo) && (
            <Button onClick={clearDateFilters} variant="text" sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none' }}>
              Clear Dates
            </Button>
          )}
        </Box>

        {tab === 'service' && (
          <ReportTable loading={isLoading} emptyText="No service reports found." colSpan={9}>
            {(serviceQ.data?.items || []).map(item => (
              <ContextTableRow
                key={item.id}
                recordKey={`report-service-${item.id}`}
                recordLabel={item.request_number}
                hover
              >
                <TableCell><ClippedTooltipText value={item.request_number} monospace color="#6757D8" fontWeight={950} onClick={() => setSelectedService(item)} /></TableCell>
                <TableCell><ClippedTooltipText value={item.facility_name || '-'} fontWeight={800} field /></TableCell>
                <TableCell><ClippedTooltipText value={item.equipment_name || '-'} field /></TableCell>
                <TableCell><ClippedTooltipText value={item.technician_name || 'Unassigned'} /></TableCell>
                <TableCell><Chip label={`${item.time_spent_hours.toFixed(2)} hrs`} sx={{ bgcolor: '#ECFDF5', color: '#047857', fontWeight: 900 }} /></TableCell>
                <TableCell><ClippedTooltipText value={item.diagnosis || item.work_done || '-'} field /></TableCell>
                <TableCell>{formatDate(item.completed_at)}</TableCell>
                <TableCell>{item.invoice ? <Chip label={item.invoice.invoice_number} sx={{ bgcolor: '#F5F3FF', color: '#7C3AED', fontWeight: 900 }} /> : '-'}</TableCell>
                <TableCell align="right"><ActionButton item={item} onOpen={openActions} /></TableCell>
              </ContextTableRow>
            ))}
          </ReportTable>
        )}

        {tab === 'inspection' && (
          <ReportTable loading={isLoading} emptyText="No inspection reports found." colSpan={9}>
            {(inspectionQ.data?.items || []).map(item => {
              const chip = statusChip(item.result)
              return (
                <ContextTableRow
                  key={item.id}
                  recordKey={`report-inspection-${item.id}`}
                  recordLabel={item.inspection_number}
                  hover
                >
                  <TableCell><ClippedTooltipText value={item.inspection_number} monospace color="#6757D8" fontWeight={950} onClick={() => setSelectedInspection(item)} /></TableCell>
                  <TableCell><ClippedTooltipText value={item.facility_name || '-'} fontWeight={800} field /></TableCell>
                  <TableCell><ClippedTooltipText value={item.asset_name || '-'} field /></TableCell>
                  <TableCell><ClippedTooltipText value={item.technician_name || 'Unassigned'} /></TableCell>
                  <TableCell><Chip label={item.result} sx={{ bgcolor: chip.bg, color: chip.color, fontWeight: 900, textTransform: 'uppercase' }} /></TableCell>
                  <TableCell><ClippedTooltipText value={item.form_template_name || '-'} field /></TableCell>
                  <TableCell>{formatDate(item.completed_at)}</TableCell>
                  <TableCell>{item.invoice ? <Chip label={item.invoice.invoice_number} sx={{ bgcolor: '#F5F3FF', color: '#7C3AED', fontWeight: 900 }} /> : '-'}</TableCell>
                  <TableCell align="right"><ActionButton item={item} onOpen={openActions} /></TableCell>
                </ContextTableRow>
              )
            })}
          </ReportTable>
        )}

        {tab === 'history' && (
          <ReportTable loading={isLoading} emptyText="No service request history found." colSpan={8}>
            {(historyQ.data?.items || []).map(item => (
              <ContextTableRow
                key={item.id}
                recordKey={`report-history-${item.id}`}
                recordLabel={item.request_number}
                hover
              >
                <TableCell>{formatDateTime(item.timestamp)}</TableCell>
                <TableCell><ClippedTooltipText value={item.request_number} monospace color="#6757D8" fontWeight={950} onClick={() => setSelectedHistory(item)} /></TableCell>
                <TableCell><ClippedTooltipText value={item.facility_name || '-'} fontWeight={800} field /></TableCell>
                <TableCell><ClippedTooltipText value={item.equipment_name || '-'} field /></TableCell>
                <TableCell>{item.user || '-'}</TableCell>
                <TableCell><Chip label={historyActionLabel(item.action)} sx={{ bgcolor: '#EEF2FF', color: '#4338CA', fontWeight: 900 }} /></TableCell>
                <TableCell><ClippedTooltipText value={item.summary || formatChangeValue(item.changes)} field /></TableCell>
                <TableCell align="right"><ActionButton item={item} onOpen={openActions} /></TableCell>
              </ContextTableRow>
            ))}
          </ReportTable>
        )}

        <Box sx={{ px: 2.5, py: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #EEF2F7' }}>
          <Typography sx={{ color: '#64748B', fontWeight: 700 }}>
            {activeData?.total ? `${(page - 1) * LIMIT + 1}-${Math.min(page * LIMIT, activeData.total)} of ${activeData.total}` : '0 of 0'}
          </Typography>
          <Pagination count={totalPages} page={page} onChange={(_, value) => setPage(value)} color="primary" shape="rounded" />
        </Box>
      </Card>

      <Menu anchorEl={actionAnchor} open={Boolean(actionAnchor)} onClose={closeActions} PaperProps={{ sx: { borderRadius: '16px', minWidth: 180, border: '1px solid #EEF2F7', boxShadow: '0 18px 45px rgba(30,27,75,0.16)' } }}>
        <MenuItem onClick={viewActionItem} sx={{ fontWeight: 900 }}><VisibilityIcon fontSize="small" sx={{ mr: 1, color: '#7C3AED' }} />View</MenuItem>
        {actionItem && !('changes' in actionItem) && (
          <MenuItem onClick={printActionItem} sx={{ fontWeight: 900 }}><PrintIcon fontSize="small" sx={{ mr: 1, color: '#059669' }} />Print</MenuItem>
        )}
      </Menu>

      <ServiceReportDialog report={selectedService} onClose={() => setSelectedService(null)} />
      <InspectionReportDialog report={selectedInspection} onClose={() => setSelectedInspection(null)} />
      <HistoryDialog item={selectedHistory} onClose={() => setSelectedHistory(null)} />
    </Box>
  )
}

const ReportTable = ({ children, loading, emptyText, colSpan }: { children: ReactNode; loading: boolean; emptyText: string; colSpan: number }) => (
  <TableContainer className="list-scroll-panel">
    <Table stickyHeader>
      <TableHead>
        <TableRow>
          {colSpan === 9 ? (
            <>
              <TableCell>{emptyText.includes('inspection') ? 'Inspection #' : 'Service #'}</TableCell>
              <TableCell>Facility</TableCell>
              <TableCell>{emptyText.includes('inspection') ? 'Asset' : 'Equipment'}</TableCell>
              <TableCell>Technician</TableCell>
              <TableCell>{emptyText.includes('inspection') ? 'Result' : 'Hours'}</TableCell>
              <TableCell>{emptyText.includes('inspection') ? 'Form' : 'Diagnosis / Work'}</TableCell>
              <TableCell>Completed</TableCell>
              <TableCell>Invoice</TableCell>
              <TableCell align="right">Actions</TableCell>
            </>
          ) : (
            <>
              <TableCell>Date</TableCell>
              <TableCell>Service #</TableCell>
              <TableCell>Facility</TableCell>
              <TableCell>Equipment</TableCell>
              <TableCell>User</TableCell>
              <TableCell>Action</TableCell>
              <TableCell>Details</TableCell>
              <TableCell align="right">Actions</TableCell>
            </>
          )}
        </TableRow>
      </TableHead>
      <TableBody>
        {loading ? Array.from({ length: 5 }).map((_, index) => (
          <TableRow key={index}>{Array.from({ length: colSpan }).map((__, cell) => <TableCell key={cell}><Skeleton /></TableCell>)}</TableRow>
        )) : children && Array.isArray(children) && children.length === 0 ? (
          <TableRow><TableCell colSpan={colSpan} align="center" sx={{ py: 7, color: '#64748B', fontWeight: 800 }}>{emptyText}</TableCell></TableRow>
        ) : children}
      </TableBody>
    </Table>
  </TableContainer>
)

const ActionButton = ({ item, onOpen }: { item: ServiceReport | InspectionReport | ServiceHistoryReport; onOpen: (event: MouseEvent<HTMLElement>, item: ServiceReport | InspectionReport | ServiceHistoryReport) => void }) => (
  <IconButton
    size="small"
    onClick={(event) => onOpen(event, item)}
    sx={{ borderRadius: '12px', bgcolor: '#F3F4F6', color: '#7C3AED', '&:hover': { bgcolor: '#EDE9FE' } }}
  >
    <MoreVertIcon fontSize="small" />
  </IconButton>
)

const ServiceReportDialog = ({ report, onClose }: { report: ServiceReport | null; onClose: () => void }) => {
  const facilityQ = useQuery({
    queryKey: ['facility', report?.facility_id],
    queryFn: () => fetchFacility(report!.facility_id),
    enabled: Boolean(report?.facility_id),
  })
  const reportHtml = useMemo(
    () => (report ? buildServiceReportDocument(report, facilityQ.data ?? null) : ''),
    [report, facilityQ.data],
  )
  return (
    <Dialog open={Boolean(report)} onClose={onClose} maxWidth="lg" fullWidth PaperProps={{ sx: { borderRadius: '22px', overflow: 'hidden' } }}>
      <DialogTitle sx={{ p: 0 }}>
        <Box sx={{ p: 3, color: '#fff', background: GRADIENT }}>
          <Typography sx={{ fontWeight: 950, fontSize: 26 }}>Service Report</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.82)', fontWeight: 800 }}>{report?.request_number} - {report?.facility_name || 'Facility'}</Typography>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ bgcolor: '#E5E7EB', p: 0 }}>
        {report && (
          <Box
            component="iframe"
            title={`${report.request_number} service report preview`}
            srcDoc={reportHtml}
            sx={{ display: 'block', width: '100%', height: { xs: '70vh', md: '76vh' }, border: 0, bgcolor: '#E5E7EB' }}
          />
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} sx={{ fontWeight: 900 }}>Close</Button>
        <Button variant="contained" startIcon={<PrintIcon />} onClick={() => report && printServiceReport(report)} sx={{ borderRadius: '12px', fontWeight: 900, background: GRADIENT }}>Print</Button>
      </DialogActions>
    </Dialog>
  )
}

const InspectionReportDialog = ({ report, onClose }: { report: InspectionReport | null; onClose: () => void }) => {
  const facilityQ = useQuery({
    queryKey: ['facility', report?.facility_id],
    queryFn: () => fetchFacility(report!.facility_id),
    enabled: Boolean(report?.facility_id),
  })
  const invoiceQ = useQuery({
    queryKey: ['report-invoice', report?.id, report?.batch_id],
    queryFn: () => resolveReportInvoice(report!),
    enabled: Boolean(report) && !report?.batch_id,
  })
  // A batched inspection's report is the complete batch document; a standalone one is single.
  const batchQ = useQuery({
    queryKey: ['inspection-batch', report?.batch_id],
    queryFn: () => fetchInspectionBatch(report!.batch_id!),
    enabled: Boolean(report?.batch_id),
  })
  const reportHtml = useMemo(() => {
    if (!report) return ''
    if (report.batch_id) {
      if (!batchQ.data) return '' // wait for the batch so we never flash the single report
      return buildInspectionReportDocumentHtml(
        buildInspectionBatchReportHtml(batchQ.data, facilityQ.data ?? null),
        `${report.batch_number || report.inspection_number} Inspection Report`,
      )
    }
    return buildInspectionReportDocumentHtml(
      buildInspectionSingleReportHtml(report, facilityQ.data ?? null, invoiceQ.data ?? report.invoice),
      `${report.inspection_number} Inspection Report`,
    )
  }, [report, facilityQ.data, invoiceQ.data, batchQ.data])
  return (
    <Dialog open={Boolean(report)} onClose={onClose} maxWidth="lg" fullWidth PaperProps={{ sx: { borderRadius: '22px', overflow: 'hidden' } }}>
      <DialogTitle sx={{ p: 0 }}>
        <Box sx={{ p: 3, color: '#fff', background: GRADIENT }}>
          <Typography sx={{ fontWeight: 950, fontSize: 26 }}>Inspection Report</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.82)', fontWeight: 800 }}>{report?.inspection_number} - {report?.facility_name || 'Facility'}</Typography>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ bgcolor: '#E5E7EB', p: 0 }}>
        {report && (
          <Box
            component="iframe"
            title={`${report.inspection_number} inspection report preview`}
            srcDoc={reportHtml}
            sx={{
              display: 'block',
              width: '100%',
              height: { xs: '70vh', md: '76vh' },
              border: 0,
              bgcolor: '#E5E7EB',
            }}
          />
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} sx={{ fontWeight: 900 }}>Close</Button>
        <Button variant="contained" startIcon={<PrintIcon />} onClick={() => report && printInspectionReport(report)} sx={{ borderRadius: '12px', fontWeight: 900, background: GRADIENT }}>Print</Button>
      </DialogActions>
    </Dialog>
  )
}

const HistoryDialog = ({ item, onClose }: { item: ServiceHistoryReport | null; onClose: () => void }) => (
  <Dialog open={Boolean(item)} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '22px' } }}>
    <DialogTitle sx={{ fontWeight: 950, color: '#1E1B4B' }}>Service Request History</DialogTitle>
    <DialogContent dividers>
      {item && (
        <Box sx={{ display: 'grid', gap: 2 }}>
          <DetailGrid items={[
            ['Service #', item.request_number],
            ['Facility', item.facility_name || '-'],
            ['User', item.user || '-'],
            ['Date', formatDateTime(item.timestamp)],
          ]} />
          <DetailCard title={historyActionLabel(item.action)} value={Object.entries(item.changes || {}).map(([key, value]) => `${historyActionLabel(key)}: ${formatChangeValue(value)}`).join('\n') || item.summary || '-'} />
        </Box>
      )}
    </DialogContent>
    <DialogActions sx={{ px: 3, py: 2 }}><Button onClick={onClose} variant="contained" sx={{ borderRadius: '12px', fontWeight: 900 }}>Close</Button></DialogActions>
  </Dialog>
)

const DetailGrid = ({ items }: { items: [string, string][] }) => (
  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 1.5 }}>
    {items.map(([label, value]) => (
      <Card key={label} sx={{ p: 2, borderRadius: '16px', border: '1px solid #E5E7EB' }}>
        <Typography sx={{ color: '#64748B', fontSize: 11, fontWeight: 950, textTransform: 'uppercase' }}>{label}</Typography>
        <ClippedTooltipText value={value} fontWeight={900} />
      </Card>
    ))}
  </Box>
)

const DetailCard = ({ title, value, footer }: { title: string; value: string; footer?: string[] }) => (
  <Card sx={{ p: 2.5, borderRadius: '18px', border: '1px solid #E5E7EB' }}>
    <Typography sx={{ color: '#1E1B4B', fontWeight: 950, mb: 1 }}>{title}</Typography>
    <Typography sx={{ color: '#475569', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{value}</Typography>
    {footer && (
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
        {footer.map(item => <Chip key={item} label={item} sx={{ bgcolor: '#F5F3FF', color: '#7C3AED', fontWeight: 950 }} />)}
      </Box>
    )}
  </Card>
)

export default Reports
