import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Alert, Avatar, Box, Button, Card, Chip, CircularProgress, Collapse, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider, FormControl,
  FormControlLabel, FormLabel, IconButton, InputLabel, ListItemIcon, Menu, MenuItem, Radio, RadioGroup, Select, Skeleton,
  Tab, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow,
  Tabs, TextField, Tooltip, Typography,
} from '@mui/material'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CreditCardIcon from '@mui/icons-material/CreditCard'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import FilterListIcon from '@mui/icons-material/FilterList'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import PaymentIcon from '@mui/icons-material/Payment'
import PrintIcon from '@mui/icons-material/Print'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import TaskAltIcon from '@mui/icons-material/TaskAlt'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import { toast } from 'react-toastify'

import { fetchAllInspectionQuotations, fetchInspectionQuotations, updateInspectionInvoice, type InspectionInvoice } from '@/api/inspections'
import { fetchRentalInvoices, updateRentalInvoice, type RentalInvoice } from '@/api/rentals'
import {
  fetchClientSalesQuotations,
  fetchSalesInvoices,
  updateSalesInvoice,
  type SalesInvoice,
} from '@/api/sales'
import {
  createQuotationPayment,
  approveQuotationPaymentProof,
  rejectQuotationPaymentProof,
  submitQuotationPaymentProof,
  requestQuotationAuthorization,
  decideQuotationAuthorization,
  fetchQuotationAuthorizationCandidates,
  fetchAllQuotations,
  fetchAllServiceInvoices,
  fetchServiceRequest,
  updateServiceInvoice,
  type QuotationPaymentCreate,
  type ServiceInvoice,
  type ServiceRequestQuotationList,
} from '@/api/serviceRequests'
import InvoicePrintDialog, {
  type PrintDocumentType,
  type PrintableInvoiceEditPayload,
  type PrintableLedgerTransaction,
  type PrintableLineItem,
  type PrintablePaidQuotation,
} from '@/components/Billing/InvoicePrintDialog'
import SearchFieldSelect from '@/components/SearchFieldSelect'
import DebouncedSearchField from '@/components/DebouncedSearchField'
import ContextTableRow from '@/components/ContextTableRow'
import SearchableSelect from '@/components/SearchableSelect'
import { useListContext } from '@/contexts/ListContext'
import { useAuthStore } from '@/stores/authStore'
import { hasPermission } from '@/config/permissions'
import { buildServiceReportSheet } from '@/utils/serviceReportHtml'
import {
  approveInvoiceForBilling,
  approveInvoicePaymentProof,
  fetchInvoicePaymentEvidence,
  fetchPaymentProofQueue,
  openPaymentProofFile,
  recordInvoicePayment,
  rejectInvoicePaymentProof,
  retryPaymentProofOcr,
  submitInvoicePaymentProof,
  type PaymentProof,
  type InvoicePaymentEvidenceItem,
} from '@/api/billing'

type BillingSource = 'service' | 'inspection' | 'sales' | 'rental'
type BillingStatus = 'draft' | 'sent' | 'authorization_requested' | 'authorized' | 'approved' | 'pending' | 'partially_paid' | 'paid' | 'overdue' | 'rejected' | 'cancelled'
type PayMethod = 'credit_card' | 'ach' | 'cheque'
type AchChoice = 'ach' | 'mbmts_ach'

const BILLING_SEARCH_FIELDS = [
  { value: 'all', label: 'All fields' },
  { value: 'billing_number', label: 'Billing #' },
  { value: 'related_number', label: 'Related #' },
  { value: 'facility_customer', label: 'Facility / Customer' },
  { value: 'total', label: 'Total' },
  { value: 'paid', label: 'Paid' },
  { value: 'balance', label: 'Balance' },
  { value: 'status', label: 'Status' },
  { value: 'due', label: 'Due date' },
]

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
  refunded?: number
  balance: number
  status: BillingStatus | string
  date: string | null
  dueDate?: string | null
  paymentMethod?: string | null
  billingApprovalStatus?: 'pending' | 'approved'
  approvedForBillingByName?: string | null
  approvedForBillingAt?: string | null
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
  authorization_requested: { bg: '#FEF3C7', color: '#B45309' },
  authorized: { bg: '#D1FAE5', color: '#047857' },
  approved: { bg: '#D1FAE5', color: '#047857' },
  pending: { bg: '#EEF2FF', color: '#4338CA' },
  partially_paid: { bg: '#FEF3C7', color: '#B45309' },
  paid: { bg: '#D1FAE5', color: '#047857' },
  partially_refunded: { bg: '#FFEDD5', color: '#C2410C' },
  refunded: { bg: '#FCE7F3', color: '#BE185D' },
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

const detectCardBrand = (cardNumber: string) => {
  const digits = cardNumber.replace(/\D/g, '')
  if (/^4/.test(digits)) return 'Visa'
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(digits)) return 'Mastercard'
  if (/^3[47]/.test(digits)) return 'American Express'
  if (/^(6011|65|64[4-9])/.test(digits)) return 'Discover'
  return 'Card'
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

const requiresBillingApproval = (item: BillingItem) => (
  item.source === 'inspection'
  || (item.source === 'service' && item.billingKind === 'service_invoice')
)

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
  onClick,
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
  onClick?: () => void
}) => {
  const text = value === null || value === undefined || value === '' ? '-' : String(value)
  const clickable = Boolean(onClick && text !== '-')

  return (
    <Tooltip title={text} arrow placement="top">
      <Box
        onClick={clickable ? onClick : undefined}
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        onKeyDown={clickable ? (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onClick?.()
          }
        } : undefined}
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
          cursor: clickable ? 'pointer' : undefined,
          transition: clickable ? 'all 0.15s ease' : undefined,
          '&:hover': clickable ? {
            borderColor: '#A78BFA',
            bgcolor: '#F5F3FF',
            transform: 'translateY(-1px)',
          } : undefined,
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
            textDecoration: clickable ? 'underline' : undefined,
            textUnderlineOffset: '3px',
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
  onClick,
}: {
  primary?: string | number | null
  secondary?: string | number | null
  maxWidth: number | string
  onClick?: () => void
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
  const clickable = Boolean(onClick && displayText !== '-')

  return (
    <Tooltip title={<Box sx={{ whiteSpace: 'pre-line' }}>{tooltip}</Box>} arrow placement="top">
      <Box
        onClick={clickable ? onClick : undefined}
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        onKeyDown={clickable ? (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onClick?.()
          }
        } : undefined}
        sx={{
          maxWidth,
          minHeight: 44,
          px: 1.5,
          py: 0.85,
          borderRadius: '14px',
          border: '1px solid #E5E7EB',
          bgcolor: '#F8FAFC',
          boxSizing: 'border-box',
          cursor: clickable ? 'pointer' : undefined,
          transition: clickable ? 'all 0.15s ease' : undefined,
          '&:hover': clickable ? {
            borderColor: '#A78BFA',
            bgcolor: '#F5F3FF',
            transform: 'translateY(-1px)',
          } : undefined,
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
            textDecoration: clickable ? 'underline' : undefined,
            textUnderlineOffset: '3px',
          }}
        >
          {displayText}
        </Typography>
      </Box>
    </Tooltip>
  )
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

const serviceTransactions = (quotation: ServiceRequestQuotationList): BillingTransaction[] => {
  if (quotation.ledger_entries?.length) {
    return quotation.ledger_entries.map(entry => {
      const details = entry.details || {}
      const actor = `${entry.actor_name} (${entry.actor_role.replace(/_/g, ' ')})`
      const authorizer = details.authorized_by_name
        ? ` Authorized by ${details.authorized_by_name} (${String(details.authorized_by_role || '').replace(/_/g, ' ')}).`
        : ''
      return {
        id: entry.id,
        transaction_type: entry.event_type === 'payment_recorded' ? 'payment' : entry.event_type,
        amount: Number(entry.amount || 0),
        payment_method: details.payment_method || null,
        reference_number: entry.reference_number,
        description: `${entry.event_type.replace(/_/g, ' ')} by ${actor}${entry.channel ? ` via ${entry.channel.replace(/_/g, ' ')}` : ''}.${authorizer}`,
        created_by_name: entry.actor_name,
        created_at: entry.created_at,
      }
    })
  }
  return [
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
      description: `${payment.notes || 'Payment recorded'}${payment.paid_by_name ? ` by ${payment.paid_by_name} (${String(payment.payer_role || '').replace(/_/g, ' ')})` : ''}`,
      created_by_name: payment.paid_by_name,
      created_at: payment.paid_at,
    }))),
  ]
}

// Keep account grouping on unique identifiers only. This mirrors the existing
// account-isolation rules while allowing the list to build each ledger once.
const billingAccountKey = (item: BillingItem) => {
  if (item.facilityId != null) return `facility:${item.facilityId}`
  const email = item.customerEmail?.trim().toLowerCase()
  if (email) return `email:${email}`
  return `record:${item.key}`
}

