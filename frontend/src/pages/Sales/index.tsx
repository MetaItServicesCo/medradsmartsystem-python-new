import { type MouseEvent, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Autocomplete, Avatar, Box, Button, Card, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, FormControl, IconButton, InputLabel, ListItemIcon, Menu, MenuItem, Select,
  LinearProgress, Skeleton, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, Tabs,
  TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import AssignmentIcon from '@mui/icons-material/Assignment'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CreditCardIcon from '@mui/icons-material/CreditCard'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import HistoryIcon from '@mui/icons-material/History'
import Inventory2Icon from '@mui/icons-material/Inventory2'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import PaymentIcon from '@mui/icons-material/Payment'
import PrintIcon from '@mui/icons-material/Print'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart'
import VisibilityIcon from '@mui/icons-material/Visibility'
import { toast } from 'react-toastify'

import { fetchFacilities, type Facility } from '@/api/facilities'
import { resolveUploadUrl } from '@/api/users'
import CreditCardAuthorizationDialog, { type AuthorizationLineItem, type CreditCardAuthorizationPayload } from '@/components/Billing/CreditCardAuthorizationDialog'
import InvoicePrintDialog, { type PrintableLedgerTransaction, type PrintableLineItem } from '@/components/Billing/InvoicePrintDialog'
import ClippedTooltipText from '@/components/ClippedTooltipText'
import DateRangeFilter from '@/components/DateRangeFilter'
import PartSearchAutocomplete from '@/components/PartSearchAutocomplete'
import SearchFieldSelect from '@/components/SearchFieldSelect'
import ContextTableRow from '@/components/ContextTableRow'
import FacilitySearchAutocomplete from '@/components/FacilitySearchAutocomplete'
import {
  completeSalesQuotation,
  convertSalesQuotationToInvoice,
  createSalesQuotation,
  deleteSalesQuotation,
  fetchSalesHistory,
  fetchSalesInvoices,
  fetchSalesQuotation,
  fetchSalesQuotationRecipientCandidates,
  fetchSalesSummary,
  fetchSalesParts,
  fetchSalesQuotations,
  requestSalesCardAuthorization,
  refundSalesInvoice,
  sendSalesQuotation,
  updateSalesInvoice,
  updateSalesQuotation,
  type SalesInvoice,
  type SalesInvoiceCreatePayload,
  type SalesPart,
  type SalesQuotation,
  type SalesQuotationLineItem,
  type SalesQuotationPayload,
  type SalesQuotationRecipientCandidate,
} from '@/api/sales'
import { useListContext } from '@/contexts/ListContext'
import { useAuthStore } from '@/stores/authStore'
import { formatUSPhone, formatUSPhoneInput } from '@/utils/formatters'

const ROUTE_TABS = ['/sales/quotations', '/sales/invoices', '/sales/in-progress', '/sales/completed']
const PAGE_SIZE = 20
const SALES_ORDER_SEARCH_FIELDS = [
  { value: 'all', label: 'All fields' },
  { value: 'quotation', label: 'Quotation #' },
  { value: 'work_order', label: 'Work order' },
  { value: 'customer', label: 'Customer' },
  { value: 'facility', label: 'Facility' },
  { value: 'type', label: 'Type' },
  { value: 'status', label: 'Status' },
  { value: 'created_by', label: 'Created by' },
  { value: 'date', label: 'Date' },
]
const SALES_INVOICE_SEARCH_FIELDS = [
  { value: 'all', label: 'All fields' },
  { value: 'invoice', label: 'Invoice #' },
  { value: 'quotation', label: 'Quotation / work order' },
  { value: 'customer', label: 'Customer' },
  { value: 'facility', label: 'Facility' },
  { value: 'status', label: 'Status' },
  { value: 'amount', label: 'Amount' },
  { value: 'payment_method', label: 'Payment method' },
  { value: 'date', label: 'Date' },
  { value: 'notes', label: 'Notes' },
]
const SALES_COMPLETED_HISTORY_SEARCH_FIELDS = [
  ...SALES_ORDER_SEARCH_FIELDS,
  { value: 'activity', label: 'Activity / user' },
]
const SYSTEM_GRADIENT = 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)'
const SYSTEM_PANEL_BORDER = '#E9D5FF'
const SYSTEM_PANEL_BG = '#F8FAFF'
const ACTION_MENU_PAPER = {
  mt: 1,
  minWidth: 260,
  borderRadius: '18px',
  border: '1px solid #E9D5FF',
  boxShadow: '0 22px 55px rgba(49,46,129,0.18)',
  overflow: 'hidden',
  '& .MuiList-root': { p: 0.8 },
}
const ACTION_MENU_ITEM = {
  mx: 0.4,
  my: 0.3,
  gap: 1,
  borderRadius: '12px',
  fontWeight: 900,
  color: '#312E81',
  '&:hover': { bgcolor: '#F5F3FF', color: '#6D28D9' },
  '&.Mui-disabled': { opacity: 0.45 },
}
const ACTION_MENU_DANGER = {
  ...ACTION_MENU_ITEM,
  color: '#DC2626',
  '&:hover': { bgcolor: '#FEF2F2', color: '#B91C1C' },
}

const statusChip = (value: string) => {
  const map: Record<string, { bg: string; color: string }> = {
    draft: { bg: '#F3F4F6', color: '#4B5563' },
    sent: { bg: '#DBEAFE', color: '#1D4ED8' },
    viewed: { bg: '#EDE9FE', color: '#6D28D9' },
    changes_requested: { bg: '#FFEDD5', color: '#C2410C' },
    declined: { bg: '#FEE2E2', color: '#DC2626' },
    accepted: { bg: '#D1FAE5', color: '#047857' },
    pending: { bg: '#EEF2FF', color: '#4338CA' },
    approved: { bg: '#D1FAE5', color: '#047857' },
    rejected: { bg: '#FEE2E2', color: '#DC2626' },
    in_progress: { bg: '#FEF3C7', color: '#B45309' },
    completed: { bg: '#D1FAE5', color: '#047857' },
    paid: { bg: '#D1FAE5', color: '#047857' },
    unpaid: { bg: '#FEE2E2', color: '#DC2626' },
    partially_paid: { bg: '#FEF3C7', color: '#B45309' },
    overdue: { bg: '#FEE2E2', color: '#DC2626' },
    partially_refunded: { bg: '#FFEDD5', color: '#C2410C' },
    refunded: { bg: '#FCE7F3', color: '#BE185D' },
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
  primary_recipient_user_id: null,
  additional_recipient_user_ids: [],
  items: [],
})

const emptyInvoiceDetails = (): SalesInvoiceCreatePayload => ({
  labour_hours: 0,
  worked_hours: 0,
  setup_fee: 0,
  service_fee: 0,
  shipping_fee: 0,
  application_fee: 0,
  tax_rate: 0,
  discount_type: 'fixed',
  discount_amount: 0,
  payment_method: '',
  action: '',
  due_date: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().slice(0, 10),
  notes: '',
})

interface SalesPartInfo {
  partNumber: string
  description: string
  make: string | null
  model: string | null
  serialNumber: string | null
  condition: string | null
  quantity: number | null
  unitPrice: number | null
  facilityName: string | null
  status: string | null
  imageUrl: string | null
}

