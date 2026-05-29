import { type MouseEvent, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Avatar, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, FormControl, IconButton, InputLabel, Menu, MenuItem, Select,
  LinearProgress, Skeleton, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs,
  TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import AssignmentIcon from '@mui/icons-material/Assignment'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import HistoryIcon from '@mui/icons-material/History'
import Inventory2Icon from '@mui/icons-material/Inventory2'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import PaymentIcon from '@mui/icons-material/Payment'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart'
import VisibilityIcon from '@mui/icons-material/Visibility'
import { toast } from 'react-toastify'

import { fetchFacilities, type Facility } from '@/api/facilities'
import {
  completeSalesQuotation,
  convertSalesQuotationToInvoice,
  createSalesQuotation,
  deleteSalesQuotation,
  fetchSalesHistory,
  fetchSalesInvoices,
  fetchSalesParts,
  fetchSalesQuotations,
  requestSalesCardAuthorization,
  updateSalesInvoice,
  updateSalesQuotation,
  type SalesInvoice,
  type SalesInvoiceCreatePayload,
  type SalesPart,
  type SalesQuotation,
  type SalesQuotationPayload,
} from '@/api/sales'

const ROUTE_TABS = ['/sales/quotations', '/sales/invoices', '/sales/in-progress', '/sales/completed', '/sales/history']
const SYSTEM_GRADIENT = 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)'
const SYSTEM_PANEL_BORDER = '#E9D5FF'
const SYSTEM_PANEL_BG = '#F8FAFF'

const statusChip = (value: string) => {
  const map: Record<string, { bg: string; color: string }> = {
    pending: { bg: '#EEF2FF', color: '#4338CA' },
    in_progress: { bg: '#FEF3C7', color: '#B45309' },
    completed: { bg: '#D1FAE5', color: '#047857' },
    paid: { bg: '#D1FAE5', color: '#047857' },
    unpaid: { bg: '#FEE2E2', color: '#DC2626' },
    partially_paid: { bg: '#FEF3C7', color: '#B45309' },
    overdue: { bg: '#FEE2E2', color: '#DC2626' },
    cancelled: { bg: '#F3F4F6', color: '#6B7280' },
  }
  return map[value] || { bg: '#F3F4F6', color: '#374151' }
}

const money = (value: number | string | null | undefined) => `$${Number(value || 0).toFixed(2)}`

const formatDate = (value: string | null | undefined) => {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
}

const emptyQuotation = (): SalesQuotationPayload => ({
  facility_id: null,
  customer_name: '',
  customer_email: '',
  customer_phone: '',
  customer_address: '',
  quotation_type: 'standard',
  requested_date: new Date().toISOString().slice(0, 10),
  notes: '',
  tax_amount: 0,
  discount_amount: 0,
  items: [],
})

const emptyInvoiceDetails = (): SalesInvoiceCreatePayload => ({
  worked_hours: 0,
  setup_fee: 0,
  service_fee: 0,
  shipping_fee: 0,
  application_fee: 0,
  tax_rate: 0,
  discount_amount: 0,
  payment_method: '',
  action: '',
  due_date: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().slice(0, 10),
  notes: '',
})

