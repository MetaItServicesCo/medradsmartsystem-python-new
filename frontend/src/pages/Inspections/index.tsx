import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Avatar, Box, Button, Card, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, FormControl, InputLabel, MenuItem, Select, Skeleton, Tab, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material'
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn'
import BoltIcon from '@mui/icons-material/Bolt'
import BuildIcon from '@mui/icons-material/Build'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import EditIcon from '@mui/icons-material/Edit'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import SaveIcon from '@mui/icons-material/Save'
import EventAvailableIcon from '@mui/icons-material/EventAvailable'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import AssessmentIcon from '@mui/icons-material/Assessment'
import { toast } from 'react-toastify'

import {
  completeInspection,
  createInstantInspection,
  fetchInspectionFacilityEquipment,
  fetchInspectionFacilities,
  fetchInspectionForms,
  fetchInspectionQuotations,
  fetchInspections,
  generateUpcomingInspections,
  scheduleInspections,
  startInspection as startScheduledInspection,
  updateInspectionForm,
  updateInspectionInvoice,
  type Inspection,
  type InspectionEquipmentItem,
  type InspectionInvoice,
  type InspectionFrequency,
  type InspectionFormOption,
} from '@/api/inspections'
import { fetchModalities, type Modality } from '@/api/modalities'

const CHECK_FIELDS = [
  ['physical_inspection', 'Physical Inspection'],
  ['cleaning', 'Cleaning'],
  ['display', 'Display'],
  ['lubrication', 'Lubrication'],
  ['functional', 'Functional'],
  ['calibration', 'Calibration'],
  ['electrical_safety', 'Electrical Safety'],
  ['battery', 'Battery'],
  ['pm_kit', 'PM Kit'],
]

const statusChip = (value: string) => {
  const map: Record<string, { bg: string; color: string }> = {
    in_progress: { bg: '#FEF3C7', color: '#B45309' },
    completed: { bg: '#D1FAE5', color: '#047857' },
    pass: { bg: '#D1FAE5', color: '#047857' },
    fail: { bg: '#FEE2E2', color: '#DC2626' },
    pending: { bg: '#E0E7FF', color: '#4338CA' },
    paid: { bg: '#E0E7FF', color: '#4338CA' },
    overdue: { bg: '#FEE2E2', color: '#DC2626' },
  }
  return map[value] || { bg: '#EEF2FF', color: '#4F46E5' }
}

const money = (value: number | string | null | undefined) => `$${Number(value || 0).toFixed(2)}`

const flattenModalities = (items: Modality[]): Modality[] =>
  items.flatMap((item) => [item, ...flattenModalities(item.children || [])])

const formatDate = (date: string | null | undefined) => {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const makeReport = (inspection: Inspection) => ({
  identity: {
    asset_number: inspection.asset_tag || inspection.part_number || '',
    description: inspection.equipment_name || inspection.inventory_part_name || '',
    make: inspection.make || '',
    model: inspection.model || '',
    serial_number: inspection.serial_number || '',
    location: '',
    risk_ranking: '',
    pm_schedule: 'Annual',
  },
  checks: CHECK_FIELDS.reduce((acc, [key]) => ({ ...acc, [key]: 'pass' }), {} as Record<string, string>),
  diagnostics: {
    reported_problem: 'N/A',
    problem_found: 'N/A',
    corrective_action_taken: '',
    summary: '',
  },
  measurements: [
    { name: 'Electrical leakage', set_value: '', read_value: '', unit: 'mA/Ohms', status: 'pass', notes: '' },
    { name: 'Functional test', set_value: '', read_value: '', unit: '', status: 'pass', notes: '' },
  ],
  photo_documentation: [{ label: 'Equipment condition', url: '', notes: '' }],
  compliance: {
    certified: 'yes',
    standard: inspection.compliance_requirement || 'Preventive maintenance and safety inspection',
    certificate_notes: '',
    recommendations: '',
  },
  parts: [{ description: '', part_number: '', price: 0, condition: '' }],
  test_equipment: [
    { description: 'Safety Analyzer', make: '', serial_number: '' },
    { description: 'MultiMeter', make: '', serial_number: '' },
  ],
  billing: { parts: 0, inspection_charges: 0, others: 0 },
  dates: {
    inspected_by: inspection.inspector_name || '',
    inspection_date: new Date().toISOString().slice(0, 10),
    inspection_due_date: new Date().toISOString().slice(0, 10),
    next_inspection_due_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10),
  },
})

