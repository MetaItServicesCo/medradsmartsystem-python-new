import { Fragment, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Avatar, Box, Button, Card, Chip, CircularProgress, Collapse, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider, FormControl,
  FormControlLabel, FormLabel, IconButton, Radio, RadioGroup, Skeleton,
  Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Tabs, TextField, Typography,
} from '@mui/material'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CreditCardIcon from '@mui/icons-material/CreditCard'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import FilterListIcon from '@mui/icons-material/FilterList'
import PaymentIcon from '@mui/icons-material/Payment'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import { toast } from 'react-toastify'

import { fetchInspectionQuotations, updateInspectionInvoice, type InspectionInvoice } from '@/api/inspections'
import { fetchRentalInvoices, updateRentalInvoice, type RentalInvoice } from '@/api/rentals'
import { fetchSalesInvoices, updateSalesInvoice, type SalesInvoice } from '@/api/sales'
import {
  createQuotationPayment,
  fetchAllQuotations,
  type QuotationPaymentCreate,
  type ServiceRequestQuotationList,
} from '@/api/serviceRequests'
import { useAuthStore } from '@/stores/authStore'

type BillingSource = 'service' | 'inspection' | 'sales' | 'rental'
type BillingStatus = 'draft' | 'sent' | 'approved' | 'pending' | 'partially_paid' | 'paid' | 'overdue' | 'rejected' | 'cancelled'
type PayMethod = 'credit_card' | 'ach'
type AchChoice = 'ach' | 'mbmts_ach'

interface BillingItem {
  key: string
  source: BillingSource
  id: number
  number: string
  relatedNumber: string
  facility: string
  customer: string
  description: string
  amount: number
  paid: number
  balance: number
  status: BillingStatus | string
  date: string | null
  dueDate?: string | null
  paymentMethod?: string | null
  raw: ServiceRequestQuotationList | InspectionInvoice | SalesInvoice | RentalInvoice
}

const SOURCE_LABEL: Record<BillingSource, string> = {
  service: 'Service',
  inspection: 'Inspection',
  sales: 'Sales',
  rental: 'Rental',
}

const STATUS_CHIP: Record<string, { bg: string; color: string }> = {
  draft: { bg: '#FEF3C7', color: '#B45309' },
  sent: { bg: '#DBEAFE', color: '#1D4ED8' },
  approved: { bg: '#D1FAE5', color: '#047857' },
  pending: { bg: '#EEF2FF', color: '#4338CA' },
  partially_paid: { bg: '#FEF3C7', color: '#B45309' },
  paid: { bg: '#D1FAE5', color: '#047857' },
  overdue: { bg: '#FEE2E2', color: '#DC2626' },
  rejected: { bg: '#FEE2E2', color: '#DC2626' },
  cancelled: { bg: '#F3F4F6', color: '#6B7280' },
}

const SOURCE_COLOR: Record<BillingSource, string> = {
  service: '#7C3AED',
  inspection: '#2563EB',
  sales: '#059669',
  rental: '#D97706',
}

const money = (value: number | string | null | undefined) => `$${Number(value || 0).toFixed(2)}`