const ACTION_MENU_PAPER = {
  sx: {
    borderRadius: '16px',
    minWidth: 190,
    boxShadow: '0 18px 45px rgba(30,27,75,0.16)',
    border: '1px solid #EEF0F6',
  },
}

const ACTION_MENU_ITEM = {
  py: 1.15,
  px: 1.5,
  mx: 0.75,
  borderRadius: '10px',
  fontWeight: 800,
}

const Billing = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { focusRecord } = useListContext()
  const user = useAuthStore(s => s.user)
  const isInternalBillingAdmin = user?.role === 'superadmin' || (user?.role === 'admin' && !user.facility_id)
  const isFacilityBillingUser = ['facility_admin', 'facility_manager', 'client'].includes(user?.role || '')
    || (user?.role === 'admin' && Boolean(user.facility_id))
  // Billing payment is available to allowed payer roles when their Billing edit permission is enabled.
  const canPay = (user?.role === 'superadmin' || isFacilityBillingUser) && hasPermission(user, 'billing', 'edit')
  const canEditInvoices = isInternalBillingAdmin && hasPermission(user, 'billing', 'edit')
  const canApproveBilling = isInternalBillingAdmin && hasPermission(user, 'billing', 'edit')
  const canManageQuotationAuthorization = isInternalBillingAdmin && hasPermission(user, 'billing', 'edit')
  const canSelfAuthorizeQuotation = ['facility_admin', 'facility_manager', 'client'].includes(user?.role || '') && hasPermission(user, 'billing', 'edit')

  const [sourceFilter, setSourceFilter] = useState<'all' | BillingSource>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [payOpen, setPayOpen] = useState<BillingItem | null>(null)
  const [viewItem, setViewItem] = useState<BillingItem | null>(null)
  const [printItem, setPrintItem] = useState<BillingItem | null>(null)
  const [printDocumentType, setPrintDocumentType] = useState<PrintDocumentType>('invoice')
  const [editItem, setEditItem] = useState<BillingItem | null>(null)
  const [actionAnchor, setActionAnchor] = useState<HTMLElement | null>(null)
  const [actionItem, setActionItem] = useState<BillingItem | null>(null)
  const [authorizationItem, setAuthorizationItem] = useState<BillingItem | null>(null)
  const [authorizationChannel, setAuthorizationChannel] = useState<'self_service' | 'phone'>('self_service')
  const [authorizationDecision, setAuthorizationDecision] = useState<'authorized' | 'declined'>('authorized')
  const [phoneAuthorizerId, setPhoneAuthorizerId] = useState<number | ''>('')
  const [authorizationNotes, setAuthorizationNotes] = useState('')
  const [tab, setTab] = useState(0)
  const [page, setPage] = useState(0)
  const rowsPerPage = 25
  const search = searchParams.get('search') || ''
  const searchField = searchParams.get('search_field') || 'all'
  const focusedBillingRecord = searchParams.get('focus') || ''
  const activeSearch = search.trim()
  const querySearch = activeSearch || undefined
  const querySearchField = searchField === 'all' ? undefined : searchField
  const clientQuotationTab = isFacilityBillingUser && tab === 3
  const shouldFetchService = !clientQuotationTab && (sourceFilter === 'all' || sourceFilter === 'service')
  const shouldFetchInspection = !clientQuotationTab && (sourceFilter === 'all' || sourceFilter === 'inspection')
  const shouldFetchSales = !clientQuotationTab && (sourceFilter === 'all' || sourceFilter === 'sales')
  const shouldFetchRental = !clientQuotationTab && (sourceFilter === 'all' || sourceFilter === 'rental')
  const inspectionServerPage = sourceFilter === 'inspection'

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
  const [payProofFile, setPayProofFile] = useState<File | null>(null)
  const [proofQueueOpen, setProofQueueOpen] = useState(false)
  const [proofQueueStatus, setProofQueueStatus] = useState<'pending_verification' | 'approved' | 'rejected'>('pending_verification')
  const [proofReviewNotes, setProofReviewNotes] = useState<Record<number, string>>({})
  const [expandedProofOcr, setExpandedProofOcr] = useState<Record<number, boolean>>({})

  const publishBillingActivity = (item: BillingItem, message: string) => {
    focusRecord(`billing-${item.key}`, item.number, {
      message,
      announce: true,
      pathname: '/billing',
      query: {
        search: item.number,
        search_field: 'billing_number',
      },
    })
  }

  const openLedgerPrint = useCallback((item: BillingItem) => {
    setPrintDocumentType('ledger')
    setPrintItem(item)
  }, [])

  // A deliberate "Show" from Recent activity must not leave the requested
  // record hidden behind a previously selected source/status/summary tab.
  // This only resets list presentation; it never changes billing data.
  useEffect(() => {
    if (!focusedBillingRecord.startsWith('billing-')) return
    setSourceFilter('all')
    setStatusFilter('all')
    setTab(0)
    setPage(0)
  }, [focusedBillingRecord])

  // The search input debounces itself and pushes the term into the URL, so
  // typing no longer re-renders the whole Billing page on every keystroke.
  // Re-seed the input (via `billingSearchSeed`) only when the URL search
  // changes from the outside (e.g. a Recent-activity "Show"), never from our
  // own push — otherwise the field would remount mid-type and lose focus.
  const lastPushedSearch = useRef(search)
  const [billingSearchSeed, setBillingSearchSeed] = useState(0)
  useEffect(() => {
    if (search !== lastPushedSearch.current) {
      lastPushedSearch.current = search
      setBillingSearchSeed((seed) => seed + 1)
    }
  }, [search])
  const applyBillingSearch = (value: string) => {
    const trimmed = value.trim()
    if (trimmed === search) return
    lastPushedSearch.current = trimmed
    const next = new URLSearchParams(searchParams)
    if (trimmed) next.set('search', trimmed)
    else next.delete('search')
    setSearchParams(next, { replace: true })
  }

  const serviceQ = useQuery({
    queryKey: ['billing-service-quotations', querySearch, querySearchField],
    queryFn: () => fetchAllQuotations(querySearch, querySearchField),
    enabled: shouldFetchService,
    staleTime: 30_000,
    placeholderData: previousData => previousData,
  })
  const serviceInvoicesQ = useQuery({
    queryKey: ['billing-service-invoices', querySearch, querySearchField],
    queryFn: () => fetchAllServiceInvoices(querySearch, querySearchField),
    enabled: shouldFetchService,
    staleTime: 30_000,
    placeholderData: previousData => previousData,
  })
  const facilityAuthorizersQ = useQuery({
    queryKey: ['quotation-authorization-candidates', authorizationItem?.id],
    queryFn: () => fetchQuotationAuthorizationCandidates(Number(authorizationItem?.id)),
    enabled: Boolean(authorizationItem && authorizationChannel === 'phone' && canManageQuotationAuthorization),
    staleTime: 60_000,
  })
  const paymentProofQueueQ = useQuery({
    queryKey: ['billing-payment-proof-queue', proofQueueStatus],
    queryFn: () => fetchPaymentProofQueue(proofQueueStatus),
    enabled: canApproveBilling && proofQueueOpen,
    staleTime: 15_000,
    refetchInterval: proofQueueOpen && proofQueueStatus === 'pending_verification' ? 3_000 : 15_000,
  })

  const viewInvoiceId = viewItem && !(viewItem.source === 'service' && viewItem.billingKind !== 'service_invoice')
    ? viewItem.id
    : null
  const printInvoiceId = printItem && !(printItem.source === 'service' && printItem.billingKind !== 'service_invoice')
    ? printItem.id
    : null
  const viewPaymentEvidenceQ = useQuery({
    queryKey: ['invoice-payment-evidence', viewInvoiceId],
    queryFn: () => fetchInvoicePaymentEvidence(viewInvoiceId!),
    enabled: Boolean(viewInvoiceId),
    staleTime: 15_000,
  })
  const printPaymentEvidenceQ = useQuery({
    queryKey: ['invoice-payment-evidence', printInvoiceId],
    queryFn: () => fetchInvoicePaymentEvidence(printInvoiceId!),
    enabled: Boolean(printInvoiceId),
    staleTime: 15_000,
  })

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
  const inspectionQ = useQuery({
    queryKey: [
      'billing-inspection-invoices',
      querySearch,
      querySearchField,
      inspectionServerPage ? page : 'all',
      inspectionServerPage ? statusFilter : 'all',
      inspectionServerPage ? tab : 0,
    ],
    queryFn: () => inspectionServerPage
      ? fetchInspectionQuotations({
          search: querySearch,
          search_field: querySearchField,
          status_filter: statusFilter === 'all' ? undefined : statusFilter,
          balance_filter: tab === 1 ? 'outstanding' : tab === 2 ? 'paid' : undefined,
          skip: page * rowsPerPage,
          limit: rowsPerPage,
        })
      : fetchAllInspectionQuotations(querySearch, querySearchField),
    enabled: shouldFetchInspection,
    staleTime: 30_000,
    placeholderData: previousData => previousData,
    retry: 1,
  })
  const salesQ = useQuery({
    queryKey: ['billing-sales-invoices', querySearch, querySearchField],
    queryFn: () => fetchSalesInvoices({ search: querySearch, search_field: querySearchField }),
    enabled: shouldFetchSales,
    staleTime: 30_000,
    placeholderData: previousData => previousData,
  })
  const rentalsQ = useQuery({
    queryKey: ['billing-rental-invoices', querySearch, querySearchField],
    queryFn: () => fetchRentalInvoices({ search: querySearch, search_field: querySearchField }),
    enabled: shouldFetchRental,
    staleTime: 30_000,
    placeholderData: previousData => previousData,
  })
  const clientQuotationsQ = useQuery({
    queryKey: ['client-sales-quotations', querySearch, page, rowsPerPage],
    queryFn: () => fetchClientSalesQuotations({
      search: querySearch,
      skip: page * rowsPerPage,
      limit: rowsPerPage,
    }),
    enabled: clientQuotationTab,
    staleTime: 30_000,
    placeholderData: previousData => previousData,
  })

  const activeBillingQueries = [
    { enabled: shouldFetchService, isLoading: serviceQ.isLoading, isFetching: serviceQ.isFetching },
    { enabled: shouldFetchService, isLoading: serviceInvoicesQ.isLoading, isFetching: serviceInvoicesQ.isFetching },
    { enabled: shouldFetchInspection, isLoading: inspectionQ.isLoading, isFetching: inspectionQ.isFetching },
    { enabled: shouldFetchSales, isLoading: salesQ.isLoading, isFetching: salesQ.isFetching },
    { enabled: shouldFetchRental, isLoading: rentalsQ.isLoading, isFetching: rentalsQ.isFetching },
    { enabled: clientQuotationTab, isLoading: clientQuotationsQ.isLoading, isFetching: clientQuotationsQ.isFetching },
  ].filter(query => query.enabled)
  const allBillingSourcesLoading = activeBillingQueries.length > 0 && activeBillingQueries.every(query => query.isLoading)
  const anyBillingSourceFetching = activeBillingQueries.some(query => query.isFetching)

  const items = useMemo<BillingItem[]>(() => {
    const serviceInvoiceItems = shouldFetchService ? (serviceInvoicesQ.data?.items || []).map((invoice): BillingItem => ({
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
      billingApprovalStatus: invoice.billing_approval_status,
      approvedForBillingByName: invoice.approved_for_billing_by_name,
      approvedForBillingAt: invoice.approved_for_billing_at,
      transactions: invoiceTransactions(invoice),
      raw: invoice,
    })) : []

    const serviceItems = shouldFetchService ? (serviceQ.data || [])
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
    }) : []

    const inspectionItems = shouldFetchInspection ? (inspectionQ.data?.items || []).map((invoice): BillingItem => ({
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
      paymentMethod: invoice.payment_method,
      billingApprovalStatus: invoice.billing_approval_status,
      approvedForBillingByName: invoice.approved_for_billing_by_name,
      approvedForBillingAt: invoice.approved_for_billing_at,
      transactions: invoiceTransactions(invoice),
      raw: invoice,
    })) : []

    const salesItems = shouldFetchSales ? (salesQ.data?.items || []).map((invoice): BillingItem => ({
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
      paid: Number(invoice.net_paid ?? invoice.amount_paid ?? 0),
      refunded: Number(invoice.refunded_amount || 0),
      balance: Number(invoice.balance_due || 0),
      status: invoice.refund_status && invoice.refund_status !== 'none' ? invoice.refund_status : invoice.status,
      date: invoice.issue_date || invoice.created_at,
      dueDate: invoice.due_date,
      paymentMethod: invoice.payment_method,
      billingApprovalStatus: invoice.billing_approval_status,
      approvedForBillingByName: invoice.approved_for_billing_by_name,
      approvedForBillingAt: invoice.approved_for_billing_at,
      transactions: invoiceTransactions(invoice),
      raw: invoice,
    })) : []

    const rentalItems = shouldFetchRental ? (rentalsQ.data?.items || []).map((invoice): BillingItem => ({
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
      billingApprovalStatus: invoice.billing_approval_status,
      approvedForBillingByName: invoice.approved_for_billing_by_name,
      approvedForBillingAt: invoice.approved_for_billing_at,
      transactions: invoiceTransactions(invoice),
      raw: invoice,
    })) : []

    return [...serviceInvoiceItems, ...serviceItems, ...inspectionItems, ...salesItems, ...rentalItems]
      .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
  }, [
    inspectionQ.data,
    rentalsQ.data,
    salesQ.data,
    serviceInvoicesQ.data,
    serviceQ.data,
    shouldFetchInspection,
    shouldFetchRental,
    shouldFetchSales,
    shouldFetchService,
  ])

  const isInitialLoading = allBillingSourcesLoading && items.length === 0
  const inspectionLoadFailed = sourceFilter === 'inspection' && inspectionQ.isError && items.length === 0

  const accountItemsByKey = useMemo(() => {
    const grouped = new Map<string, BillingItem[]>()
    items.forEach(item => {
      const key = billingAccountKey(item)
      const accountItems = grouped.get(key)
      if (accountItems) accountItems.push(item)
      else grouped.set(key, [item])
    })
    grouped.forEach(accountItems => {
      accountItems.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
    })
    return grouped
  }, [items])

  const filteredItems = useMemo(() => (
    inspectionServerPage ? items : items.filter(item => {
      if (sourceFilter !== 'all' && item.source !== sourceFilter) return false
      if (statusFilter === 'billing_pending' && (!requiresBillingApproval(item) || item.billingApprovalStatus !== 'pending')) return false
      if (statusFilter !== 'all' && statusFilter !== 'billing_pending' && item.status !== statusFilter) return false
      if (tab === 1) return item.balance > 0 && item.status !== 'cancelled' && item.status !== 'rejected'
      if (tab === 2) return item.status === 'paid' || item.balance <= 0
      return true
    })
  ), [inspectionServerPage, items, sourceFilter, statusFilter, tab])
  const pagedItems = useMemo(() => (
    inspectionServerPage
      ? filteredItems
      : filteredItems.slice(page * rowsPerPage, (page + 1) * rowsPerPage)
  ), [filteredItems, inspectionServerPage, page, rowsPerPage])
  const paginationCount = inspectionServerPage
    ? Number(inspectionQ.data?.total || 0)
    : filteredItems.length

  useEffect(() => {
    setPage(0)
  }, [sourceFilter, statusFilter, tab, search, searchField])

  const handleSearchFieldChange = (value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value === 'all') next.delete('search_field')
    else next.set('search_field', value)
    setPage(0)
    setSearchParams(next, { replace: true })
  }

  const totals = useMemo(() => {
    if (inspectionServerPage && inspectionQ.data?.summary) {
      return inspectionQ.data.summary
    }
    const outstanding = items.filter(item => item.balance > 0).reduce((sum, item) => sum + item.balance, 0)
    const paid = items.reduce((sum, item) => sum + item.paid, 0)
    return { outstanding, paid, total: items.reduce((sum, item) => sum + item.amount, 0), count: items.length }
  }, [inspectionQ.data?.summary, inspectionServerPage, items])

  const invalidateBilling = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['billing-service-quotations'] }),
    queryClient.invalidateQueries({ queryKey: ['billing-service-invoices'] }),
    queryClient.invalidateQueries({ queryKey: ['billing-inspection-invoices'] }),
    queryClient.invalidateQueries({ queryKey: ['billing-sales-invoices'] }),
    queryClient.invalidateQueries({ queryKey: ['billing-rental-invoices'] }),
    queryClient.invalidateQueries({ queryKey: ['billing-quotations'] }),
    queryClient.invalidateQueries({ queryKey: ['sales-invoices'] }),
    queryClient.invalidateQueries({ queryKey: ['rental-invoices'] }),
    queryClient.invalidateQueries({ queryKey: ['inspection-quotations'] }),
    queryClient.invalidateQueries({ queryKey: ['service-invoices'] }),
    queryClient.invalidateQueries({ queryKey: ['service-request'] }),
  ])

  const servicePayMut = useMutation({
    mutationFn: ({ item, data }: { item: BillingItem; data: QuotationPaymentCreate }) => createQuotationPayment(item.id, data),
    onSuccess: (_, variables) => {
      toast.success('Payment recorded')
      closePayDialog()
      invalidateBilling()
      publishBillingActivity(variables.item, 'Payment recorded in the billing ledger.')
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to record payment'),
  })

  const requestAuthorizationMut = useMutation({
    mutationFn: ({ item }: { item: BillingItem }) => requestQuotationAuthorization(item.id),
    onSuccess: async (_, variables) => {
      await invalidateBilling()
      toast.success('Authorization request sent to the facility')
      publishBillingActivity(variables.item, 'Payment authorization requested from the facility.')
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Could not request authorization'),
  })

  const decideAuthorizationMut = useMutation({
    mutationFn: ({ item }: { item: BillingItem }) => decideQuotationAuthorization(item.id, {
      decision: authorizationDecision,
      channel: authorizationChannel,
      authorized_by_user_id: authorizationChannel === 'phone' ? Number(phoneAuthorizerId) : undefined,
      notes: authorizationNotes.trim() || undefined,
    }),
    onSuccess: async (_, variables) => {
      await invalidateBilling()
      toast.success(authorizationDecision === 'authorized' ? 'Quotation authorized' : 'Authorization declined')
      publishBillingActivity(
        variables.item,
        authorizationDecision === 'authorized' ? 'Quotation payment authorized.' : 'Quotation authorization declined.',
      )
      closeAuthorizationDialog()
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Could not save authorization decision'),
  })

  const invoicePayMut = useMutation({
    mutationFn: async ({ item, amount, method, notes, cardBrand, cardLast4 }: { item: BillingItem; amount: number; method: string; notes?: string; cardBrand?: string; cardLast4?: string }) => {
      return recordInvoicePayment(item.id, {
        amount,
        payment_method: method,
        notes,
        card_brand: cardBrand,
        card_last4: cardLast4,
      })
    },
    onSuccess: (_, variables) => {
      toast.success('Invoice payment updated')
      closePayDialog()
      invalidateBilling()
      queryClient.invalidateQueries({ queryKey: ['invoice-payment-evidence'] })
      publishBillingActivity(variables.item, 'Invoice payment updated in the billing ledger.')
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update invoice payment'),
  })

  const paymentProofMut = useMutation({
    mutationFn: async ({ item, amount, method, notes, file }: { item: BillingItem; amount: number; method: string; notes?: string; file: File }) => {
      if (item.source === 'service' && item.billingKind !== 'service_invoice') {
        return submitQuotationPaymentProof(item.id, { amount, payment_method: method, notes, file })
      }
      return submitInvoicePaymentProof(item.id, { amount, payment_method: method, notes, file })
    },
    onSuccess: async (_, variables) => {
      toast.success('Payment proof submitted for Admin review; no balance was changed')
      closePayDialog()
      await Promise.all([
        invalidateBilling(),
        queryClient.invalidateQueries({ queryKey: ['billing-payment-proof-queue'] }),
        queryClient.invalidateQueries({ queryKey: ['invoice-payment-evidence'] }),
      ])
      publishBillingActivity(variables.item, 'Payment proof submitted for review.')
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to submit payment proof'),
  })

  const reviewProofMut = useMutation({
    mutationFn: async ({ proof, decision, notes }: { proof: PaymentProof; decision: 'approve' | 'reject'; notes?: string }) => {
      if (decision === 'reject' && !notes?.trim()) throw new Error('Enter a rejection reason')
      if (proof.service_quotation_id) {
        return decision === 'approve'
          ? approveQuotationPaymentProof(proof.id, notes)
          : rejectQuotationPaymentProof(proof.id, notes || '')
      }
      return decision === 'approve'
        ? approveInvoicePaymentProof(proof.id, notes)
        : rejectInvoicePaymentProof(proof.id, notes || '')
    },
    onSuccess: async (_, variables) => {
      toast.success(variables.decision === 'approve' ? 'Payment proof approved and financial records updated' : 'Payment proof rejected; no balance was changed')
      await Promise.all([
        invalidateBilling(),
        queryClient.invalidateQueries({ queryKey: ['billing-payment-proof-queue'] }),
        queryClient.invalidateQueries({ queryKey: ['invoice-payment-evidence'] }),
      ])
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || err.message || 'Could not review payment proof'),
  })

  const retryProofOcrMut = useMutation({
    mutationFn: (proofId: number) => retryPaymentProofOcr(proofId),
    onSuccess: async () => {
      toast.success('Payment proof queued for a fresh OCR scan')
      await queryClient.invalidateQueries({ queryKey: ['billing-payment-proof-queue'] })
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Could not retry payment-proof OCR'),
  })

  const approveBillingMut = useMutation({
    mutationFn: (item: BillingItem) => approveInvoiceForBilling(item.id),
    onSuccess: async (approval, item) => {
      await invalidateBilling()
      toast.success(`${approval.invoice_number} is approved and available for payment`)
      publishBillingActivity(item, 'Invoice approved and made available for payment.')
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Could not approve invoice for billing'),
  })

  const invoiceEditMut = useMutation({
    mutationFn: async ({ item, data }: { item: BillingItem; data: PrintableInvoiceEditPayload }) => {
      const amountPaid = data.amount_paid === undefined ? undefined : Number(data.amount_paid || 0)
      const commonPayload = {
        customer_name: data.customer_name,
        customer_email: data.customer_email || undefined,
        customer_phone: data.customer_phone || null,
        customer_address: data.customer_address || null,
        subtotal: data.subtotal,
        tax_amount: data.tax_amount,
        discount_amount: data.discount_amount,
        total_amount: data.total_amount,
        ...(amountPaid !== undefined ? { amount_paid: amountPaid } : {}),
        issue_date: data.issue_date || undefined,
        due_date: data.due_date || undefined,
        status: data.status,
        notes: data.notes || undefined,
        line_items: data.line_items,
        labels: data.labels,
        summary_rows: data.summary_rows,
      }

      if (item.source === 'sales') {
        return updateSalesInvoice(item.id, { ...commonPayload, payment_method: data.payment_method || null } as any)
      }
      if (item.source === 'rental') {
        return updateRentalInvoice(item.id, { ...commonPayload, payment_method: data.payment_method || null } as any)
      }
      if (item.source === 'service' && item.billingKind === 'service_invoice') {
        return updateServiceInvoice(item.id, { ...commonPayload, payment_method: data.payment_method || null })
      }
      return updateInspectionInvoice(item.id, { ...commonPayload, payment_method: data.payment_method || null } as any)
    },
    onSuccess: async (updatedInvoice, variables) => {
      await invalidateBilling()
      setEditItem(null)
      toast.success(
        requiresBillingApproval(variables.item) && updatedInvoice.billing_approval_status === 'pending'
          ? 'Invoice updated; billing approval is required'
          : 'Invoice updated',
      )
      publishBillingActivity(variables.item, 'Invoice details updated.')
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Failed to update invoice'),
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
    setPayProofFile(null)
  }

  const closePayDialog = () => {
    setPayOpen(null)
    resetPayForm()
  }

  const openPayment = (item: BillingItem) => {
    if (requiresBillingApproval(item) && item.billingApprovalStatus !== 'approved') {
      toast.info('Approve this invoice for billing before recording payment')
      return
    }
    setPayOpen(item)
    setPayAmount(String(Math.max(0, item.balance || item.amount).toFixed(2)))
  }

  const openActions = (event: React.MouseEvent<HTMLElement>, item: BillingItem) => {
    setActionAnchor(event.currentTarget)
    setActionItem(item)
  }

  const closeActions = () => {
    setActionAnchor(null)
    setActionItem(null)
  }

  const closeAuthorizationDialog = () => {
    setAuthorizationItem(null)
    setAuthorizationChannel('self_service')
    setAuthorizationDecision('authorized')
    setPhoneAuthorizerId('')
    setAuthorizationNotes('')
  }

  const openAuthorizationDialog = (item: BillingItem, channel: 'self_service' | 'phone') => {
    setAuthorizationItem(item)
    setAuthorizationChannel(channel)
    setAuthorizationDecision('authorized')
    setPhoneAuthorizerId('')
    setAuthorizationNotes('')
  }

  const hydrateInspectionBillingItem = async (item: BillingItem): Promise<BillingItem> => {
    if (item.source !== 'inspection') return item
    try {
      const detail = await queryClient.fetchQuery({
        queryKey: ['inspection-quotation-detail', item.id],
        queryFn: () => fetchInspectionQuotations({ invoice_id: item.id, limit: 1 }),
        staleTime: 30_000,
      })
      const invoice = detail.items[0]
      if (!invoice) return item
      return {
        ...item,
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
        paymentMethod: invoice.payment_method,
        billingApprovalStatus: invoice.billing_approval_status,
        approvedForBillingByName: invoice.approved_for_billing_by_name,
        approvedForBillingAt: invoice.approved_for_billing_at,
        transactions: invoiceTransactions(invoice),
        raw: invoice,
      }
    } catch {
      toast.error('Could not load the full inspection invoice')
      return item
    }
  }

  const viewBillingItem = async (item: BillingItem) => {
    setViewItem(await hydrateInspectionBillingItem(item))
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

    if (actualMethod !== 'credit_card') {
      if (!payProofFile) {
        toast.error('Upload the cheque or ACH payment proof before submitting')
        return
      }
      paymentProofMut.mutate({ item: payOpen, amount, method: actualMethod, notes, file: payProofFile })
      return
    }

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
      servicePayMut.mutate({ item: payOpen, data })
      return
    }

    const cardDigits = ccNumber.replace(/\D/g, '')
    invoicePayMut.mutate({
      item: payOpen,
      amount,
      method: actualMethod,
      notes,
      cardBrand: detectCardBrand(cardDigits),
      cardLast4: cardDigits.slice(-4) || undefined,
    })
  }

  const paying = servicePayMut.isPending || invoicePayMut.isPending || paymentProofMut.isPending

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
      labels: (item.raw as any).labels || null,
      summary_rows: (item.raw as any).summary_rows || [],
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

  const normalizeCustomLineItems = (rows?: any[] | null, fallbackNumber?: string): PrintableLineItem[] => (
    (rows || []).map((line, index) => ({
      item_number: line.item_number || line.part_number || fallbackNumber || `ITEM-${index + 1}`,
      description: line.description || line.part_description || 'Invoice item',
      quantity: Number(line.quantity || 0),
      unit_price: Number(line.unit_price || 0),
      shipping_fee: Number(line.shipping_fee || 0),
      setup_fee: Number(line.setup_fee || 0),
      condition: line.condition || line.item_type || null,
      total_amount: Number(line.total_amount ?? line.total ?? 0),
      unitLabel: line.unitLabel,
      custom_cells: Array.isArray(line.custom_cells) ? line.custom_cells : [],
    }))
  )

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
          custom_cells: Array.isArray((line as any).custom_cells) ? (line as any).custom_cells : [],
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
      const customRows = normalizeCustomLineItems((invoice as any).line_items, item.number)
      if (customRows.length) return customRows
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
    if (item.source === 'sales') {
      const invoice = item.raw as SalesInvoice
      const customRows = normalizeCustomLineItems((invoice as any).line_items, item.number)
      if (customRows.length) return customRows
    }
    if (item.source === 'rental') {
      const invoice = item.raw as RentalInvoice
      const customRows = normalizeCustomLineItems((invoice as any).line_items, item.number)
      if (customRows.length) return customRows
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

  const printablePaidQuotations = (item: BillingItem | null): PrintablePaidQuotation[] => {
    if (!item || item.source !== 'service' || item.billingKind !== 'service_invoice') return []
    const invoice = item.raw as ServiceInvoice
    return (invoice.paid_quotations || []).map(quotation => ({
      id: quotation.id,
      quotation_number: quotation.quotation_number,
      description: quotation.description,
      amount: Number(quotation.amount || 0),
      paid_amount: Number(quotation.paid_amount || 0),
      paid_at: quotation.paid_at,
      payment_method: quotation.payment_method,
      reference_number: quotation.reference_number,
      line_items: (quotation.line_items || []).map(line => ({
        description: line.description,
        quantity: Number(line.quantity || 0),
        unit_price: Number(line.unit_price || 0),
        total: Number(line.total || 0),
        item_type: line.item_type,
      })),
    }))
  }

  const printableLedgerTransactions = (item: BillingItem | null): PrintableLedgerTransaction[] => {
    if (!item) return []
    return (accountItemsByKey.get(billingAccountKey(item)) || [item])
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
        <SearchFieldSelect
          value={searchField}
          options={BILLING_SEARCH_FIELDS}
          onChange={handleSearchFieldChange}
          ariaLabel="Billing search field"
          sx={{ minWidth: 175 }}
        />
        <DebouncedSearchField
          key={`billing-${billingSearchSeed}`}
          defaultValue={search}
          delay={350}
          onDebouncedChange={applyBillingSearch}
          size="small"
          placeholder={`Search ${BILLING_SEARCH_FIELDS.find((field) => field.value === searchField)?.label.toLowerCase() || 'billing'}...`}
          sx={{ minWidth: 260 }}
        />
        {anyBillingSourceFetching && !isInitialLoading && (
          <CircularProgress size={18} thickness={5} sx={{ color: '#7C3AED' }} />
        )}
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
        {[
          'all',
          ...(canApproveBilling ? ['billing_pending'] : []),
          'pending',
          'partially_paid',
          'paid',
          'overdue',
          'approved',
        ].map(status => (
          <Chip
            key={status}
            label={status === 'all' ? 'All' : status === 'billing_pending' ? 'Pending Approval' : methodLabel(status)}
            onClick={() => setStatusFilter(status)}
            sx={{ fontWeight: 700, cursor: 'pointer', bgcolor: statusFilter === status ? '#EC4899' : '#F3F4F6', color: statusFilter === status ? '#fff' : '#374151' }}
          />
        ))}
        {canApproveBilling && (
          <Chip
            icon={<AttachFileIcon />}
            label="Review payment proofs"
            onClick={() => setProofQueueOpen(true)}
            sx={{ ml: 'auto', fontWeight: 900, cursor: 'pointer', bgcolor: '#FFF7ED', color: '#C2410C', border: '1px solid #FED7AA' }}
          />
        )}
      </Card>

      <Card sx={{ borderRadius: '24px', border: '1px solid #EEF0F6', overflow: 'hidden', boxShadow: '0 18px 45px rgba(49,46,129,0.08)' }}>
        <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ px: 2, borderBottom: '1px solid #EEF0F6', '& .Mui-selected': { color: '#7C3AED !important', fontWeight: 700 } }}>
          <Tab label="All Billing" />
          <Tab label="Outstanding" />
          <Tab label="Paid" />
          {isFacilityBillingUser && <Tab label="Quotations" />}
        </Tabs>
        {clientQuotationTab ? (
          <>
            <TableContainer className="list-scroll-panel">
              <Table stickyHeader sx={{ tableLayout: 'fixed', minWidth: 900 }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                    <TableCell sx={{ fontWeight: 700 }}>Quotation #</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Facility</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Amount</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Sent</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="center">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {clientQuotationsQ.isLoading ? Array.from({ length: 5 }).map((_, index) => (
                    <TableRow key={index}>{Array.from({ length: 7 }).map((__, cell) => <TableCell key={cell}><Skeleton /></TableCell>)}</TableRow>
                  )) : (clientQuotationsQ.data?.items || []).length === 0 ? (
                    <TableRow><TableCell colSpan={7} align="center" sx={{ py: 6, color: '#6B7280', fontWeight: 800 }}>No quotations have been sent to you.</TableCell></TableRow>
                  ) : (clientQuotationsQ.data?.items || []).map(item => {
                    const quote = item.quotation
                    const chip = STATUS_CHIP[quote.status] || STATUS_CHIP.pending
                    return (
                      <TableRow key={`${quote.id}-${item.recipient.id}`} hover>
                        <TableCell>
                          <Button
                            onClick={() => navigate(`/quotation/account/${quote.id}`)}
                            sx={{ p: 0, minWidth: 0, fontWeight: 900, textTransform: 'none', fontFamily: 'monospace' }}
                          >
                            {quote.quotation_number}
                          </Button>
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>{quote.facility_name || quote.customer_name}</TableCell>
                        <TableCell sx={{ textTransform: 'capitalize' }}>{quote.quotation_type.replace(/_/g, ' ')}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 900 }}>{money(quote.total_amount)}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={methodLabel(quote.status)}
                            sx={{ bgcolor: chip.bg, color: chip.color, fontWeight: 800 }}
                          />
                        </TableCell>
                        <TableCell>{formatDate(quote.sent_at)}</TableCell>
                        <TableCell align="center">
                          <Button
                            startIcon={<VisibilityOutlinedIcon />}
                            variant="outlined"
                            onClick={() => navigate(`/quotation/account/${quote.id}`)}
                            sx={{ borderRadius: '10px', fontWeight: 800, textTransform: 'none' }}
                          >
                            View & Respond
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={Number(clientQuotationsQ.data?.total || 0)}
              page={page}
              onPageChange={(_, nextPage) => setPage(nextPage)}
              rowsPerPage={rowsPerPage}
              rowsPerPageOptions={[rowsPerPage]}
              labelDisplayedRows={({ from, to, count }) => `${from}-${to} of ${count}`}
            />
          </>
        ) : (
          <>
        <TableContainer className="list-scroll-panel">
          <Table stickyHeader sx={{ tableLayout: 'fixed', minWidth: 1340 }}>
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
              <col style={{ width: 100 }} />
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
                <TableCell sx={{ fontWeight: 700, px: 1.5 }} align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isInitialLoading ? Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={index}>{Array.from({ length: 10 }).map((__, cell) => <TableCell key={cell}><Skeleton /></TableCell>)}</TableRow>
              )) : inspectionLoadFailed ? (
                <TableRow>
                  <TableCell colSpan={10} sx={{ py: 4 }}>
                    <Alert
                      severity="error"
                      action={<Button color="inherit" size="small" onClick={() => inspectionQ.refetch()}>Retry</Button>}
                      sx={{ borderRadius: '14px', alignItems: 'center' }}
                    >
                      Inspection invoices could not be loaded. Retry the request or contact support if it continues.
                    </Alert>
                  </TableCell>
                </TableRow>
              ) : filteredItems.length === 0 ? (
                <TableRow><TableCell colSpan={10} align="center" sx={{ py: 6, color: '#6B7280', fontWeight: 800 }}>No billing records found.</TableCell></TableRow>
              ) : pagedItems.map(item => {
                const expanded = expandedKey === item.key
                const chip = STATUS_CHIP[item.status] || STATUS_CHIP.pending
                const accountItems = accountItemsByKey.get(billingAccountKey(item)) || [item]
                return (
                  <Fragment key={item.key}>
                    <ContextTableRow
                      key={item.key}
                      recordKey={`billing-${item.key}`}
                      recordLabel={item.number}
                      hover
                    >
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
                        <ValueBox value={item.number} maxWidth={116} color="#5B21B6" fontWeight={700} fontFamily="monospace" bgcolor="#F7F0FF" borderColor="#E9D5FF" onClick={() => viewBillingItem(item)} />
                      </TableCell>
                      <TableCell>
                        <ValueBox value={item.relatedNumber} maxWidth={116} fontWeight={700} fontFamily="monospace" bgcolor="#F5F7FF" borderColor="#D8E1FF" onClick={() => viewBillingItem(item)} />
                      </TableCell>
                      <TableCell>
                        <EntityValueBox primary={item.facility} secondary={item.customer} maxWidth={290} onClick={() => viewBillingItem(item)} />
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap', color: '#1E1B4B' }}>{money(item.amount)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: '#059669', whiteSpace: 'nowrap' }}>{money(item.paid)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: item.balance > 0 ? '#DC2626' : '#059669', whiteSpace: 'nowrap' }}>{money(item.balance)}</TableCell>
                      <TableCell>
                        <Tooltip
                          title={
                            requiresBillingApproval(item) && item.billingApprovalStatus === 'pending'
                              ? 'Pending billing approval'
                              : requiresBillingApproval(item) && item.billingApprovalStatus === 'approved'
                                ? `Approved for billing${item.approvedForBillingByName ? ` by ${item.approvedForBillingByName}` : ''}${item.approvedForBillingAt ? ` on ${formatDate(item.approvedForBillingAt)}` : ''}`
                                : methodLabel(item.status)
                          }
                          arrow
                          placement="top"
                        >
                          <Box sx={{ display: 'grid', gap: 0.5, justifyItems: 'start' }}>
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
                          {requiresBillingApproval(item) && item.billingApprovalStatus && (
                            <Typography
                              component="span"
                              sx={{
                                color: item.billingApprovalStatus === 'approved' ? '#047857' : '#B45309',
                                fontSize: 10.5,
                                lineHeight: 1.1,
                                fontWeight: 800,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {item.billingApprovalStatus === 'approved' ? 'Billing approved' : 'Approval required'}
                            </Typography>
                          )}
                          </Box>
                        </Tooltip>
                      </TableCell>
                      <TableCell sx={{ pl: 3, pr: 2, overflow: 'hidden' }}>
                        <Tooltip title={formatDate(item.dueDate || item.date)} arrow placement="top">
                          <Typography sx={{ display: 'block', fontWeight: 600, color: '#1E1B4B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 108 }}>
                            {formatDate(item.dueDate || item.date)}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell align="center" sx={{ px: 1.5 }}>
                        <Tooltip title="Actions" arrow>
                          <IconButton
                            size="small"
                            onClick={(event) => openActions(event, item)}
                            sx={{
                              borderRadius: '12px',
                              border: '1px solid #E9D5FF',
                              color: '#7C3AED',
                              bgcolor: '#F7F0FF',
                              '&:hover': { bgcolor: '#EDE9FE' },
                            }}
                          >
                            <MoreVertIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </ContextTableRow>
                    <TableRow key={`${item.key}-details`}>
                      <TableCell colSpan={10} sx={{ py: 0, border: expanded ? undefined : 'none' }}>
                        <Collapse in={expanded} timeout="auto" unmountOnExit>
                          <BillingDetailsV2
                            item={item}
                            accountItems={accountItems}
                            onPrintLedger={openLedgerPrint}
                          />
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
          count={paginationCount}
          page={page}
          onPageChange={(_, nextPage) => setPage(nextPage)}
          rowsPerPage={rowsPerPage}
          rowsPerPageOptions={[rowsPerPage]}
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} of ${count}`}
        />
          </>
        )}
      </Card>

      <Menu anchorEl={actionAnchor} open={Boolean(actionAnchor)} onClose={closeActions} PaperProps={ACTION_MENU_PAPER}>
        {actionItem && canApproveBilling && requiresBillingApproval(actionItem) && actionItem.billingApprovalStatus !== 'approved' && (
          <MenuItem
            sx={ACTION_MENU_ITEM}
            disabled={approveBillingMut.isPending}
            onClick={() => {
              approveBillingMut.mutate(actionItem)
              closeActions()
            }}
          >
            <ListItemIcon><TaskAltIcon fontSize="small" sx={{ color: '#047857' }} /></ListItemIcon>
            Approve for Billing
          </MenuItem>
        )}
        {actionItem && actionItem.source === 'service' && actionItem.billingKind === 'service_quotation' && canManageQuotationAuthorization
          && !['authorization_requested', 'authorized', 'paid', 'included_in_invoice', 'cancelled'].includes(actionItem.status)
          && !(actionItem.status === 'partially_paid' && (actionItem.raw as ServiceRequestQuotationList).authorizations?.some(item => ['requested', 'authorized'].includes(item.status))) && (
          <MenuItem sx={ACTION_MENU_ITEM} onClick={() => { requestAuthorizationMut.mutate({ item: actionItem }); closeActions() }}>
            <ListItemIcon><PaymentIcon fontSize="small" sx={{ color: '#B45309' }} /></ListItemIcon>
            Request Authorization
          </MenuItem>
        )}
        {actionItem && actionItem.source === 'service' && actionItem.billingKind === 'service_quotation' && actionItem.status === 'authorization_requested' && canManageQuotationAuthorization && (
          <MenuItem sx={ACTION_MENU_ITEM} onClick={() => { openAuthorizationDialog(actionItem, 'phone'); closeActions() }}>
            <ListItemIcon><CheckCircleIcon fontSize="small" sx={{ color: '#047857' }} /></ListItemIcon>
            Record Phone Decision
          </MenuItem>
        )}
        {actionItem && actionItem.source === 'service' && actionItem.billingKind === 'service_quotation' && actionItem.status === 'authorization_requested' && canSelfAuthorizeQuotation && (
          <MenuItem sx={ACTION_MENU_ITEM} onClick={() => { openAuthorizationDialog(actionItem, 'self_service'); closeActions() }}>
            <ListItemIcon><CheckCircleIcon fontSize="small" sx={{ color: '#047857' }} /></ListItemIcon>
            Review Authorization
          </MenuItem>
        )}
        {actionItem && canPay && actionItem.balance > 0
          && (!requiresBillingApproval(actionItem) || actionItem.billingApprovalStatus === 'approved')
          && (!(actionItem.source === 'service' && actionItem.billingKind === 'service_quotation') || ['authorized', 'partially_paid'].includes(actionItem.status)) && (
          <MenuItem sx={ACTION_MENU_ITEM} onClick={() => { openPayment(actionItem); closeActions() }}>
            <ListItemIcon><PaymentIcon fontSize="small" sx={{ color: '#7C3AED' }} /></ListItemIcon>
            Pay
          </MenuItem>
        )}
        {actionItem && canEditInvoices && !(actionItem.source === 'service' && actionItem.billingKind !== 'service_invoice') && (
          <MenuItem sx={ACTION_MENU_ITEM} onClick={() => {
            const item = actionItem
            closeActions()
            void hydrateInspectionBillingItem(item).then(setEditItem)
          }}>
            <ListItemIcon><EditOutlinedIcon fontSize="small" sx={{ color: '#7C3AED' }} /></ListItemIcon>
            Edit Invoice
          </MenuItem>
        )}
        {actionItem && (
          <MenuItem sx={ACTION_MENU_ITEM} onClick={() => { viewBillingItem(actionItem); closeActions() }}>
            <ListItemIcon><VisibilityOutlinedIcon fontSize="small" sx={{ color: '#2563EB' }} /></ListItemIcon>
            View
          </MenuItem>
        )}
        {actionItem && (
          <MenuItem sx={ACTION_MENU_ITEM} onClick={() => {
            const item = actionItem
            closeActions()
            setPrintDocumentType('invoice')
            void hydrateInspectionBillingItem(item).then(setPrintItem)
          }}>
            <ListItemIcon><PrintIcon fontSize="small" sx={{ color: '#059669' }} /></ListItemIcon>
            Print
          </MenuItem>
        )}
        {actionItem && (
          <MenuItem sx={ACTION_MENU_ITEM} onClick={() => { setExpandedKey(prev => (prev === actionItem.key ? null : actionItem.key)); closeActions() }}>
            <ListItemIcon>
              {expandedKey === actionItem.key
                ? <ExpandLessIcon fontSize="small" sx={{ color: '#64748B' }} />
                : <ExpandMoreIcon fontSize="small" sx={{ color: '#64748B' }} />}
            </ListItemIcon>
            {expandedKey === actionItem.key ? 'Hide Details' : 'Show Details'}
          </MenuItem>
        )}
      </Menu>

      <InvoicePrintDialog
        open={Boolean(viewItem)}
        onClose={() => setViewItem(null)}
        invoice={printableItem(viewItem)}
        lineItems={printableLineItems(viewItem)}
        ledgerTransactions={printableLedgerTransactions(viewItem)}
        paidQuotations={printablePaidQuotations(viewItem)}
        moduleLabel={viewItem ? SOURCE_LABEL[viewItem.source] : 'Billing'}
        primaryDocumentLabel={viewItem?.source === 'service' && viewItem.billingKind !== 'service_invoice' ? 'Quotation' : 'Invoice'}
        accent={viewItem ? SOURCE_COLOR[viewItem.source] : '#7C3AED'}
        quantityLabel={viewItem?.source === 'service' && viewItem.billingKind === 'service_invoice' ? 'Hours' : 'Qty'}
        mode="view"
        paymentEvidence={(viewPaymentEvidenceQ.data?.items || []) as InvoicePaymentEvidenceItem[]}
        paymentEvidenceLoading={viewPaymentEvidenceQ.isLoading}
        onOpenPaymentProof={(proofId, filename) => {
          void openPaymentProofFile(proofId, filename).catch(() => toast.error('Could not open payment proof'))
        }}
      />

      <InvoicePrintDialog
        open={Boolean(printItem)}
        onClose={() => {
          setPrintItem(null)
          setPrintDocumentType('invoice')
        }}
        invoice={printableItem(printItem)}
        lineItems={printableLineItems(printItem)}
        ledgerTransactions={printableLedgerTransactions(printItem)}
        paidQuotations={printablePaidQuotations(printItem)}
        moduleLabel={printItem ? SOURCE_LABEL[printItem.source] : 'Billing'}
        primaryDocumentLabel={printItem?.source === 'service' && printItem.billingKind !== 'service_invoice' ? 'Quotation' : 'Invoice'}
        accent={printItem ? SOURCE_COLOR[printItem.source] : '#7C3AED'}
        quantityLabel={printItem?.source === 'service' && printItem.billingKind === 'service_invoice' ? 'Hours' : 'Qty'}
        appendHtml={printDocumentType !== 'ledger' && printSrData ? buildServiceReportSheet(printSrData) : undefined}
        initialDocumentType={printDocumentType}
        documentTypeLocked={printDocumentType === 'ledger'}
        paymentEvidence={(printPaymentEvidenceQ.data?.items || []) as InvoicePaymentEvidenceItem[]}
        paymentEvidenceLoading={printPaymentEvidenceQ.isLoading}
        onOpenPaymentProof={(proofId, filename) => {
          void openPaymentProofFile(proofId, filename).catch(() => toast.error('Could not open payment proof'))
        }}
      />

      <InvoicePrintDialog
        open={Boolean(editItem)}
        onClose={() => setEditItem(null)}
        invoice={printableItem(editItem)}
        lineItems={printableLineItems(editItem)}
        ledgerTransactions={printableLedgerTransactions(editItem)}
        paidQuotations={printablePaidQuotations(editItem)}
        moduleLabel={editItem ? SOURCE_LABEL[editItem.source] : 'Billing'}
        primaryDocumentLabel="Invoice"
        accent={editItem ? SOURCE_COLOR[editItem.source] : '#7C3AED'}
        quantityLabel={editItem?.source === 'service' && editItem.billingKind === 'service_invoice' ? 'Hours' : 'Qty'}
        mode="edit"
        onSave={payload => {
          if (editItem) invoiceEditMut.mutate({ item: editItem, data: payload })
        }}
        saving={invoiceEditMut.isPending}
      />

      <Dialog open={Boolean(authorizationItem)} onClose={closeAuthorizationDialog} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '22px' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>
          {authorizationChannel === 'phone' ? 'Record Phone Authorization' : 'Review Quotation Authorization'}
        </DialogTitle>
        <DialogContent dividers sx={{ display: 'grid', gap: 2 }}>
          <Box sx={{ p: 1.5, borderRadius: '14px', bgcolor: '#F5F3FF', border: '1px solid #DDD6FE' }}>
            <Typography sx={{ fontWeight: 900 }}>{authorizationItem?.number}</Typography>
            <Typography sx={{ color: '#64748B', fontSize: 13 }}>{authorizationItem?.description}</Typography>
            <Typography sx={{ color: '#047857', fontWeight: 950 }}>{money(authorizationItem?.amount)}</Typography>
          </Box>
          <FormControl fullWidth>
            <InputLabel>Decision</InputLabel>
            <Select value={authorizationDecision} label="Decision" onChange={event => setAuthorizationDecision(event.target.value as 'authorized' | 'declined')}>
              <MenuItem value="authorized">Authorize payment</MenuItem>
              <MenuItem value="declined">Decline authorization</MenuItem>
            </Select>
          </FormControl>
          {authorizationChannel === 'phone' && (
            <SearchableSelect<number>
              label="Facility Representative"
              value={phoneAuthorizerId}
              options={(facilityAuthorizersQ.data || []).map(authorizer => ({
                value: authorizer.id,
                label: authorizer.full_name,
                secondary: authorizer.role.replace(/_/g, ' '),
                keywords: `${authorizer.email || ''} ${authorizer.role}`,
              }))}
              onChange={value => setPhoneAuthorizerId(value ? Number(value) : 0)}
              loading={facilityAuthorizersQ.isLoading}
              noOptionsText="No matching facility representatives"
              required
            />
          )}
          <TextField
            label={authorizationChannel === 'phone' ? 'Phone authorization notes' : 'Authorization notes'}
            value={authorizationNotes}
            onChange={event => setAuthorizationNotes(event.target.value)}
            multiline
            minRows={2}
          />
          <Typography sx={{ color: '#64748B', fontSize: 12, fontWeight: 700 }}>
            The authorizer, administrator, channel, amount and timestamp are saved permanently in the quotation ledger.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button onClick={closeAuthorizationDialog} sx={{ fontWeight: 900 }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => authorizationItem && decideAuthorizationMut.mutate({ item: authorizationItem })}
            disabled={decideAuthorizationMut.isPending || (authorizationChannel === 'phone' && !phoneAuthorizerId)}
            sx={{ borderRadius: '12px', fontWeight: 900, background: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)' }}
          >
            {decideAuthorizationMut.isPending ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Save Decision'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={proofQueueOpen} onClose={() => setProofQueueOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '22px' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>
          Payment Proof Review
          <Typography sx={{ mt: 0.5, color: '#64748B', fontSize: 13, fontWeight: 700 }}>
            OCR findings are review aids only. Approving is the only action that updates paid balances and downstream ledgers.
          </Typography>
        </DialogTitle>
        <DialogContent dividers sx={{ bgcolor: '#F8FAFC' }}>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            {([
              ['pending_verification', 'Pending review'],
              ['approved', 'Approved'],
              ['rejected', 'Rejected'],
            ] as const).map(([value, label]) => (
              <Chip
                key={value}
                label={label}
                onClick={() => setProofQueueStatus(value)}
                sx={{
                  cursor: 'pointer',
                  fontWeight: 900,
                  bgcolor: proofQueueStatus === value ? '#7C3AED' : '#EDE9FE',
                  color: proofQueueStatus === value ? '#fff' : '#5B21B6',
                }}
              />
            ))}
          </Box>
          {paymentProofQueueQ.isLoading ? (
            <Box sx={{ display: 'grid', placeItems: 'center', py: 7 }}><CircularProgress /></Box>
          ) : !(paymentProofQueueQ.data?.length) ? (
            <Alert severity="success">There are no {proofQueueStatus.replace(/_/g, ' ')} payment proofs.</Alert>
          ) : (
            <Box sx={{ display: 'grid', gap: 2 }}>
              {paymentProofQueueQ.data.map(proof => {
                const extractedAmounts = Array.isArray(proof.extracted_data?.amounts) ? proof.extracted_data.amounts : []
                const extractedDates = Array.isArray(proof.extracted_data?.dates) ? proof.extracted_data.dates : []
                const chequeDetails = [
                  ['Cheque / transaction #', proof.extracted_data?.cheque_number || proof.extracted_data?.reference],
                  ['Date', extractedDates.join(', ')],
                  ['Payee', proof.extracted_data?.payee],
                  ['Payer', proof.extracted_data?.payer],
                  ['Bank', proof.extracted_data?.bank_name],
                  ['Written amount', proof.extracted_data?.written_amount],
                  ['Memo', proof.extracted_data?.memo],
                ].filter((detail): detail is [string, string] => Boolean(detail[1]))
                const extractionReady = ['completed', 'failed'].includes(proof.extraction_status || 'completed')
                return (
                  <Card key={proof.id} variant="outlined" sx={{ p: 2, borderRadius: '16px', borderColor: proof.mismatch_flags.length ? '#F59E0B88' : '#CBD5E1' }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                      <Box>
                        <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>{proof.target_number || `Payment proof #${proof.id}`}</Typography>
                        <Typography sx={{ color: '#64748B', fontSize: 13, fontWeight: 700 }}>
                          {proof.customer_name || 'Customer'} · {methodLabel(proof.payment_method)} · Claimed {money(proof.claimed_amount)}
                        </Typography>
                        <Typography sx={{ color: '#64748B', fontSize: 12, mt: 0.5 }}>
                          Submitted by {proof.submitted_by_name || `User #${proof.submitted_by_id}`} on {formatDate(proof.created_at)}
                        </Typography>
                        {proof.reviewed_at && (
                          <Typography sx={{ color: '#64748B', fontSize: 12, mt: 0.25 }}>
                            Reviewed by {proof.reviewed_by_name || 'Admin'} on {formatDate(proof.reviewed_at)}
                          </Typography>
                        )}
                      </Box>
                      <Chip
                        label={methodLabel(proof.status)}
                        sx={{
                          fontWeight: 800,
                          bgcolor: proof.status === 'approved' ? '#D1FAE5' : proof.status === 'rejected' ? '#FEE2E2' : '#FEF3C7',
                          color: proof.status === 'approved' ? '#047857' : proof.status === 'rejected' ? '#B91C1C' : '#B45309',
                        }}
                      />
                    </Box>
                    <Box sx={{ mt: 1.5, p: 1.5, borderRadius: '12px', bgcolor: '#F1F5F9', display: 'grid', gap: 0.5 }}>
                      {!extractionReady && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <CircularProgress size={16} />
                          <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: '#475569' }}>
                            OCR processing {proof.extraction_status === 'retry' ? 'will retry automatically' : 'in the background'}
                          </Typography>
                        </Box>
                      )}
                      {proof.extraction_status === 'failed' && (
                        <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: '#B45309', mb: 0.5 }}>
                          OCR could not read this document after {proof.extraction_attempt_count} attempts. Review the original proof manually.
                        </Typography>
                      )}
                      <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: '#334155' }}>
                        OCR amounts: {extractedAmounts.length ? extractedAmounts.map((value: string) => money(value)).join(', ') : 'Not detected'}
                      </Typography>
                      <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: '#334155' }}>
                        OCR reference: {proof.extracted_data?.reference || 'Not detected'} · Extraction confidence {Math.round(Number(proof.extraction_confidence || 0) * 100)}%
                        {proof.extracted_data?.confidence_is_estimate ? ' (estimate)' : ''}
                      </Typography>
                      {chequeDetails.length > 0 && (
                        <Box
                          sx={{
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                            gap: 1,
                            mt: 0.75,
                          }}
                        >
                          {chequeDetails.map(([label, value]) => (
                            <Box key={`${proof.id}-${label}`} sx={{ minWidth: 0, p: 1, bgcolor: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px' }}>
                              <Typography sx={{ color: '#64748B', fontSize: 10.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.35 }}>
                                {label}
                              </Typography>
                              <Typography sx={{ color: '#1E293B', fontSize: 12.5, fontWeight: 750, overflowWrap: 'anywhere' }}>
                                {value}
                              </Typography>
                            </Box>
                          ))}
                        </Box>
                      )}
                      {proof.mismatch_flags.length > 0 && (
                        <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: '#B45309' }}>
                          Review flags: {proof.mismatch_flags.map(flag => methodLabel(flag)).join(', ')}
                        </Typography>
                      )}
                      {proof.ocr_text && (
                        <Box sx={{ mt: 0.25 }}>
                          <Button
                            size="small"
                            endIcon={expandedProofOcr[proof.id] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                            onClick={() => setExpandedProofOcr(current => ({ ...current, [proof.id]: !current[proof.id] }))}
                            sx={{ px: 0, minWidth: 0, fontSize: 11.5, fontWeight: 900, textTransform: 'none' }}
                          >
                            {expandedProofOcr[proof.id] ? 'Hide extracted text' : 'View all extracted text'}
                          </Button>
                          <Collapse in={Boolean(expandedProofOcr[proof.id])}>
                            <Box
                              component="pre"
                              sx={{
                                mt: 0.75,
                                mb: 0,
                                p: 1.25,
                                maxHeight: 220,
                                overflow: 'auto',
                                whiteSpace: 'pre-wrap',
                                overflowWrap: 'anywhere',
                                bgcolor: '#fff',
                                border: '1px solid #E2E8F0',
                                borderRadius: '10px',
                                color: '#334155',
                                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                fontSize: 11.5,
                              }}
                            >
                              {proof.ocr_text}
                            </Box>
                          </Collapse>
                        </Box>
                      )}
                    </Box>
                    {proof.status === 'pending_verification' ? (
                      <TextField
                        size="small"
                        fullWidth
                        label="Reviewer notes / rejection reason"
                        value={proofReviewNotes[proof.id] || ''}
                        onChange={event => setProofReviewNotes(current => ({ ...current, [proof.id]: event.target.value }))}
                        sx={{ mt: 1.5 }}
                      />
                    ) : proof.review_notes ? (
                      <Typography sx={{ mt: 1.5, color: '#475569', fontSize: 13, fontWeight: 700 }}>
                        Review notes: {proof.review_notes}
                      </Typography>
                    ) : null}
                    <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'flex-end', gap: 1, flexWrap: 'wrap' }}>
                      <Button
                        variant="outlined"
                        startIcon={<VisibilityOutlinedIcon />}
                        onClick={() => openPaymentProofFile(proof.id, proof.original_filename).catch(() => toast.error('Could not open payment proof'))}
                        sx={{ fontWeight: 900 }}
                      >
                        View proof
                      </Button>
                      {proof.status === 'pending_verification' && (
                        <>
                          <Button
                            variant="outlined"
                            startIcon={<RestartAltIcon />}
                            disabled={retryProofOcrMut.isPending || !extractionReady}
                            onClick={() => retryProofOcrMut.mutate(proof.id)}
                            sx={{ fontWeight: 900 }}
                          >
                            Retry OCR
                          </Button>
                          <Button
                            color="error"
                            variant="outlined"
                            disabled={reviewProofMut.isPending}
                            onClick={() => reviewProofMut.mutate({ proof, decision: 'reject', notes: proofReviewNotes[proof.id] })}
                            sx={{ fontWeight: 900 }}
                          >
                            Reject
                          </Button>
                          <Button
                            variant="contained"
                            disabled={reviewProofMut.isPending || !extractionReady}
                            onClick={() => reviewProofMut.mutate({ proof, decision: 'approve', notes: proofReviewNotes[proof.id] })}
                            sx={{ fontWeight: 900, background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)' }}
                          >
                            Approve payment
                          </Button>
                        </>
                      )}
                    </Box>
                  </Card>
                )
              })}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}><Button onClick={() => setProofQueueOpen(false)} sx={{ fontWeight: 900 }}>Close</Button></DialogActions>
      </Dialog>

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
              <FormControlLabel value="cheque" control={<Radio />} label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><ReceiptLongIcon fontSize="small" /> Cheque</Box>} />
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

          {payMethod !== 'credit_card' && (
            <Box sx={{ mb: 2, p: 2, borderRadius: '14px', border: '1px solid #F59E0B55', bgcolor: '#FFFBEB' }}>
              <Alert severity="warning" sx={{ mb: 1.5, bgcolor: 'transparent', p: 0 }}>
                OCR will extract review details, but this payment remains unpaid until an Admin or Super Admin approves the proof.
              </Alert>
              <Button component="label" variant="outlined" startIcon={<AttachFileIcon />} sx={{ fontWeight: 900, borderRadius: '12px' }}>
                {payProofFile ? 'Replace proof' : 'Upload payment proof'}
                <input
                  hidden
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  onChange={event => setPayProofFile(event.target.files?.[0] || null)}
                />
              </Button>
              <Typography sx={{ mt: 1, fontSize: 12.5, fontWeight: 700, color: payProofFile ? '#047857' : '#92400E' }}>
                {payProofFile ? `${payProofFile.name} · ${(payProofFile.size / 1024).toFixed(0)} KB` : 'PDF, JPEG, PNG, or WebP · maximum 10 MB'}
              </Typography>
            </Box>
          )}

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
            {paying ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : payMethod === 'credit_card' ? 'Record Payment' : 'Submit Proof for Review'}
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

const BillingDetailsV2 = memo(({
  item,
  accountItems,
  onPrintLedger,
}: {
  item: BillingItem
  accountItems: BillingItem[]
  onPrintLedger: (item: BillingItem) => void
}) => {
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
            <Button size="small" variant="contained" startIcon={<PrintIcon />} onClick={() => onPrintLedger(item)} sx={{ bgcolor: '#111827', fontWeight: 900 }}>
              Print Ledger
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
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
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
})

BillingDetailsV2.displayName = 'BillingDetailsV2'

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
