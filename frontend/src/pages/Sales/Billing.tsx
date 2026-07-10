import { Fragment, useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Avatar, Box, Button, Card, Chip, CircularProgress, Collapse, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider, FormControl,
  FormControlLabel, FormLabel, IconButton, Radio, RadioGroup, Skeleton,
  Tab, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow,
  Tabs, TextField, Tooltip, Typography,
} from '@mui/material'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CreditCardIcon from '@mui/icons-material/CreditCard'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import FilterListIcon from '@mui/icons-material/FilterList'
import PaymentIcon from '@mui/icons-material/Payment'
import PrintIcon from '@mui/icons-material/Print'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import { toast } from 'react-toastify'

import { fetchAllInspectionQuotations, updateInspectionInvoice, type InspectionInvoice } from '@/api/inspections'
import { fetchRentalInvoices, updateRentalInvoice, type RentalInvoice } from '@/api/rentals'
import { fetchSalesInvoices, updateSalesInvoice, type SalesInvoice } from '@/api/sales'
import {
  createQuotationPayment,
  fetchAllQuotations,
  fetchAllServiceInvoices,
  fetchServiceRequest,
  updateServiceInvoice,
  type QuotationPaymentCreate,
  type ServiceInvoice,
  type ServiceRequestQuotationList,
} from '@/api/serviceRequests'
import InvoicePrintDialog, { type PrintableLedgerTransaction, type PrintableLineItem } from '@/components/Billing/InvoicePrintDialog'
import { useAuthStore } from '@/stores/authStore'
import { hasPermission } from '@/config/permissions'
import { buildServiceReportSheet } from '@/utils/serviceReportHtml'

type BillingSource = 'service' | 'inspection' | 'sales' | 'rental'
type BillingStatus = 'draft' | 'sent' | 'approved' | 'pending' | 'partially_paid' | 'paid' | 'overdue' | 'rejected' | 'cancelled'
type PayMethod = 'credit_card' | 'ach'
type AchChoice = 'ach' | 'mbmts_ach'

interface BillingItem {
  key: string
  source: BillingSource
  billingKind?: 'service_invoice' | 'service_quotation'
  id: number
  facilityId?: number | null
  number: string
  relatedNumber: string
  facility: string
  customer: string
  customerEmail?: string | null
  description: string
  amount: number
  paid: number
  balance: number
  status: BillingStatus | string
  date: string | null
  dueDate?: string | null
  paymentMethod?: string | null
  transactions?: BillingTransaction[]
  raw: ServiceRequestQuotationList | ServiceInvoice | InspectionInvoice | SalesInvoice | RentalInvoice
}

interface BillingTransaction {
  id?: number
  invoice_id?: number
  transaction_type: string
  amount: number
  payment_method?: string | null
  reference_number?: string | null
  description?: string | null
  created_by_name?: string | null
  created_at?: string | null
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

const billingTypeLabel = (item: BillingItem) => {
  if (item.source === 'service') {
    return item.billingKind === 'service_invoice' ? 'Service Invoice' : 'Service Quote'
  }
  if (item.source === 'inspection') {
    return (item.raw as InspectionInvoice).inspection_batch_id ? 'Inspection Batch Invoice' : 'Inspection Invoice'
  }
  return SOURCE_LABEL[item.source]
}

const ValueBox = ({
  value,
  maxWidth,
  color = '#1E1B4B',
  fontWeight = 800,
  fontSize,
  fontFamily,
  bgcolor = '#F7F4FF',
  borderColor = '#E4D7FF',
  minHeight = 38,
  align = 'left',
}: {
  value?: string | number | null
  maxWidth: number | string
  color?: string
  fontWeight?: number
  fontSize?: number
  fontFamily?: string
  bgcolor?: string
  borderColor?: string
  minHeight?: number
  align?: 'left' | 'right' | 'center'
}) => {
  const text = value === null || value === undefined || value === '' ? '-' : String(value)

  return (
    <Tooltip title={text} arrow placement="top">
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          maxWidth,
          minHeight,
          ml: align === 'right' ? 'auto' : undefined,
          mx: align === 'center' ? 'auto' : undefined,
          px: 1.5,
          py: 0.75,
          borderRadius: '12px',
          border: `1px solid ${borderColor}`,
          bgcolor,
          boxSizing: 'border-box',
        }}
      >
        <Typography
          component="span"
          sx={{
            display: 'block',
            width: '100%',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color,
            fontWeight,
            fontSize,
            fontFamily,
            lineHeight: 1.35,
            textAlign: align,
          }}
        >
          {text}
        </Typography>
      </Box>
    </Tooltip>
  )
}

const normalizeDisplayText = (value?: string | number | null) => (
  value === null || value === undefined ? '' : String(value).trim().toLowerCase().replace(/\s+/g, ' ')
)