const formatDate = (value: string | null | undefined) => {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const methodLabel = (value?: string | null) => {
  if (!value) return '-'
  return value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}

const invoiceStatusForPayment = (total: number, paid: number): 'pending' | 'partially_paid' | 'paid' => {
  if (paid <= 0) return 'pending'
  if (paid >= total) return 'paid'
  return 'partially_paid'
}

const Billing = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore(s => s.user)
  const canPay = ['superadmin', 'admin', 'hr_manager'].includes(user?.role || '')

  const [sourceFilter, setSourceFilter] = useState<'all' | BillingSource>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [payOpen, setPayOpen] = useState<BillingItem | null>(null)
  const [tab, setTab] = useState(0)

  const [payMethod, setPayMethod] = useState<PayMethod>('credit_card')
  const [achChoice, setAchChoice] = useState<AchChoice>('ach')
  const [payAmount, setPayAmount] = useState('')
  const [payNotes, setPayNotes] = useState('')
  const [ccName, setCcName] = useState('')
  const [ccNumber, setCcNumber] = useState('')
  const [ccExpiry, setCcExpiry] = useState('')
  const [ccCvv, setCcCvv] = useState('')
  const [payBankName, setPayBankName] = useState('')
  const [payAcctLast4, setPayAcctLast4] = useState('')
  const [payRoutingLast4, setPayRoutingLast4] = useState('')

  const serviceQ = useQuery({ queryKey: ['billing-service-quotations'], queryFn: fetchAllQuotations })
  const inspectionQ = useQuery({ queryKey: ['billing-inspection-invoices'], queryFn: fetchInspectionQuotations })
  const salesQ = useQuery({ queryKey: ['billing-sales-invoices'], queryFn: () => fetchSalesInvoices() })
  const rentalsQ = useQuery({ queryKey: ['billing-rental-invoices'], queryFn: () => fetchRentalInvoices() })

  const isLoading = serviceQ.isLoading || inspectionQ.isLoading || salesQ.isLoading || rentalsQ.isLoading

  const items = useMemo<BillingItem[]>(() => {
    const serviceItems = (serviceQ.data || []).map((q): BillingItem => {
      const amount = Number(q.amount || 0)
      const paid = (q.payments || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
      return {
        key: `service-${q.id}`,
        source: 'service',
        id: q.id,
        number: q.quotation_number || `Q-${q.id}`,
        relatedNumber: q.request_number || '-',
        facility: q.facility_name || '-',
        customer: q.facility_name || '-',
        description: q.description || 'Service quotation',
        amount,
        paid,
        balance: Math.max(0, amount - paid),
        status: q.status,
        date: q.created_at,
        raw: q,
      }
    })

    const inspectionItems = (inspectionQ.data?.items || []).map((invoice): BillingItem => ({
      key: `inspection-${invoice.id}`,
      source: 'inspection',
      id: invoice.id,
      number: invoice.invoice_number,
      relatedNumber: invoice.inspection_number || '-',
      facility: invoice.facility_name || '-',
      customer: invoice.customer_name,
      description: invoice.inventory_part_name || 'Inspection invoice',
      amount: Number(invoice.total_amount || 0),
      paid: Number(invoice.amount_paid || 0),
      balance: Number(invoice.balance_due || 0),
      status: invoice.status,
      date: invoice.issue_date || invoice.created_at,
      dueDate: invoice.due_date,
      raw: invoice,
    }))

    const salesItems = (salesQ.data?.items || []).map((invoice): BillingItem => ({
      key: `sales-${invoice.id}`,
      source: 'sales',
      id: invoice.id,
      number: invoice.invoice_number,
      relatedNumber: invoice.work_order || invoice.sales_quotation_number || '-',
      facility: invoice.facility_name || '-',
      customer: invoice.customer_name,
      description: 'Sales invoice',
      amount: Number(invoice.total_amount || 0),
      paid: Number(invoice.amount_paid || 0),
      balance: Number(invoice.balance_due || 0),
      status: invoice.status,
      date: invoice.issue_date || invoice.created_at,
      dueDate: invoice.due_date,
      paymentMethod: invoice.payment_method,
      raw: invoice,
    }))

    const rentalItems = (rentalsQ.data?.items || []).map((invoice): BillingItem => ({
      key: `rental-${invoice.id}`,
      source: 'rental',
      id: invoice.id,
      number: invoice.invoice_number,
      relatedNumber: invoice.rental_number || '-',
      facility: invoice.facility_name || '-',
      customer: invoice.customer_name,
      description: 'Rental invoice',
      amount: Number(invoice.total_amount || 0),
      paid: Number(invoice.amount_paid || 0),
      balance: Number(invoice.balance_due || 0),
      status: invoice.status,
      date: invoice.issue_date || invoice.created_at,
      dueDate: invoice.due_date,
      paymentMethod: invoice.payment_method,
      raw: invoice,
    }))

    return [...serviceItems, ...inspectionItems, ...salesItems, ...rentalItems]
      .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
  }, [inspectionQ.data, rentalsQ.data, salesQ.data, serviceQ.data])

  const filteredItems = items.filter(item => {
    if (sourceFilter !== 'all' && item.source !== sourceFilter) return false
    if (statusFilter !== 'all' && item.status !== statusFilter) return false
    if (tab === 1) return item.balance > 0 && item.status !== 'cancelled' && item.status !== 'rejected'
    if (tab === 2) return item.status === 'paid' || item.balance <= 0
    return true
  })

  const totals = useMemo(() => {
    const outstanding = items.filter(item => item.balance > 0).reduce((sum, item) => sum + item.balance, 0)
    const paid = items.reduce((sum, item) => sum + item.paid, 0)
    return { outstanding, paid, total: items.reduce((sum, item) => sum + item.amount, 0), count: items.length }
  }, [items])

  const invalidateBilling = () => {
    queryClient.invalidateQueries({ queryKey: ['billing-service-quotations'] })
    queryClient.invalidateQueries({ queryKey: ['billing-inspection-invoices'] })
    queryClient.invalidateQueries({ queryKey: ['billing-sales-invoices'] })
    queryClient.invalidateQueries({ queryKey: ['billing-rental-invoices'] })
    queryClient.invalidateQueries({ queryKey: ['billing-quotations'] })
    queryClient.invalidateQueries({ queryKey: ['sales-invoices'] })
    queryClient.invalidateQueries({ queryKey: ['rental-invoices'] })
    queryClient.invalidateQueries({ queryKey: ['inspection-quotations'] })
  }

  const servicePayMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: QuotationPaymentCreate }) => createQuotationPayment(id, data),
    onSuccess: () => {
      toast.success('Payment recorded')
      closePayDialog()
      invalidateBilling()
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to record payment'),
  })

  const invoicePayMut = useMutation({
    mutationFn: async ({ item, amount, method, notes }: { item: BillingItem; amount: number; method: string; notes?: string }) => {
      const nextPaid = Math.min(item.amount, item.paid + amount)
      const status = invoiceStatusForPayment(item.amount, nextPaid)
      const existingNotes = 'notes' in item.raw ? item.raw.notes : null
      const commonNotes = [existingNotes, notes, `Payment method: ${methodLabel(method)}`].filter(Boolean).join('\n')

      if (item.source === 'sales') {
        return updateSalesInvoice(item.id, { amount_paid: nextPaid, status, payment_method: method, notes: commonNotes })
      }
      if (item.source === 'rental') {
        return updateRentalInvoice(item.id, { amount_paid: nextPaid, status, payment_method: method, notes: commonNotes })
      }
      return updateInspectionInvoice(item.id, { amount_paid: nextPaid, status, notes: commonNotes })
    },
    onSuccess: () => {
      toast.success('Invoice payment updated')
      closePayDialog()
      invalidateBilling()
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update invoice payment'),
  })

  const resetPayForm = () => {
    setPayMethod('credit_card')
    setAchChoice('ach')
    setPayAmount('')
    setPayNotes('')
    setCcName('')
    setCcNumber('')
    setCcExpiry('')
    setCcCvv('')
    setPayBankName('')
    setPayAcctLast4('')
    setPayRoutingLast4('')
  }

  const closePayDialog = () => {
    setPayOpen(null)
    resetPayForm()
  }

  const openPayment = (item: BillingItem) => {
    setPayOpen(item)
    setPayAmount(String(Math.max(0, item.balance || item.amount).toFixed(2)))
  }

  const handlePay = () => {
    if (!payOpen) return
    const amount = Number(payAmount)
    if (!amount || amount <= 0) {
      toast.error('Enter a valid payment amount')
      return
    }
    const actualMethod = payMethod === 'ach' ? achChoice : payMethod
    const notes = payNotes || undefined

    if (payOpen.source === 'service') {
      const data: QuotationPaymentCreate = {
        payment_method: actualMethod as any,
        amount,
        notes,
      }
      if (actualMethod === 'credit_card') {
        const digits = ccNumber.replace(/\s/g, '')
        data.account_last_four = digits.slice(-4) || undefined
        data.bank_name = ccName || undefined
      }
      if (actualMethod === 'ach') {
        data.bank_name = payBankName || undefined
        data.account_last_four = payAcctLast4 || undefined
        data.routing_number_last_four = payRoutingLast4 || undefined
      }
      if (actualMethod === 'mbmts_ach') {
        data.mbmts_account_name = 'Mr. Biomed Tech Services'
        data.mbmts_routing_number = '111000614'
        data.mbmts_account_number = '818388071'
        data.mbmts_bank_name = 'Chase Business Banking'
        data.mbmts_bank_address = '555 N. 5th Street Suite 109B, Garland, TX 75040'
      }
      servicePayMut.mutate({ id: payOpen.id, data })
      return
    }

    invoicePayMut.mutate({ item: payOpen, amount, method: actualMethod, notes })
  }

  const paying = servicePayMut.isPending || invoicePayMut.isPending

  return (
    <Box className="page-enter" sx={{ maxWidth: 1500, mx: 'auto' }}>
      <Card sx={{ mb: 3, p: 3, borderRadius: '28px', border: '1px solid #E9E5FF', background: 'linear-gradient(135deg, #F8FAFF 0%, #F5F3FF 100%)', boxShadow: '0 18px 45px rgba(49,46,129,0.08)', position: 'relative', overflow: 'hidden' }}>
        <Box sx={{ position: 'absolute', right: -18, top: -20, color: '#7C3AED', opacity: 0.08 }}>
          <ReceiptLongIcon sx={{ fontSize: 160 }} />
        </Box>
        <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
              <Avatar sx={{ width: 52, height: 52, borderRadius: '18px', background: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)' }}>
                <PaymentIcon />
              </Avatar>
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 900, color: '#1E1B4B' }}>Billing & Payments</Typography>
                <Typography sx={{ color: '#6B7280', fontWeight: 700 }}>Unified payment workflow for service, inspection, sales, and rental billing.</Typography>
              </Box>
            </Box>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(4, 150px)' }, gap: 1.5 }}>
            <Kpi label="Outstanding" value={money(totals.outstanding)} color="#DC2626" />
            <Kpi label="Paid" value={money(totals.paid)} color="#059669" />
            <Kpi label="Total" value={money(totals.total)} color="#7C3AED" />
            <Kpi label="Records" value={String(totals.count)} color="#2563EB" />
          </Box>
        </Box>
      </Card>

      <Card sx={{ mb: 3, p: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', borderRadius: '24px', border: '1px solid #EEF0F6', boxShadow: '0 14px 34px rgba(49,46,129,0.07)' }}>
        <FilterListIcon sx={{ color: '#6B7280' }} />
        <Typography sx={{ fontWeight: 900, color: '#374151', fontSize: '0.9rem' }}>Source:</Typography>
        {(['all', 'service', 'inspection', 'sales', 'rental'] as const).map(source => (
          <Chip
            key={source}
            label={source === 'all' ? 'All' : SOURCE_LABEL[source]}
            onClick={() => setSourceFilter(source)}
            sx={{ fontWeight: 800, cursor: 'pointer', bgcolor: sourceFilter === source ? '#7C3AED' : '#F3F4F6', color: sourceFilter === source ? '#fff' : '#374151' }}
          />
        ))}
        <Divider flexItem orientation="vertical" sx={{ mx: 1 }} />
        <Typography sx={{ fontWeight: 900, color: '#374151', fontSize: '0.9rem' }}>Status:</Typography>
        {['all', 'pending', 'partially_paid', 'paid', 'overdue', 'approved'].map(status => (
          <Chip
            key={status}
            label={status === 'all' ? 'All' : methodLabel(status)}
            onClick={() => setStatusFilter(status)}
            sx={{ fontWeight: 800, cursor: 'pointer', bgcolor: statusFilter === status ? '#EC4899' : '#F3F4F6', color: statusFilter === status ? '#fff' : '#374151' }}
          />
        ))}
      </Card>

      <Card sx={{ borderRadius: '24px', border: '1px solid #EEF0F6', overflow: 'hidden', boxShadow: '0 18px 45px rgba(49,46,129,0.08)' }}>
        <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ px: 2, borderBottom: '1px solid #EEF0F6', '& .Mui-selected': { color: '#7C3AED !important', fontWeight: 900 } }}>
          <Tab label="All Billing" />
          <Tab label="Outstanding" />
          <Tab label="Paid" />
        </Tabs>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                <TableCell sx={{ fontWeight: 900 }}>Type</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Billing #</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Related #</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Facility / Customer</TableCell>
                <TableCell sx={{ fontWeight: 900 }} align="right">Total</TableCell>
                <TableCell sx={{ fontWeight: 900 }} align="right">Paid</TableCell>
                <TableCell sx={{ fontWeight: 900 }} align="right">Balance</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 900 }}>Due</TableCell>
                <TableCell sx={{ fontWeight: 900 }} align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={index}>{Array.from({ length: 10 }).map((__, cell) => <TableCell key={cell}><Skeleton /></TableCell>)}</TableRow>
              )) : filteredItems.length === 0 ? (
                <TableRow><TableCell colSpan={10} align="center" sx={{ py: 6, color: '#6B7280', fontWeight: 800 }}>No billing records found.</TableCell></TableRow>
              ) : filteredItems.map(item => {
                const expanded = expandedKey === item.key
                const chip = STATUS_CHIP[item.status] || STATUS_CHIP.pending
                return (
                  <Fragment key={item.key}>
                    <TableRow key={item.key} hover>
                      <TableCell>
                        <Chip label={SOURCE_LABEL[item.source]} sx={{ bgcolor: `${SOURCE_COLOR[item.source]}16`, color: SOURCE_COLOR[item.source], fontWeight: 900 }} />
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontWeight: 900, color: '#5B21B6' }}>{item.number}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontWeight: 800 }}>{item.relatedNumber}</TableCell>
                      <TableCell>
                        <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>{item.facility}</Typography>
                        <Typography sx={{ color: '#8B95A7', fontSize: 13 }}>{item.customer}</Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 900 }}>{money(item.amount)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 900, color: '#059669' }}>{money(item.paid)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 900, color: item.balance > 0 ? '#DC2626' : '#059669' }}>{money(item.balance)}</TableCell>
                      <TableCell><Chip label={methodLabel(item.status)} sx={{ bgcolor: chip.bg, color: chip.color, fontWeight: 900 }} /></TableCell>
                      <TableCell>{formatDate(item.dueDate || item.date)}</TableCell>
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'flex-end' }}>
                          {canPay && item.balance > 0 && (
                            <Button
                              size="small"
                              variant="contained"
                              startIcon={<PaymentIcon />}
                              onClick={() => openPayment(item)}
                              sx={{ borderRadius: '10px', fontWeight: 900, textTransform: 'none', background: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)' }}
                            >
                              Pay
                            </Button>
                          )}
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<VisibilityOutlinedIcon />}
                            onClick={() => {
                              if (item.source === 'service') navigate(`/service-requests/${(item.raw as ServiceRequestQuotationList).service_request_id}`)
                              if (item.source === 'sales') navigate('/sales/invoices')
                              if (item.source === 'rental') navigate('/rentals/invoices')
                              if (item.source === 'inspection') navigate('/inspections')
                            }}
                            sx={{ borderRadius: '10px', fontWeight: 800, textTransform: 'none' }}
                          >
                            View
                          </Button>
                          <IconButton size="small" onClick={() => setExpandedKey(expanded ? null : item.key)}>
                            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                          </IconButton>
                        </Box>
                      </TableCell>
                    </TableRow>
                    <TableRow key={`${item.key}-details`}>
                      <TableCell colSpan={10} sx={{ py: 0, border: expanded ? undefined : 'none' }}>
                        <Collapse in={expanded}>
                          <BillingDetails item={item} />
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Dialog open={Boolean(payOpen)} onClose={closePayDialog} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '22px' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PaymentIcon sx={{ color: '#7C3AED' }} />
            Record Payment
          </Box>
          {payOpen && (
            <Typography sx={{ fontSize: 13, color: '#6B7280', mt: 0.5 }}>
              {SOURCE_LABEL[payOpen.source]}: <strong>{payOpen.number}</strong> · Balance <strong>{money(payOpen.balance)}</strong>
            </Typography>
          )}
        </DialogTitle>
        <DialogContent dividers>
          <FormControl sx={{ mt: 1, mb: 2 }}>
            <FormLabel sx={{ fontWeight: 800, mb: 1 }}>Payment Method</FormLabel>
            <RadioGroup row value={payMethod} onChange={e => { setPayMethod(e.target.value as PayMethod); setAchChoice('ach') }}>
              <FormControlLabel value="credit_card" control={<Radio />} label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><CreditCardIcon fontSize="small" /> Credit Card</Box>} />
              <FormControlLabel value="ach" control={<Radio />} label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><AccountBalanceIcon fontSize="small" /> ACH</Box>} />
            </RadioGroup>
          </FormControl>

          {payMethod === 'ach' && (
            <Box sx={{ mb: 2, p: 2, bgcolor: '#F5F3FF', borderRadius: '14px' }}>
              <FormLabel sx={{ fontWeight: 800, fontSize: 14 }}>ACH Option</FormLabel>
              <RadioGroup value={achChoice} onChange={e => setAchChoice(e.target.value as AchChoice)}>
                <FormControlLabel value="ach" control={<Radio size="small" />} label="Pay through ACH" />
                <FormControlLabel value="mbmts_ach" control={<Radio size="small" />} label="Pay through MBMTS ACH" />
              </RadioGroup>
            </Box>
          )}

          <TextField label="Amount ($)" type="number" fullWidth value={payAmount} onChange={e => setPayAmount(e.target.value)} sx={{ mb: 2 }} inputProps={{ min: 0, step: 0.01 }} />
          <TextField label="Notes" multiline rows={2} fullWidth value={payNotes} onChange={e => setPayNotes(e.target.value)} sx={{ mb: 2 }} />

          {payMethod === 'credit_card' && (
            <Box sx={{ display: 'grid', gap: 1.5, p: 2, bgcolor: '#EFF6FF', borderRadius: '14px', border: '1px solid rgba(29,78,216,0.12)' }}>
              <Typography sx={{ fontWeight: 900, color: '#1D4ED8' }}>Credit Card Details</Typography>
              <TextField size="small" label="Cardholder Name" value={ccName} onChange={e => setCcName(e.target.value)} fullWidth />
              <TextField size="small" label="Card Number" value={ccNumber} onChange={e => {
                const value = e.target.value.replace(/\D/g, '').slice(0, 16)
                setCcNumber(value.replace(/(\d{4})(?=\d)/g, '$1 ').trim())
              }} fullWidth inputProps={{ maxLength: 19 }} placeholder="0000 0000 0000 0000" />
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <TextField size="small" label="Expiry (MM/YY)" value={ccExpiry} onChange={e => {
                  let value = e.target.value.replace(/\D/g, '').slice(0, 4)
                  if (value.length > 2) value = `${value.slice(0, 2)}/${value.slice(2)}`
                  setCcExpiry(value)
                }} sx={{ flex: 1 }} inputProps={{ maxLength: 5 }} placeholder="MM/YY" />
                <TextField size="small" label="CVV" value={ccCvv} onChange={e => setCcCvv(e.target.value.replace(/\D/g, '').slice(0, 4))} sx={{ flex: 1 }} inputProps={{ maxLength: 4 }} placeholder="123" />
              </Box>
            </Box>
          )}

          {payMethod === 'ach' && achChoice === 'ach' && (
            <Box sx={{ display: 'grid', gap: 1.5, p: 2, bgcolor: '#F0FDF4', borderRadius: '14px' }}>
              <Typography sx={{ fontWeight: 900, color: '#047857' }}>ACH Details</Typography>
              <TextField size="small" label="Bank Name" value={payBankName} onChange={e => setPayBankName(e.target.value)} />
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <TextField size="small" label="Account Last 4" value={payAcctLast4} onChange={e => setPayAcctLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} sx={{ flex: 1 }} />
                <TextField size="small" label="Routing Last 4" value={payRoutingLast4} onChange={e => setPayRoutingLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} sx={{ flex: 1 }} />
              </Box>
            </Box>
          )}

          {payMethod === 'ach' && achChoice === 'mbmts_ach' && (
            <Box sx={{ p: 2.5, bgcolor: '#FDF4FF', borderRadius: '14px', border: '1px solid rgba(162,28,175,0.15)' }}>
              <Typography sx={{ fontWeight: 900, color: '#A21CAF', mb: 0.5, textAlign: 'center' }}>ACH Authorization Form</Typography>
              <Typography sx={{ fontSize: 12, color: '#9CA3AF', mb: 2, textAlign: 'center' }}>Use the listed information for MBMTS ACH payment.</Typography>
              <Divider sx={{ mb: 2 }} />
              {[
                { label: 'Business Name', value: 'Mr. Biomed Tech Services' },
                { label: 'Owner Name', value: 'Omar Ahmad' },
                { label: 'Address', value: '555 N. 5th Street Suite 109B' },
                { label: 'City, State, Zip', value: 'Garland, TX 75040' },
                { label: 'Name of Bank', value: 'Chase Business Banking' },
                { label: 'Account #', value: '818388071' },
                { label: '9-Digit Routing #', value: '111000614' },
                { label: 'Type of Account', value: 'Checking' },
              ].map(row => (
                <Box key={row.label} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.8, borderBottom: '1px solid #F3E8FF', gap: 2 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#6B7280' }}>{row.label}</Typography>
                  <Typography sx={{ fontSize: 13, fontWeight: 900, color: '#1E1B4B', textAlign: 'right' }}>{row.value}</Typography>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={closePayDialog} sx={{ fontWeight: 900 }}>Cancel</Button>
          <Button onClick={handlePay} variant="contained" disabled={paying || !payAmount} sx={{ borderRadius: '12px', fontWeight: 900, background: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)' }}>
            {paying ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Record Payment'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

const Kpi = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <Box sx={{ p: 2, bgcolor: '#fff', borderRadius: '18px', border: '1px solid #ECEBFF' }}>
    <Typography sx={{ fontSize: 11, fontWeight: 900, color: '#6B7280', textTransform: 'uppercase' }}>{label}</Typography>
    <Typography sx={{ fontWeight: 900, fontSize: 22, color }}>{value}</Typography>
  </Box>
)

const BillingDetails = ({ item }: { item: BillingItem }) => {
  const service = item.source === 'service' ? item.raw as ServiceRequestQuotationList : null
  return (
    <Box sx={{ p: 2.5, bgcolor: '#FBFCFF' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
        <Box>
          <Typography sx={{ fontWeight: 900, color: '#1E1B4B', mb: 1 }}>Billing Details</Typography>
          <Typography sx={{ color: '#6B7280', fontWeight: 700 }}>{item.description}</Typography>
          <Typography sx={{ color: '#8B95A7', fontSize: 13 }}>Issued: {formatDate(item.date)} · Due: {formatDate(item.dueDate || item.date)}</Typography>
          <Typography sx={{ color: '#8B95A7', fontSize: 13 }}>Payment method: {methodLabel(item.paymentMethod)}</Typography>
        </Box>
        <Box>
          <Typography sx={{ fontWeight: 900, color: '#1E1B4B', mb: 1 }}>Payment History</Typography>
          {service?.payments?.length ? service.payments.map(payment => (
            <Box key={payment.id} sx={{ display: 'flex', gap: 1, alignItems: 'center', p: 1.5, mb: 1, borderRadius: '12px', bgcolor: '#F0FDF4' }}>
              <CheckCircleIcon sx={{ color: '#10B981', fontSize: 18 }} />
              <Box>
                <Typography sx={{ fontWeight: 900, color: '#047857', fontSize: 13 }}>{money(payment.amount)} · {methodLabel(payment.payment_method)}</Typography>
                <Typography sx={{ color: '#8B95A7', fontSize: 12 }}>Ref: {payment.reference_number || '-'} · {formatDate(payment.paid_at)}</Typography>
              </Box>
            </Box>
          )) : (
            <Typography sx={{ color: '#9CA3AF', fontWeight: 700 }}>No separate payment history available for this record.</Typography>
          )}
        </Box>
      </Box>
    </Box>
  )
}

export default Billing