const Sales = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [quotationDialog, setQuotationDialog] = useState(false)
  const [editingQuotation, setEditingQuotation] = useState<SalesQuotation | null>(null)
  const [viewQuotation, setViewQuotation] = useState<SalesQuotation | null>(null)
  const [quotationForm, setQuotationForm] = useState<SalesQuotationPayload>(emptyQuotation())
  const [selectedPartId, setSelectedPartId] = useState<number | ''>('')
  const [selectedPartQty, setSelectedPartQty] = useState(1)
  const [actionAnchor, setActionAnchor] = useState<HTMLElement | null>(null)
  const [actionQuotation, setActionQuotation] = useState<SalesQuotation | null>(null)
  const [invoiceEdit, setInvoiceEdit] = useState<SalesInvoice | null>(null)
  const [invoiceForm, setInvoiceForm] = useState({ amount_paid: 0, due_date: '', status: 'pending', payment_method: '', notes: '' })
  const [convertQuotation, setConvertQuotation] = useState<SalesQuotation | null>(null)
  const [invoiceDetails, setInvoiceDetails] = useState<SalesInvoiceCreatePayload>(emptyInvoiceDetails())

  const tab = Math.max(0, ROUTE_TABS.findIndex(path => location.pathname === path || location.pathname.startsWith(`${path}/`)))

  useEffect(() => {
    if (location.pathname === '/sales') navigate('/sales/quotations', { replace: true })
    if (location.pathname === '/sales/billing') navigate('/sales/invoices', { replace: true })
  }, [location.pathname, navigate])

  const facilitiesQ = useQuery({ queryKey: ['sales-facilities'], queryFn: () => fetchFacilities({ limit: 500 }) })
  const partsQ = useQuery({ queryKey: ['sales-parts'], queryFn: () => fetchSalesParts() })
  const quotationsQ = useQuery({ queryKey: ['sales-quotations', search], queryFn: () => fetchSalesQuotations({ search: search || undefined }) })
  const invoicesQ = useQuery({ queryKey: ['sales-invoices'], queryFn: () => fetchSalesInvoices() })
  const historyQ = useQuery({ queryKey: ['sales-history'], queryFn: fetchSalesHistory })

  const facilities = facilitiesQ.data?.items || []
  const parts = partsQ.data?.items || []
  const quotations = quotationsQ.data?.items || []
  const invoices = invoicesQ.data?.items || []
  const pendingQuotations = quotations.filter(q => q.status === 'pending')
  const inProgressQuotations = quotations.filter(q => q.status === 'in_progress')
  const completedQuotations = quotations.filter(q => q.status === 'completed')
  const inProgressTotal = inProgressQuotations.reduce((sum, quotation) => sum + Number(quotation.total_amount || 0), 0)
  const completedTotal = completedQuotations.reduce((sum, quotation) => sum + Number(quotation.total_amount || 0), 0)
  const inProgressPaid = inProgressQuotations.reduce((sum, quotation) => sum + Number(quotation.converted_invoice_amount_paid || 0), 0)
  const inProgressPaymentPercent = inProgressTotal > 0 ? Math.min(100, Math.round((inProgressPaid / inProgressTotal) * 100)) : 0

  const stats = useMemo(() => ({
    quotations: pendingQuotations.length,
    invoices: invoices.length,
    inProgress: inProgressQuotations.length,
    completed: completedQuotations.length,
    history: historyQ.data?.total || 0,
  }), [pendingQuotations.length, invoices.length, inProgressQuotations.length, completedQuotations.length, historyQ.data?.total])

  const invalidateSales = () => {
    queryClient.invalidateQueries({ queryKey: ['sales-quotations'] })
    queryClient.invalidateQueries({ queryKey: ['sales-invoices'] })
    queryClient.invalidateQueries({ queryKey: ['sales-history'] })
    queryClient.invalidateQueries({ queryKey: ['sales-parts'] })
  }

  const saveQuotationMut = useMutation({
    mutationFn: () => editingQuotation ? updateSalesQuotation(editingQuotation.id, quotationForm) : createSalesQuotation(quotationForm),
    onSuccess: () => {
      toast.success(editingQuotation ? 'Sales quotation updated' : 'Sales quotation created')
      setQuotationDialog(false)
      setEditingQuotation(null)
      setQuotationForm(emptyQuotation())
      invalidateSales()
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not save sales quotation'),
  })

  const deleteQuotationMut = useMutation({
    mutationFn: deleteSalesQuotation,
    onSuccess: () => {
      toast.success('Sales quotation deleted')
      closeActions()
      invalidateSales()
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not delete quotation'),
  })

  const convertMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: SalesInvoiceCreatePayload }) => convertSalesQuotationToInvoice(id, data),
    onSuccess: () => {
      toast.success('Quotation converted to invoice')
      setConvertQuotation(null)
      setInvoiceDetails(emptyInvoiceDetails())
      closeActions()
      invalidateSales()
      navigate('/sales/invoices')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not convert quotation'),
  })

  const cardAuthMut = useMutation({
    mutationFn: requestSalesCardAuthorization,
    onSuccess: () => {
      toast.success('Credit card authorization requested')
      closeActions()
      invalidateSales()
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not request authorization'),
  })

  const completeMut = useMutation({
    mutationFn: completeSalesQuotation,
    onSuccess: () => {
      toast.success('Sales order completed')
      closeActions()
      invalidateSales()
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not complete sales order'),
  })

  const invoiceMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => updateSalesInvoice(id, data),
    onSuccess: () => {
      toast.success('Sales invoice updated')
      setInvoiceEdit(null)
      invalidateSales()
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not update invoice'),
  })

  const selectedFacility = facilities.find(f => f.id === quotationForm.facility_id)

  const openCreate = () => {
    setEditingQuotation(null)
    setQuotationForm(emptyQuotation())
    setQuotationDialog(true)
  }

  const openEdit = (quotation: SalesQuotation) => {
    closeActions()
    setEditingQuotation(quotation)
    setQuotationForm({
      facility_id: quotation.facility_id,
      customer_name: quotation.customer_name,
      customer_email: quotation.customer_email || '',
      customer_phone: quotation.customer_phone || '',
      customer_address: quotation.customer_address || '',
      quotation_type: quotation.quotation_type || 'standard',
      requested_date: quotation.requested_date || new Date().toISOString().slice(0, 10),
      notes: quotation.notes || '',
      tax_amount: Number(quotation.tax_amount || 0),
      discount_amount: Number(quotation.discount_amount || 0),
      items: quotation.line_items.map(item => ({
        part_id: item.part_id,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        description: item.description,
      })),
    })
    setQuotationDialog(true)
  }

  const addLineItem = () => {
    const part = parts.find(item => item.id === selectedPartId)
    if (!part) return toast.error('Select a sales part first')
    if (selectedPartQty <= 0) return toast.error('Quantity must be greater than zero')
    setQuotationForm(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          part_id: part.id,
          quantity: selectedPartQty,
          unit_price: Number(part.unit_price || 0),
          description: `${part.part_number} - ${part.description}`,
        },
      ],
    }))
    setSelectedPartId('')
    setSelectedPartQty(1)
  }

  const removeLineItem = (index: number) => {
    setQuotationForm(prev => ({ ...prev, items: prev.items.filter((_, itemIndex) => itemIndex !== index) }))
  }

  const submitQuotation = () => {
    if (!quotationForm.customer_name) return toast.error('Customer name is required')
    if (quotationForm.items.length === 0) return toast.error('Add at least one sales part')
    saveQuotationMut.mutate()
  }

  const openActions = (event: MouseEvent<HTMLElement>, quotation: SalesQuotation) => {
    setActionAnchor(event.currentTarget)
    setActionQuotation(quotation)
  }

  const closeActions = () => {
    setActionAnchor(null)
    setActionQuotation(null)
  }

  const openInvoiceEdit = (invoice: SalesInvoice) => {
    setInvoiceEdit(invoice)
    setInvoiceForm({
      amount_paid: Number(invoice.amount_paid || 0),
      due_date: invoice.due_date || '',
      status: invoice.status || 'pending',
      payment_method: invoice.payment_method || '',
      notes: invoice.notes || '',
    })
  }

  const openConvertDialog = (quotation: SalesQuotation) => {
    closeActions()
    setConvertQuotation(quotation)
    setInvoiceDetails({
      ...emptyInvoiceDetails(),
      discount_amount: Number(quotation.discount_amount || 0),
      tax_rate: Number(quotation.tax_rate || 0),
      payment_method: quotation.converted_invoice_payment_method || quotation.payment_method || '',
    })
  }

  const quotationTotal = quotationForm.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0)
  const quotationGrandTotal = quotationTotal + Number(quotationForm.tax_amount || 0) - Number(quotationForm.discount_amount || 0)
  const convertPartsTotal = convertQuotation ? Number(convertQuotation.subtotal || 0) : 0
  const convertTaxAmount = convertPartsTotal * Number(invoiceDetails.tax_rate || 0) / 100
  const convertGrandTotal =
    convertPartsTotal +
    Number(invoiceDetails.worked_hours || 0) +
    Number(invoiceDetails.setup_fee || 0) +
    Number(invoiceDetails.service_fee || 0) +
    Number(invoiceDetails.shipping_fee || 0) +
    Number(invoiceDetails.application_fee || 0) +
    convertTaxAmount -
    Number(invoiceDetails.discount_amount || 0)

  const syncCustomerFromFacility = (facilityId: number | '') => {
    const facility = facilities.find(item => item.id === facilityId)
    setQuotationForm(prev => ({
      ...prev,
      facility_id: facilityId ? Number(facilityId) : null,
      customer_name: facility?.billing_name || facility?.name || prev.customer_name,
      customer_email: facility?.billing_email || facility?.email || prev.customer_email,
      customer_phone: facility?.phone || prev.customer_phone,
      customer_address: facility
        ? [facility.billing_street || facility.address, facility.billing_city || facility.city, facility.billing_state || facility.state, facility.billing_zip_code || facility.zip_code].filter(Boolean).join(', ')
        : prev.customer_address,
    }))
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

  const paymentMethodLabel = (method?: string | null) => {
    if (!method) return '-'
    const labels: Record<string, string> = {
      credit_card: 'Credit Card',
      cheque: 'Cheque',
      bank_transfer: 'Bank Transfer',
    }
    return labels[method] || method.replace(/_/g, ' ')
  }

  const quotationPaymentPercent = (quotation: SalesQuotation) => {
    const paid = Number(quotation.converted_invoice_amount_paid || 0)
    const total = Number(quotation.total_amount || 0)
    return total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0
  }

  const renderQuotationTable = (items: SalesQuotation[], emptyText: string, showComplete = false) => (
    <TableContainer>
      <Table>
        <TableHead>
          <TableRow sx={{ bgcolor: '#F9FAFB' }}>
            <TableCell sx={{ fontWeight: 900 }}>#</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Work Order</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Facility Name</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Quotation Type</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Created By</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Requested Date</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Status</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Paid</TableCell>
            <TableCell align="right" sx={{ fontWeight: 900 }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {quotationsQ.isLoading ? Array.from({ length: 5 }).map((_, index) => (
            <TableRow key={index}><TableCell colSpan={9}><Skeleton /></TableCell></TableRow>
          )) : items.length === 0 ? (
            <TableRow><TableCell colSpan={9} align="center" sx={{ py: 5, color: '#6B7280', fontWeight: 700 }}>{emptyText}</TableCell></TableRow>
          ) : items.map(item => {
            const status = statusChip(item.status)
            const paid = statusChip(item.paid_status)
            return (
              <TableRow key={item.id} hover>
                <TableCell>{item.id}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace', color: '#1E40AF', fontWeight: 900 }}>{item.work_order}</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>{item.facility_name || item.customer_name}</TableCell>
                <TableCell sx={{ textTransform: 'capitalize' }}>{item.quotation_type}</TableCell>
                <TableCell>{item.created_by_name || '-'}</TableCell>
                <TableCell>{formatDate(item.requested_date)}</TableCell>
                <TableCell><Chip size="small" label={item.status.replace('_', ' ')} sx={{ bgcolor: status.bg, color: status.color, fontWeight: 900, textTransform: 'uppercase' }} /></TableCell>
                <TableCell><Chip size="small" label={item.paid_status === 'paid' ? 'Paid' : 'Un Paid'} sx={{ bgcolor: paid.bg, color: paid.color, fontWeight: 900, textTransform: 'uppercase' }} /></TableCell>
                <TableCell align="right">
                  {item.status === 'in_progress' && (
                    <Box sx={{ minWidth: 150, mb: 1 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.4 }}>
                        <Typography sx={{ color: '#6B7280', fontSize: 11, fontWeight: 800 }}>Payment progress</Typography>
                        <Typography sx={{ color: '#1E1B4B', fontSize: 11, fontWeight: 900 }}>{quotationPaymentPercent(item)}%</Typography>
                      </Box>
                      <LinearProgress variant="determinate" value={quotationPaymentPercent(item)} sx={{ height: 8, borderRadius: 10, bgcolor: '#EEF2FF', '& .MuiLinearProgress-bar': { borderRadius: 10, bgcolor: '#7C3AED' } }} />
                    </Box>
                  )}
                  {item.status === 'completed' && (
                    <Typography sx={{ color: '#6B7280', fontSize: 12, fontWeight: 800, mb: 1 }}>
                      {paymentMethodLabel(item.converted_invoice_payment_method || item.payment_method)}
                    </Typography>
                  )}
                  {showComplete ? (
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                      <Button size="small" variant="outlined" startIcon={<VisibilityIcon />} onClick={() => setViewQuotation(item)} sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 900 }}>View</Button>
                      <Button size="small" variant="contained" startIcon={<CheckCircleIcon />} onClick={() => completeMut.mutate(item.id)} sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 900 }}>Complete</Button>
                    </Box>
                  ) : (
                    <Button
                      size="small"
                      variant="contained"
                      endIcon={<MoreVertIcon />}
                      onClick={(event) => openActions(event, item)}
                      sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 900 }}
                    >
                      Actions
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )

  const renderInvoices = () => (
    <TableContainer>
      <Table>
        <TableHead>
          <TableRow sx={{ bgcolor: '#F9FAFB' }}>
            <TableCell sx={{ fontWeight: 900 }}>Invoice #</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Work Order</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Customer</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Facility</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Amount</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Paid</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Status</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Due</TableCell>
            <TableCell align="right" sx={{ fontWeight: 900 }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {invoicesQ.isLoading ? Array.from({ length: 5 }).map((_, index) => (
            <TableRow key={index}><TableCell colSpan={9}><Skeleton /></TableCell></TableRow>
          )) : invoices.length === 0 ? (
            <TableRow><TableCell colSpan={9} align="center" sx={{ py: 5, color: '#6B7280', fontWeight: 700 }}>No sales invoices yet.</TableCell></TableRow>
          ) : invoices.map(invoice => {
            const chip = statusChip(invoice.status)
            return (
              <TableRow key={invoice.id} hover>
                <TableCell sx={{ fontFamily: 'monospace', color: '#7161D8', fontWeight: 900 }}>{invoice.invoice_number}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace', fontWeight: 800 }}>{invoice.work_order || '-'}</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>{invoice.customer_name}</TableCell>
                <TableCell>{invoice.facility_name || '-'}</TableCell>
                <TableCell sx={{ color: '#059669', fontWeight: 900 }}>{money(invoice.total_amount)}</TableCell>
                <TableCell>{money(invoice.amount_paid)}</TableCell>
                <TableCell><Chip size="small" label={invoice.status.replace('_', ' ')} sx={{ bgcolor: chip.bg, color: chip.color, fontWeight: 900, textTransform: 'uppercase' }} /></TableCell>
                <TableCell>{formatDate(invoice.due_date)}</TableCell>
                <TableCell align="right">
                  <Button size="small" variant="outlined" startIcon={<PaymentIcon />} onClick={() => openInvoiceEdit(invoice)} sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 900 }}>Update</Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )

  return (
    <Box className="page-enter" sx={{ maxWidth: 1440, mx: 'auto' }}>
      <Card sx={{ p: 3, mb: 3, borderRadius: '24px', border: '1px solid #E6E8F2', background: 'linear-gradient(135deg, #F8FAFF 0%, #F5F3FF 100%)', boxShadow: '0 18px 45px rgba(49,46,129,0.08)' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <Box>
            <Typography variant="h4" sx={{ color: '#1E1B4B', fontWeight: 900 }}>Sales Module</Typography>
            <Typography sx={{ color: '#6B7280', fontWeight: 700 }}>Create quotations from inventory parts marked for Sales, convert them to invoices, and track progress through completion.</Typography>
          </Box>
          <Button startIcon={<AddIcon />} variant="contained" onClick={openCreate} sx={{ borderRadius: '14px', px: 3, py: 1.4, textTransform: 'none', fontWeight: 900, background: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)' }}>
            New Quotation
          </Button>
        </Box>
      </Card>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(5, 1fr)' }, gap: 2, mb: 3 }}>
        {renderKpi('Quotations', stats.quotations, <AssignmentIcon />, '#4F46E5')}
        {renderKpi('Invoices', stats.invoices, <ReceiptLongIcon />, '#2563EB')}
        {renderKpi('In Progress', stats.inProgress, <ShoppingCartIcon />, '#F59E0B')}
        {renderKpi('Completed', stats.completed, <CheckCircleIcon />, '#059669')}
        {renderKpi('History', stats.history, <HistoryIcon />, '#7C3AED')}
      </Box>

      <Card sx={{ borderRadius: '24px', overflow: 'hidden', border: '1px solid #EEF0F6', boxShadow: '0 18px 45px rgba(49,46,129,0.08)' }}>
        <Tabs value={tab} onChange={(_, value) => navigate(ROUTE_TABS[value])} variant="scrollable" sx={{ px: 2, borderBottom: '1px solid #EEF0F6' }}>
          <Tab icon={<AssignmentIcon />} iconPosition="start" label="Quotations" />
          <Tab icon={<ReceiptLongIcon />} iconPosition="start" label="Invoice" />
          <Tab icon={<ShoppingCartIcon />} iconPosition="start" label="In Progress" />
          <Tab icon={<CheckCircleIcon />} iconPosition="start" label="Completed" />
          <Tab icon={<HistoryIcon />} iconPosition="start" label="History" />
        </Tabs>

        {tab === 0 && (
          <Box>
            <Box sx={{ px: 3, py: 2, display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center', borderBottom: '1px solid #EEF0F6', flexWrap: 'wrap' }}>
              <Box>
                <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Quotation Parts List</Typography>
                <Typography sx={{ color: '#6B7280', fontWeight: 700, fontSize: 13 }}>{parts.length} sales part{parts.length === 1 ? '' : 's'} available from inventory.</Typography>
              </Box>
              <TextField size="small" label="Search Facility or Work Order..." value={search} onChange={e => setSearch(e.target.value)} sx={{ minWidth: 280 }} />
            </Box>
            <Box sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', gap: 2, mb: 2, color: '#2434B6', fontWeight: 900, flexWrap: 'wrap' }}>
                {['None', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')].map(letter => <Typography key={letter} sx={{ fontWeight: 900, fontSize: 14 }}>{letter}</Typography>)}
              </Box>
              {renderQuotationTable(pendingQuotations, 'No pending sales quotations found.')}
            </Box>
          </Box>
        )}
        {tab === 1 && renderInvoices()}
        {tab === 2 && (
          <Box sx={{ p: 3 }}>
            <Card sx={{ p: 2.5, mb: 2, borderRadius: '18px', border: '1px solid #EEF0F6', bgcolor: '#F8FAFF' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 1 }}>
                <Box>
                  <Typography sx={{ color: '#6B7280', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>Total Sale In Progress</Typography>
                  <Typography sx={{ color: '#1E1B4B', fontSize: 30, fontWeight: 900 }}>{money(inProgressTotal)}</Typography>
                </Box>
                <Box sx={{ textAlign: { xs: 'left', md: 'right' } }}>
                  <Typography sx={{ color: '#6B7280', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>Payment Collected</Typography>
                  <Typography sx={{ color: '#059669', fontSize: 24, fontWeight: 900 }}>{money(inProgressPaid)}</Typography>
                </Box>
              </Box>
              <LinearProgress variant="determinate" value={inProgressPaymentPercent} sx={{ height: 10, borderRadius: 10, bgcolor: '#E0E7FF', '& .MuiLinearProgress-bar': { borderRadius: 10, bgcolor: '#7C3AED' } }} />
              <Typography sx={{ mt: 1, color: '#6B7280', fontWeight: 800, fontSize: 12 }}>{inProgressPaymentPercent}% collected across active sales.</Typography>
            </Card>
            {renderQuotationTable(inProgressQuotations, 'No sales orders in progress.', true)}
          </Box>
        )}
        {tab === 3 && (
          <Box sx={{ p: 3 }}>
            <Card sx={{ p: 2.5, mb: 2, borderRadius: '18px', border: '1px solid #EEF0F6', bgcolor: '#F7FEF9' }}>
              <Typography sx={{ color: '#6B7280', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>Total Completed Sales</Typography>
              <Typography sx={{ color: '#059669', fontSize: 30, fontWeight: 900 }}>{money(completedTotal)}</Typography>
              <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                {['credit_card', 'cheque', 'bank_transfer'].map(method => (
                  <Chip
                    key={method}
                    label={`${paymentMethodLabel(method)}: ${completedQuotations.filter(q => (q.converted_invoice_payment_method || q.payment_method) === method).length}`}
                    sx={{ fontWeight: 900, bgcolor: '#ECFDF5', color: '#047857' }}
                  />
                ))}
              </Box>
            </Card>
            {renderQuotationTable(completedQuotations, 'No completed sales orders yet.')}
          </Box>
        )}
        {tab === 4 && (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                  <TableCell sx={{ fontWeight: 900 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Work Order</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Quotation</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Customer</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Facility</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Activity</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>By</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {historyQ.isLoading ? Array.from({ length: 5 }).map((_, index) => (
                  <TableRow key={index}><TableCell colSpan={7}><Skeleton /></TableCell></TableRow>
                )) : (historyQ.data?.items || []).length === 0 ? (
                  <TableRow><TableCell colSpan={7} align="center" sx={{ py: 5, color: '#6B7280', fontWeight: 700 }}>No sales history yet.</TableCell></TableRow>
                ) : historyQ.data!.items.map((item, index) => (
                  <TableRow key={`${item.quotation_id}-${item.action}-${index}`} hover>
                    <TableCell>{formatDate(item.at)}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 900 }}>{item.work_order}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', color: '#7161D8', fontWeight: 900 }}>{item.quotation_number}</TableCell>
                    <TableCell>{item.customer_name}</TableCell>
                    <TableCell>{item.facility_name || '-'}</TableCell>
                    <TableCell sx={{ textTransform: 'capitalize', fontWeight: 800 }}>{item.action.replace(/_/g, ' ')}</TableCell>
                    <TableCell>{item.by}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      <Menu anchorEl={actionAnchor} open={Boolean(actionAnchor)} onClose={closeActions}>
        <MenuItem disabled={!actionQuotation || Boolean(actionQuotation.converted_invoice_id)} onClick={() => actionQuotation && openConvertDialog(actionQuotation)}>
          Convert to Invoice
        </MenuItem>
        <MenuItem onClick={() => actionQuotation && openEdit(actionQuotation)}>Edit</MenuItem>
        <MenuItem onClick={() => { if (actionQuotation) setViewQuotation(actionQuotation); closeActions() }}>View</MenuItem>
        <MenuItem disabled={!actionQuotation || Boolean(actionQuotation.converted_invoice_id)} onClick={() => actionQuotation && deleteQuotationMut.mutate(actionQuotation.id)} sx={{ color: '#DC2626' }}>Delete</MenuItem>
        <MenuItem onClick={() => actionQuotation && cardAuthMut.mutate(actionQuotation.id)}>Request Credit Card Authorization</MenuItem>
      </Menu>

      <Dialog open={quotationDialog} onClose={() => setQuotationDialog(false)} maxWidth="lg" fullWidth PaperProps={{ sx: { borderRadius: '22px' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>{editingQuotation ? 'Edit Sales Quotation' : 'Create Sales Quotation'}</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2, pt: 1 }}>
            <FormControl>
              <InputLabel>Facility</InputLabel>
              <Select label="Facility" value={quotationForm.facility_id || ''} onChange={e => syncCustomerFromFacility(e.target.value ? Number(e.target.value) : '')}>
                <MenuItem value="">Independent customer</MenuItem>
                {facilities.map((facility: Facility) => <MenuItem key={facility.id} value={facility.id}>{facility.name}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField label="Customer Name *" value={quotationForm.customer_name} onChange={e => setQuotationForm(prev => ({ ...prev, customer_name: e.target.value }))} />
            <TextField label="Customer Email" value={quotationForm.customer_email || ''} onChange={e => setQuotationForm(prev => ({ ...prev, customer_email: e.target.value }))} />
            <TextField label="Customer Phone" value={quotationForm.customer_phone || ''} onChange={e => setQuotationForm(prev => ({ ...prev, customer_phone: e.target.value }))} />
            <TextField select label="Quotation Type" value={quotationForm.quotation_type || 'standard'} onChange={e => setQuotationForm(prev => ({ ...prev, quotation_type: e.target.value }))}>
              <MenuItem value="standard">Standard</MenuItem>
              <MenuItem value="urgent">Urgent</MenuItem>
              <MenuItem value="contract">Contract</MenuItem>
            </TextField>
            <TextField label="Requested Date" type="date" value={quotationForm.requested_date || ''} onChange={e => setQuotationForm(prev => ({ ...prev, requested_date: e.target.value }))} InputLabelProps={{ shrink: true }} />
            <TextField label="Customer Address" value={quotationForm.customer_address || ''} onChange={e => setQuotationForm(prev => ({ ...prev, customer_address: e.target.value }))} sx={{ gridColumn: '1 / -1' }} />
          </Box>

          <Divider sx={{ my: 3 }} />
          <Typography sx={{ fontWeight: 900, color: '#1E1B4B', mb: 1 }}>Sales Parts</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 130px auto' }, gap: 2, mb: 2 }}>
            <TextField select label="Part assigned for sale" value={selectedPartId} onChange={e => setSelectedPartId(Number(e.target.value))}>
              {parts.map((part: SalesPart) => (
                <MenuItem key={part.id} value={part.id}>
                  {part.part_number} - {part.description} ({part.quantity_on_hand} available, {money(part.unit_price)})
                </MenuItem>
              ))}
            </TextField>
            <TextField label="Qty" type="number" value={selectedPartQty} onChange={e => setSelectedPartQty(Number(e.target.value))} />
            <Button startIcon={<AddIcon />} variant="contained" onClick={addLineItem} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900 }}>Add Part</Button>
          </Box>

          <TableContainer sx={{ border: '1px solid #EEF0F6', borderRadius: '16px' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                  <TableCell sx={{ fontWeight: 900 }}>Part</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Description</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Qty</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Unit Price</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Total</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 900 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {quotationForm.items.length === 0 ? (
                  <TableRow><TableCell colSpan={6} align="center" sx={{ py: 3, color: '#6B7280', fontWeight: 700 }}>No sales parts selected.</TableCell></TableRow>
                ) : quotationForm.items.map((item, index) => {
                  const part = parts.find(candidate => candidate.id === item.part_id)
                  return (
                    <TableRow key={`${item.part_id}-${index}`}>
                      <TableCell sx={{ fontFamily: 'monospace', fontWeight: 900 }}>{part?.part_number || item.part_id}</TableCell>
                      <TableCell>{item.description}</TableCell>
                      <TableCell><TextField size="small" type="number" value={item.quantity} onChange={e => setQuotationForm(prev => ({ ...prev, items: prev.items.map((line, lineIndex) => lineIndex === index ? { ...line, quantity: Number(e.target.value) } : line) }))} sx={{ width: 90 }} /></TableCell>
                      <TableCell><TextField size="small" type="number" value={item.unit_price} onChange={e => setQuotationForm(prev => ({ ...prev, items: prev.items.map((line, lineIndex) => lineIndex === index ? { ...line, unit_price: Number(e.target.value) } : line) }))} sx={{ width: 120 }} /></TableCell>
                      <TableCell sx={{ color: '#059669', fontWeight: 900 }}>{money(Number(item.quantity) * Number(item.unit_price || 0))}</TableCell>
                      <TableCell align="right"><IconButton size="small" onClick={() => removeLineItem(index)} sx={{ color: '#DC2626' }}><DeleteIcon fontSize="small" /></IconButton></TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 180px 180px 180px' }, gap: 2, mt: 2, alignItems: 'start' }}>
            <TextField label="Notes" value={quotationForm.notes || ''} onChange={e => setQuotationForm(prev => ({ ...prev, notes: e.target.value }))} multiline rows={3} />
            <TextField label="Tax" type="number" value={quotationForm.tax_amount || 0} onChange={e => setQuotationForm(prev => ({ ...prev, tax_amount: Number(e.target.value) }))} />
            <TextField label="Discount" type="number" value={quotationForm.discount_amount || 0} onChange={e => setQuotationForm(prev => ({ ...prev, discount_amount: Number(e.target.value) }))} />
            <Card sx={{ p: 2, borderRadius: '14px', bgcolor: '#F8FAFC', border: '1px solid #EEF0F6' }}>
              <Typography sx={{ color: '#6B7280', fontWeight: 900, fontSize: 12, textTransform: 'uppercase' }}>Total</Typography>
              <Typography sx={{ color: '#059669', fontWeight: 900, fontSize: 26 }}>{money(quotationGrandTotal)}</Typography>
            </Card>
          </Box>

          {selectedFacility && <Typography sx={{ color: '#8B95A7', mt: 1, fontWeight: 700, fontSize: 13 }}>Using billing details from {selectedFacility.name}.</Typography>}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setQuotationDialog(false)} sx={{ fontWeight: 900 }}>Cancel</Button>
          <Button startIcon={saveQuotationMut.isPending ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <AddIcon />} onClick={submitQuotation} variant="contained" sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none' }}>
            {editingQuotation ? 'Update Quotation' : 'Create Quotation'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(convertQuotation)} onClose={() => setConvertQuotation(null)} maxWidth="lg" fullWidth PaperProps={{ sx: { borderRadius: '22px', overflow: 'hidden' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B', textAlign: 'center' }}>
          Sale Quotation
          <Typography sx={{ color: '#6B7280', fontSize: 13, fontWeight: 700 }}>
            Acknowledgement Form
          </Typography>
        </DialogTitle>
        <DialogContent dividers sx={{ bgcolor: SYSTEM_PANEL_BG }}>
          {convertQuotation && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 340px' }, gap: 2 }}>
              <Box sx={{ display: 'grid', gap: 2 }}>
                <Card sx={{ borderRadius: '14px', overflow: 'hidden', border: `1px solid ${SYSTEM_PANEL_BORDER}`, boxShadow: '0 14px 35px rgba(49,46,129,0.08)' }}>
                  <Box sx={{ background: SYSTEM_GRADIENT, color: '#fff', px: 2, py: 1.3, fontWeight: 900 }}>About Facility and Inventory</Box>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 900 }}>Facility</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Email</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Phone</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Address</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      <TableRow>
                        <TableCell>{convertQuotation.facility_name || convertQuotation.customer_name}</TableCell>
                        <TableCell>{convertQuotation.customer_email || '-'}</TableCell>
                        <TableCell>{convertQuotation.customer_phone || '-'}</TableCell>
                        <TableCell>{convertQuotation.customer_address || '-'}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </Card>

                <Card sx={{ borderRadius: '14px', overflow: 'hidden', border: `1px solid ${SYSTEM_PANEL_BORDER}`, boxShadow: '0 14px 35px rgba(49,46,129,0.08)' }}>
                  <Box sx={{ background: SYSTEM_GRADIENT, color: '#fff', px: 2, py: 1.3, fontWeight: 900 }}>Parts Used</Box>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 900 }}>Number</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Description</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Unit Amount</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Quantity</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Condition</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 900 }}>Total</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {convertQuotation.line_items.map(line => {
                        const part = parts.find(item => item.id === line.part_id)
                        return (
                          <TableRow key={line.id}>
                            <TableCell sx={{ fontFamily: 'monospace', fontWeight: 900 }}>{line.part_number}</TableCell>
                            <TableCell>{line.description}</TableCell>
                            <TableCell>{money(line.unit_price)}</TableCell>
                            <TableCell>{line.quantity}</TableCell>
                            <TableCell>{part?.condition || '-'}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 900 }}>{money(line.total)}</TableCell>
                          </TableRow>
                        )
                      })}
                      {[
                        ['Worked Hours (0/hour)', Number(invoiceDetails.worked_hours || 0)],
                        ['Setup Fee', Number(invoiceDetails.setup_fee || 0)],
                        ['Service Fee', Number(invoiceDetails.service_fee || 0)],
                        ['Shipping Fee', Number(invoiceDetails.shipping_fee || 0)],
                        ['Application Fee', Number(invoiceDetails.application_fee || 0)],
                        ['Tax Amount on Parts', convertTaxAmount],
                      ].map(([label, value]) => (
                        <TableRow key={String(label)}>
                          <TableCell colSpan={5} align="right" sx={{ fontWeight: 900 }}>{label}</TableCell>
                          <TableCell align="right">{money(value as number)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell colSpan={5} align="right" sx={{ fontWeight: 900 }}>Grand Total</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 900 }}>{money(convertGrandTotal)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </Card>
              </Box>

              <Card sx={{ borderRadius: '14px', overflow: 'hidden', border: `1px solid ${SYSTEM_PANEL_BORDER}`, alignSelf: 'start', boxShadow: '0 14px 35px rgba(49,46,129,0.08)' }}>
                <Box sx={{ background: SYSTEM_GRADIENT, color: '#fff', px: 2, py: 1.3, fontWeight: 900, textAlign: 'center' }}>Invoice Details</Box>
                <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                  <TextField size="small" label="Worked Hours" type="number" value={invoiceDetails.worked_hours || 0} onChange={e => setInvoiceDetails(prev => ({ ...prev, worked_hours: Number(e.target.value) }))} />
                  <TextField size="small" label="Setup Fee" type="number" value={invoiceDetails.setup_fee || 0} onChange={e => setInvoiceDetails(prev => ({ ...prev, setup_fee: Number(e.target.value) }))} />
                  <TextField size="small" label="Service Fee" type="number" value={invoiceDetails.service_fee || 0} onChange={e => setInvoiceDetails(prev => ({ ...prev, service_fee: Number(e.target.value) }))} />
                  <TextField size="small" label="Shipping Fee/Delivery Fee" type="number" value={invoiceDetails.shipping_fee || 0} onChange={e => setInvoiceDetails(prev => ({ ...prev, shipping_fee: Number(e.target.value) }))} />
                  <TextField size="small" label="Application Fee" type="number" value={invoiceDetails.application_fee || 0} onChange={e => setInvoiceDetails(prev => ({ ...prev, application_fee: Number(e.target.value) }))} />
                  <TextField size="small" label="Parts" value={convertPartsTotal.toFixed(2)} InputProps={{ readOnly: true }} />
                  <TextField size="small" label="Tax Rate (%)" type="number" value={invoiceDetails.tax_rate || 0} onChange={e => setInvoiceDetails(prev => ({ ...prev, tax_rate: Number(e.target.value) }))} />
                  <TextField size="small" label="Tax Amount" value={convertTaxAmount.toFixed(2)} InputProps={{ readOnly: true }} />
                  <TextField size="small" label="Discount" type="number" value={invoiceDetails.discount_amount || 0} onChange={e => setInvoiceDetails(prev => ({ ...prev, discount_amount: Number(e.target.value) }))} />
                  <TextField size="small" label="Grand Total" value={convertGrandTotal.toFixed(2)} InputProps={{ readOnly: true }} />
                  <TextField size="small" select label="Payment Method" value={invoiceDetails.payment_method || ''} onChange={e => setInvoiceDetails(prev => ({ ...prev, payment_method: e.target.value }))} sx={{ gridColumn: '1 / -1' }}>
                    <MenuItem value="">Select payment method</MenuItem>
                    <MenuItem value="credit_card">Credit Card</MenuItem>
                    <MenuItem value="cheque">Cheque</MenuItem>
                    <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
                  </TextField>
                  <TextField size="small" select label="Select Action" value={invoiceDetails.action || ''} onChange={e => setInvoiceDetails(prev => ({ ...prev, action: e.target.value }))} sx={{ gridColumn: '1 / -1' }}>
                    <MenuItem value="">Select Action</MenuItem>
                    <MenuItem value="send_invoice">Send Invoice</MenuItem>
                    <MenuItem value="request_payment">Request Payment</MenuItem>
                    <MenuItem value="save_draft">Save Invoice Draft</MenuItem>
                  </TextField>
                  <TextField size="small" label="Due Date" type="date" value={invoiceDetails.due_date || ''} onChange={e => setInvoiceDetails(prev => ({ ...prev, due_date: e.target.value }))} InputLabelProps={{ shrink: true }} sx={{ gridColumn: '1 / -1' }} />
                  <TextField size="small" label="Notes" value={invoiceDetails.notes || ''} onChange={e => setInvoiceDetails(prev => ({ ...prev, notes: e.target.value }))} multiline rows={2} sx={{ gridColumn: '1 / -1' }} />
                </Box>
              </Card>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setConvertQuotation(null)} sx={{ fontWeight: 900 }}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!convertQuotation || convertMut.isPending}
            onClick={() => convertQuotation && convertMut.mutate({ id: convertQuotation.id, data: invoiceDetails })}
            sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none', background: SYSTEM_GRADIENT }}
          >
            {convertMut.isPending ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Convert to Invoice'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(viewQuotation)} onClose={() => setViewQuotation(null)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '22px' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>Sales Quotation Details</DialogTitle>
        <DialogContent dividers>
          {viewQuotation && (
            <Box sx={{ display: 'grid', gap: 2 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
                <Card sx={{ p: 2, borderRadius: '14px', border: '1px solid #EEF0F6' }}><Typography sx={{ fontWeight: 900 }}>Work Order</Typography><Typography>{viewQuotation.work_order}</Typography></Card>
                <Card sx={{ p: 2, borderRadius: '14px', border: '1px solid #EEF0F6' }}><Typography sx={{ fontWeight: 900 }}>Customer</Typography><Typography>{viewQuotation.customer_name}</Typography></Card>
                <Card sx={{ p: 2, borderRadius: '14px', border: '1px solid #EEF0F6' }}><Typography sx={{ fontWeight: 900 }}>Total</Typography><Typography sx={{ color: '#059669', fontWeight: 900 }}>{money(viewQuotation.total_amount)}</Typography></Card>
              </Box>
              <TableContainer>
                <Table size="small">
                  <TableHead><TableRow><TableCell>Part</TableCell><TableCell>Description</TableCell><TableCell>Qty</TableCell><TableCell>Total</TableCell></TableRow></TableHead>
                  <TableBody>{viewQuotation.line_items.map(line => <TableRow key={line.id}><TableCell>{line.part_number}</TableCell><TableCell>{line.description}</TableCell><TableCell>{line.quantity}</TableCell><TableCell>{money(line.total)}</TableCell></TableRow>)}</TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setViewQuotation(null)} variant="contained" sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none' }}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(invoiceEdit)} onClose={() => setInvoiceEdit(null)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '22px' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>Update Sales Invoice</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gap: 2, pt: 1 }}>
            <TextField label="Amount Paid" type="number" value={invoiceForm.amount_paid} onChange={e => setInvoiceForm(prev => ({ ...prev, amount_paid: Number(e.target.value) }))} />
            <TextField label="Due Date" type="date" value={invoiceForm.due_date} onChange={e => setInvoiceForm(prev => ({ ...prev, due_date: e.target.value }))} InputLabelProps={{ shrink: true }} />
            <TextField select label="Payment Method" value={invoiceForm.payment_method} onChange={e => setInvoiceForm(prev => ({ ...prev, payment_method: e.target.value }))}>
              <MenuItem value="">Not selected</MenuItem>
              <MenuItem value="credit_card">Credit Card</MenuItem>
              <MenuItem value="cheque">Cheque</MenuItem>
              <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
            </TextField>
            <TextField select label="Status" value={invoiceForm.status} onChange={e => setInvoiceForm(prev => ({ ...prev, status: e.target.value }))}>
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="partially_paid">Partially Paid</MenuItem>
              <MenuItem value="paid">Paid</MenuItem>
              <MenuItem value="overdue">Overdue</MenuItem>
              <MenuItem value="cancelled">Cancelled</MenuItem>
            </TextField>
            <TextField label="Notes" value={invoiceForm.notes} onChange={e => setInvoiceForm(prev => ({ ...prev, notes: e.target.value }))} multiline rows={3} />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setInvoiceEdit(null)} sx={{ fontWeight: 900 }}>Cancel</Button>
          <Button onClick={() => invoiceEdit && invoiceMut.mutate({ id: invoiceEdit.id, data: invoiceForm })} variant="contained" sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none' }}>
            Save Invoice
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default Sales