const Inspections = () => {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState(0)
  const [facilityId, setFacilityId] = useState<number | ''>('')
  const [selectedInstantEquipmentIds, setSelectedInstantEquipmentIds] = useState<number[]>([])
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<number[]>([])
  const [frequency, setFrequency] = useState<InspectionFrequency>('instant')
  const [scheduleDate, setScheduleDate] = useState(new Date().toISOString().slice(0, 10))
  const [reportInspection, setReportInspection] = useState<Inspection | null>(null)
  const [viewReport, setViewReport] = useState<Inspection | null>(null)
  const [report, setReport] = useState<any>(null)
  const [invoiceEdit, setInvoiceEdit] = useState<InspectionInvoice | null>(null)
  const [invoiceForm, setInvoiceForm] = useState<any>({})

  const facilitiesQ = useQuery({ queryKey: ['inspection-facilities'], queryFn: fetchInspectionFacilities })
  const equipmentQ = useQuery({
    queryKey: ['inspection-equipment', facilityId],
    queryFn: () => fetchInspectionFacilityEquipment(Number(facilityId)),
    enabled: Boolean(facilityId),
  })
  const upcomingQ = useQuery({
    queryKey: ['inspections', 'upcoming'],
    queryFn: () => fetchInspections({ status: 'upcoming' }),
  })
  const inProgressQ = useQuery({
    queryKey: ['inspections', 'in_progress'],
    queryFn: () => fetchInspections({ status: 'in_progress' }),
  })
  const completedQ = useQuery({
    queryKey: ['inspections', 'completed'],
    queryFn: () => fetchInspections({ status: 'completed' }),
  })
  const quotationsQ = useQuery({ queryKey: ['inspection-quotations'], queryFn: fetchInspectionQuotations })
  const formsQ = useQuery({ queryKey: ['inspection-forms'], queryFn: () => fetchInspectionForms() })
  const modalitiesQ = useQuery({ queryKey: ['modalities'], queryFn: () => fetchModalities() })

  const selectedFacility = facilitiesQ.data?.find(f => f.id === facilityId)
  const equipment = equipmentQ.data || []
  const assignableModalities = useMemo(
    () => flattenModalities(modalitiesQ.data?.items || []),
    [modalitiesQ.data?.items],
  )

  const createMut = useMutation({
    mutationFn: createInstantInspection,
    onSuccess: (res) => {
      toast.success(`${res.total} inspection(s) started`)
      setSelectedInstantEquipmentIds([])
      queryClient.invalidateQueries({ queryKey: ['inspections'] })
      setTab(2)
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not start inspection'),
  })

  const scheduleMut = useMutation({
    mutationFn: scheduleInspections,
    onSuccess: (res) => {
      toast.success(`${res.total} upcoming inspection(s) scheduled`)
      setSelectedEquipmentIds([])
      queryClient.invalidateQueries({ queryKey: ['inspections'] })
      setTab(0)
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not schedule inspections'),
  })

  const generateMut = useMutation({
    mutationFn: generateUpcomingInspections,
    onSuccess: (res) => {
      toast.success(`${res.total} upcoming inspection(s) generated`)
      queryClient.invalidateQueries({ queryKey: ['inspections'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not generate schedule'),
  })

  const startMut = useMutation({
    mutationFn: startScheduledInspection,
    onSuccess: () => {
      toast.success('Inspection moved to in progress')
      queryClient.invalidateQueries({ queryKey: ['inspections'] })
      setTab(2)
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not start inspection'),
  })

  const completeMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => completeInspection(id, data),
    onSuccess: () => {
      toast.success('Inspection completed and invoice generated')
      setReportInspection(null)
      setReport(null)
      queryClient.invalidateQueries({ queryKey: ['inspections'] })
      queryClient.invalidateQueries({ queryKey: ['inspection-quotations'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not complete inspection'),
  })

  const invoiceMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => updateInspectionInvoice(id, data),
    onSuccess: () => {
      toast.success('Inspection invoice updated')
      setInvoiceEdit(null)
      queryClient.invalidateQueries({ queryKey: ['inspection-quotations'] })
      queryClient.invalidateQueries({ queryKey: ['inspections'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not update invoice'),
  })

  const formMut = useMutation({
    mutationFn: ({ id, modality_id }: { id: number; modality_id: number | null }) => updateInspectionForm(id, { modality_id }),
    onSuccess: () => {
      toast.success('Inspection form asset tag updated')
      queryClient.invalidateQueries({ queryKey: ['inspection-forms'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not update inspection form'),
  })

  useEffect(() => {
    if (reportInspection) setReport(reportInspection.form_data || makeReport(reportInspection))
  }, [reportInspection])

  useEffect(() => {
    if (!invoiceEdit) return
    setInvoiceForm({
      subtotal: Number(invoiceEdit.subtotal || 0),
      tax_amount: Number(invoiceEdit.tax_amount || 0),
      discount_amount: Number(invoiceEdit.discount_amount || 0),
      total_amount: Number(invoiceEdit.total_amount || 0),
      amount_paid: Number(invoiceEdit.amount_paid || 0),
      due_date: invoiceEdit.due_date,
      payment_terms: invoiceEdit.payment_terms || 'Net 30',
      status: invoiceEdit.status,
      notes: invoiceEdit.notes || '',
    })
  }, [invoiceEdit])

  const stats = useMemo(() => ({
    upcoming: upcomingQ.data?.total || 0,
    instantItems: equipment.length,
    inProgress: inProgressQ.data?.total || 0,
    completed: completedQ.data?.total || 0,
    quotations: quotationsQ.data?.total || 0,
  }), [upcomingQ.data?.total, equipment.length, inProgressQ.data?.total, completedQ.data?.total, quotationsQ.data?.total])

  const toggleInstantEquipment = (id: number) => {
    setSelectedInstantEquipmentIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id])
  }

  const toggleEquipment = (id: number) => {
    setSelectedEquipmentIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id])
  }

  const startInspection = () => {
    if (!facilityId) return toast.error('Select a facility first')
    createMut.mutate({
      facility_id: Number(facilityId),
      equipment_ids: selectedInstantEquipmentIds.length ? selectedInstantEquipmentIds : undefined,
      frequency,
    })
  }

  const scheduleSelected = () => {
    if (!facilityId) return toast.error('Select a facility first')
    scheduleMut.mutate({
      facility_id: Number(facilityId),
      equipment_ids: selectedEquipmentIds.length ? selectedEquipmentIds : undefined,
      frequency: frequency === 'instant' ? 'annual' : frequency,
      scheduled_date: new Date(scheduleDate).toISOString(),
    })
  }

  const updateReport = (section: string, key: string, value: any) => {
    setReport((prev: any) => ({ ...prev, [section]: { ...prev[section], [key]: value } }))
  }

  const updateArrayReport = (section: 'parts' | 'test_equipment' | 'measurements' | 'photo_documentation', index: number, key: string, value: any) => {
    setReport((prev: any) => {
      const next = [...prev[section]]
      next[index] = { ...next[index], [key]: value }
      return { ...prev, [section]: next }
    })
  }

  const submitReport = () => {
    if (!reportInspection || !report) return
    const hasFail = Object.values(report.checks || {}).includes('fail')
    const partTotal = (report.parts || []).reduce((sum: number, part: any) => sum + Number(part.price || 0), 0)
    completeMut.mutate({
      id: reportInspection.id,
      data: {
        result: hasFail ? 'fail' : 'pass',
        form_data: report,
        corrective_actions: report.diagnostics?.corrective_action_taken || '',
        parts_amount: Number(report.billing?.parts || partTotal || 0),
        inspection_charge: Number(report.billing?.inspection_charges || 0),
        other_charges: Number(report.billing?.others || 0),
        notes: `Inspection completed for ${reportInspection.asset_name || reportInspection.inspection_number}`,
      },
    })
  }

  const saveInvoice = () => {
    if (!invoiceEdit) return
    invoiceMut.mutate({ id: invoiceEdit.id, data: invoiceForm })
  }

  const renderKpi = (label: string, value: number, icon: JSX.Element, color: string) => (
    <Card sx={{ p: 2.2, borderRadius: '18px', border: '1px solid #EEF0F6', boxShadow: '0 14px 34px rgba(49,46,129,0.07)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.4 }}>
        <Avatar sx={{ bgcolor: `${color}18`, color, borderRadius: '14px' }}>{icon}</Avatar>
        <Box>
          <Typography sx={{ color: '#6B7280', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>{label}</Typography>
          <Typography sx={{ color: '#1E1B4B', fontSize: 28, fontWeight: 900, lineHeight: 1 }}>{value}</Typography>
        </Box>
      </Box>
    </Card>
  )

  const renderInspectionRows = (items: Inspection[], loading: boolean, mode: 'progress' | 'completed') => (
    <TableContainer>
      <Table>
        <TableHead>
          <TableRow sx={{ bgcolor: '#F9FAFB' }}>
            <TableCell sx={{ fontWeight: 900 }}>Inspection #</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Facility</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Asset</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Tier</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Result</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Date</TableCell>
            <TableCell align="right" sx={{ fontWeight: 900 }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {loading ? Array.from({ length: 4 }).map((_, i) => (
            <TableRow key={i}><TableCell colSpan={7}><Skeleton /></TableCell></TableRow>
          )) : items.length === 0 ? (
            <TableRow><TableCell colSpan={7} align="center" sx={{ py: 5, color: '#6B7280', fontWeight: 700 }}>No inspections found.</TableCell></TableRow>
          ) : items.map(item => {
            const resultStyle = statusChip(item.result)
            return (
              <TableRow key={item.id} hover>
                <TableCell sx={{ color: '#7161D8', fontFamily: 'monospace', fontWeight: 900 }}>{item.inspection_number}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{item.facility_name || '-'}</TableCell>
                <TableCell>
                  <Typography sx={{ fontWeight: 800, color: '#1E1B4B' }}>{item.asset_name || item.equipment_name || '-'}</Typography>
                  <Typography sx={{ color: '#8B95A7', fontSize: 12 }}>{item.serial_number || item.part_number || '-'}</Typography>
                </TableCell>
                <TableCell>{item.tier_name || '-'}</TableCell>
                <TableCell><Chip size="small" label={item.result} sx={{ bgcolor: resultStyle.bg, color: resultStyle.color, fontWeight: 900 }} /></TableCell>
                <TableCell>{formatDate(mode === 'progress' ? item.started_at : item.completed_at)}</TableCell>
                <TableCell align="right">
                  {mode === 'progress' ? (
                    <Button startIcon={<AssignmentTurnedInIcon />} variant="contained" onClick={() => setReportInspection(item)} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900 }}>
                      Fill Report
                    </Button>
                  ) : (
                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                      <Button size="small" startIcon={<AssessmentIcon />} variant="outlined" onClick={() => setViewReport(item)} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900 }}>
                        Report
                      </Button>
                      <Chip label={item.invoice?.invoice_number || 'Invoice pending'} sx={{ fontWeight: 900 }} />
                    </Box>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )

  const renderUpcomingRows = () => (
    <TableContainer>
      <Table>
        <TableHead>
          <TableRow sx={{ bgcolor: '#F9FAFB' }}>
            <TableCell sx={{ fontWeight: 900 }}>Inspection #</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Facility</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Equipment</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Frequency</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Criticality</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Requirement</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Scheduled</TableCell>
            <TableCell align="right" sx={{ fontWeight: 900 }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {upcomingQ.isLoading ? Array.from({ length: 4 }).map((_, i) => (
            <TableRow key={i}><TableCell colSpan={8}><Skeleton /></TableCell></TableRow>
          )) : (upcomingQ.data?.items || []).length === 0 ? (
            <TableRow><TableCell colSpan={8} align="center" sx={{ py: 5, color: '#6B7280', fontWeight: 700 }}>No upcoming inspections scheduled.</TableCell></TableRow>
          ) : upcomingQ.data!.items.map(item => (
            <TableRow key={item.id} hover>
              <TableCell sx={{ color: '#7161D8', fontFamily: 'monospace', fontWeight: 900 }}>{item.inspection_number}</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>{item.facility_name || '-'}</TableCell>
              <TableCell>
                <Typography sx={{ fontWeight: 800, color: '#1E1B4B' }}>{item.asset_name || '-'}</Typography>
                <Typography sx={{ color: '#8B95A7', fontSize: 12 }}>{item.serial_number || '-'}</Typography>
              </TableCell>
              <TableCell>{(item.inspection_frequency || 'annual').replace('_', '-')}</TableCell>
              <TableCell><Chip size="small" label={item.criticality || 'standard'} sx={{ fontWeight: 900 }} /></TableCell>
              <TableCell sx={{ maxWidth: 260 }}>{item.compliance_requirement || '-'}</TableCell>
              <TableCell>{formatDate(item.scheduled_date)}</TableCell>
              <TableCell align="right">
                <Button startIcon={<PlayArrowIcon />} variant="contained" onClick={() => startMut.mutate(item.id)} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900 }}>
                  Start
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )

  return (
    <Box className="page-enter" sx={{ maxWidth: 1440, mx: 'auto' }}>
      <Card sx={{ p: 3, mb: 3, borderRadius: '24px', border: '1px solid #E6E8F2', background: 'linear-gradient(135deg, #F8FAFF 0%, #F5F3FF 100%)', boxShadow: '0 18px 45px rgba(49,46,129,0.08)' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="h4" sx={{ color: '#1E1B4B', fontWeight: 900 }}>Inspection Module</Typography>
            <Typography sx={{ color: '#6B7280', fontWeight: 700 }}>Schedule equipment compliance inspections, initiate on-demand checks, complete technician reports, and prepare billing.</Typography>
          </Box>
          <Avatar sx={{ bgcolor: '#EFE7FF', color: '#7C3AED', width: 58, height: 58, borderRadius: '18px' }}><AssignmentTurnedInIcon /></Avatar>
        </Box>
      </Card>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(5, 1fr)' }, gap: 2, mb: 3 }}>
        {renderKpi('Upcoming', stats.upcoming, <EventAvailableIcon />, '#2563EB')}
        {renderKpi('Assets', stats.instantItems, <BoltIcon />, '#7C3AED')}
        {renderKpi('In Progress', stats.inProgress, <BuildIcon />, '#F59E0B')}
        {renderKpi('Completed', stats.completed, <CheckCircleIcon />, '#059669')}
        {renderKpi('Quotations', stats.quotations, <ReceiptLongIcon />, '#2563EB')}
      </Box>

      <Card sx={{ borderRadius: '24px', overflow: 'hidden', border: '1px solid #EEF0F6', boxShadow: '0 18px 45px rgba(49,46,129,0.08)' }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" sx={{ px: 2, borderBottom: '1px solid #EEF0F6' }}>
          <Tab icon={<EventAvailableIcon />} iconPosition="start" label="Upcoming" />
          <Tab icon={<BoltIcon />} iconPosition="start" label="Instant Inspection" />
          <Tab icon={<BuildIcon />} iconPosition="start" label="In Progress" />
          <Tab icon={<CheckCircleIcon />} iconPosition="start" label="Completed" />
          <Tab icon={<ReceiptLongIcon />} iconPosition="start" label="Inspection Quotations" />
          <Tab icon={<AssignmentTurnedInIcon />} iconPosition="start" label="Inspection Forms" />
        </Tabs>

        {tab === 0 && (
          <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 180px 180px auto auto' }, gap: 2, alignItems: 'center', mb: 3 }}>
              <FormControl fullWidth>
                <InputLabel>Facility</InputLabel>
                <Select label="Facility" value={facilityId} onChange={(e) => { setFacilityId(e.target.value as number); setSelectedInstantEquipmentIds([]); setSelectedEquipmentIds([]) }}>
                  {(facilitiesQ.data || []).map(f => (
                    <MenuItem key={f.id} value={f.id}>{f.name} - {f.tier_name || 'No tier'}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField select label="Frequency" value={frequency} onChange={e => setFrequency(e.target.value as InspectionFrequency)}>
                <MenuItem value="quarterly">Quarterly</MenuItem>
                <MenuItem value="semi_annual">Semi-Annual</MenuItem>
                <MenuItem value="annual">Annual</MenuItem>
              </TextField>
              <TextField label="Schedule Date" type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} InputLabelProps={{ shrink: true }} />
              <Button startIcon={<EventAvailableIcon />} variant="outlined" onClick={scheduleSelected} disabled={!facilityId || scheduleMut.isPending} sx={{ height: 54, borderRadius: '14px', fontWeight: 900, textTransform: 'none' }}>
                Schedule {selectedEquipmentIds.length || 'All'}
              </Button>
              <Button startIcon={<AutoFixHighIcon />} variant="contained" onClick={() => generateMut.mutate({ facility_id: facilityId ? Number(facilityId) : undefined, days_ahead: 90 })} sx={{ height: 54, borderRadius: '14px', fontWeight: 900, textTransform: 'none' }}>
                Auto Generate
              </Button>
            </Box>
            <TableContainer sx={{ mb: 3, border: '1px solid #EEF0F6', borderRadius: '18px' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                    <TableCell padding="checkbox" />
                    <TableCell sx={{ fontWeight: 900 }}>Asset Tag</TableCell>
                    <TableCell sx={{ fontWeight: 900 }}>Equipment</TableCell>
                    <TableCell sx={{ fontWeight: 900 }}>Modality</TableCell>
                    <TableCell sx={{ fontWeight: 900 }}>Criticality</TableCell>
                    <TableCell sx={{ fontWeight: 900 }}>Serial #</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {equipmentQ.isLoading ? <TableRow><TableCell colSpan={6}><Skeleton /></TableCell></TableRow> : equipment.length === 0 ? (
                    <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: '#6B7280', fontWeight: 700 }}>Select a facility to schedule equipment inspections.</TableCell></TableRow>
                  ) : equipment.map((item: InspectionEquipmentItem) => (
                    <TableRow key={item.id} hover onClick={() => toggleEquipment(item.id)} sx={{ cursor: 'pointer' }}>
                      <TableCell padding="checkbox"><Checkbox checked={selectedEquipmentIds.includes(item.id)} /></TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', color: '#7161D8', fontWeight: 900 }}>{item.asset_tag}</TableCell>
                      <TableCell>{item.make} {item.model}</TableCell>
                      <TableCell>{item.modality_name || '-'}</TableCell>
                      <TableCell>{item.criticality}</TableCell>
                      <TableCell>{item.serial_number}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {renderUpcomingRows()}
          </Box>
        )}

        {tab === 1 && (
          <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr auto' }, gap: 2, alignItems: 'center', mb: 3 }}>
              <FormControl fullWidth>
                <InputLabel>Facility</InputLabel>
                <Select label="Facility" value={facilityId} onChange={(e) => { setFacilityId(e.target.value as number); setSelectedInstantEquipmentIds([]); setSelectedEquipmentIds([]) }}>
                  {(facilitiesQ.data || []).map(f => (
                    <MenuItem key={f.id} value={f.id}>{f.name} - {f.tier_name || 'No tier'} - {f.inventory_count} asset(s)</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField select label="Frequency" value={frequency} onChange={e => setFrequency(e.target.value as InspectionFrequency)} sx={{ minWidth: 180 }}>
                <MenuItem value="instant">Instant</MenuItem>
                <MenuItem value="quarterly">Quarterly</MenuItem>
                <MenuItem value="semi_annual">Semi-Annual</MenuItem>
                <MenuItem value="annual">Annual</MenuItem>
              </TextField>
              <Button
                startIcon={createMut.isPending ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <PlayArrowIcon />}
                variant="contained"
                onClick={startInspection}
                disabled={!facilityId || createMut.isPending}
                sx={{ height: 54, borderRadius: '14px', px: 3, fontWeight: 900, textTransform: 'none', background: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)' }}
              >
                Start {selectedInstantEquipmentIds.length || 'All'} Inspection{selectedInstantEquipmentIds.length === 1 ? '' : 's'}
              </Button>
            </Box>
            {selectedFacility && (
              <Typography sx={{ mb: 2, color: '#6B7280', fontWeight: 800 }}>
                {selectedFacility.name}: select assets or leave all unchecked to inspect all facility assets.
              </Typography>
            )}
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                    <TableCell padding="checkbox" />
                    <TableCell sx={{ fontWeight: 900 }}>Asset Tag</TableCell>
                    <TableCell sx={{ fontWeight: 900 }}>Equipment</TableCell>
                    <TableCell sx={{ fontWeight: 900 }}>Modality</TableCell>
                    <TableCell sx={{ fontWeight: 900 }}>Serial #</TableCell>
                    <TableCell sx={{ fontWeight: 900 }}>Tier</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {equipmentQ.isLoading ? Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={6}><Skeleton /></TableCell></TableRow>
                  )) : equipment.length === 0 ? (
                    <TableRow><TableCell colSpan={6} align="center" sx={{ py: 5, color: '#6B7280', fontWeight: 700 }}>Select a facility with assets.</TableCell></TableRow>
                  ) : equipment.map((item: InspectionEquipmentItem) => (
                    <TableRow key={item.id} hover onClick={() => toggleInstantEquipment(item.id)} sx={{ cursor: 'pointer' }}>
                      <TableCell padding="checkbox"><Checkbox checked={selectedInstantEquipmentIds.includes(item.id)} /></TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', color: '#7161D8', fontWeight: 900 }}>{item.asset_tag}</TableCell>
                      <TableCell>{item.make} {item.model}</TableCell>
                      <TableCell>{item.modality_name || '-'}</TableCell>
                      <TableCell>{item.serial_number || '-'}</TableCell>
                      <TableCell>{item.tier_name || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {tab === 2 && renderInspectionRows(inProgressQ.data?.items || [], inProgressQ.isLoading, 'progress')}
        {tab === 3 && renderInspectionRows(completedQ.data?.items || [], completedQ.isLoading, 'completed')}

        {tab === 4 && (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                  <TableCell sx={{ fontWeight: 900 }}>Invoice #</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Inspection #</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Facility</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Inventory</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Amount</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Due</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 900 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {quotationsQ.isLoading ? Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}><TableCell colSpan={8}><Skeleton /></TableCell></TableRow>
                )) : (quotationsQ.data?.items || []).length === 0 ? (
                  <TableRow><TableCell colSpan={8} align="center" sx={{ py: 5, color: '#6B7280', fontWeight: 700 }}>No inspection quotations yet.</TableCell></TableRow>
                ) : quotationsQ.data!.items.map(invoice => {
                  const chip = statusChip(invoice.status)
                  return (
                    <TableRow key={invoice.id} hover>
                      <TableCell sx={{ color: '#7161D8', fontFamily: 'monospace', fontWeight: 900 }}>{invoice.invoice_number}</TableCell>
                      <TableCell>{invoice.inspection_number || '-'}</TableCell>
                      <TableCell>{invoice.facility_name || '-'}</TableCell>
                      <TableCell>{invoice.inventory_part_name || '-'}</TableCell>
                      <TableCell sx={{ color: '#059669', fontWeight: 900 }}>{money(invoice.total_amount)}</TableCell>
                      <TableCell><Chip size="small" label={invoice.status} sx={{ bgcolor: chip.bg, color: chip.color, fontWeight: 900 }} /></TableCell>
                      <TableCell>{formatDate(invoice.due_date)}</TableCell>
                      <TableCell align="right">
                        <Button startIcon={<EditIcon />} variant="outlined" onClick={() => setInvoiceEdit(invoice)} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900 }}>
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {tab === 5 && (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                  <TableCell sx={{ fontWeight: 900 }}>Form</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Description</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Tagged Asset Type</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {formsQ.isLoading ? Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}><TableCell colSpan={3}><Skeleton /></TableCell></TableRow>
                )) : (formsQ.data?.items || []).length === 0 ? (
                  <TableRow><TableCell colSpan={3} align="center" sx={{ py: 5, color: '#6B7280', fontWeight: 700 }}>No inspection forms found.</TableCell></TableRow>
                ) : formsQ.data!.items.map((form: InspectionFormOption) => (
                  <TableRow key={form.id} hover>
                    <TableCell sx={{ fontWeight: 900, color: '#1E1B4B' }}>{form.name}</TableCell>
                    <TableCell>{form.description || '-'}</TableCell>
                    <TableCell sx={{ minWidth: 280 }}>
                      <TextField
                        select
                        size="small"
                        fullWidth
                        value={form.modality_id ?? ''}
                        onChange={(event) => formMut.mutate({
                          id: form.id,
                          modality_id: event.target.value ? Number(event.target.value) : null,
                        })}
                        disabled={formMut.isPending}
                      >
                        <MenuItem value="">General - available to all assets</MenuItem>
                        {assignableModalities.map((modality) => (
                          <MenuItem key={modality.id} value={modality.id}>{modality.name}</MenuItem>
                        ))}
                      </TextField>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      <Dialog open={Boolean(reportInspection)} onClose={() => setReportInspection(null)} maxWidth="lg" fullWidth PaperProps={{ sx: { borderRadius: '22px' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>
          Technician Inspection Report
          <Typography sx={{ color: '#6B7280', fontSize: 13, fontWeight: 700 }}>
            {reportInspection?.inspection_number} - {reportInspection?.inventory_part_name}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          {report && (
            <Box sx={{ display: 'grid', gap: 3 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
                {Object.entries(report.identity).map(([key, value]) => (
                  <TextField key={key} label={key.replace(/_/g, ' ')} value={value as string} onChange={e => updateReport('identity', key, e.target.value)} size="small" />
                ))}
              </Box>
              <Divider />
              <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Checks</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
                {CHECK_FIELDS.map(([key, label]) => (
                  <TextField key={key} select label={label} value={report.checks[key]} onChange={e => updateReport('checks', key, e.target.value)} size="small">
                    <MenuItem value="pass">Pass</MenuItem>
                    <MenuItem value="fail">Fail</MenuItem>
                    <MenuItem value="na">N/A</MenuItem>
                  </TextField>
                ))}
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2 }}>
                {Object.entries(report.diagnostics).map(([key, value]) => (
                  <TextField key={key} label={key.replace(/_/g, ' ')} value={value as string} onChange={e => updateReport('diagnostics', key, e.target.value)} multiline rows={key === 'summary' ? 3 : 2} />
                ))}
              </Box>
              <Divider />
              <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Measurements & Photo Documentation</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.2fr 1fr' }, gap: 2 }}>
                <Card sx={{ p: 2, borderRadius: '16px', border: '1px solid #EEF0F6' }}>
                  {(report.measurements || []).map((item: any, index: number) => (
                    <Box key={index} sx={{ display: 'grid', gridTemplateColumns: '1.1fr 0.8fr 0.8fr 0.6fr 0.8fr', gap: 1, mb: 1 }}>
                      <TextField size="small" label="Measurement" value={item.name} onChange={e => updateArrayReport('measurements', index, 'name', e.target.value)} />
                      <TextField size="small" label="Set" value={item.set_value} onChange={e => updateArrayReport('measurements', index, 'set_value', e.target.value)} />
                      <TextField size="small" label="Read" value={item.read_value} onChange={e => updateArrayReport('measurements', index, 'read_value', e.target.value)} />
                      <TextField size="small" label="Unit" value={item.unit} onChange={e => updateArrayReport('measurements', index, 'unit', e.target.value)} />
                      <TextField size="small" select label="Status" value={item.status} onChange={e => updateArrayReport('measurements', index, 'status', e.target.value)}>
                        <MenuItem value="pass">Pass</MenuItem>
                        <MenuItem value="fail">Fail</MenuItem>
                      </TextField>
                    </Box>
                  ))}
                </Card>
                <Card sx={{ p: 2, borderRadius: '16px', border: '1px solid #EEF0F6' }}>
                  {(report.photo_documentation || []).map((item: any, index: number) => (
                    <Box key={index} sx={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 1, mb: 1 }}>
                      <TextField size="small" label="Label" value={item.label} onChange={e => updateArrayReport('photo_documentation', index, 'label', e.target.value)} />
                      <TextField size="small" label="Photo URL / reference" value={item.url} onChange={e => updateArrayReport('photo_documentation', index, 'url', e.target.value)} />
                    </Box>
                  ))}
                </Card>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '180px 1fr 1fr' }, gap: 2 }}>
                <TextField select label="Certified" value={report.compliance?.certified || 'yes'} onChange={e => updateReport('compliance', 'certified', e.target.value)}>
                  <MenuItem value="yes">Yes</MenuItem>
                  <MenuItem value="conditional">Conditional</MenuItem>
                  <MenuItem value="no">No</MenuItem>
                </TextField>
                <TextField label="Compliance standard" value={report.compliance?.standard || ''} onChange={e => updateReport('compliance', 'standard', e.target.value)} />
                <TextField label="Recommendations" value={report.compliance?.recommendations || ''} onChange={e => updateReport('compliance', 'recommendations', e.target.value)} />
              </Box>
              <Divider />
              <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Parts & Test Equipment</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                <Card sx={{ p: 2, borderRadius: '16px', border: '1px solid #EEF0F6' }}>
                  {(report.parts || []).map((part: any, index: number) => (
                    <Box key={index} sx={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 0.8fr 1fr', gap: 1, mb: 1 }}>
                      <TextField size="small" label="Description" value={part.description} onChange={e => updateArrayReport('parts', index, 'description', e.target.value)} />
                      <TextField size="small" label="Part #" value={part.part_number} onChange={e => updateArrayReport('parts', index, 'part_number', e.target.value)} />
                      <TextField size="small" label="Price" type="number" value={part.price} onChange={e => updateArrayReport('parts', index, 'price', Number(e.target.value))} />
                      <TextField size="small" label="Condition" value={part.condition} onChange={e => updateArrayReport('parts', index, 'condition', e.target.value)} />
                    </Box>
                  ))}
                </Card>
                <Card sx={{ p: 2, borderRadius: '16px', border: '1px solid #EEF0F6' }}>
                  {(report.test_equipment || []).map((item: any, index: number) => (
                    <Box key={index} sx={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 1, mb: 1 }}>
                      <TextField size="small" label="Description" value={item.description} onChange={e => updateArrayReport('test_equipment', index, 'description', e.target.value)} />
                      <TextField size="small" label="Make" value={item.make} onChange={e => updateArrayReport('test_equipment', index, 'make', e.target.value)} />
                      <TextField size="small" label="SN #" value={item.serial_number} onChange={e => updateArrayReport('test_equipment', index, 'serial_number', e.target.value)} />
                    </Box>
                  ))}
                </Card>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
                <TextField label="Parts" type="number" value={report.billing.parts} onChange={e => updateReport('billing', 'parts', Number(e.target.value))} />
                <TextField label="Inspection Charges" type="number" value={report.billing.inspection_charges} onChange={e => updateReport('billing', 'inspection_charges', Number(e.target.value))} />
                <TextField label="Others" type="number" value={report.billing.others} onChange={e => updateReport('billing', 'others', Number(e.target.value))} />
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
                {Object.entries(report.dates).map(([key, value]) => (
                  <TextField key={key} label={key.replace(/_/g, ' ')} type={key.includes('date') ? 'date' : 'text'} value={value as string} onChange={e => updateReport('dates', key, e.target.value)} InputLabelProps={{ shrink: true }} />
                ))}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setReportInspection(null)} sx={{ fontWeight: 900 }}>Cancel</Button>
          <Button startIcon={completeMut.isPending ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <SaveIcon />} onClick={submitReport} variant="contained" sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none' }}>
            Complete & Generate Invoice
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(viewReport)} onClose={() => setViewReport(null)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '22px' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>
          Inspection Report
          <Typography sx={{ color: '#6B7280', fontSize: 13, fontWeight: 700 }}>
            {viewReport?.inspection_number} - {viewReport?.asset_name}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          {viewReport?.form_data ? (
            <Box sx={{ display: 'grid', gap: 2 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
                <Card sx={{ p: 2, borderRadius: '16px', border: '1px solid #EEF0F6' }}>
                  <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Result</Typography>
                  <Chip label={viewReport.result} sx={{ mt: 1, fontWeight: 900, ...statusChip(viewReport.result) }} />
                </Card>
                <Card sx={{ p: 2, borderRadius: '16px', border: '1px solid #EEF0F6' }}>
                  <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Certification</Typography>
                  <Typography sx={{ color: '#6B7280', fontWeight: 800 }}>{viewReport.form_data.compliance?.certified || '-'}</Typography>
                </Card>
                <Card sx={{ p: 2, borderRadius: '16px', border: '1px solid #EEF0F6' }}>
                  <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Invoice</Typography>
                  <Typography sx={{ color: '#059669', fontWeight: 900 }}>{viewReport.invoice?.invoice_number || 'Pending'}</Typography>
                </Card>
              </Box>
              <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Summary</Typography>
              <Typography sx={{ color: '#374151', whiteSpace: 'pre-wrap' }}>{viewReport.form_data.diagnostics?.summary || '-'}</Typography>
              <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Corrective Action</Typography>
              <Typography sx={{ color: '#374151', whiteSpace: 'pre-wrap' }}>{viewReport.corrective_actions || viewReport.form_data.diagnostics?.corrective_action_taken || '-'}</Typography>
              <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Recommendations</Typography>
              <Typography sx={{ color: '#374151', whiteSpace: 'pre-wrap' }}>{viewReport.form_data.compliance?.recommendations || '-'}</Typography>
            </Box>
          ) : (
            <Typography sx={{ color: '#6B7280', fontWeight: 700 }}>No report data available.</Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => window.print()} variant="outlined" sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none' }}>Print Report</Button>
          <Button onClick={() => setViewReport(null)} variant="contained" sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none' }}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(invoiceEdit)} onClose={() => setInvoiceEdit(null)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '22px' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>Edit Inspection Invoice</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, pt: 1 }}>
            {['subtotal', 'tax_amount', 'discount_amount', 'total_amount', 'amount_paid'].map(key => (
              <TextField key={key} label={key.replace(/_/g, ' ')} type="number" value={invoiceForm[key] ?? ''} onChange={e => setInvoiceForm((prev: any) => ({ ...prev, [key]: Number(e.target.value) }))} />
            ))}
            <TextField label="Due date" type="date" value={invoiceForm.due_date || ''} onChange={e => setInvoiceForm((prev: any) => ({ ...prev, due_date: e.target.value }))} InputLabelProps={{ shrink: true }} />
            <TextField select label="Status" value={invoiceForm.status || 'pending'} onChange={e => setInvoiceForm((prev: any) => ({ ...prev, status: e.target.value }))}>
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="partially_paid">Partially Paid</MenuItem>
              <MenuItem value="paid">Paid</MenuItem>
              <MenuItem value="overdue">Overdue</MenuItem>
              <MenuItem value="cancelled">Cancelled</MenuItem>
            </TextField>
            <TextField label="Payment terms" value={invoiceForm.payment_terms || ''} onChange={e => setInvoiceForm((prev: any) => ({ ...prev, payment_terms: e.target.value }))} />
            <TextField label="Notes" value={invoiceForm.notes || ''} onChange={e => setInvoiceForm((prev: any) => ({ ...prev, notes: e.target.value }))} multiline rows={3} sx={{ gridColumn: '1 / -1' }} />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setInvoiceEdit(null)} sx={{ fontWeight: 900 }}>Cancel</Button>
          <Button startIcon={invoiceMut.isPending ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <SaveIcon />} onClick={saveInvoice} variant="contained" sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none' }}>
            Save Invoice
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default Inspections
