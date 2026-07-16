import { type MouseEvent, type ReactNode, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Avatar, Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, IconButton, Menu, MenuItem, Pagination, Skeleton, Tab, Table, TableBody,
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
import { buildInspectionReportDocumentHtml, printInspectionReportSheet } from '@/utils/inspectionReportHtml'
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

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

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

const printHtml = (title: string, body: string) => {
  const frame = document.createElement('iframe')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  document.body.appendChild(frame)
  const doc = frame.contentWindow?.document
  if (!doc) return
  doc.open()
  doc.write(`<!doctype html>
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; background: #eef2f7; color: #111827; font-family: Arial, sans-serif; }
          .sheet { width: 8.5in; min-height: 11in; margin: 24px auto; background: #fff; box-shadow: 0 20px 60px rgba(15,23,42,0.16); overflow: hidden; }
          .hero { padding: 30px 38px; color: #fff; background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 58%, #EC4899 100%); }
          .hero h1 { margin: 0; font-size: 30px; }
          .hero .sub { margin-top: 8px; color: rgba(255,255,255,0.84); font-weight: 700; }
          .content { padding: 34px 38px 38px; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
          .box { border: 1px solid #E5E7EB; border-radius: 14px; padding: 14px; background: #F8FAFC; }
          .box small { display: block; color: #64748B; font-weight: 900; text-transform: uppercase; margin-bottom: 6px; }
          .box strong { color: #1E1B4B; }
          .section { border: 1px solid #E5E7EB; border-radius: 16px; padding: 18px; margin-top: 16px; page-break-inside: avoid; }
          h2 { margin: 0 0 10px; color: #1E1B4B; font-size: 18px; }
          h4 { margin: 12px 0 5px; color: #64748B; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
          p { margin: 0; white-space: pre-wrap; line-height: 1.55; }
          .pill { display: inline-block; margin: 8px 8px 0 0; padding: 8px 12px; border-radius: 999px; background: #F5F3FF; color: #7C3AED; font-weight: 900; }
          .muted { color: #64748B; }
          @media print {
            body { background: #fff; }
            .sheet { margin: 0; width: 100%; min-height: 0; box-shadow: none; }
            .hero { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body><main class="sheet">${body}</main></body>
    </html>`)
  doc.close()
  frame.onload = () => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    window.setTimeout(() => frame.remove(), 800)
  }
}

const printServiceReport = (report: ServiceReport) => {
  const sessions = report.sessions.length ? report.sessions.map((session, index) => `
    <section class="section">
      <h2>Session ${index + 1} — ${escapeHtml(Number(session.duration_hours || 0).toFixed(2))} hrs</h2>
      <div class="grid">
        <div class="box"><small>Start</small><strong>${escapeHtml(formatDateTime(session.start_time))}</strong></div>
        <div class="box"><small>End</small><strong>${escapeHtml(formatDateTime(session.end_time || session.timestamp))}</strong></div>
        <div class="box"><small>Break</small><strong>${escapeHtml(session.break_minutes ?? 0)} min</strong></div>
        <div class="box"><small>By</small><strong>${escapeHtml(session.user || report.technician_name || '-')}</strong></div>
      </div>
      <h4>Diagnosis</h4><p>${escapeHtml(session.diagnosis || '-')}</p>
      <h4>Work Done</h4><p>${escapeHtml(session.work_done || '-')}</p>
      ${session.notes ? `<h4>Notes</h4><p>${escapeHtml(session.notes)}</p>` : ''}
    </section>
  `).join('') : '<section class="section"><p class="muted">No technician sessions were recorded.</p></section>'
  printHtml(`${report.request_number} Service Report`, `
    <section class="hero"><h1>Service Report</h1><div class="sub">${escapeHtml(report.request_number)} - ${escapeHtml(report.facility_name || '-')}</div></section>
    <section class="content">
      <div class="grid">
        <div class="box"><small>Facility</small><strong>${escapeHtml(report.facility_name || '-')}</strong></div>
        <div class="box"><small>Equipment</small><strong>${escapeHtml(report.equipment_name || '-')}</strong></div>
        <div class="box"><small>Technician</small><strong>${escapeHtml(report.technician_name || '-')}</strong></div>
        <div class="box"><small>Completed</small><strong>${escapeHtml(formatDateTime(report.completed_at))}</strong></div>
      </div>
      <section class="section"><h2>Service Required</h2><p>${escapeHtml(report.service_required || report.problem_description || '-')}</p></section>
      ${sessions}
      <section class="section">
        <h2>Completion Summary</h2>
        <p>${escapeHtml(report.resolution_description || 'No final resolution summary was added.')}</p>
        <span class="pill">Total Hours: ${escapeHtml(report.time_spent_hours.toFixed(2))}</span>
        <span class="pill">Total Cost: ${escapeHtml(money(report.total_cost))}</span>
        <span class="pill">Invoice: ${escapeHtml(report.invoice?.invoice_number || '-')}</span>
      </section>
    </section>
  `)
}