const Sales = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { focusRecord } = useListContext()
  const currentUser = useAuthStore(state => state.user)
  const canConfigureDefaults = currentUser?.role === 'superadmin' || currentUser?.role === 'admin'

  const routeParams = new URLSearchParams(location.search)
  const routeSearch = routeParams.get('search') || ''
  const searchField = routeParams.get('search_field') || 'all'
  const dateFrom = routeParams.get('date_from') || ''
  const dateTo = routeParams.get('date_to') || ''
  const invalidDateRange = Boolean(dateFrom && dateTo && dateFrom > dateTo)
  const [search, setSearch] = useState(routeSearch)
  const [debouncedSearch, setDebouncedSearch] = useState(routeSearch)
  const [quotationDialog, setQuotationDialog] = useState(false)
  const [editingQuotation, setEditingQuotation] = useState<SalesQuotation | null>(null)
  const [viewQuotation, setViewQuotation] = useState<SalesQuotation | null>(null)
  const [quotationForm, setQuotationForm] = useState<SalesQuotationPayload>(emptyQuotation())
  const [selectedPart, setSelectedPart] = useState<SalesPart | null>(null)
  const [selectedPartQty, setSelectedPartQty] = useState(1)
  const [selectedPartShipping, setSelectedPartShipping] = useState(0)
  const [selectedPartSetup, setSelectedPartSetup] = useState(0)
  const [selectedPartCondition, setSelectedPartCondition] = useState('New')
  const [actionAnchor, setActionAnchor] = useState<HTMLElement | null>(null)
  const [actionQuotation, setActionQuotation] = useState<SalesQuotation | null>(null)
  const [invoiceActionAnchor, setInvoiceActionAnchor] = useState<HTMLElement | null>(null)
  const [actionInvoice, setActionInvoice] = useState<SalesInvoice | null>(null)
  const [viewInvoice, setViewInvoice] = useState<SalesInvoice | null>(null)
  const [printQuotation, setPrintQuotation] = useState<SalesQuotation | null>(null)
  const [printInvoice, setPrintInvoice] = useState<SalesInvoice | null>(null)
  const [cardAuthDialog, setCardAuthDialog] = useState<{ quotation?: SalesQuotation; invoice?: SalesInvoice } | null>(null)
  const [invoiceEdit, setInvoiceEdit] = useState<SalesInvoice | null>(null)
  const [invoiceForm, setInvoiceForm] = useState({ amount_paid: 0, due_date: '', status: 'pending', payment_method: '', notes: '' })
  const [convertQuotation, setConvertQuotation] = useState<SalesQuotation | null>(null)
  const [invoiceDetails, setInvoiceDetails] = useState<SalesInvoiceCreatePayload>(emptyInvoiceDetails())
  const [selectedQuoteOptions, setSelectedQuoteOptions] = useState<number[]>([])
  const [tradeInDescription, setTradeInDescription] = useState('')
  const [tradeInValue, setTradeInValue] = useState(0)
  const [refundAdjustmentDescription, setRefundAdjustmentDescription] = useState('')
  const [refundAdjustmentReference, setRefundAdjustmentReference] = useState('')
  const [refundAdjustmentValue, setRefundAdjustmentValue] = useState(0)
  const [refundInvoice, setRefundInvoice] = useState<SalesInvoice | null>(null)
  const [refundForm, setRefundForm] = useState({ amount: 0, payment_method: '', notes: '' })
  const [partInfo, setPartInfo] = useState<SalesPartInfo | null>(null)
  const [deliveryLink, setDeliveryLink] = useState('')
  const [quotationsPage, setQuotationsPage] = useState(0)
  const [invoicesPage, setInvoicesPage] = useState(0)
  const [inProgressPage, setInProgressPage] = useState(0)
  const [completedPage, setCompletedPage] = useState(0)
  const [historyPage, setHistoryPage] = useState(0)
  // Quotations fetched on demand for id-lookups (a quotation linked from an
  // invoice/history row may not be on the currently loaded page).
  const [linkedQuotations, setLinkedQuotations] = useState<SalesQuotation[]>([])

  const tab = Math.max(0, ROUTE_TABS.findIndex(path => location.pathname === path || location.pathname.startsWith(`${path}/`)))
  const highlightInvoiceId = Number(new URLSearchParams(location.search).get('highlightInvoice') || 0)
  const highlightQuotationId = Number(new URLSearchParams(location.search).get('highlightQuotation') || 0)

  useEffect(() => {
    if (location.pathname === '/sales') navigate('/sales/quotations', { replace: true })
    if (location.pathname === '/sales/billing') navigate('/sales/invoices', { replace: true })
    if (location.pathname === '/sales/history') {
      navigate(`/sales/completed${location.search}`, { replace: true })
    }
  }, [location.pathname, navigate])

  useEffect(() => {
    setSearch(routeSearch)
    setDebouncedSearch(routeSearch)
  }, [routeSearch])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(search.trim())
      setQuotationsPage(0)
      setInvoicesPage(0)
      setInProgressPage(0)
      setCompletedPage(0)
      setHistoryPage(0)
    }, 350)

    return () => window.clearTimeout(handle)
  }, [search])

  // Facilities and the full parts list are only needed inside the quotation /
  // convert dialogs (facility picker, line-item avatars). Loading them eagerly
  // on every page view fetched 500 + 771 rows for nothing — defer until a dialog
  // that needs them is open so the list page loads fast.
  const partsAndFacilitiesNeeded = quotationDialog || Boolean(convertQuotation)
  const facilitiesQ = useQuery({
    queryKey: ['sales-facilities'],
    queryFn: () => fetchFacilities({ limit: 500 }),
    enabled: partsAndFacilitiesNeeded,
    staleTime: 5 * 60_000,
  })
  const partsQ = useQuery({
    queryKey: ['sales-parts', 'dialog-preview'],
    queryFn: () => fetchSalesParts(undefined, 100),
    enabled: partsAndFacilitiesNeeded,
    placeholderData: previousData => previousData,
  })
  const recipientCandidatesQ = useQuery({
    queryKey: ['sales-quotation-recipient-candidates', quotationForm.facility_id],
    queryFn: () => fetchSalesQuotationRecipientCandidates(Number(quotationForm.facility_id)),
    enabled: quotationDialog && Boolean(quotationForm.facility_id),
    staleTime: 60_000,
  })
  const summaryQ = useQuery({ queryKey: ['sales-summary'], queryFn: fetchSalesSummary, placeholderData: previousData => previousData })
  const quotationsQ = useQuery({
    queryKey: ['sales-quotations', 'quotations', debouncedSearch, searchField, dateFrom, dateTo, quotationsPage],
    queryFn: () => fetchSalesQuotations({ view: 'quotations', search: debouncedSearch || undefined, search_field: searchField === 'all' ? undefined : searchField, date_from: dateFrom || undefined, date_to: dateTo || undefined, skip: quotationsPage * PAGE_SIZE, limit: PAGE_SIZE }),
    enabled: tab === 0 && !invalidDateRange,
    placeholderData: previousData => previousData,
  })
  const inProgressQ = useQuery({
    queryKey: ['sales-quotations', 'in_progress', debouncedSearch, searchField, dateFrom, dateTo, inProgressPage],
    queryFn: () => fetchSalesQuotations({ view: 'in_progress', search: debouncedSearch || undefined, search_field: searchField === 'all' ? undefined : searchField, date_from: dateFrom || undefined, date_to: dateTo || undefined, skip: inProgressPage * PAGE_SIZE, limit: PAGE_SIZE }),
    enabled: tab === 2 && !invalidDateRange,
    placeholderData: previousData => previousData,
  })
  const completedQ = useQuery({
    queryKey: ['sales-quotations', 'completed', debouncedSearch, searchField, dateFrom, dateTo, completedPage],
    queryFn: () => fetchSalesQuotations({ view: 'completed', search: debouncedSearch || undefined, search_field: searchField === 'all' ? undefined : searchField, date_from: dateFrom || undefined, date_to: dateTo || undefined, skip: completedPage * PAGE_SIZE, limit: PAGE_SIZE }),
    enabled: tab === 3 && !invalidDateRange,
    placeholderData: previousData => previousData,
  })
  const invoicesQ = useQuery({
    queryKey: ['sales-invoices', debouncedSearch, searchField, dateFrom, dateTo, invoicesPage],
    queryFn: () => fetchSalesInvoices({ search: debouncedSearch || undefined, search_field: searchField === 'all' ? undefined : searchField, date_from: dateFrom || undefined, date_to: dateTo || undefined, skip: invoicesPage * PAGE_SIZE, limit: PAGE_SIZE }),
    enabled: tab === 1 && !invalidDateRange,
    placeholderData: previousData => previousData,
  })
  const historyQ = useQuery({
    queryKey: ['sales-history', debouncedSearch, searchField, dateFrom, dateTo, historyPage],
    queryFn: () => fetchSalesHistory({
      search: debouncedSearch || undefined,
      search_field: searchField === 'all' ? undefined : searchField,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      skip: historyPage * PAGE_SIZE,
      limit: PAGE_SIZE,
    }),
    enabled: tab === 3 && !invalidDateRange,
    placeholderData: previousData => previousData,
  })

  const facilities = facilitiesQ.data?.items || []
  const parts = partsQ.data?.items || []
  const recipientCandidates = recipientCandidatesQ.data?.items || []
  const summary = summaryQ.data
  const pendingQuotations = quotationsQ.data?.items || []
  const inProgressQuotations = inProgressQ.data?.items || []
  const completedQuotations = completedQ.data?.items || []
  const invoices = invoicesQ.data?.items || []
  // Flattened set of currently-loaded quotation pages, used for id lookups
  // (opening a linked quotation from an invoice/history row, print, card auth).
  const quotations = useMemo(
    () => [...pendingQuotations, ...inProgressQuotations, ...completedQuotations, ...linkedQuotations],
    [pendingQuotations, inProgressQuotations, completedQuotations, linkedQuotations],
  )

  // Ensure a quotation is available for lookups; fetches + caches it if it is not
  // on a currently-loaded page. Returns the quotation (or null if unavailable).
  const ensureQuotation = async (id?: number | null): Promise<SalesQuotation | null> => {
    if (!id) return null
    const existing = quotations.find(item => item.id === id)
    if (existing) return existing
    try {
      const fetched = await fetchSalesQuotation(id)
      setLinkedQuotations(prev => (prev.some(item => item.id === fetched.id) ? prev : [...prev, fetched]))
      return fetched
    } catch {
      return null
    }
  }

  const openLinkedQuotation = async (id?: number | null) => {
    const quotation = await ensureQuotation(id)
    if (quotation) setViewQuotation(quotation)
  }
  const inProgressTotal = summary?.in_progress_total || 0
  const completedTotal = summary?.completed_total || 0
  const inProgressPaid = summary?.in_progress_paid || 0
  const inProgressPaymentPercent = inProgressTotal > 0 ? Math.min(100, Math.round((inProgressPaid / inProgressTotal) * 100)) : 0

  useEffect(() => {
    if (!highlightInvoiceId || invoices.length === 0) return
    window.setTimeout(() => {
      document.getElementById(`sales-invoice-${highlightInvoiceId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)
  }, [highlightInvoiceId, invoices.length])

  useEffect(() => {
    if (!highlightQuotationId || pendingQuotations.length === 0) return
    window.setTimeout(() => {
      document.getElementById(`sales-quotation-${highlightQuotationId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)
  }, [highlightQuotationId, pendingQuotations.length])

  // Reset every tab to its first page whenever the search term changes.
  useEffect(() => {
    setQuotationsPage(0)
    setInvoicesPage(0)
    setInProgressPage(0)
    setCompletedPage(0)
    setHistoryPage(0)
  }, [debouncedSearch, searchField, dateFrom, dateTo])

  // Prefetch the linked quotation for dialogs whose content is built from it,
  // so their details resolve even when that quotation is not on a loaded page.
  useEffect(() => {
    if (printInvoice?.sales_quotation_id) ensureQuotation(printInvoice.sales_quotation_id)
  }, [printInvoice]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (cardAuthDialog?.invoice?.sales_quotation_id) ensureQuotation(cardAuthDialog.invoice.sales_quotation_id)
  }, [cardAuthDialog]) // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => ({
    quotations: summary?.quotations || 0,
    invoices: summary?.invoices || 0,
    inProgress: summary?.in_progress || 0,
    completed: summary?.completed || 0,
    history: summary?.history || 0,
  }), [summary])

  const invalidateSales = () => {
    queryClient.invalidateQueries({ queryKey: ['sales-quotations'] })
    queryClient.invalidateQueries({ queryKey: ['sales-invoices'] })
    queryClient.invalidateQueries({ queryKey: ['sales-history'] })
    queryClient.invalidateQueries({ queryKey: ['sales-summary'] })
    queryClient.invalidateQueries({ queryKey: ['sales-parts'] })
  }

  const locateSalesRecord = (
    path: string,
    key: string,
    label: string,
    message: string,
  ) => {
    setSearch(label)
    setDebouncedSearch(label)
    setQuotationsPage(0)
    setInvoicesPage(0)
    setInProgressPage(0)
    setCompletedPage(0)
    focusRecord(key, label, { message, announce: true })
    navigate(`${path}?focus=${encodeURIComponent(key)}&search=${encodeURIComponent(label)}`)
  }

  const saveQuotationMut = useMutation({
    mutationFn: async (action: 'draft' | 'send') => {
      const quotation = editingQuotation
        ? await updateSalesQuotation(editingQuotation.id, quotationForm)
        : await createSalesQuotation(quotationForm)
      const delivered = action === 'send'
        ? await sendSalesQuotation(quotation.id)
        : quotation
      return { quotation: delivered, sent: action === 'send' }
    },
    onSuccess: ({ quotation, sent }) => {
      toast.success(sent ? 'Sales quotation sent to its recipients' : editingQuotation ? 'Sales quotation draft updated' : 'Sales quotation saved as draft')
      if (sent && 'primary_share_url' in quotation && typeof quotation.primary_share_url === 'string' && quotation.primary_share_url) {
        setDeliveryLink(quotation.primary_share_url)
      }
      setQuotationDialog(false)
      setEditingQuotation(null)
      setQuotationForm(emptyQuotation())
      invalidateSales()
      locateSalesRecord(
        '/sales/quotations',
        `sales-quotation-${quotation.id}`,
        quotation.work_order || quotation.quotation_number,
        sent ? 'Sent quotation located' : editingQuotation ? 'Updated draft located' : 'New draft located',
      )
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

  const sendQuotationMut = useMutation({
    mutationFn: (id: number) => sendSalesQuotation(id),
    onSuccess: quotation => {
      toast.success('Sales quotation sent to its recipients')
      if (quotation.primary_share_url) setDeliveryLink(quotation.primary_share_url)
      closeActions()
      invalidateSales()
      locateSalesRecord(
        '/sales/quotations',
        `sales-quotation-${quotation.id}`,
        quotation.work_order || quotation.quotation_number,
        'Sent quotation located',
      )
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not send quotation'),
  })

  const convertMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: SalesInvoiceCreatePayload }) => convertSalesQuotationToInvoice(id, data),
    onSuccess: invoice => {
      toast.success('Quotation converted to invoice')
      setConvertQuotation(null)
      setInvoiceDetails(emptyInvoiceDetails())
      closeActions()
      invalidateSales()
      if (canConfigureDefaults) {
        locateSalesRecord(
          '/sales/invoices',
          `sales-invoice-${invoice.id}`,
          invoice.invoice_number,
          'Generated invoice located',
        )
      } else if (convertQuotation) {
        locateSalesRecord(
          '/sales/in-progress',
          `sales-quotation-${convertQuotation.id}`,
          convertQuotation.work_order,
          'Selection submitted; sales invoice is ready for payment',
        )
      }
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not convert quotation'),
  })

  const cardAuthMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: CreditCardAuthorizationPayload }) =>
      requestSalesCardAuthorization(id, data),
    onSuccess: result => {
      if (result.authorization.status === 'submitted') {
        toast.success(`Authorization ${result.authorization.authorization_reference || ''} recorded for ${money(result.amount)}`)
      } else {
        navigator.clipboard?.writeText(result.payment_url).catch(() => undefined)
        toast.success(`Secure authorization link created for ${money(result.amount)} and copied`)
      }
      setCardAuthDialog(null)
      closeActions()
      invalidateSales()
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not request authorization'),
  })

  const completeMut = useMutation({
    mutationFn: completeSalesQuotation,
    onSuccess: quotation => {
      toast.success('Sales order completed')
      closeActions()
      invalidateSales()
      locateSalesRecord('/sales/completed', `sales-quotation-${quotation.id}`, quotation.work_order, 'Completed sale located')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not complete sales order'),
  })

  const invoiceMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => updateSalesInvoice(id, data),
    onSuccess: invoice => {
      toast.success('Sales invoice updated')
      setInvoiceEdit(null)
      invalidateSales()
      locateSalesRecord('/sales/invoices', `sales-invoice-${invoice.id}`, invoice.invoice_number, 'Updated invoice located')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not update invoice'),
  })

  const refundMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { amount: number; payment_method?: string; notes?: string } }) => refundSalesInvoice(id, data),
    onSuccess: invoice => {
      toast.success('Refund recorded in the invoice ledger')
      setRefundInvoice(null)
      invalidateSales()
      locateSalesRecord('/sales/invoices', `sales-invoice-${invoice.id}`, invoice.invoice_number, 'Refunded invoice located')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not record refund'),
  })

  const selectedFacility = facilities.find(f => f.id === quotationForm.facility_id)
  const selectedPrimaryRecipient = recipientCandidates.find(
    candidate => candidate.id === quotationForm.primary_recipient_user_id,
  ) || null
  const selectedAdditionalRecipients = recipientCandidates.filter(
    candidate => quotationForm.additional_recipient_user_ids?.includes(candidate.id),
  )

  const openCreate = () => {
    setEditingQuotation(null)
    setSelectedPart(null)
    setQuotationForm(emptyQuotation())
    setQuotationDialog(true)
  }

  const openEdit = (quotation: SalesQuotation) => {
    closeActions()
    setEditingQuotation(quotation)
    setSelectedPart(null)
    setQuotationForm({
      facility_id: quotation.facility_id,
      customer_name: quotation.customer_name,
      customer_email: quotation.customer_email || '',
      customer_phone: formatUSPhoneInput(quotation.customer_phone || ''),
      customer_address: quotation.customer_address || '',
      quotation_type: ['standard', 'choice_single', 'choice_multiple'].includes(quotation.quotation_type)
        ? quotation.quotation_type
        : 'standard',
      requested_date: quotation.requested_date || new Date().toISOString().slice(0, 10),
      notes: quotation.notes || '',
      tax_amount: Number(quotation.tax_amount || 0),
      discount_amount: Number(quotation.discount_amount || 0),
      primary_recipient_user_id: quotation.primary_recipient?.user_id || null,
      additional_recipient_user_ids: quotation.additional_recipients?.map(item => item.user_id).filter((id): id is number => Boolean(id)) || [],
      items: quotation.line_items.map(item => ({
        part_id: item.part_id,
        item_kind: item.item_kind,
        is_default: item.is_default,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        shipping_fee: Number(item.shipping_fee || 0),
        setup_fee: Number(item.setup_fee || 0),
        condition: item.condition || 'New',
        description: item.description,
        item_metadata: item.item_metadata,
      })),
    })
    setQuotationDialog(true)
  }

  const addLineItem = () => {
    const part = selectedPart
    if (!part) return toast.error('Select a sales part first')
    if (selectedPartQty <= 0) return toast.error('Quantity must be greater than zero')
    setQuotationForm(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          part_id: part.id,
          item_kind: 'product',
          is_default: prev.quotation_type === 'standard',
          quantity: selectedPartQty,
          unit_price: Number(part.unit_price || 0),
          shipping_fee: selectedPartShipping,
          setup_fee: selectedPartSetup,
          condition: selectedPartCondition || part.condition || 'New',
          description: `${part.part_number} - ${part.description}`,
        },
      ],
    }))
    setSelectedPart(null)
    setSelectedPartQty(1)
    setSelectedPartShipping(0)
    setSelectedPartSetup(0)
    setSelectedPartCondition('New')
  }

  const addTradeIn = () => {
    if (!tradeInDescription.trim()) return toast.error('Enter the trade-in description')
    if (tradeInValue <= 0) return toast.error('Trade-in value must be greater than zero')
    setQuotationForm(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          part_id: null,
          item_kind: 'trade_in',
          is_default: true,
          quantity: 1,
          unit_price: tradeInValue,
          shipping_fee: 0,
          setup_fee: 0,
          condition: 'Trade-in',
          description: tradeInDescription.trim(),
        },
      ],
    }))
    setTradeInDescription('')
    setTradeInValue(0)
  }

  const addRefundAdjustment = () => {
    if (!refundAdjustmentDescription.trim()) return toast.error('Enter the refund reason')
    if (refundAdjustmentValue <= 0) return toast.error('Refund payment must be greater than zero')
    setQuotationForm(prev => ({
      ...prev,
      items: [
        ...prev.items,
        {
          part_id: null,
          item_kind: 'refund',
          is_default: true,
          quantity: 1,
          unit_price: refundAdjustmentValue,
          shipping_fee: 0,
          setup_fee: 0,
          condition: 'Refund adjustment',
          description: refundAdjustmentDescription.trim(),
          item_metadata: {
            payment_reference: refundAdjustmentReference.trim() || null,
          },
        },
      ],
    }))
    setRefundAdjustmentDescription('')
    setRefundAdjustmentReference('')
    setRefundAdjustmentValue(0)
  }

  const removeLineItem = (index: number) => {
    setQuotationForm(prev => ({ ...prev, items: prev.items.filter((_, itemIndex) => itemIndex !== index) }))
  }

  const submitQuotation = (action: 'draft' | 'send') => {
    if (!quotationForm.customer_name) return toast.error('Customer name is required')
    if (quotationForm.items.length === 0) return toast.error('Add at least one sales part')
    if (action === 'send' && quotationForm.facility_id && !quotationForm.primary_recipient_user_id) {
      return toast.error('Select a primary facility recipient before sending')
    }
    if (action === 'send' && !quotationForm.customer_email) {
      return toast.error('Customer email is required before sending')
    }
    saveQuotationMut.mutate(action)
  }

  const openSalesPartInfo = (
    part?: Partial<SalesPart> | null,
    fallback?: Partial<SalesQuotationLineItem> & { part_id?: number | null; default_picture_url?: string | null },
  ) => {
    const partNumber = part?.part_number || fallback?.part_number || ''
    const matchedPart = part || parts.find(item =>
      (fallback?.part_id && item.id === fallback.part_id) ||
      (partNumber && item.part_number === partNumber),
    )
    setPartInfo({
      partNumber: matchedPart?.part_number || partNumber || String(fallback?.part_id || '-'),
      description: matchedPart?.description || fallback?.description || fallback?.part_description || '-',
      make: matchedPart?.make ?? null,
      model: matchedPart?.model ?? null,
      serialNumber: matchedPart?.serial_number ?? null,
      condition: matchedPart?.condition || fallback?.condition || null,
      quantity: matchedPart?.quantity_on_hand ?? null,
      unitPrice: matchedPart?.unit_price ?? fallback?.unit_price ?? null,
      facilityName: matchedPart?.facility_name ?? null,
      status: matchedPart?.status ?? null,
      imageUrl: matchedPart?.default_picture_url || fallback?.default_picture_url || null,
    })
  }

  const openActions = (event: MouseEvent<HTMLElement>, quotation: SalesQuotation) => {
    setActionAnchor(event.currentTarget)
    setActionQuotation(quotation)
  }

  const closeActions = () => {
    setActionAnchor(null)
    setActionQuotation(null)
  }

  const openInvoiceActions = (event: MouseEvent<HTMLElement>, invoice: SalesInvoice) => {
    setInvoiceActionAnchor(event.currentTarget)
    setActionInvoice(invoice)
  }

  const closeInvoiceActions = () => {
    setInvoiceActionAnchor(null)
    setActionInvoice(null)
  }

  const openCardAuthorization = (target: { quotation?: SalesQuotation; invoice?: SalesInvoice }) => {
    closeActions()
    closeInvoiceActions()
    setCardAuthDialog(target)
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
    setSelectedQuoteOptions(
      quotation.line_items
        .filter(item => item.item_kind === 'product' && (quotation.quotation_type === 'standard' || item.is_default || item.is_selected))
        .map(item => item.id),
    )
    setInvoiceDetails({
      ...emptyInvoiceDetails(),
      discount_amount: Number(quotation.discount_amount || 0),
      tax_rate: Number(quotation.tax_rate || 0),
      payment_method: quotation.converted_invoice_payment_method || quotation.payment_method || '',
      action: 'convert_to_invoice',
      selection_channel: canConfigureDefaults ? 'internal' : 'client_portal',
    })
  }

  const lineTotal = (item: SalesQuotationPayload['items'][number]) => {
    const total = Number(item.quantity || 0) * Number(item.unit_price || 0) + Number(item.shipping_fee || 0) + Number(item.setup_fee || 0)
    return item.item_kind === 'trade_in' || item.item_kind === 'refund' ? -Math.abs(total) : total
  }
  const hasDefaultProduct = quotationForm.items.some(item => item.item_kind === 'product' && item.is_default)
  const quotationTotal = quotationForm.items.reduce((sum, item) => {
    const included = quotationForm.quotation_type === 'standard'
      || (item.item_kind === 'product' && item.is_default)
      || (item.item_kind !== 'product' && hasDefaultProduct)
    return sum + (included ? lineTotal(item) : 0)
  }, 0)
  const quotationGrandTotal = quotationTotal + Number(quotationForm.tax_amount || 0) - Number(quotationForm.discount_amount || 0)
  const convertPartsTotal = convertQuotation
    ? convertQuotation.line_items.reduce((sum, line) => (
        line.item_kind !== 'product' || convertQuotation.quotation_type === 'standard' || selectedQuoteOptions.includes(line.id)
          ? sum + Number(line.total || 0)
          : sum
      ), 0)
    : 0
  const convertTaxAmount = convertPartsTotal * Number(invoiceDetails.tax_rate || 0) / 100
  const convertGrandTotal =
    convertPartsTotal +
    Number(invoiceDetails.worked_hours || 0) +
    Number(invoiceDetails.setup_fee || 0) +
    Number(invoiceDetails.service_fee || 0) +
    Number(invoiceDetails.shipping_fee || 0) +
    Number(invoiceDetails.application_fee || 0) +
    convertTaxAmount -
    (invoiceDetails.discount_type === 'percent'
      ? (convertPartsTotal + Number(invoiceDetails.worked_hours || 0) + Number(invoiceDetails.setup_fee || 0) + Number(invoiceDetails.service_fee || 0) + Number(invoiceDetails.shipping_fee || 0) + Number(invoiceDetails.application_fee || 0)) * Number(invoiceDetails.discount_amount || 0) / 100
      : Number(invoiceDetails.discount_amount || 0))

  const applyConvertAction = () => {
    if (!convertQuotation) return
    const action = invoiceDetails.action || 'convert_to_invoice'
    if (action === 'approve') {
      updateSalesQuotation(convertQuotation.id, { status: 'approved' })
        .then(updated => {
          toast.success('Quotation approved')
          setConvertQuotation(null)
          invalidateSales()
          locateSalesRecord('/sales/quotations', `sales-quotation-${updated.id}`, updated.work_order, 'Approved quotation located')
        })
        .catch((e: any) => toast.error(e.response?.data?.detail || 'Could not approve quotation'))
      return
    }
    if (action === 'reject') {
      updateSalesQuotation(convertQuotation.id, { status: 'rejected' })
        .then(updated => {
          toast.success('Quotation rejected')
          setConvertQuotation(null)
          invalidateSales()
          locateSalesRecord('/sales/quotations', `sales-quotation-${updated.id}`, updated.work_order, 'Rejected quotation located')
        })
        .catch((e: any) => toast.error(e.response?.data?.detail || 'Could not reject quotation'))
      return
    }
    if (action === 'mark_pending') {
      updateSalesQuotation(convertQuotation.id, { status: 'pending' })
        .then(updated => {
          toast.success('Quotation marked pending')
          setConvertQuotation(null)
          invalidateSales()
          locateSalesRecord('/sales/quotations', `sales-quotation-${updated.id}`, updated.work_order, 'Pending quotation located')
        })
        .catch((e: any) => toast.error(e.response?.data?.detail || 'Could not mark quotation pending'))
      return
    }
    convertMut.mutate({
      id: convertQuotation.id,
      data: {
        ...invoiceDetails,
        selected_line_item_ids: selectedQuoteOptions,
        selection_channel: canConfigureDefaults ? 'internal' : 'client_portal',
      },
    })
  }

  const syncCustomerFromFacility = (facilityId: number | '', selected?: Facility | null) => {
    const facility = selected || facilities.find(item => item.id === facilityId)
    setQuotationForm(prev => ({
      ...prev,
      facility_id: facilityId ? Number(facilityId) : null,
      customer_name: facility?.billing_name || facility?.name || prev.customer_name,
      customer_email: facility?.billing_email || facility?.email || prev.customer_email,
      customer_phone: facility?.phone ? formatUSPhoneInput(facility.phone) : prev.customer_phone,
      customer_address: facility
        ? [facility.billing_street || facility.address, facility.billing_city || facility.city, facility.billing_state || facility.state, facility.billing_zip_code || facility.zip_code].filter(Boolean).join(', ')
        : prev.customer_address,
      primary_recipient_user_id: null,
      additional_recipient_user_ids: [],
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

  const sameInvoiceAccount = (left: SalesInvoice, right: SalesInvoice) => {
    if (left.facility_id && right.facility_id) return left.facility_id === right.facility_id
    return left.customer_name.trim().toLowerCase() === right.customer_name.trim().toLowerCase()
  }

  const invoiceLineItems = (invoice: SalesInvoice | null): PrintableLineItem[] => {
    if (!invoice) return []
    if (invoice.line_items?.length) {
      return invoice.line_items.map((line: any) => ({
        item_number: line.item_number || line.part_number || (line.item_kind === 'refund' ? 'REFUND' : line.item_kind === 'trade_in' ? 'TRADE-IN' : String(line.part_id || '-')),
        description: line.description || line.part_description || 'Sales item',
        quantity: Number(line.quantity || 1),
        unit_price: Number(line.unit_price || 0),
        shipping_fee: Number(line.shipping_fee || 0),
        setup_fee: Number(line.setup_fee || 0),
        condition: line.condition || null,
        total_amount: Number(line.total ?? line.total_amount ?? 0),
      }))
    }
    const quotation = quotations.find(item => item.id === invoice.sales_quotation_id)
    if (quotation?.line_items?.length) {
      return quotation.line_items.map(line => ({
        item_number: line.part_number || String(line.part_id),
        description: line.description || line.part_description || 'Sales item',
        quantity: Number(line.quantity || 1),
        unit_price: Number(line.unit_price || 0),
        shipping_fee: Number(line.shipping_fee || 0),
        setup_fee: Number(line.setup_fee || 0),
        condition: line.condition || null,
        total_amount: Number(line.total || 0),
      }))
    }
    return [{
      item_number: invoice.invoice_number,
      description: invoice.notes || 'Sales invoice',
      quantity: 1,
      unit_price: Number(invoice.subtotal || invoice.total_amount || 0),
      shipping_fee: 0,
      setup_fee: 0,
      condition: null,
      total_amount: Number(invoice.subtotal || invoice.total_amount || 0),
    }]
  }

  const quotationLineItems = (quotation: SalesQuotation | null): PrintableLineItem[] => {
    if (!quotation) return []
    const lines = quotation.selection_status === 'accepted'
      ? (quotation.line_items || []).filter(line => line.is_selected)
      : (quotation.line_items || [])
    return lines.map(line => ({
      item_number: line.part_number || String(line.part_id),
      description: line.description || line.part_description || 'Sales item',
      quantity: Number(line.quantity || 1),
      unit_price: Number(line.unit_price || 0),
      shipping_fee: Number(line.shipping_fee || 0),
      setup_fee: Number(line.setup_fee || 0),
      condition: line.condition || null,
      total_amount: Number(line.total || 0),
    }))
  }

  const quotationLedgerTransactions = (quotation: SalesQuotation | null): PrintableLedgerTransaction[] => {
    if (!quotation) return []
    return invoices
      .filter(invoice => {
        if (quotation.facility_id && invoice.facility_id) return quotation.facility_id === invoice.facility_id
        return quotation.customer_name.trim().toLowerCase() === invoice.customer_name.trim().toLowerCase()
      })
      .flatMap(invoice => (invoice.transactions || []).map(transaction => ({
        ...transaction,
        invoice_number: invoice.invoice_number,
      })))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }

  const invoiceLedgerTransactions = (invoice: SalesInvoice | null): PrintableLedgerTransaction[] => {
    if (!invoice) return []
    return invoices
      .filter(item => sameInvoiceAccount(invoice, item))
      .flatMap(item => (item.transactions || []).map(transaction => ({
        ...transaction,
        invoice_number: item.invoice_number,
      })))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }

  const cardAuthorizationQuotation = cardAuthDialog?.quotation
    || quotations.find(item => item.id === cardAuthDialog?.invoice?.sales_quotation_id)
    || null

  const authorizationInvoiceNumber = cardAuthDialog?.invoice?.invoice_number
    || cardAuthorizationQuotation?.converted_invoice_number
    || 'Accepted sales invoice'
  const authorizationBalance = Number(
    cardAuthDialog?.invoice?.balance_due
    ?? cardAuthorizationQuotation?.converted_invoice_balance_due
    ?? 0,
  )
  const cardAuthorizationItems: AuthorizationLineItem[] = cardAuthDialog
    ? [{
      item_number: authorizationInvoiceNumber,
      description: 'Approved invoice outstanding balance',
      amount: authorizationBalance,
      quantity: 1,
      total_amount: authorizationBalance,
    }]
    : []

  const submitCardAuthorization = (payload: CreditCardAuthorizationPayload) => {
    const quotationId = cardAuthorizationQuotation?.id || cardAuthDialog?.invoice?.sales_quotation_id
    if (quotationId) {
      cardAuthMut.mutate({ id: quotationId, data: payload })
    } else {
      toast.error('This authorization must be tied to an accepted sales invoice')
    }
  }

  const quotationPaymentPercent = (quotation: SalesQuotation) => {
    const paid = Number(quotation.converted_invoice_amount_paid || 0)
    const total = Number(quotation.total_amount || 0)
    return total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0
  }

  const renderPagination = (total: number, page: number, setPage: (next: number) => void) => (
    total > PAGE_SIZE ? (
      <TablePagination
        component="div"
        count={total}
        page={page}
        onPageChange={(_, next) => setPage(next)}
        rowsPerPage={PAGE_SIZE}
        rowsPerPageOptions={[PAGE_SIZE]}
        sx={{ borderTop: '1px solid #EEF0F6' }}
      />
    ) : null
  )

  const renderQuotationTable = (items: SalesQuotation[], emptyText: string) => (
    <TableContainer className="list-scroll-panel">
      <Table stickyHeader>
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
            const highlighted = highlightQuotationId === item.id
            return (
              <ContextTableRow
                key={item.id}
                recordKey={`sales-quotation-${item.id}`}
                recordLabel={item.work_order || `Quotation #${item.id}`}
                id={`sales-quotation-${item.id}`}
                hover
                sx={highlighted ? {
                  bgcolor: '#F5F3FF',
                  outline: '2px solid #7C3AED',
                  outlineOffset: '-2px',
                  '& td': { borderTop: '1px solid #DDD6FE', borderBottom: '1px solid #DDD6FE' },
                } : undefined}
              >
                <TableCell>{item.id}</TableCell>
                <TableCell><ClippedTooltipText value={item.work_order} monospace color="#1E40AF" fontWeight={900} onClick={() => setViewQuotation(item)} /></TableCell>
                <TableCell><ClippedTooltipText value={item.facility_name || item.customer_name} fontWeight={800} onClick={item.facility_name ? () => navigate(`/facilities?search=${encodeURIComponent(item.facility_name!)}`) : undefined} /></TableCell>
                <TableCell sx={{ textTransform: 'capitalize' }}>{item.quotation_type.replace(/_/g, ' ')}</TableCell>
                <TableCell>{item.created_by_name || '-'}</TableCell>
                <TableCell>{formatDate(item.requested_date)}</TableCell>
                <TableCell><Chip size="small" label={item.status.replace('_', ' ')} sx={{ bgcolor: status.bg, color: status.color, fontWeight: 900, textTransform: 'uppercase' }} /></TableCell>
                <TableCell><Chip size="small" label={item.paid_status === 'unpaid' ? 'Unpaid' : item.paid_status.replace(/_/g, ' ')} sx={{ bgcolor: paid.bg, color: paid.color, fontWeight: 900, textTransform: 'uppercase' }} /></TableCell>
                <TableCell align="right">
                  {highlighted && (
                    <Chip size="small" label="Selected" sx={{ mr: 1, bgcolor: '#EDE9FE', color: '#6D28D9', fontWeight: 900 }} />
                  )}
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
                  <IconButton
                    size="small"
                    onClick={(event) => openActions(event, item)}
                    sx={{ borderRadius: '12px', bgcolor: '#F3F4F6', color: '#4F46E5', '&:hover': { bgcolor: '#EDE9FE' } }}
                  >
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </ContextTableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )

  const renderInvoices = () => (
    <TableContainer className="list-scroll-panel">
      <Table stickyHeader>
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
            const highlighted = highlightInvoiceId === invoice.id
            return (
              <ContextTableRow
                key={invoice.id}
                recordKey={`sales-invoice-${invoice.id}`}
                recordLabel={invoice.invoice_number}
                id={`sales-invoice-${invoice.id}`}
                hover
                sx={highlighted ? {
                  bgcolor: '#F5F3FF',
                  outline: '2px solid #7C3AED',
                  outlineOffset: '-2px',
                  '& td': { borderTop: '1px solid #DDD6FE', borderBottom: '1px solid #DDD6FE' },
                } : undefined}
              >
                <TableCell><ClippedTooltipText value={invoice.invoice_number} monospace color="#7161D8" fontWeight={900} onClick={() => setViewInvoice(invoice)} /></TableCell>
                <TableCell><ClippedTooltipText value={invoice.work_order || '-'} monospace fontWeight={800} onClick={() => openLinkedQuotation(invoice.sales_quotation_id)} /></TableCell>
                <TableCell><ClippedTooltipText value={invoice.customer_name} fontWeight={800} /></TableCell>
                <TableCell><ClippedTooltipText value={invoice.facility_name || '-'} onClick={invoice.facility_name ? () => navigate(`/facilities?search=${encodeURIComponent(invoice.facility_name!)}`) : undefined} /></TableCell>
                <TableCell sx={{ color: '#059669', fontWeight: 900 }}>{money(invoice.total_amount)}</TableCell>
                <TableCell>{money(invoice.net_paid ?? invoice.amount_paid)}</TableCell>
                <TableCell>
                  <Chip size="small" label={(invoice.refund_status !== 'none' ? invoice.refund_status : invoice.status).replace('_', ' ')} sx={{ bgcolor: chip.bg, color: chip.color, fontWeight: 900, textTransform: 'uppercase' }} />
                </TableCell>
                <TableCell>{formatDate(invoice.due_date)}</TableCell>
                <TableCell align="right">
                  {highlighted && (
                    <Chip size="small" label="Selected from Billing" sx={{ mr: 1, bgcolor: '#EDE9FE', color: '#6D28D9', fontWeight: 900 }} />
                  )}
                  <IconButton
                    size="small"
                    onClick={(event) => openInvoiceActions(event, invoice)}
                    sx={{ borderRadius: '12px', bgcolor: '#F3F4F6', color: '#4F46E5', '&:hover': { bgcolor: '#EDE9FE' } }}
                  >
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </ContextTableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )

  const activeSearchFields = tab === 1
    ? SALES_INVOICE_SEARCH_FIELDS
    : tab === 3
      ? SALES_COMPLETED_HISTORY_SEARCH_FIELDS
      : SALES_ORDER_SEARCH_FIELDS

  const setRouteParam = (key: string, value: string) => {
    const params = new URLSearchParams(location.search)
    if (value) params.set(key, value)
    else params.delete(key)
    navigate(`${location.pathname}${params.size ? `?${params.toString()}` : ''}`, { replace: true })
  }

  const handleTabChange = (value: number) => {
    const params = new URLSearchParams()
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    navigate(`${ROUTE_TABS[value]}${params.size ? `?${params.toString()}` : ''}`)
  }

  const handleSearchFieldChange = (value: string) => {
    const params = new URLSearchParams(location.search)
    if (value === 'all') params.delete('search_field')
    else params.set('search_field', value)
    navigate(`${location.pathname}${params.size ? `?${params.toString()}` : ''}`, { replace: true })
  }

  const renderSearchControl = (label: string) => (
    <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center', flexWrap: 'wrap' }}>
      <SearchFieldSelect
        value={searchField}
        options={activeSearchFields}
        onChange={handleSearchFieldChange}
        ariaLabel="Sales search field"
      />
      <TextField
        size="small"
        label={label}
        placeholder={`Search ${activeSearchFields.find((field) => field.value === searchField)?.label.toLowerCase() || 'sales'}...`}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        sx={{ minWidth: 280, bgcolor: '#fff' }}
      />
      <DateRangeFilter
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={(value) => setRouteParam('date_from', value)}
        onDateToChange={(value) => setRouteParam('date_to', value)}
        label={tab === 1 ? 'invoice issue date' : tab === 3 ? 'sale or history date' : 'requested date'}
      />
    </Box>
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
        <Tabs value={tab} onChange={(_, value) => handleTabChange(value)} variant="scrollable" scrollButtons={false} sx={{ px: 2, borderBottom: '1px solid #EEF0F6' }}>
          <Tab icon={<AssignmentIcon />} iconPosition="start" label="Quotations" />
          <Tab icon={<ReceiptLongIcon />} iconPosition="start" label="Invoice" />
          <Tab icon={<ShoppingCartIcon />} iconPosition="start" label="In Progress" />
          <Tab icon={<CheckCircleIcon />} iconPosition="start" label="Completed & History" />
        </Tabs>

        {tab === 0 && (
          <Box>
            <Box sx={{ px: 3, py: 2, display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center', borderBottom: '1px solid #EEF0F6', flexWrap: 'wrap' }}>
              <Box>
                <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Quotation Parts List</Typography>
                <Typography sx={{ color: '#6B7280', fontWeight: 700, fontSize: 13 }}>{summary?.parts ?? 0} sales part{(summary?.parts ?? 0) === 1 ? '' : 's'} available from inventory.</Typography>
              </Box>
              {renderSearchControl('Search quotations')}
            </Box>
            <Box sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', gap: 2, mb: 2, color: '#2434B6', fontWeight: 900, flexWrap: 'wrap' }}>
                {['None', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')].map(letter => <Typography key={letter} sx={{ fontWeight: 900, fontSize: 14 }}>{letter}</Typography>)}
              </Box>
              {renderQuotationTable(pendingQuotations, 'No pending sales quotations found.')}
              {renderPagination(quotationsQ.data?.total || 0, quotationsPage, setQuotationsPage)}
            </Box>
          </Box>
        )}
        {tab === 1 && (
          <Box>
            <Box sx={{ px: 3, py: 2, display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center', borderBottom: '1px solid #EEF0F6', flexWrap: 'wrap' }}>
              <Box>
                <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Sales Invoices</Typography>
                <Typography sx={{ color: '#6B7280', fontWeight: 700, fontSize: 13 }}>Search by invoice, customer, facility, quotation, status, amount, or date.</Typography>
              </Box>
              {renderSearchControl('Search invoices')}
            </Box>
            {renderInvoices()}
            {renderPagination(invoicesQ.data?.total || 0, invoicesPage, setInvoicesPage)}
          </Box>
        )}
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
                {renderSearchControl('Search in-progress sales')}
              </Box>
              <LinearProgress variant="determinate" value={inProgressPaymentPercent} sx={{ height: 10, borderRadius: 10, bgcolor: '#E0E7FF', '& .MuiLinearProgress-bar': { borderRadius: 10, bgcolor: '#7C3AED' } }} />
              <Typography sx={{ mt: 1, color: '#6B7280', fontWeight: 800, fontSize: 12 }}>{inProgressPaymentPercent}% collected across active sales.</Typography>
            </Card>
              {renderQuotationTable(inProgressQuotations, 'No sales orders in progress.')}
              {renderPagination(inProgressQ.data?.total || 0, inProgressPage, setInProgressPage)}
          </Box>
        )}
        {tab === 3 && (
          <Box sx={{ p: 3 }}>
            <Card sx={{ p: 2.5, mb: 2, borderRadius: '18px', border: '1px solid #EEF0F6', bgcolor: '#F7FEF9' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <Box>
                  <Typography sx={{ color: '#6B7280', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>Total Completed Sales</Typography>
                  <Typography sx={{ color: '#059669', fontSize: 30, fontWeight: 900 }}>{money(completedTotal)}</Typography>
                </Box>
                {renderSearchControl('Search completed sales')}
              </Box>
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
            {renderPagination(completedQ.data?.total || 0, completedPage, setCompletedPage)}
          </Box>
        )}
        {tab === 3 && (
          <Box>
          <Box sx={{ px: 3, py: 2, display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center', borderBottom: '1px solid #EEF0F6', flexWrap: 'wrap' }}>
            <Box>
              <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Sales History</Typography>
              <Typography sx={{ color: '#6B7280', fontWeight: 700, fontSize: 13 }}>Search by work order, quotation, customer, facility, activity, user, or date.</Typography>
            </Box>
            <Typography sx={{ color: '#7C3AED', fontWeight: 800, fontSize: 13 }}>
              Uses the Completed &amp; History filters above
            </Typography>
          </Box>
          <TableContainer className="list-scroll-panel">
            <Table stickyHeader>
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
                  <ContextTableRow
                    key={`${item.quotation_id}-${item.action}-${index}`}
                    recordKey={`sales-history-${item.quotation_id}-${index}`}
                    recordLabel={`${item.quotation_number} · ${item.action.replace(/_/g, ' ')}`}
                    hover
                  >
                    <TableCell>{formatDate(item.at)}</TableCell>
                    <TableCell><ClippedTooltipText value={item.work_order} monospace fontWeight={900} onClick={() => openLinkedQuotation(item.quotation_id)} /></TableCell>
                    <TableCell><ClippedTooltipText value={item.quotation_number} monospace color="#7161D8" fontWeight={900} onClick={() => openLinkedQuotation(item.quotation_id)} /></TableCell>
                    <TableCell><ClippedTooltipText value={item.customer_name} /></TableCell>
                    <TableCell><ClippedTooltipText value={item.facility_name || '-'} onClick={item.facility_name ? () => navigate(`/facilities?search=${encodeURIComponent(item.facility_name!)}`) : undefined} /></TableCell>
                    <TableCell sx={{ textTransform: 'capitalize', fontWeight: 800 }}>{item.action.replace(/_/g, ' ')}</TableCell>
                    <TableCell>{item.by}</TableCell>
                  </ContextTableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {renderPagination(historyQ.data?.total || 0, historyPage, setHistoryPage)}
          </Box>
        )}
      </Card>

      <Menu anchorEl={actionAnchor} open={Boolean(actionAnchor)} onClose={closeActions} PaperProps={{ sx: ACTION_MENU_PAPER }}>
        {actionQuotation && ['draft', 'pending', 'sent', 'viewed'].includes(String(actionQuotation.status)) && (
          <MenuItem
            sx={ACTION_MENU_ITEM}
            disabled={sendQuotationMut.isPending}
            onClick={() => sendQuotationMut.mutate(actionQuotation.id)}
          >
            <ListItemIcon sx={{ color: 'inherit', minWidth: 34 }}><AssignmentIcon fontSize="small" /></ListItemIcon>
            {['sent', 'viewed'].includes(String(actionQuotation.status)) ? 'Resend Quotation' : 'Send Quotation'}
          </MenuItem>
        )}
        <MenuItem sx={ACTION_MENU_ITEM} disabled={!actionQuotation || Boolean(actionQuotation.converted_invoice_id)} onClick={() => actionQuotation && openConvertDialog(actionQuotation)}>
          <ListItemIcon sx={{ color: 'inherit', minWidth: 34 }}><ReceiptLongIcon fontSize="small" /></ListItemIcon>
          {actionQuotation?.quotation_type === 'standard' ? 'Convert to Invoice' : 'Choose Options & Generate Invoice'}
        </MenuItem>
        <MenuItem
          sx={ACTION_MENU_ITEM}
          disabled={!actionQuotation || Boolean(actionQuotation.converted_invoice_id) || !['draft', 'pending', 'changes_requested'].includes(String(actionQuotation.status))}
          onClick={() => actionQuotation && openEdit(actionQuotation)}
        >
          <ListItemIcon sx={{ color: 'inherit', minWidth: 34 }}><EditIcon fontSize="small" /></ListItemIcon>
          Edit
        </MenuItem>
        <MenuItem sx={ACTION_MENU_ITEM} onClick={() => { if (actionQuotation) setViewQuotation(actionQuotation); closeActions() }}>
          <ListItemIcon sx={{ color: 'inherit', minWidth: 34 }}><VisibilityIcon fontSize="small" /></ListItemIcon>
          View
        </MenuItem>
        {actionQuotation?.status === 'in_progress' && (
          <MenuItem sx={ACTION_MENU_ITEM} onClick={() => { if (actionQuotation) completeMut.mutate(actionQuotation.id); closeActions() }}>
            <ListItemIcon sx={{ color: 'inherit', minWidth: 34 }}><CheckCircleIcon fontSize="small" /></ListItemIcon>
            Complete
          </MenuItem>
        )}
        <MenuItem sx={ACTION_MENU_ITEM} onClick={() => { if (actionQuotation) setPrintQuotation(actionQuotation); closeActions() }}>
          <ListItemIcon sx={{ color: 'inherit', minWidth: 34 }}><PrintIcon fontSize="small" /></ListItemIcon>
          Print Documents
        </MenuItem>
        <MenuItem sx={ACTION_MENU_DANGER} disabled={!actionQuotation || Boolean(actionQuotation.converted_invoice_id)} onClick={() => actionQuotation && deleteQuotationMut.mutate(actionQuotation.id)}>
          <ListItemIcon sx={{ color: 'inherit', minWidth: 34 }}><DeleteIcon fontSize="small" /></ListItemIcon>
          Delete
        </MenuItem>
        <MenuItem
          sx={ACTION_MENU_ITEM}
          disabled={
            !actionQuotation?.acceptance
            || !actionQuotation.converted_invoice_id
            || Number(actionQuotation.converted_invoice_balance_due || 0) <= 0
          }
          onClick={() => actionQuotation && openCardAuthorization({ quotation: actionQuotation })}
        >
          <ListItemIcon sx={{ color: 'inherit', minWidth: 34 }}><CreditCardIcon fontSize="small" /></ListItemIcon>
          Request Card Authorization
        </MenuItem>
      </Menu>

      <Menu anchorEl={invoiceActionAnchor} open={Boolean(invoiceActionAnchor)} onClose={closeInvoiceActions} PaperProps={{ sx: ACTION_MENU_PAPER }}>
        <MenuItem sx={ACTION_MENU_ITEM} onClick={() => { if (actionInvoice) setViewInvoice(actionInvoice); closeInvoiceActions() }}>
          <ListItemIcon sx={{ color: 'inherit', minWidth: 34 }}><VisibilityIcon fontSize="small" /></ListItemIcon>
          View
        </MenuItem>
        <MenuItem sx={ACTION_MENU_ITEM} onClick={() => { if (actionInvoice) setPrintInvoice(actionInvoice); closeInvoiceActions() }}>
          <ListItemIcon sx={{ color: 'inherit', minWidth: 34 }}><PrintIcon fontSize="small" /></ListItemIcon>
          Print Documents
        </MenuItem>
        <MenuItem sx={ACTION_MENU_ITEM} onClick={() => {
          if (actionInvoice) {
            openInvoiceEdit(actionInvoice)
            setInvoiceForm(prev => ({ ...prev, amount_paid: Number(actionInvoice.total_amount || 0), status: 'paid' }))
          }
          closeInvoiceActions()
        }}>
          <ListItemIcon sx={{ color: 'inherit', minWidth: 34 }}><PaymentIcon fontSize="small" /></ListItemIcon>
          Pay
        </MenuItem>
        <MenuItem sx={ACTION_MENU_ITEM} onClick={() => { if (actionInvoice) openInvoiceEdit(actionInvoice); closeInvoiceActions() }}>
          <ListItemIcon sx={{ color: 'inherit', minWidth: 34 }}><EditIcon fontSize="small" /></ListItemIcon>
          Edit
        </MenuItem>
        <MenuItem
          sx={ACTION_MENU_ITEM}
          disabled={!actionInvoice || Number(actionInvoice.amount_paid || 0) - Number(actionInvoice.refunded_amount || 0) <= 0}
          onClick={() => {
            if (actionInvoice) {
              const refundable = Math.max(0, Number(actionInvoice.amount_paid || 0) - Number(actionInvoice.refunded_amount || 0))
              setRefundInvoice(actionInvoice)
              setRefundForm({ amount: refundable, payment_method: actionInvoice.payment_method || '', notes: '' })
            }
            closeInvoiceActions()
          }}
        >
          <ListItemIcon sx={{ color: 'inherit', minWidth: 34 }}><PaymentIcon fontSize="small" /></ListItemIcon>
          Refund Payment
        </MenuItem>
        <MenuItem
          sx={ACTION_MENU_ITEM}
          disabled={
            !actionInvoice?.sales_quotation_id
            || Number(actionInvoice.balance_due || 0) <= 0
          }
          onClick={() => actionInvoice && openCardAuthorization({ invoice: actionInvoice })}
        >
          <ListItemIcon sx={{ color: 'inherit', minWidth: 34 }}><CreditCardIcon fontSize="small" /></ListItemIcon>
          Request Card Authorization
        </MenuItem>
        <MenuItem sx={ACTION_MENU_ITEM} disabled={!actionInvoice?.sales_quotation_id} onClick={() => {
          if (actionInvoice?.sales_quotation_id) completeMut.mutate(actionInvoice.sales_quotation_id)
          closeInvoiceActions()
        }}>
          <ListItemIcon sx={{ color: 'inherit', minWidth: 34 }}><ShoppingCartIcon fontSize="small" /></ListItemIcon>
          Sale
        </MenuItem>
      </Menu>

      <CreditCardAuthorizationDialog
        open={Boolean(cardAuthDialog)}
        customerName={cardAuthDialog?.quotation?.customer_name || cardAuthDialog?.invoice?.customer_name}
        requestType="Sales"
        items={cardAuthorizationItems}
        secureRequestMode
        submitting={cardAuthMut.isPending}
        onClose={() => setCardAuthDialog(null)}
        onSubmit={submitCardAuthorization}
      />

      <InvoicePrintDialog
        open={Boolean(printQuotation)}
        onClose={() => setPrintQuotation(null)}
        invoice={printQuotation ? {
          invoice_number: printQuotation.quotation_number,
          invoice_type: printQuotation.quotation_type,
          reference_number: printQuotation.work_order,
          customer_name: printQuotation.customer_name,
          customer_email: printQuotation.customer_email,
          facility_name: printQuotation.facility_name,
          subtotal: Number(printQuotation.subtotal || 0),
          tax_amount: Number(printQuotation.tax_amount || 0),
          discount_amount: Number(printQuotation.discount_amount || 0),
          total_amount: Number(printQuotation.total_amount || 0),
          amount_paid: Number(printQuotation.converted_invoice_amount_paid || 0),
          balance_due: Math.max(0, Number(printQuotation.total_amount || 0) - Number(printQuotation.converted_invoice_amount_paid || 0)),
          status: String(printQuotation.status || ''),
          issue_date: printQuotation.created_at,
          due_date: printQuotation.requested_date,
          payment_method: printQuotation.converted_invoice_payment_method || printQuotation.payment_method,
          notes: printQuotation.notes,
        } : null}
        lineItems={quotationLineItems(printQuotation)}
        ledgerTransactions={quotationLedgerTransactions(printQuotation)}
        moduleLabel="Sales"
        primaryDocumentLabel="Quotation"
        accent="#7C3AED"
        acceptance={printQuotation?.acceptance || null}
      />

      <InvoicePrintDialog
        open={Boolean(printInvoice)}
        onClose={() => setPrintInvoice(null)}
        invoice={printInvoice ? (() => {
          const q = quotations.find(item => item.id === printInvoice.sales_quotation_id)
          const hasExtraFees = q && (Number(q.worked_hours) > 0 || Number(q.setup_fee) > 0 || Number(q.service_fee) > 0 || Number(q.shipping_fee) > 0 || Number(q.application_fee) > 0)
          return {
            invoice_number: printInvoice.invoice_number,
            invoice_type: printInvoice.invoice_type,
            reference_number: printInvoice.work_order || printInvoice.sales_quotation_number,
            customer_name: printInvoice.customer_name,
            customer_email: printInvoice.customer_email,
            facility_name: printInvoice.facility_name,
            subtotal: Number(printInvoice.subtotal || 0),
            tax_amount: Number(printInvoice.tax_amount || 0),
            discount_amount: Number(printInvoice.discount_amount || 0),
            total_amount: Number(printInvoice.total_amount || 0),
            amount_paid: Number(printInvoice.net_paid ?? printInvoice.amount_paid ?? 0),
            balance_due: Number(printInvoice.balance_due || 0),
            status: String(printInvoice.status || ''),
            issue_date: printInvoice.issue_date,
            due_date: printInvoice.due_date,
            payment_method: printInvoice.payment_method,
            notes: printInvoice.notes,
            ...(hasExtraFees && q ? {
              parts_total: Number(q.subtotal || 0),
              worked_hours_fee: Number(q.worked_hours || 0) || null,
              setup_fee_extra: Number(q.setup_fee || 0) || null,
              service_fee_extra: Number(q.service_fee || 0) || null,
              shipping_fee_extra: Number(q.shipping_fee || 0) || null,
              application_fee_extra: Number(q.application_fee || 0) || null,
            } : {}),
          }
        })() : null}
        lineItems={invoiceLineItems(printInvoice)}
        ledgerTransactions={invoiceLedgerTransactions(printInvoice)}
        moduleLabel="Sales"
        accent="#7C3AED"
      />

      <Dialog open={quotationDialog} onClose={() => setQuotationDialog(false)} maxWidth="lg" fullWidth PaperProps={{ sx: { borderRadius: '22px' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>{editingQuotation ? 'Edit Sales Quotation' : 'Create Sales Quotation'}</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2, pt: 1 }}>
            <FacilitySearchAutocomplete
              label="Facility"
              value={quotationForm.facility_id || ''}
              enabled={quotationDialog}
              selectedFacility={selectedFacility}
              allowClear
              helperText="Leave empty for an independent customer"
              onChange={facilityId => setQuotationForm(previous => ({
                ...previous,
                facility_id: facilityId ? Number(facilityId) : null,
              }))}
              onFacilityChange={facility => syncCustomerFromFacility(facility?.id || '', facility)}
            />
            {quotationForm.facility_id ? (
              <>
                <Autocomplete<SalesQuotationRecipientCandidate>
                  options={recipientCandidates}
                  value={selectedPrimaryRecipient}
                  loading={recipientCandidatesQ.isLoading}
                  getOptionLabel={option => `${option.full_name} · ${option.email}`}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                  onChange={(_, recipient) => setQuotationForm(prev => ({
                    ...prev,
                    primary_recipient_user_id: recipient?.id || null,
                    additional_recipient_user_ids: (prev.additional_recipient_user_ids || []).filter(id => id !== recipient?.id),
                    customer_name: recipient?.full_name || prev.customer_name,
                    customer_email: recipient?.email || prev.customer_email,
                    customer_phone: recipient?.phone ? formatUSPhoneInput(recipient.phone) : prev.customer_phone,
                  }))}
                  renderInput={params => (
                    <TextField
                      {...params}
                      label="Primary Recipient"
                      helperText={recipientCandidates.length === 0 && !recipientCandidatesQ.isLoading
                        ? 'No facility admin, manager, or client is attached to this facility'
                        : 'This person can accept or decline the quotation'}
                    />
                  )}
                />
                <Autocomplete<SalesQuotationRecipientCandidate, true>
                  multiple
                  options={recipientCandidates.filter(candidate => candidate.id !== quotationForm.primary_recipient_user_id)}
                  value={selectedAdditionalRecipients}
                  loading={recipientCandidatesQ.isLoading}
                  getOptionLabel={option => `${option.full_name} · ${option.email}`}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                  onChange={(_, recipients) => setQuotationForm(prev => ({
                    ...prev,
                    additional_recipient_user_ids: recipients.map(item => item.id),
                  }))}
                  renderInput={params => (
                    <TextField
                      {...params}
                      label="Additional Recipients"
                      helperText="Optional; copied recipients can view the quotation"
                    />
                  )}
                />
              </>
            ) : null}
            <TextField label="Customer Name *" value={quotationForm.customer_name} onChange={e => setQuotationForm(prev => ({ ...prev, customer_name: e.target.value }))} />
            <TextField label="Customer Email" value={quotationForm.customer_email || ''} onChange={e => setQuotationForm(prev => ({ ...prev, customer_email: e.target.value }))} />
            <TextField label="Customer Phone" value={quotationForm.customer_phone || ''} onChange={e => setQuotationForm(prev => ({ ...prev, customer_phone: formatUSPhoneInput(e.target.value) }))} />
            <TextField
              select
              label="Quotation Type"
              value={quotationForm.quotation_type || 'standard'}
              onChange={e => {
                const quotationType = e.target.value
                setQuotationForm(prev => ({
                  ...prev,
                  quotation_type: quotationType,
                  items: prev.items.map(item => ({
                    ...item,
                    is_default: item.item_kind !== 'product' || quotationType === 'standard',
                  })),
                }))
              }}
            >
              <MenuItem value="standard">Standard</MenuItem>
              <MenuItem value="choice_single">Choice Single</MenuItem>
              <MenuItem value="choice_multiple">Choice Multiple</MenuItem>
            </TextField>
            <TextField label="Requested Date" type="date" value={quotationForm.requested_date || ''} onChange={e => setQuotationForm(prev => ({ ...prev, requested_date: e.target.value }))} InputLabelProps={{ shrink: true }} />
            <TextField label="Customer Address" value={quotationForm.customer_address || ''} onChange={e => setQuotationForm(prev => ({ ...prev, customer_address: e.target.value }))} sx={{ gridColumn: '1 / -1' }} />
          </Box>

          <Divider sx={{ my: 3 }} />
          <Typography sx={{ fontWeight: 900, color: '#1E1B4B', mb: 1 }}>Sales Parts</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 110px 130px 130px 150px auto' }, gap: 2, mb: 2 }}>
            <PartSearchAutocomplete<SalesPart>
              label="Part assigned for sale"
              value={selectedPart}
              onChange={setSelectedPart}
              fetchParts={fetchSalesParts}
              queryKey="sales-parts-picker"
              icon={<Inventory2Icon fontSize="small" />}
              avatarBg="#F5F3FF"
              avatarColor="#7C3AED"
            />
            <TextField label="Qty" type="number" value={selectedPartQty} onChange={e => setSelectedPartQty(Number(e.target.value))} />
            <TextField label="Shipping Fee" type="number" value={selectedPartShipping} onChange={e => setSelectedPartShipping(Number(e.target.value))} />
            <TextField label="Setup Fee" type="number" value={selectedPartSetup} onChange={e => setSelectedPartSetup(Number(e.target.value))} />
            <TextField select label="Condition" value={selectedPartCondition} onChange={e => setSelectedPartCondition(e.target.value)}>
              {['New', 'Used', 'Refurbished', 'Damaged'].map(condition => <MenuItem key={condition} value={condition}>{condition}</MenuItem>)}
            </TextField>
            <Button startIcon={<AddIcon />} variant="contained" onClick={addLineItem} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900 }}>Add Part</Button>
          </Box>

          <Card sx={{ p: 2, mb: 2, borderRadius: '16px', bgcolor: '#FFF7ED', border: '1px solid #FED7AA' }}>
            <Typography sx={{ fontWeight: 900, color: '#9A3412', mb: 1 }}>Optional Trade-In Credit</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 180px auto' }, gap: 1.5 }}>
              <TextField label="Trade-in equipment / serial / notes" value={tradeInDescription} onChange={e => setTradeInDescription(e.target.value)} />
              <TextField label="Credit Value" type="number" value={tradeInValue} onChange={e => setTradeInValue(Number(e.target.value))} />
              <Button variant="outlined" startIcon={<AddIcon />} onClick={addTradeIn} sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none' }}>Add Trade-In</Button>
            </Box>
            <Typography sx={{ mt: 1, color: '#9A3412', fontSize: 12, fontWeight: 700 }}>
              Trade-in credit reduces the invoice and never changes sales inventory stock.
            </Typography>
          </Card>

          <Card sx={{ p: 2, mb: 2, borderRadius: '16px', bgcolor: '#FEF2F2', border: '1px solid #FECACA' }}>
            <Typography sx={{ fontWeight: 900, color: '#B91C1C', mb: 1 }}>Refund Payment</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 180px 220px auto' }, gap: 1.5 }}>
              <TextField
                label="Refund reason"
                value={refundAdjustmentDescription}
                onChange={e => setRefundAdjustmentDescription(e.target.value)}
              />
              <TextField
                label="Refund amount"
                type="number"
                inputProps={{ min: 0, step: '0.01' }}
                value={refundAdjustmentValue}
                onChange={e => setRefundAdjustmentValue(Number(e.target.value))}
              />
              <TextField
                label="Payment reference (optional)"
                value={refundAdjustmentReference}
                onChange={e => setRefundAdjustmentReference(e.target.value)}
              />
              <Button
                color="error"
                variant="contained"
                startIcon={<PaymentIcon />}
                onClick={addRefundAdjustment}
                sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none' }}
              >
                Refund Payment
              </Button>
            </Box>
            <Typography sx={{ mt: 1, color: '#B91C1C', fontSize: 12, fontWeight: 700 }}>
              Adds a clearly identified negative line to this quotation. It does not alter inventory stock.
            </Typography>
          </Card>

          <TableContainer className="list-scroll-panel" sx={{ border: '1px solid #EEF0F6', borderRadius: '16px' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                  <TableCell sx={{ fontWeight: 900 }}>Image</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Item Number</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Item Description</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Amount</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Quantity</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Shipping Fee</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Setup Fee</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Condition</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Total</TableCell>
                  {quotationForm.quotation_type !== 'standard' && <TableCell sx={{ fontWeight: 900 }}>Default</TableCell>}
                  <TableCell align="right" sx={{ fontWeight: 900 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {quotationForm.items.length === 0 ? (
                  <TableRow><TableCell colSpan={12} align="center" sx={{ py: 3, color: '#6B7280', fontWeight: 700 }}>No sales parts or credits selected.</TableCell></TableRow>
                ) : quotationForm.items.map((item, index) => {
                  const part = parts.find(candidate => candidate.id === item.part_id)
                  const itemLabel = item.item_kind === 'trade_in' ? 'Trade-In' : item.item_kind === 'refund' ? 'Refund' : 'Product'
                  const itemNumber = item.item_kind === 'trade_in' ? 'TRADE-IN' : item.item_kind === 'refund' ? 'REFUND' : part?.part_number || item.part_id
                  return (
                    <TableRow key={`${item.part_id}-${index}`}>
                      <TableCell>
                        <Avatar src={resolveUploadUrl(part?.default_picture_url)} variant="rounded" sx={{ width: 42, height: 42, bgcolor: '#F5F3FF', color: '#7C3AED', borderRadius: '10px' }}>
                          <Inventory2Icon fontSize="small" />
                        </Avatar>
                      </TableCell>
                      <TableCell><Chip size="small" label={itemLabel} color={item.item_kind === 'refund' ? 'error' : item.item_kind === 'trade_in' ? 'warning' : 'primary'} /></TableCell>
                      <TableCell><ClippedTooltipText value={itemNumber} monospace fontWeight={900} onClick={item.item_kind === 'product' ? () => openSalesPartInfo(part, item) : undefined} /></TableCell>
                      <TableCell>
                        {item.item_kind !== 'product'
                          ? <TextField size="small" value={item.description || ''} onChange={e => setQuotationForm(prev => ({ ...prev, items: prev.items.map((line, lineIndex) => lineIndex === index ? { ...line, description: e.target.value } : line) }))} />
                          : <ClippedTooltipText value={item.description} field />}
                      </TableCell>
                      <TableCell><TextField size="small" type="number" value={item.unit_price} onChange={e => setQuotationForm(prev => ({ ...prev, items: prev.items.map((line, lineIndex) => lineIndex === index ? { ...line, unit_price: Number(e.target.value) } : line) }))} sx={{ width: 120 }} /></TableCell>
                      <TableCell><TextField size="small" type="number" value={item.quantity} onChange={e => setQuotationForm(prev => ({ ...prev, items: prev.items.map((line, lineIndex) => lineIndex === index ? { ...line, quantity: Number(e.target.value) } : line) }))} sx={{ width: 90 }} /></TableCell>
                      <TableCell><TextField size="small" type="number" value={item.shipping_fee || 0} onChange={e => setQuotationForm(prev => ({ ...prev, items: prev.items.map((line, lineIndex) => lineIndex === index ? { ...line, shipping_fee: Number(e.target.value) } : line) }))} sx={{ width: 110 }} /></TableCell>
                      <TableCell><TextField size="small" type="number" value={item.setup_fee || 0} onChange={e => setQuotationForm(prev => ({ ...prev, items: prev.items.map((line, lineIndex) => lineIndex === index ? { ...line, setup_fee: Number(e.target.value) } : line) }))} sx={{ width: 110 }} /></TableCell>
                      <TableCell>{item.condition || 'New'}</TableCell>
                      <TableCell sx={{ color: '#059669', fontWeight: 900 }}>{money(lineTotal(item))}</TableCell>
                      {quotationForm.quotation_type !== 'standard' && (
                        <TableCell>
                          {item.item_kind !== 'product' ? (
                            <Chip size="small" label="Always applied" />
                          ) : (
                            <Checkbox
                              checked={Boolean(item.is_default)}
                              disabled={!canConfigureDefaults}
                              onChange={e => setQuotationForm(prev => ({
                                ...prev,
                                items: prev.items.map((line, lineIndex) => ({
                                  ...line,
                                  is_default: lineIndex === index
                                    ? e.target.checked
                                    : prev.quotation_type === 'choice_single' && e.target.checked && line.item_kind === 'product'
                                      ? false
                                      : line.is_default,
                                })),
                              }))}
                              inputProps={{ 'aria-label': `Make option ${index + 1} selected by default` }}
                            />
                          )}
                        </TableCell>
                      )}
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
          <Button
            disabled={saveQuotationMut.isPending}
            onClick={() => submitQuotation('draft')}
            variant="outlined"
            sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none' }}
          >
            Save as Draft
          </Button>
          <Button
            disabled={saveQuotationMut.isPending}
            startIcon={saveQuotationMut.isPending ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <AddIcon />}
            onClick={() => submitQuotation('send')}
            variant="contained"
            sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none' }}
          >
            Send Quotation
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deliveryLink)} onClose={() => setDeliveryLink('')} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '20px' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>Quotation Sent</DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ color: '#4B5563', mb: 2 }}>
            Recipients were notified. You can also copy this secure quotation link.
          </Typography>
          <TextField fullWidth value={deliveryLink} InputProps={{ readOnly: true }} />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDeliveryLink('')}>Close</Button>
          <Button
            variant="contained"
            onClick={() => {
              navigator.clipboard.writeText(deliveryLink)
                .then(() => toast.success('Quotation link copied'))
                .catch(() => toast.error('Copy the link from the field'))
            }}
            sx={{ fontWeight: 900 }}
          >
            Copy Link
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
                        <TableCell><ClippedTooltipText value={convertQuotation.facility_name || convertQuotation.customer_name} /></TableCell>
                        <TableCell><ClippedTooltipText value={convertQuotation.customer_email || '-'} /></TableCell>
                        <TableCell>{formatUSPhone(convertQuotation.customer_phone) || '-'}</TableCell>
                        <TableCell><ClippedTooltipText value={convertQuotation.customer_address || '-'} field /></TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </Card>

                {convertQuotation.quotation_type !== 'standard' && (
                  <Card sx={{ p: 2, borderRadius: '14px', border: `1px solid ${SYSTEM_PANEL_BORDER}`, boxShadow: '0 14px 35px rgba(49,46,129,0.08)' }}>
                    <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>
                      {convertQuotation.quotation_type === 'choice_single' ? 'Choose one option' : 'Choose one or more options'}
                    </Typography>
                    <Typography sx={{ color: '#6B7280', fontSize: 13, mb: 1.5 }}>
                      Defaults were selected by the quotation creator. This accepted selection becomes the immutable invoice snapshot.
                    </Typography>
                    <Box sx={{ display: 'grid', gap: 1 }}>
                      {convertQuotation.line_items.filter(line => line.item_kind === 'product').map(line => (
                        <Card
                          key={line.id}
                          variant="outlined"
                          sx={{
                            p: 1.25,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            borderColor: selectedQuoteOptions.includes(line.id) ? '#8B5CF6' : '#E5E7EB',
                            bgcolor: selectedQuoteOptions.includes(line.id) ? '#F5F3FF' : '#fff',
                          }}
                        >
                          <Checkbox
                            checked={selectedQuoteOptions.includes(line.id)}
                            onChange={event => setSelectedQuoteOptions(previous => {
                              if (convertQuotation.quotation_type === 'choice_single') {
                                return event.target.checked ? [line.id] : []
                              }
                              return event.target.checked
                                ? [...new Set([...previous, line.id])]
                                : previous.filter(id => id !== line.id)
                            })}
                          />
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <ClippedTooltipText value={`${line.part_number || 'Part'} · ${line.description}`} fontWeight={850} />
                            <Typography sx={{ color: '#059669', fontWeight: 900 }}>{money(line.total)}</Typography>
                          </Box>
                          {line.is_default && <Chip size="small" label="Default" sx={{ bgcolor: '#EDE9FE', color: '#6D28D9', fontWeight: 900 }} />}
                        </Card>
                      ))}
                    </Box>
                  </Card>
                )}

                <Card sx={{ borderRadius: '14px', overflow: 'hidden', border: `1px solid ${SYSTEM_PANEL_BORDER}`, boxShadow: '0 14px 35px rgba(49,46,129,0.08)' }}>
                  <Box sx={{ background: SYSTEM_GRADIENT, color: '#fff', px: 2, py: 1.3, fontWeight: 900 }}>Parts Used</Box>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 900 }}>Number</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Description</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Unit Amount</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Quantity</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Shipping Fee</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Setup Fee</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Condition</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 900 }}>Total</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {convertQuotation.line_items.filter(line => (
                        line.item_kind !== 'product' ||
                        convertQuotation.quotation_type === 'standard' ||
                        selectedQuoteOptions.includes(line.id)
                      )).map(line => {
                        const part = parts.find(item => item.id === line.part_id)
                        return (
                          <TableRow key={line.id}>
                            <TableCell><ClippedTooltipText value={line.item_kind === 'refund' ? 'REFUND' : line.item_kind === 'trade_in' ? 'TRADE-IN' : line.part_number} monospace fontWeight={900} onClick={line.item_kind === 'product' ? () => openSalesPartInfo(part, line) : undefined} /></TableCell>
                            <TableCell><ClippedTooltipText value={line.description} field /></TableCell>
                            <TableCell>{money(line.unit_price)}</TableCell>
                            <TableCell>{line.quantity}</TableCell>
                            <TableCell>{money(line.shipping_fee)}</TableCell>
                            <TableCell>{money(line.setup_fee)}</TableCell>
                            <TableCell>{line.condition || part?.condition || '-'}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 900 }}>{money(line.total)}</TableCell>
                          </TableRow>
                        )
                      })}
                      {[
                        [`Working Hours Fee (${Number(invoiceDetails.labour_hours || 0)} hour)`, Number(invoiceDetails.worked_hours || 0)],
                        ['Setup Fee', Number(invoiceDetails.setup_fee || 0)],
                        ['Service Fee', Number(invoiceDetails.service_fee || 0)],
                        ['Shipping Fee', Number(invoiceDetails.shipping_fee || 0)],
                        ['Application Fee', Number(invoiceDetails.application_fee || 0)],
                        ['Tax Amount on Parts', convertTaxAmount],
                      ].map(([label, value]) => (
                        <TableRow key={String(label)}>
                          <TableCell colSpan={7} align="right" sx={{ fontWeight: 900 }}>{label}</TableCell>
                          <TableCell align="right">{money(value as number)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell colSpan={7} align="right" sx={{ fontWeight: 900 }}>Grand Total</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 900 }}>{money(convertGrandTotal)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </Card>
              </Box>

              <Card sx={{ borderRadius: '14px', overflow: 'hidden', border: `1px solid ${SYSTEM_PANEL_BORDER}`, alignSelf: 'start', boxShadow: '0 14px 35px rgba(49,46,129,0.08)' }}>
                <Box sx={{ background: SYSTEM_GRADIENT, color: '#fff', px: 2, py: 1.3, fontWeight: 900, textAlign: 'center' }}>Invoice Details</Box>
                <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                  <TextField size="small" select label="Select Action" value={invoiceDetails.action || ''} onChange={e => setInvoiceDetails(prev => ({ ...prev, action: e.target.value }))} sx={{ gridColumn: '1 / -1' }}>
                    <MenuItem value="">Select Action</MenuItem>
                    <MenuItem value="approve">Approve Quotation</MenuItem>
                    <MenuItem value="reject">Reject Quotation</MenuItem>
                    <MenuItem value="mark_pending">Mark as Pending</MenuItem>
                    <MenuItem value="convert_to_invoice">Convert to Invoice</MenuItem>
                  </TextField>
                  <TextField size="small" select label="Payment Method" value={invoiceDetails.payment_method || ''} onChange={e => setInvoiceDetails(prev => ({ ...prev, payment_method: e.target.value }))} sx={{ gridColumn: '1 / -1' }}>
                    <MenuItem value="">Select payment method</MenuItem>
                    <MenuItem value="credit_card">Credit Card</MenuItem>
                    <MenuItem value="cheque">Cheque</MenuItem>
                    <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
                  </TextField>
                  <TextField size="small" label="Labour Hours" type="number" value={invoiceDetails.labour_hours || 0} onChange={e => setInvoiceDetails(prev => ({ ...prev, labour_hours: Number(e.target.value) }))} />
                  <TextField size="small" label="Working Hours Fee ($)" type="number" value={invoiceDetails.worked_hours || 0} onChange={e => setInvoiceDetails(prev => ({ ...prev, worked_hours: Number(e.target.value) }))} />
                  <TextField size="small" label="Service Fee" type="number" value={invoiceDetails.service_fee || 0} onChange={e => setInvoiceDetails(prev => ({ ...prev, service_fee: Number(e.target.value) }))} />
                  <TextField size="small" label="Setup Fee" type="number" value={invoiceDetails.setup_fee || 0} onChange={e => setInvoiceDetails(prev => ({ ...prev, setup_fee: Number(e.target.value) }))} />
                  <TextField size="small" label="Shipping / Delivery Fee" type="number" value={invoiceDetails.shipping_fee || 0} onChange={e => setInvoiceDetails(prev => ({ ...prev, shipping_fee: Number(e.target.value) }))} />
                  <TextField size="small" label="Application Fee" type="number" value={invoiceDetails.application_fee || 0} onChange={e => setInvoiceDetails(prev => ({ ...prev, application_fee: Number(e.target.value) }))} />
                  <TextField size="small" label="Parts Total" value={convertPartsTotal.toFixed(2)} InputProps={{ readOnly: true }} />
                  <TextField size="small" label="Tax Rate (%)" type="number" value={invoiceDetails.tax_rate || 0} onChange={e => setInvoiceDetails(prev => ({ ...prev, tax_rate: Number(e.target.value) }))} />
                  <TextField size="small" label="Tax Amount" value={convertTaxAmount.toFixed(2)} InputProps={{ readOnly: true }} />
                  <TextField size="small" select label="Discount Type" value={invoiceDetails.discount_type || 'fixed'} onChange={e => setInvoiceDetails(prev => ({ ...prev, discount_type: e.target.value as 'fixed' | 'percent' }))}>
                    <MenuItem value="fixed">Fixed ($)</MenuItem>
                    <MenuItem value="percent">Percent (%)</MenuItem>
                  </TextField>
                  <TextField size="small" label="Discount" type="number" value={invoiceDetails.discount_amount || 0} onChange={e => setInvoiceDetails(prev => ({ ...prev, discount_amount: Number(e.target.value) }))} />
                  <TextField size="small" label="Grand Total" value={convertGrandTotal.toFixed(2)} InputProps={{ readOnly: true }} sx={{ gridColumn: '1 / -1' }} />
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
            onClick={applyConvertAction}
            sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none', background: SYSTEM_GRADIENT }}
          >
            {convertMut.isPending ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Apply Action'}
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
              <TableContainer className="list-scroll-panel">
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Part</TableCell>
                      <TableCell>Option</TableCell>
                      <TableCell>Description</TableCell>
                      <TableCell>Qty</TableCell>
                      <TableCell>Shipping</TableCell>
                      <TableCell>Setup</TableCell>
                      <TableCell>Condition</TableCell>
                      <TableCell>Total</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {viewQuotation.line_items.map(line => (
                      <TableRow key={line.id}>
                        <TableCell><ClippedTooltipText value={line.item_kind === 'refund' ? 'REFUND' : line.item_kind === 'trade_in' ? 'TRADE-IN' : line.part_number} onClick={line.item_kind === 'product' ? () => openSalesPartInfo(parts.find(item => item.id === line.part_id), line) : undefined} /></TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            <Chip size="small" label={line.item_kind === 'refund' ? 'Refund' : line.item_kind === 'trade_in' ? 'Trade-In' : 'Product'} color={line.item_kind === 'refund' ? 'error' : line.item_kind === 'trade_in' ? 'warning' : 'primary'} />
                            {line.is_default && line.item_kind === 'product' && <Chip size="small" label="Default" color="secondary" />}
                            {viewQuotation.selection_status === 'accepted' && line.is_selected && <Chip size="small" label="Selected" color="success" />}
                          </Box>
                        </TableCell>
                        <TableCell><ClippedTooltipText value={line.description} field /></TableCell>
                        <TableCell>{line.quantity}</TableCell>
                        <TableCell>{money(line.shipping_fee)}</TableCell>
                        <TableCell>{money(line.setup_fee)}</TableCell>
                        <TableCell>{line.condition || '-'}</TableCell>
                        <TableCell>{money(line.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {viewQuotation.acceptance && (
                <Card sx={{ p: 2.2, borderRadius: '16px', border: '1px solid #DDD6FE', bgcolor: '#FAF8FF' }}>
                  <Typography sx={{ fontWeight: 950, color: '#312E81' }}>Signed Acceptance Record</Typography>
                  <Typography sx={{ color: '#64748B', fontSize: 13 }}>
                    {viewQuotation.acceptance.accepted_by_name} · {formatDate(viewQuotation.acceptance.accepted_at)} · Revision {viewQuotation.acceptance.quotation_revision}
                  </Typography>
                  <Typography sx={{ mt: 1.5, pb: 0.8, borderBottom: '1px solid #94A3B8', color: '#1E1B4B', fontFamily: '"Segoe Script", "Brush Script MT", cursive', fontSize: 32, fontStyle: 'italic' }}>
                    {viewQuotation.acceptance.signature_name}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1.5 }}>
                    <Chip size="small" color="success" label="Terms accepted" />
                    <Chip size="small" label={`Signed total ${money(viewQuotation.acceptance.pricing_snapshot.total_amount)}`} />
                    {viewQuotation.acceptance.ip_address && <Chip size="small" variant="outlined" label={`IP ${viewQuotation.acceptance.ip_address}`} />}
                  </Box>
                </Card>
              )}
              {Boolean(viewQuotation.payment_authorizations?.length) && (
                <Card sx={{ p: 2.2, borderRadius: '16px', border: '1px solid #E2E8F0' }}>
                  <Typography sx={{ fontWeight: 950, color: '#1E1B4B', mb: 1 }}>Payment Authorization Audit</Typography>
                  <Box sx={{ display: 'grid', gap: 1 }}>
                    {viewQuotation.payment_authorizations!.map(authorization => (
                      <Box key={authorization.id} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr auto auto' }, gap: 1, p: 1.2, borderRadius: '10px', bgcolor: '#F8FAFC' }}>
                        <Typography sx={{ fontWeight: 800 }}>
                          {authorization.authorization_reference || `Authorization #${authorization.id}`}
                          {authorization.card_last_four ? ` · ${authorization.card_brand || 'Card'} ending ${authorization.card_last_four}` : ''}
                        </Typography>
                        <Typography sx={{ fontWeight: 900 }}>{money(authorization.amount)}</Typography>
                        <Chip size="small" label={authorization.status.replace(/_/g, ' ')} color={authorization.status === 'processed' ? 'success' : authorization.status === 'submitted' ? 'warning' : 'default'} />
                      </Box>
                    ))}
                  </Box>
                </Card>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setViewQuotation(null)} variant="contained" sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none' }}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(viewInvoice)} onClose={() => setViewInvoice(null)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '22px' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>Sales Invoice Details</DialogTitle>
        <DialogContent dividers>
          {viewInvoice && (
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <Typography><strong>Invoice:</strong> {viewInvoice.invoice_number}</Typography>
              <Typography><strong>Work Order:</strong> {viewInvoice.work_order || '-'}</Typography>
              <Typography><strong>Customer:</strong> {viewInvoice.customer_name}</Typography>
              <Typography><strong>Facility:</strong> {viewInvoice.facility_name || '-'}</Typography>
              <Typography><strong>Total:</strong> {money(viewInvoice.total_amount)}</Typography>
              <Typography><strong>Paid:</strong> {money(viewInvoice.amount_paid)}</Typography>
              <Typography><strong>Refunded:</strong> {money(viewInvoice.refunded_amount)}</Typography>
              <Typography><strong>Net Paid:</strong> {money(viewInvoice.net_paid)}</Typography>
              <Typography><strong>Balance:</strong> {money(viewInvoice.balance_due)}</Typography>
              <Typography><strong>Payment:</strong> {paymentMethodLabel(viewInvoice.payment_method)}</Typography>
              <Typography sx={{ gridColumn: '1 / -1' }}><strong>Notes:</strong> {viewInvoice.notes || '-'}</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setViewInvoice(null)} variant="contained" sx={{ borderRadius: '12px', fontWeight: 900 }}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(partInfo)} onClose={() => setPartInfo(null)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '22px' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>
          Sales Part Details
          <Typography sx={{ color: '#6B7280', fontSize: 13, fontWeight: 700 }}>
            View-only inventory information
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          {partInfo && (
            <Box sx={{ display: 'grid', gap: 2 }}>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <Avatar src={resolveUploadUrl(partInfo.imageUrl)} variant="rounded" sx={{ width: 76, height: 76, bgcolor: '#F5F3FF', color: '#7C3AED', borderRadius: '18px' }}>
                  <Inventory2Icon />
                </Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <ClippedTooltipText value={partInfo.partNumber} monospace color="#7C3AED" fontWeight={900} />
                  <ClippedTooltipText value={partInfo.description} field fontWeight={800} />
                </Box>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5 }}>
                {[
                  ['Make / Model', [partInfo.make, partInfo.model].filter(Boolean).join(' / ') || '-'],
                  ['Serial #', partInfo.serialNumber || '-'],
                  ['Condition', partInfo.condition || '-'],
                  ['Qty Available', partInfo.quantity ?? '-'],
                  ['Unit Price', partInfo.unitPrice === null ? '-' : money(partInfo.unitPrice)],
                  ['Facility', partInfo.facilityName || 'Global / Independent'],
                  ['Status', partInfo.status || '-'],
                ].map(([label, value]) => (
                  <Card key={label} sx={{ p: 1.5, borderRadius: '14px', border: '1px solid #EEF0F6', bgcolor: '#F8FAFC' }}>
                    <Typography sx={{ color: '#6B7280', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>{label}</Typography>
                    <Typography sx={{ color: '#1E1B4B', fontWeight: 850 }}>{value}</Typography>
                  </Card>
                ))}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setPartInfo(null)} variant="contained" sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none' }}>Close</Button>
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

      <Dialog open={Boolean(refundInvoice)} onClose={() => setRefundInvoice(null)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '22px' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>Refund Sales Payment</DialogTitle>
        <DialogContent dividers>
          {refundInvoice && (
            <Box sx={{ display: 'grid', gap: 2, pt: 1 }}>
              <Card sx={{ p: 2, borderRadius: '14px', bgcolor: '#FFF7ED', border: '1px solid #FED7AA' }}>
                <Typography sx={{ fontWeight: 900 }}>{refundInvoice.invoice_number}</Typography>
                <Typography sx={{ color: '#9A3412', fontWeight: 800 }}>
                  Refundable: {money(Math.max(0, Number(refundInvoice.amount_paid || 0) - Number(refundInvoice.refunded_amount || 0)))}
                </Typography>
                <Typography sx={{ color: '#6B7280', fontSize: 12 }}>
                  Refunds are ledger entries and do not automatically restock a sold part.
                </Typography>
              </Card>
              <TextField label="Refund Amount" type="number" value={refundForm.amount} onChange={e => setRefundForm(prev => ({ ...prev, amount: Number(e.target.value) }))} />
              <TextField select label="Refund Method" value={refundForm.payment_method} onChange={e => setRefundForm(prev => ({ ...prev, payment_method: e.target.value }))}>
                <MenuItem value="">Use original method</MenuItem>
                <MenuItem value="credit_card">Credit Card</MenuItem>
                <MenuItem value="cheque">Cheque</MenuItem>
                <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
              </TextField>
              <TextField label="Refund Notes" value={refundForm.notes} onChange={e => setRefundForm(prev => ({ ...prev, notes: e.target.value }))} multiline rows={3} />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setRefundInvoice(null)} sx={{ fontWeight: 900 }}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!refundInvoice || refundForm.amount <= 0 || refundMut.isPending}
            onClick={() => refundInvoice && refundMut.mutate({ id: refundInvoice.id, data: refundForm })}
            sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none' }}
          >
            Record Refund
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default Sales
