import { type MouseEvent, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Avatar, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, FormControl, IconButton, InputLabel, Menu, MenuItem, Select,
  Skeleton, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs,
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
  type SalesPart,
  type SalesQuotation,
  type SalesQuotationPayload,
} from '@/api/sales'

const ROUTE_TABS = ['/sales/quotations', '/sales/invoices', '/sales/in-progress', '/sales/completed', '/sales/history']

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
  const [invoiceForm, setInvoiceForm] = useState({ amount_paid: 0, due_date: '', status: 'pending', notes: '' })

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
    mutationFn: convertSalesQuotationToInvoice,
    onSuccess: () => {
      toast.success('Quotation converted to invoice')
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
      notes: invoice.notes || '',
    })
  }

  const quotationTotal = quotationForm.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0)
  const quotationGrandTotal = quotationTotal + Number(quotationForm.tax_amount || 0) - Number(quotationForm.discount_amount || 0)

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
        {tab === 2 && <Box sx={{ p: 3 }}>{renderQuotationTable(inProgressQuotations, 'No sales orders in progress.', true)}</Box>}
        {tab === 3 && <Box sx={{ p: 3 }}>{renderQuotationTable(completedQuotations, 'No completed sales orders yet.')}</Box>}
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
        <MenuItem disabled={!actionQuotation || Boolean(actionQuotation.converted_invoice_id)} onClick={() => actionQuotation && convertMut.mutate(actionQuotation.id)}>
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