const printInspectionReport = (report: InspectionReport) => {
  printInspectionReportSheet(report)
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
  const [params] = useSearchParams()
  const highlightedServiceRequestId = Number(params.get('serviceRequest') || 0)
  const [tab, setTab] = useState<ReportTab>('service')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [result, setResult] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [selectedService, setSelectedService] = useState<ServiceReport | null>(null)
  const [selectedInspection, setSelectedInspection] = useState<InspectionReport | null>(null)
  const [selectedHistory, setSelectedHistory] = useState<ServiceHistoryReport | null>(null)
  const [actionAnchor, setActionAnchor] = useState<HTMLElement | null>(null)
  const [actionItem, setActionItem] = useState<ServiceReport | InspectionReport | ServiceHistoryReport | null>(null)

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

  const summaryQ = useQuery({ queryKey: ['reports-summary'], queryFn: fetchReportsSummary })
  const serviceQ = useQuery({
    queryKey: ['reports', 'service', commonParams],
    queryFn: () => fetchServiceReports(commonParams),
    enabled: tab === 'service',
  })
  const inspectionQ = useQuery({
    queryKey: ['reports', 'inspection', commonParams, result],
    queryFn: () => fetchInspectionReports({ ...commonParams, result: result || undefined }),
    enabled: tab === 'inspection',
  })
  const historyQ = useQuery({
    queryKey: ['reports', 'history', commonParams, actionFilter],
    queryFn: () => fetchServiceHistoryReports({ ...commonParams, action: actionFilter || undefined }),
    enabled: tab === 'history',
  })

  const activeData = tab === 'service' ? serviceQ.data : tab === 'inspection' ? inspectionQ.data : historyQ.data
  const isLoading = tab === 'service' ? serviceQ.isLoading : tab === 'inspection' ? inspectionQ.isLoading : historyQ.isLoading
  const totalPages = Math.max(1, Math.ceil((activeData?.total || 0) / LIMIT))
  const kpis = [
    { label: 'Service Reports', value: summaryQ.data?.service_reports ?? '-', icon: <BuildIcon />, color: '#7C3AED' },
    { label: 'Inspection Reports', value: summaryQ.data?.inspection_reports ?? '-', icon: <ChecklistIcon />, color: '#3B82F6' },
    { label: 'Service History', value: summaryQ.data?.service_history ?? '-', icon: <HistoryIcon />, color: '#10B981' },
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
          <Card key={item.label} sx={{ p: 2.5, borderRadius: '22px', border: '1px solid #EEF2F7' }}>
            <Avatar sx={{ bgcolor: `${item.color}18`, color: item.color, borderRadius: '16px', mb: 1.5 }}>{item.icon}</Avatar>
            <Typography sx={{ color: '#64748B', fontWeight: 900, fontSize: 12, textTransform: 'uppercase' }}>{item.label}</Typography>
            <Typography sx={{ color: '#1E1B4B', fontWeight: 950, fontSize: 30 }}>{item.value}</Typography>
          </Card>
        ))}
      </Box>

      <Card sx={{ borderRadius: '24px', border: '1px solid #EEF2F7', boxShadow: '0 18px 45px rgba(49,46,129,0.08)', overflow: 'hidden' }}>
        <Tabs value={TABS.indexOf(tab)} onChange={(_, value) => setTab(TABS[value] || 'service')} variant="scrollable" sx={{ px: 2, borderBottom: '1px solid #EEF2F7' }}>
          <Tab icon={<BuildIcon />} iconPosition="start" label="Service Reports" />
          <Tab icon={<ChecklistIcon />} iconPosition="start" label="Inspection Reports" />
          <Tab icon={<HistoryIcon />} iconPosition="start" label="Service Request History" />
        </Tabs>

        <Box sx={{ p: 2.5, display: 'grid', gridTemplateColumns: { xs: '1fr', md: tab === 'service' ? '1fr 180px 180px auto' : '1fr 180px 180px 180px auto' }, gap: 1.5, alignItems: 'center' }}>
          <TextField
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search reports by number, facility, asset, technician..."
            InputProps={{ startAdornment: <SearchIcon sx={{ color: '#94A3B8', mr: 1 }} /> }}
          />
          <TextField label="From" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField label="To" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} InputLabelProps={{ shrink: true }} />
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
        </Box>

        {tab === 'service' && (
          <ReportTable loading={isLoading} emptyText="No service reports found." colSpan={9}>
            {(serviceQ.data?.items || []).map(item => (
              <TableRow key={item.id} hover>
                <TableCell><ClippedTooltipText value={item.request_number} monospace color="#6757D8" fontWeight={950} onClick={() => setSelectedService(item)} /></TableCell>
                <TableCell><ClippedTooltipText value={item.facility_name || '-'} fontWeight={800} field /></TableCell>
                <TableCell><ClippedTooltipText value={item.equipment_name || '-'} field /></TableCell>
                <TableCell><ClippedTooltipText value={item.technician_name || 'Unassigned'} /></TableCell>
                <TableCell><Chip label={`${item.time_spent_hours.toFixed(2)} hrs`} sx={{ bgcolor: '#ECFDF5', color: '#047857', fontWeight: 900 }} /></TableCell>
                <TableCell><ClippedTooltipText value={item.diagnosis || item.work_done || '-'} field /></TableCell>
                <TableCell>{formatDate(item.completed_at)}</TableCell>
                <TableCell>{item.invoice ? <Chip label={item.invoice.invoice_number} sx={{ bgcolor: '#F5F3FF', color: '#7C3AED', fontWeight: 900 }} /> : '-'}</TableCell>
                <TableCell align="right"><ActionButton item={item} onOpen={openActions} /></TableCell>
              </TableRow>
            ))}
          </ReportTable>
        )}

        {tab === 'inspection' && (
          <ReportTable loading={isLoading} emptyText="No inspection reports found." colSpan={9}>
            {(inspectionQ.data?.items || []).map(item => {
              const chip = statusChip(item.result)
              return (
                <TableRow key={item.id} hover>
                  <TableCell><ClippedTooltipText value={item.inspection_number} monospace color="#6757D8" fontWeight={950} onClick={() => setSelectedInspection(item)} /></TableCell>
                  <TableCell><ClippedTooltipText value={item.facility_name || '-'} fontWeight={800} field /></TableCell>
                  <TableCell><ClippedTooltipText value={item.asset_name || '-'} field /></TableCell>
                  <TableCell><ClippedTooltipText value={item.technician_name || 'Unassigned'} /></TableCell>
                  <TableCell><Chip label={item.result} sx={{ bgcolor: chip.bg, color: chip.color, fontWeight: 900, textTransform: 'uppercase' }} /></TableCell>
                  <TableCell><ClippedTooltipText value={item.form_template_name || '-'} field /></TableCell>
                  <TableCell>{formatDate(item.completed_at)}</TableCell>
                  <TableCell>{item.invoice ? <Chip label={item.invoice.invoice_number} sx={{ bgcolor: '#F5F3FF', color: '#7C3AED', fontWeight: 900 }} /> : '-'}</TableCell>
                  <TableCell align="right"><ActionButton item={item} onOpen={openActions} /></TableCell>
                </TableRow>
              )
            })}
          </ReportTable>
        )}

        {tab === 'history' && (
          <ReportTable loading={isLoading} emptyText="No service request history found." colSpan={8}>
            {(historyQ.data?.items || []).map(item => (
              <TableRow key={item.id} hover>
                <TableCell>{formatDateTime(item.timestamp)}</TableCell>
                <TableCell><ClippedTooltipText value={item.request_number} monospace color="#6757D8" fontWeight={950} onClick={() => setSelectedHistory(item)} /></TableCell>
                <TableCell><ClippedTooltipText value={item.facility_name || '-'} fontWeight={800} field /></TableCell>
                <TableCell><ClippedTooltipText value={item.equipment_name || '-'} field /></TableCell>
                <TableCell>{item.user || '-'}</TableCell>
                <TableCell><Chip label={historyActionLabel(item.action)} sx={{ bgcolor: '#EEF2FF', color: '#4338CA', fontWeight: 900 }} /></TableCell>
                <TableCell><ClippedTooltipText value={item.summary || formatChangeValue(item.changes)} field /></TableCell>
                <TableCell align="right"><ActionButton item={item} onOpen={openActions} /></TableCell>
              </TableRow>
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

const ServiceReportDialog = ({ report, onClose }: { report: ServiceReport | null; onClose: () => void }) => (
  <Dialog open={Boolean(report)} onClose={onClose} maxWidth="lg" fullWidth PaperProps={{ sx: { borderRadius: '22px', overflow: 'hidden' } }}>
    <DialogTitle sx={{ p: 0 }}>
      <Box sx={{ p: 3, color: '#fff', background: GRADIENT }}>
        <Typography sx={{ fontWeight: 950, fontSize: 26 }}>Service Report</Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.82)', fontWeight: 800 }}>{report?.request_number} - {report?.facility_name || 'Facility'}</Typography>
      </Box>
    </DialogTitle>
    <DialogContent sx={{ bgcolor: '#F8FAFC', p: 3 }}>
      {report && (
        <Box sx={{ display: 'grid', gap: 2.5 }}>
          <DetailGrid items={[
            ['Facility', report.facility_name || '-'],
            ['Equipment', report.equipment_name || '-'],
            ['Technician', report.technician_name || 'Unassigned'],
            ['Completed', formatDateTime(report.completed_at)],
          ]} />
          <DetailCard title="Service Required" value={report.service_required || report.problem_description || '-'} />
          <Card sx={{ p: 2.5, borderRadius: '18px', border: '1px solid #E5E7EB' }}>
            <Typography sx={{ color: '#1E1B4B', fontWeight: 950, mb: 1 }}>Technician Sessions</Typography>
            {report.sessions.length === 0 ? <Typography sx={{ color: '#64748B' }}>No sessions recorded.</Typography> : (
              <Box sx={{ display: 'grid', gap: 1.5 }}>
                {report.sessions.map((session, index) => (
                  <Box key={`${session.session_id || index}`} sx={{ p: 2, borderRadius: '16px', border: '1px solid #E5E7EB', bgcolor: '#fff' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, gap: 1 }}>
                      <Typography sx={{ fontWeight: 950, color: '#1E1B4B' }}>Session {index + 1}</Typography>
                      <Chip size="small" label={`${Number(session.duration_hours || 0).toFixed(2)} hrs`} sx={{ bgcolor: '#F5F3FF', color: '#7C3AED', fontWeight: 950 }} />
                    </Box>
                    <Typography sx={{ color: '#64748B', fontSize: 13 }}>Start: {formatDateTime(session.start_time)} · End: {formatDateTime(session.end_time || session.timestamp)} · Break: {session.break_minutes ?? 0} min</Typography>
                    <Divider sx={{ my: 1.5 }} />
                    <Typography sx={{ color: '#64748B', fontSize: 12, fontWeight: 950, textTransform: 'uppercase' }}>Diagnosis</Typography>
                    <Typography sx={{ whiteSpace: 'pre-wrap', mb: 1 }}>{session.diagnosis || '-'}</Typography>
                    <Typography sx={{ color: '#64748B', fontSize: 12, fontWeight: 950, textTransform: 'uppercase' }}>Work Done</Typography>
                    <Typography sx={{ whiteSpace: 'pre-wrap', mb: 1 }}>{session.work_done || '-'}</Typography>
                    {session.notes && <Typography sx={{ whiteSpace: 'pre-wrap', color: '#475569' }}>{session.notes}</Typography>}
                  </Box>
                ))}
              </Box>
            )}
          </Card>
          <DetailCard title="Completion Summary" value={report.resolution_description || 'No final resolution summary was added.'} footer={[
            `Total Hours: ${report.time_spent_hours.toFixed(2)}`,
            `Cost: ${money(report.total_cost)}`,
            `Invoice: ${report.invoice?.invoice_number || '-'}`,
          ]} />
        </Box>
      )}
    </DialogContent>
    <DialogActions sx={{ px: 3, py: 2 }}>
      <Button onClick={onClose} sx={{ fontWeight: 900 }}>Close</Button>
      <Button variant="contained" startIcon={<PrintIcon />} onClick={() => report && printServiceReport(report)} sx={{ borderRadius: '12px', fontWeight: 900, background: GRADIENT }}>Print</Button>
    </DialogActions>
  </Dialog>
)

const InspectionReportDialog = ({ report, onClose }: { report: InspectionReport | null; onClose: () => void }) => {
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
            srcDoc={buildInspectionReportDocumentHtml(report)}
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