const EntityValueBox = ({
  primary,
  secondary,
  maxWidth,
}: {
  primary?: string | number | null
  secondary?: string | number | null
  maxWidth: number | string
}) => {
  const primaryText = primary === null || primary === undefined || primary === '' ? '-' : String(primary)
  const secondaryText = secondary === null || secondary === undefined || secondary === '' ? '' : String(secondary)
  const normalizedPrimary = normalizeDisplayText(primaryText)
  const normalizedSecondary = normalizeDisplayText(secondaryText)
  const hasDistinctSecondary = Boolean(
    normalizedSecondary &&
    normalizedSecondary !== normalizedPrimary &&
    !normalizedPrimary.includes(normalizedSecondary) &&
    !normalizedSecondary.includes(normalizedPrimary)
  )
  const displayText = primaryText !== '-' ? primaryText : (secondaryText || '-')
  const tooltip = hasDistinctSecondary ? `${primaryText}\n${secondaryText}` : displayText

  return (
    <Tooltip title={<Box sx={{ whiteSpace: 'pre-line' }}>{tooltip}</Box>} arrow placement="top">
      <Box
        sx={{
          maxWidth,
          minHeight: 44,
          px: 1.5,
          py: 0.85,
          borderRadius: '14px',
          border: '1px solid #E5E7EB',
          bgcolor: '#F8FAFC',
          boxSizing: 'border-box',
        }}
      >
        <Typography
          component="span"
          sx={{
            display: 'block',
            width: '100%',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: '#1E1B4B',
            fontWeight: 700,
            lineHeight: 1.35,
          }}
        >
          {displayText}
        </Typography>
      </Box>
    </Tooltip>
  )
}

const invoiceStatusForPayment = (total: number, paid: number): 'pending' | 'partially_paid' | 'paid' => {
  if (paid <= 0) return 'pending'
  if (paid >= total) return 'paid'
  return 'partially_paid'
}

const invoiceTransactions = (invoice: SalesInvoice | RentalInvoice | InspectionInvoice | ServiceInvoice): BillingTransaction[] => (
  (invoice.transactions || []).map(transaction => ({
    id: transaction.id,
    invoice_id: transaction.invoice_id,
    transaction_type: transaction.transaction_type,
    amount: Number(transaction.amount || 0),
    payment_method: transaction.payment_method,
    reference_number: transaction.reference_number,
    description: transaction.description,
    created_by_name: transaction.created_by_name,
    created_at: transaction.created_at,
  }))
)

const serviceTransactions = (quotation: ServiceRequestQuotationList): BillingTransaction[] => [
  {
    transaction_type: 'invoice_created',
    amount: Number(quotation.amount || 0),
    description: `Service quotation ${quotation.quotation_number || quotation.id} created`,
    created_at: quotation.created_at,
  },
  ...((quotation.payments || []).map(payment => ({
    id: payment.id,
    transaction_type: 'payment',
    amount: Number(payment.amount || 0),
    payment_method: payment.payment_method,
    reference_number: payment.reference_number,
    description: payment.notes || 'Payment recorded',
    created_at: payment.paid_at,
  }))),
]

const sameAccount = (left: BillingItem, right: BillingItem) => {
  if (left.facilityId && right.facilityId) return left.facilityId === right.facilityId
  if (left.facility !== '-' && right.facility !== '-') return left.facility === right.facility
  if (left.customerEmail && right.customerEmail) return left.customerEmail === right.customerEmail
  return left.customer === right.customer
}

const Billing = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const user = useAuthStore(s => s.user)
  // Billing payment is available to allowed payer roles when their Billing edit permission is enabled.
  const canPay = ['superadmin', 'facility_admin', 'facility_manager', 'client'].includes(user?.role || '') && hasPermission(user, 'billing', 'edit')

  const [sourceFilter, setSourceFilter] = useState<'all' | BillingSource>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [payOpen, setPayOpen] = useState<BillingItem | null>(null)
  const [printItem, setPrintItem] = useState<BillingItem | null>(null)
  const [tab, setTab] = useState(0)
  const [page, setPage] = useState(0)
  const rowsPerPage = 25
  const search = searchParams.get('search') || ''

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

  const serviceQ = useQuery({ queryKey: ['billing-service-quotations', search], queryFn: () => fetchAllQuotations(search || undefined) })
  const serviceInvoicesQ = useQuery({ queryKey: ['billing-service-invoices', search], queryFn: () => fetchAllServiceInvoices(search || undefined) })

  // Fetch full SR data (with history) when printing a service invoice — needed to append the service report
  const printSrId = printItem?.source === 'service' && printItem?.billingKind === 'service_invoice'
    ? (printItem.raw as ServiceInvoice).service_request_id
    : null
  const { data: printSrData } = useQuery({
    queryKey: ['service-request', printSrId],
    queryFn: () => fetchServiceRequest(printSrId!),
    enabled: !!printSrId,
    staleTime: 60_000,
  })
  const inspectionQ = useQuery({ queryKey: ['billing-inspection-invoices', search], queryFn: () => fetchAllInspectionQuotations(search || undefined) })
  const salesQ = useQuery({ queryKey: ['billing-sales-invoices', search], queryFn: () => fetchSalesInvoices({ search: search || undefined }) })
  const rentalsQ = useQuery({ queryKey: ['billing-rental-invoices', search], queryFn: () => fetchRentalInvoices({ search: search || undefined }) })

  const anyBillingSourceLoading = serviceQ.isLoading || serviceInvoicesQ.isLoading || inspectionQ.isLoading || salesQ.isLoading || rentalsQ.isLoading

  const items = useMemo<BillingItem[]>(() => {
    const serviceInvoiceItems = (serviceInvoicesQ.data?.items || []).map((invoice): BillingItem => ({
      key: `service-invoice-${invoice.id}`,
      source: 'service',
      billingKind: 'service_invoice',
      id: invoice.id,
      facilityId: invoice.facility_id,
      number: invoice.invoice_number,
      relatedNumber: invoice.request_number || '-',
      facility: invoice.facility_name || '-',
      customer: invoice.customer_name,
      customerEmail: invoice.customer_email,
      description: invoice.notes || 'Service invoice',
      amount: Number(invoice.total_amount || 0),
      paid: Number(invoice.amount_paid || 0),
      balance: Number(invoice.balance_due || 0),
      status: invoice.status,
      date: invoice.issue_date || invoice.created_at,
      dueDate: invoice.due_date,
      paymentMethod: invoice.payment_method,
      transactions: invoiceTransactions(invoice),
      raw: invoice,
    }))

    const serviceItems = (serviceQ.data || [])
      .filter(q => q.status !== 'included_in_invoice')
      .map((q): BillingItem => {
      const amount = Number(q.amount || 0)
      const paid = (q.payments || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
      return {
        key: `service-${q.id}`,
        source: 'service',
        billingKind: 'service_quotation',
        id: q.id,
        facilityId: (q as any).facility_id || null,
        number: q.quotation_number || `Q-${q.id}`,
        relatedNumber: q.request_number || '-',
        facility: q.facility_name || '-',
        customer: q.facility_name || '-',
        customerEmail: null,
        description: q.description || 'Service quotation',
        amount,
        paid,
        balance: Math.max(0, amount - paid),
        status: q.status,
        date: q.created_at,
        transactions: serviceTransactions(q),
        raw: q,
      }
    })

    const inspectionItems = (inspectionQ.data?.items || []).map((invoice): BillingItem => ({
      key: `inspection-${invoice.id}`,
      source: 'inspection',
      id: invoice.id,
      facilityId: invoice.facility_id,
      number: invoice.invoice_number,
      relatedNumber: invoice.inspection_batch_number || invoice.inspection_number || '-',
      facility: invoice.facility_name || '-',
      customer: invoice.customer_name,
      customerEmail: invoice.customer_email,
      description: invoice.inspection_batch_id
        ? `${invoice.batch_asset_count || invoice.batch_items?.length || 0} asset inspection batch`
        : invoice.inventory_part_name || 'Inspection invoice',
      amount: Number(invoice.total_amount || 0),
      paid: Number(invoice.amount_paid || 0),
      balance: Number(invoice.balance_due || 0),
      status: invoice.status,
      date: invoice.issue_date || invoice.created_at,
      dueDate: invoice.due_date,
      transactions: invoiceTransactions(invoice),
      raw: invoice,
    }))

    const salesItems = (salesQ.data?.items || []).map((invoice): BillingItem => ({
      key: `sales-${invoice.id}`,
      source: 'sales',
      id: invoice.id,
      facilityId: invoice.facility_id,
      number: invoice.invoice_number,
      relatedNumber: invoice.work_order || invoice.sales_quotation_number || '-',
      facility: invoice.facility_name || '-',
      customer: invoice.customer_name,
      customerEmail: invoice.customer_email,
      description: 'Sales invoice',
      amount: Number(invoice.total_amount || 0),
      paid: Number(invoice.amount_paid || 0),
      balance: Number(invoice.balance_due || 0),
      status: invoice.status,
      date: invoice.issue_date || invoice.created_at,
      dueDate: invoice.due_date,
      paymentMethod: invoice.payment_method,
      transactions: invoiceTransactions(invoice),
      raw: invoice,
    }))

    const rentalItems = (rentalsQ.data?.items || []).map((invoice): BillingItem => ({
      key: `rental-${invoice.id}`,
      source: 'rental',
      id: invoice.id,
      facilityId: invoice.facility_id,
      number: invoice.invoice_number,
      relatedNumber: invoice.rental_number || '-',
      facility: invoice.facility_name || '-',
      customer: invoice.customer_name,
      customerEmail: invoice.customer_email,
      description: 'Rental invoice',
      amount: Number(invoice.total_amount || 0),
      paid: Number(invoice.amount_paid || 0),
      balance: Number(invoice.balance_due || 0),
      status: invoice.status,
      date: invoice.issue_date || invoice.created_at,
      dueDate: invoice.due_date,
      paymentMethod: invoice.payment_method,
      transactions: invoiceTransactions(invoice),
      raw: invoice,
    }))

    return [...serviceInvoiceItems, ...serviceItems, ...inspectionItems, ...salesItems, ...rentalItems]
      .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
  }, [inspectionQ.data, rentalsQ.data, salesQ.data, serviceInvoicesQ.data, serviceQ.data])

  const isInitialLoading = anyBillingSourceLoading && items.length === 0

  const filteredItems = items.filter(item => {
    const normalizedSearch = search.trim().toLowerCase()
    if (normalizedSearch) {
      const haystack = [
        item.number,
        item.relatedNumber,
        item.facility,
        item.customer,
        item.customerEmail,
        item.description,
        item.status,
        billingTypeLabel(item),
      ].filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(normalizedSearch)) return false
    }
    if (sourceFilter !== 'all' && item.source !== sourceFilter) return false
    if (statusFilter !== 'all' && item.status !== statusFilter) return false
    if (tab === 1) return item.balance > 0 && item.status !== 'cancelled' && item.status !== 'rejected'
    if (tab === 2) return item.status === 'paid' || item.balance <= 0
    return true
  })
  const pagedItems = filteredItems.slice(page * rowsPerPage, (page + 1) * rowsPerPage)

  useEffect(() => {
    setPage(0)
  }, [sourceFilter, statusFilter, tab, search])

  const updateSearch = (value: string) => {
    const next = new URLSearchParams(searchParams)
    const trimmed = value.trim()
    if (trimmed) next.set('search', trimmed)
    else next.delete('search')
    setSearchParams(next, { replace: true })
  }

  const totals = useMemo(() => {
    const outstanding = items.filter(item => item.balance > 0).reduce((sum, item) => sum + item.balance, 0)
    const paid = items.reduce((sum, item) => sum + item.paid, 0)
    return { outstanding, paid, total: items.reduce((sum, item) => sum + item.amount, 0), count: items.length }
  }, [items])

  const invalidateBilling = () => {
    queryClient.invalidateQueries({ queryKey: ['billing-service-quotations'] })
    queryClient.invalidateQueries({ queryKey: ['billing-service-invoices'] })
    queryClient.invalidateQueries({ queryKey: ['billing-inspection-invoices'] })
    queryClient.invalidateQueries({ queryKey: ['billing-sales-invoices'] })
    queryClient.invalidateQueries({ queryKey: ['billing-rental-invoices'] })
    queryClient.invalidateQueries({ queryKey: ['billing-quotations'] })
    queryClient.invalidateQueries({ queryKey: ['sales-invoices'] })
    queryClient.invalidateQueries({ queryKey: ['rental-invoices'] })
    queryClient.invalidateQueries({ queryKey: ['inspection-quotations'] })
    queryClient.invalidateQueries({ queryKey: ['service-invoices'] })
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
      if (item.source === 'service' && item.billingKind === 'service_invoice') {
        return updateServiceInvoice(item.id, { amount_paid: nextPaid, status, payment_method: method, notes: commonNotes })
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

    if (payOpen.source === 'service' && payOpen.billingKind !== 'service_invoice') {
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

  const printableItem = (item: BillingItem | null) => {
    if (!item) return null
    const base = {
      invoice_number: item.number,
      invoice_type: item.source,
      reference_number: item.relatedNumber,
      customer_name: item.customer,
      customer_email: item.customerEmail,
      customer_phone: (item.raw as any).customer_phone || null,
      customer_address: (item.raw as any).customer_address || null,
      facility_name: item.facility,
      subtotal: Number((item.raw as any).subtotal ?? item.amount ?? 0),
      tax_amount: Number((item.raw as any).tax_amount || 0),
      discount_amount: Number((item.raw as any).discount_amount || 0),
      total_amount: Number(item.amount || 0),
      amount_paid: Number(item.paid || 0),
      balance_due: Number(item.balance || 0),
      status: String(item.status || ''),
      issue_date: item.date,
      due_date: item.dueDate,
      payment_method: item.paymentMethod,
      notes: item.description,
    }
    if (item.source === 'service' && item.billingKind === 'service_invoice') {
      const invoice = item.raw as ServiceInvoice
      const laborLine = invoice.line_items?.find(l => l.description?.startsWith('Service labor'))
      const travelLine = invoice.line_items?.find(l => l.description === 'Travel Charges')
      return {
        ...base,
        ...(Number(laborLine?.total_amount || 0) > 0 ? { labor_fees: Number(laborLine!.total_amount) } : {}),
        ...(Number(travelLine?.total_amount || 0) > 0 ? { travel_charges: Number(travelLine!.total_amount) } : {}),
      }
    }
    if (item.source === 'inspection') {
      const invoice = item.raw as InspectionInvoice
      return {
        ...base,
        ...(Number(invoice.travel_charges || 0) > 0 ? { travel_charges: Number(invoice.travel_charges) } : {}),
        ...(Number(invoice.service_charges || 0) > 0 ? { service_charges: Number(invoice.service_charges) } : {}),
      }
    }
    return base
  }

  const serviceLineUnitLabel = (description: string, condition?: string | null): string => {
    if (/travel/i.test(description)) return 'Miles'
    if (/labor/i.test(description) || condition === 'labor') return 'Hours'
    if (condition === 'part') return 'Qty'
    return 'Qty'
  }

  const printableLineItems = (item: BillingItem | null): PrintableLineItem[] => {
    if (!item) return []
    if (item.source === 'service' && item.billingKind === 'service_invoice') {
      const invoice = item.raw as ServiceInvoice
      if (invoice.line_items?.length) {
        return invoice.line_items.map(line => ({
          item_number: line.item_number || item.relatedNumber || item.number,
          description: line.description,
          quantity: Number(line.quantity || 0),
          unit_price: Number(line.unit_price || 0),
          shipping_fee: Number(line.shipping_fee || 0),
          setup_fee: Number(line.setup_fee || 0),
          condition: line.condition,
          total_amount: Number(line.total_amount || 0),
          unitLabel: serviceLineUnitLabel(line.description, line.condition),
        }))
      }
    }
    if (item.source === 'service' && item.billingKind !== 'service_invoice') {
      const quotation = item.raw as ServiceRequestQuotationList
      if (quotation.line_items?.length) {
        return quotation.line_items.map(line => ({
          item_number: quotation.quotation_number,
          description: line.description,
          quantity: Number(line.quantity || 0),
          unit_price: Number(line.unit_price || 0),
          shipping_fee: 0,
          setup_fee: 0,
          condition: line.item_type,
          total_amount: Number(line.total || 0),
        }))
      }
    }
    if (item.source === 'inspection') {
      const invoice = item.raw as InspectionInvoice
      if (invoice.inspection_batch_id && invoice.batch_items?.length) {
        return invoice.batch_items.map(line => ({
          item_number: line.inspection_number,
          description: line.asset_name || 'Inspection asset',
          quantity: 1,
          unit_price: Number(line.subtotal || 0),
          shipping_fee: 0,
          setup_fee: 0,
          condition: line.serial_number || line.asset_tag || null,
          total_amount: Number(line.subtotal || 0),
        }))
      }
      const baseAmount = Number((invoice as any).subtotal || item.amount || 0)
      const rows: PrintableLineItem[] = [{
        item_number: item.relatedNumber || item.number,
        description: item.description,
        quantity: 1,
        unit_price: baseAmount,
        shipping_fee: 0,
        setup_fee: 0,
        condition: null,
        total_amount: baseAmount,
      }]
      if (Number(invoice.travel_charges || 0) > 0) {
        rows.push({
          item_number: item.relatedNumber || item.number,
          description: 'Travel Charges',
          quantity: 1,
          unit_price: Number(invoice.travel_charges),
          shipping_fee: 0,
          setup_fee: 0,
          condition: null,
          total_amount: Number(invoice.travel_charges),
        })
      }
      if (Number(invoice.service_charges || 0) > 0) {
        rows.push({
          item_number: item.relatedNumber || item.number,
          description: 'Service Charges',
          quantity: 1,
          unit_price: Number(invoice.service_charges),
          shipping_fee: 0,
          setup_fee: 0,
          condition: null,
          total_amount: Number(invoice.service_charges),
        })
      }
      return rows
    }
    return [{
      item_number: item.relatedNumber || item.number,
      description: item.description,
      quantity: 1,
      unit_price: Number(item.amount || 0),
      shipping_fee: 0,
      setup_fee: 0,
      condition: null,
      total_amount: Number(item.amount || 0),
    }]
  }

  const printableLedgerTransactions = (item: BillingItem | null): PrintableLedgerTransaction[] => {
    if (!item) return []
    return items
      .filter(other => sameAccount(item, other))
      .flatMap(other => (other.transactions || []).map((transaction, index) => ({
        id: transaction.id || index,
        invoice_id: transaction.invoice_id,
        invoice_number: other.number,
        transaction_type: transaction.transaction_type,
        amount: Number(transaction.amount || 0),
        payment_method: transaction.payment_method,
        reference_number: transaction.reference_number,
        description: transaction.description,
        created_by_name: transaction.created_by_name,
        created_at: transaction.created_at || other.date || new Date().toISOString(),
      })))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }

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
        <TextField
          size="small"
          placeholder="Search billing..."
          value={search}
          onChange={event => updateSearch(event.target.value)}
          sx={{ minWidth: 260 }}
        />
        <Typography sx={{ fontWeight: 700, color: '#374151', fontSize: '0.9rem' }}>Source:</Typography>
        {(['all', 'service', 'inspection', 'sales', 'rental'] as const).map(source => (
          <Chip
            key={source}
            label={source === 'all' ? 'All' : SOURCE_LABEL[source]}
            onClick={() => setSourceFilter(source)}
            sx={{ fontWeight: 700, cursor: 'pointer', bgcolor: sourceFilter === source ? '#7C3AED' : '#F3F4F6', color: sourceFilter === source ? '#fff' : '#374151' }}
          />
        ))}
        <Divider flexItem orientation="vertical" sx={{ mx: 1 }} />
        <Typography sx={{ fontWeight: 700, color: '#374151', fontSize: '0.9rem' }}>Status:</Typography>
        {['all', 'pending', 'partially_paid', 'paid', 'overdue', 'approved'].map(status => (
          <Chip
            key={status}
            label={status === 'all' ? 'All' : methodLabel(status)}
            onClick={() => setStatusFilter(status)}
            sx={{ fontWeight: 700, cursor: 'pointer', bgcolor: statusFilter === status ? '#EC4899' : '#F3F4F6', color: statusFilter === status ? '#fff' : '#374151' }}
          />
        ))}
      </Card>

      <Card sx={{ borderRadius: '24px', border: '1px solid #EEF0F6', overflow: 'hidden', boxShadow: '0 18px 45px rgba(49,46,129,0.08)' }}>
        <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ px: 2, borderBottom: '1px solid #EEF0F6', '& .Mui-selected': { color: '#7C3AED !important', fontWeight: 700 } }}>
          <Tab label="All Billing" />
          <Tab label="Outstanding" />
          <Tab label="Paid" />
        </Tabs>
        <TableContainer className="list-scroll-panel">
          <Table stickyHeader sx={{ tableLayout: 'fixed', minWidth: 1580 }}>
            <colgroup>
              <col style={{ width: 150 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 320 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 340 }} />
            </colgroup>
            <TableHead>
              <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Billing #</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Related #</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Facility / Customer</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Total</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Paid</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Balance</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 700, pl: 3, pr: 2 }}>Due</TableCell>
                <TableCell sx={{ fontWeight: 700, pl: 2 }} align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isInitialLoading ? Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={index}>{Array.from({ length: 10 }).map((__, cell) => <TableCell key={cell}><Skeleton /></TableCell>)}</TableRow>
              )) : filteredItems.length === 0 ? (
                <TableRow><TableCell colSpan={10} align="center" sx={{ py: 6, color: '#6B7280', fontWeight: 800 }}>No billing records found.</TableCell></TableRow>
              ) : pagedItems.map(item => {
                const expanded = expandedKey === item.key
                const chip = STATUS_CHIP[item.status] || STATUS_CHIP.pending
                const accountItems = items
                  .filter(other => sameAccount(item, other))
                  .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
                return (
                  <Fragment key={item.key}>
                    <TableRow key={item.key} hover>
                      <TableCell>
                        <Tooltip title={billingTypeLabel(item)} arrow placement="top">
                          <Chip
                            label={billingTypeLabel(item)}
                            sx={{
                              maxWidth: 126,
                              bgcolor: `${SOURCE_COLOR[item.source]}16`,
                              color: SOURCE_COLOR[item.source],
                              fontWeight: 700,
                              '& .MuiChip-label': {
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              },
                            }}
                          />
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <ValueBox value={item.number} maxWidth={116} color="#5B21B6" fontWeight={700} fontFamily="monospace" bgcolor="#F7F0FF" borderColor="#E9D5FF" />
                      </TableCell>
                      <TableCell>
                        <ValueBox value={item.relatedNumber} maxWidth={116} fontWeight={700} fontFamily="monospace" bgcolor="#F5F7FF" borderColor="#D8E1FF" />
                      </TableCell>
                      <TableCell>
                        <EntityValueBox primary={item.facility} secondary={item.customer} maxWidth={290} />
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap', color: '#1E1B4B' }}>{money(item.amount)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: '#059669', whiteSpace: 'nowrap' }}>{money(item.paid)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: item.balance > 0 ? '#DC2626' : '#059669', whiteSpace: 'nowrap' }}>{money(item.balance)}</TableCell>
                      <TableCell>
                        <Tooltip title={methodLabel(item.status)} arrow placement="top">
                          <Chip
                            label={methodLabel(item.status)}
                            sx={{
                              maxWidth: 104,
                              bgcolor: chip.bg,
                              color: chip.color,
                              fontWeight: 700,
                              '& .MuiChip-label': {
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              },
                            }}
                          />
                        </Tooltip>
                      </TableCell>
                      <TableCell sx={{ pl: 3, pr: 2, overflow: 'hidden' }}>
                        <Tooltip title={formatDate(item.dueDate || item.date)} arrow placement="top">
                          <Typography sx={{ display: 'block', fontWeight: 600, color: '#1E1B4B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 108 }}>
                            {formatDate(item.dueDate || item.date)}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell align="right" sx={{ pl: 2 }}>
                        <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'nowrap' }}>
                          {canPay && item.balance > 0 && (
                            <Button
                              size="small"
                              variant="contained"
                              startIcon={<PaymentIcon />}
                              onClick={() => openPayment(item)}
                              sx={{ borderRadius: '10px', fontWeight: 700, textTransform: 'none', minWidth: 82, background: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)' }}
                            >
                              Pay
                            </Button>
                          )}
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<VisibilityOutlinedIcon />}
                            onClick={() => {
                              if (item.source === 'service') navigate(`/service-requests/${(item.raw as any).service_request_id}?highlightBilling=${item.id}`)
                              if (item.source === 'sales') navigate(`/sales/invoices?highlightInvoice=${item.id}`)
                              if (item.source === 'rental') navigate(`/rentals/invoices?highlightInvoice=${item.id}`)
                              if (item.source === 'inspection') setExpandedKey(expanded ? null : item.key)
                            }}
                            sx={{ borderRadius: '10px', fontWeight: 700, textTransform: 'none', minWidth: 82 }}
                          >
                            View
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<PrintIcon />}
                            onClick={() => setPrintItem(item)}
                            sx={{ borderRadius: '10px', fontWeight: 700, textTransform: 'none', minWidth: 82 }}
                          >
                            Print
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
                          <BillingDetailsV2 item={item} accountItems={accountItems} />
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={filteredItems.length}
          page={page}
          onPageChange={(_, nextPage) => setPage(nextPage)}
          rowsPerPage={rowsPerPage}
          rowsPerPageOptions={[rowsPerPage]}
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} of ${count}`}
        />
      </Card>

      <InvoicePrintDialog
        open={Boolean(printItem)}
        onClose={() => setPrintItem(null)}
        invoice={printableItem(printItem)}
        lineItems={printableLineItems(printItem)}
        ledgerTransactions={printableLedgerTransactions(printItem)}
        moduleLabel={printItem ? SOURCE_LABEL[printItem.source] : 'Billing'}
        primaryDocumentLabel={printItem?.source === 'service' && printItem.billingKind !== 'service_invoice' ? 'Quotation' : 'Invoice'}
        accent={printItem ? SOURCE_COLOR[printItem.source] : '#7C3AED'}
        quantityLabel={printItem?.source === 'service' && printItem.billingKind === 'service_invoice' ? 'Hours' : 'Qty'}
        appendHtml={printSrData ? buildServiceReportSheet(printSrData) : undefined}
      />

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

const BillingDetailsV2 = ({ item, accountItems }: { item: BillingItem; accountItems: BillingItem[] }) => {
  const serviceQuotation = item.source === 'service' && item.billingKind !== 'service_invoice' ? item.raw as ServiceRequestQuotationList : null
  const serviceInvoice = item.source === 'service' && item.billingKind === 'service_invoice' ? item.raw as ServiceInvoice : null
  const inspectionInvoice = item.source === 'inspection' ? item.raw as InspectionInvoice : null
  const rawSubtotal = Number((item.raw as any).subtotal ?? item.amount)
  const rawTax = Number((item.raw as any).tax_amount || 0)
  const rawDiscount = Number((item.raw as any).discount_amount || 0)
  const currentTransactions: BillingTransaction[] = item.transactions?.length
    ? item.transactions
    : [
      {
        transaction_type: 'invoice_created',
        amount: item.amount,
        payment_method: null,
        reference_number: null,
        description: `${item.number} created`,
        created_at: item.date,
      },
      ...(item.paid > 0 ? [{
        transaction_type: 'payment',
        amount: item.paid,
        payment_method: item.paymentMethod,
        reference_number: null,
        description: 'Payment recorded',
        created_at: (item.raw as any).updated_at || item.date,
      }] : []),
    ]
  const accountTransactions = accountItems
    .flatMap(accountItem => (
      accountItem.transactions?.length
        ? accountItem.transactions.map(transaction => ({ ...transaction, invoiceNumber: accountItem.number }))
        : [{
          transaction_type: 'invoice_created',
          amount: accountItem.amount,
          description: `${accountItem.number} created`,
          created_at: accountItem.date,
          invoiceNumber: accountItem.number,
        }]
    ))
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
  const accountTotal = accountItems.reduce((sum, row) => sum + row.amount, 0)
  const accountPaid = accountItems.reduce((sum, row) => sum + row.paid, 0)
  const accountBalance = accountItems.reduce((sum, row) => sum + row.balance, 0)
  const lineRows = serviceInvoice?.line_items?.length
    ? serviceInvoice.line_items.map(line => ({
      label: line.description,
      meta: line.condition || 'service invoice',
      quantity: Number(line.quantity || 0),
      price: Number(line.unit_price || 0),
      total: Number(line.total_amount || 0),
    }))
    : serviceQuotation?.line_items?.length
    ? serviceQuotation.line_items.map(line => ({
      label: line.description,
      meta: line.item_type,
      quantity: line.quantity,
      price: line.unit_price,
      total: line.total,
    }))
    : inspectionInvoice?.inspection_batch_id && inspectionInvoice.batch_items?.length
    ? inspectionInvoice.batch_items.map(line => ({
      label: line.asset_name || 'Inspection asset',
      meta: `${line.inspection_number}${line.serial_number ? ` / ${line.serial_number}` : ''}`,
      quantity: 1,
      price: Number(line.subtotal || 0),
      total: Number(line.subtotal || 0),
    }))
    : [{
      label: item.description,
      meta: `${SOURCE_LABEL[item.source]} - ${item.relatedNumber}`,
      quantity: 1,
      price: rawSubtotal,
      total: rawSubtotal,
    }]

  return (
    <Box sx={{ p: 2.5, bgcolor: '#FBFCFF' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.55fr 0.9fr' }, gap: 2.5 }}>
        <Card sx={{ p: { xs: 2, md: 3 }, borderRadius: '18px', border: '1px solid #E5E7EB', boxShadow: '0 18px 40px rgba(15,23,42,0.08)' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2.5 }}>
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
              <Avatar sx={{ bgcolor: '#047857', width: 56, height: 56, fontWeight: 950 }}>
                {item.customer.slice(0, 2).toUpperCase()}
              </Avatar>
              <Box>
                <Typography sx={{ color: '#111827', fontWeight: 950, fontSize: 24, lineHeight: 1.15 }}>
                  Invoice for {item.customer}
                </Typography>
                <Chip
                  size="small"
                  label={methodLabel(item.status)}
                  sx={{
                    mt: 0.75,
                    bgcolor: item.balance <= 0 ? '#D1FAE5' : '#FEF3C7',
                    color: item.balance <= 0 ? '#047857' : '#B45309',
                    fontWeight: 900,
                  }}
                />
              </Box>
            </Box>
            <Button size="small" variant="contained" onClick={() => window.print()} sx={{ bgcolor: '#111827', fontWeight: 900 }}>
              Print
            </Button>
          </Box>

          <Divider sx={{ mb: 2 }} />

          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography sx={{ fontWeight: 950, color: '#111827' }}>Balance</Typography>
              <Typography sx={{ fontWeight: 950, color: item.balance > 0 ? '#DC2626' : '#047857' }}>{money(item.balance)}</Typography>
            </Box>
            <Box sx={{ textAlign: { xs: 'left', md: 'right' }, color: '#6B7280', fontWeight: 700, fontSize: 13 }}>
              <div>Created on {formatDate(item.date)}</div>
              <div>Due on {formatDate(item.dueDate || item.date)}</div>
              {item.paid > 0 && <div>Payment received: {money(item.paid)}</div>}
            </Box>
          </Box>

          <Box sx={{ p: 2.5, borderRadius: '16px', border: '1px solid #E5E7EB', bgcolor: '#fff' }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 180px' }, gap: 3, mb: 3 }}>
              <Box>
                <Typography sx={{ fontWeight: 950, color: '#111827', mb: 0.5 }}>From</Typography>
                <Typography sx={{ fontWeight: 800 }}>Mr. BioMed Tech Services</Typography>
                <Typography sx={{ color: '#4B5563', fontSize: 13 }}>555 N. 5th Street Suite 109</Typography>
                <Typography sx={{ color: '#4B5563', fontSize: 13 }}>Garland, TX 75040</Typography>
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 950, color: '#111827', mb: 0.5 }}>To</Typography>
                <Typography sx={{ fontWeight: 800 }}>{item.customer}</Typography>
                <Typography sx={{ color: '#4B5563', fontSize: 13 }}>{item.facility}</Typography>
                <Typography sx={{ color: '#4B5563', fontSize: 13 }}>{item.customerEmail || '-'}</Typography>
              </Box>
              <Box>
                <Typography sx={{ color: '#6B7280', fontSize: 13 }}><strong>Invoice</strong> {item.number}</Typography>
                <Typography sx={{ color: '#6B7280', fontSize: 13 }}><strong>Related</strong> {item.relatedNumber}</Typography>
                <Typography sx={{ color: '#6B7280', fontSize: 13 }}><strong>Type</strong> {billingTypeLabel(item)}</Typography>
              </Box>
            </Box>

            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 950 }}>Item</TableCell>
                  <TableCell sx={{ fontWeight: 950 }} align="right">{serviceInvoice ? 'Hours' : 'Quantity'}</TableCell>
                  <TableCell sx={{ fontWeight: 950 }} align="right">Price</TableCell>
                  <TableCell sx={{ fontWeight: 950 }} align="right">Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {lineRows.map((line, index) => (
                  <TableRow key={`${line.label}-${index}`}>
                    <TableCell>
                      <Typography sx={{ fontWeight: 900, color: '#111827' }}>{line.label}</Typography>
                      <Typography sx={{ color: '#6B7280', fontSize: 12 }}>{line.meta}</Typography>
                    </TableCell>
                    <TableCell align="right">{line.quantity}</TableCell>
                    <TableCell align="right">{money(line.price)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 950 }}>{money(line.total)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={3} align="right" sx={{ fontWeight: 900 }}>Subtotal</TableCell>
                  <TableCell align="right">{money(rawSubtotal)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={3} align="right" sx={{ fontWeight: 900 }}>Tax</TableCell>
                  <TableCell align="right">{money(rawTax)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={3} align="right" sx={{ fontWeight: 900 }}>Discount</TableCell>
                  <TableCell align="right">{money(rawDiscount)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={3} align="right" sx={{ fontWeight: 950, fontSize: 16 }}>Total</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 950, fontSize: 16 }}>{money(item.amount)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={3} align="right" sx={{ fontWeight: 950 }}>Balance Due</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 950, color: item.balance > 0 ? '#DC2626' : '#047857' }}>{money(item.balance)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>

            <Box sx={{ mt: 2 }}>
              {currentTransactions.filter(transaction => transaction.transaction_type === 'payment' || transaction.transaction_type === 'refund').map((transaction, index) => (
                <Typography key={`${transaction.reference_number}-${index}`} sx={{ color: '#4B5563', fontSize: 13, textAlign: 'right' }}>
                  {transaction.transaction_type === 'refund' ? 'Refund' : 'Payment'} {money(transaction.amount)} received {formatDate(transaction.created_at)} by {methodLabel(transaction.payment_method)}
                  {transaction.reference_number ? ` - ${transaction.reference_number}` : ''}
                </Typography>
              ))}
            </Box>
          </Box>
        </Card>

        <Box sx={{ display: 'grid', gap: 2 }}>
          <Card sx={{ p: 2.4, borderRadius: '18px', border: '1px solid #E5E7EB' }}>
            <Typography sx={{ fontWeight: 950, color: '#1E1B4B', mb: 1 }}>Account Summary</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
              <Kpi label="Account Total" value={money(accountTotal)} color="#7C3AED" />
              <Kpi label="Collected" value={money(accountPaid)} color="#059669" />
              <Kpi label="Balance" value={money(accountBalance)} color={accountBalance > 0 ? '#DC2626' : '#059669'} />
              <Kpi label="Records" value={String(accountItems.length)} color="#2563EB" />
            </Box>
          </Card>

          <Card sx={{ p: 2.4, borderRadius: '18px', border: '1px solid #E5E7EB' }}>
            <Typography sx={{ fontWeight: 950, color: '#1E1B4B', mb: 1 }}>Account Transaction Ledger</Typography>
            <Box sx={{ maxHeight: 360, overflow: 'auto', display: 'grid', gap: 1 }}>
              {accountTransactions.length === 0 ? (
                <Typography sx={{ color: '#9CA3AF', fontWeight: 700 }}>No account transactions found.</Typography>
              ) : accountTransactions.map((transaction, index) => (
                <Box key={`${transaction.invoiceNumber}-${transaction.reference_number || index}`} sx={{ p: 1.4, borderRadius: '12px', bgcolor: '#F8FAFC', border: '1px solid #EEF2F7' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                    <Typography sx={{ fontWeight: 950, color: '#111827', fontSize: 13 }}>{methodLabel(transaction.transaction_type)}</Typography>
                    <Typography sx={{ fontWeight: 950, color: transaction.transaction_type === 'refund' ? '#DC2626' : '#047857', fontSize: 13 }}>{money(transaction.amount)}</Typography>
                  </Box>
                  <Typography sx={{ color: '#6B7280', fontSize: 12 }}>{transaction.description || transaction.invoiceNumber}</Typography>
                  <Typography sx={{ color: '#94A3B8', fontSize: 11 }}>
                    {transaction.invoiceNumber} - {formatDate(transaction.created_at)} - {methodLabel(transaction.payment_method)}
                    {transaction.reference_number ? ` - ${transaction.reference_number}` : ''}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Card>
        </Box>
      </Box>
    </Box>
  )
}

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
