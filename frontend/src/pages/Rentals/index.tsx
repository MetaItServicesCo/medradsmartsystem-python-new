import { type MouseEvent, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Autocomplete, Avatar, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, IconButton, ListItemIcon, Menu, MenuItem,
  LinearProgress, Skeleton, Switch, FormControlLabel, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs,
  TablePagination, TextField, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import AssignmentIcon from '@mui/icons-material/Assignment'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CreditCardIcon from '@mui/icons-material/CreditCard'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import HistoryIcon from '@mui/icons-material/History'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import PaymentIcon from '@mui/icons-material/Payment'
import PrintIcon from '@mui/icons-material/Print'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import VisibilityIcon from '@mui/icons-material/Visibility'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import InfoIcon from '@mui/icons-material/Info'
import CurrencyExchangeIcon from '@mui/icons-material/CurrencyExchange'
import { toast } from 'react-toastify'

import type { Facility } from '@/api/facilities'
import { resolveUploadUrl } from '@/api/users'
import CreditCardAuthorizationDialog, { type AuthorizationLineItem, type CreditCardAuthorizationPayload } from '@/components/Billing/CreditCardAuthorizationDialog'
import InvoicePrintDialog, { type PrintableLedgerTransaction, type PrintableLineItem } from '@/components/Billing/InvoicePrintDialog'
import ClippedTooltipText from '@/components/ClippedTooltipText'
import DateRangeFilter from '@/components/DateRangeFilter'
import FacilitySearchAutocomplete from '@/components/FacilitySearchAutocomplete'
import PartSearchAutocomplete from '@/components/PartSearchAutocomplete'
import SearchFieldSelect from '@/components/SearchFieldSelect'
import ContextTableRow from '@/components/ContextTableRow'
import { SALES_TAX_RATE, SALES_TAX_FACTOR, roundSalesMoney } from '@/utils/salesPricing'
import {
  fetchRentalParts,
  fetchRentals,
  fetchRentalDetail,
  fetchRentalFacilityCustomers,
  createRental,
  updateRental,
  deleteRental,
  returnRental,
  convertRentalToInvoice,
  fetchRentalInvoices,
  fetchRentalSummary,
  updateRentalInvoice,
  refundRentalInvoice,
  fetchRentalHistory,
  fetchRentalProductRate,
  upsertRentalProductRate,
  runRecurringBilling,
  sendRentalPortalLink,
  createRentalExtension,
  offerRentalExtension,
  rejectRentalExtension,
  cancelRentalExtension,
  type Rental,
  type RentalItem,
  type RentalInvoice,
  type RentalInvoiceCreatePayload,
  type RentalPart,
  type RentalPayload,
  type RentalItemPayload,
  type RentalReturnPayload,
  type RentalProductRate,
  type RentalFacilityCustomer,
  type BillingFrequency,
  type RentalStatus,
  type RentalInvoiceStatus,
} from '@/api/rentals'
import { isSameBillingAccount } from '@/utils/billingAccountIdentity'
import { digitsOnly, formatUSPhone, formatUSPhoneInput } from '@/utils/formatters'
import { useAuthStore } from '@/stores/authStore'

const ROUTE_TABS = ['/rentals/agreements', '/rentals/invoices', '/rentals/products', '/rentals/history']
const PAGE_SIZE = 20
const RENTAL_AGREEMENT_SEARCH_FIELDS = [
  { value: 'all', label: 'All fields' },
  { value: 'agreement', label: 'Agreement #' },
  { value: 'customer', label: 'Customer' },
  { value: 'product', label: 'Product' },
  { value: 'facility', label: 'Facility' },
  { value: 'created_by', label: 'Created by' },
  { value: 'billing', label: 'Billing / amount' },
  { value: 'status', label: 'Status' },
  { value: 'condition', label: 'Condition' },
  { value: 'date', label: 'Date' },
]
const RENTAL_INVOICE_SEARCH_FIELDS = [
  { value: 'all', label: 'All fields' },
  { value: 'invoice', label: 'Invoice #' },
  { value: 'agreement', label: 'Agreement #' },
  { value: 'customer', label: 'Customer' },
  { value: 'facility', label: 'Facility' },
  { value: 'status', label: 'Status' },
  { value: 'amount', label: 'Amount' },
  { value: 'payment_method', label: 'Payment method' },
  { value: 'date', label: 'Date' },
  { value: 'notes', label: 'Notes' },
]
const RENTAL_PRODUCT_SEARCH_FIELDS = [
  { value: 'all', label: 'All fields' },
  { value: 'part_number', label: 'Part #' },
  { value: 'description', label: 'Description' },
  { value: 'make_model', label: 'Make / model' },
  { value: 'serial', label: 'Serial #' },
  { value: 'facility', label: 'Facility' },
  { value: 'condition', label: 'Condition' },
  { value: 'price', label: 'Price' },
  { value: 'stock', label: 'Stock' },
  { value: 'status', label: 'Status' },
]
const RENTAL_HISTORY_SEARCH_FIELDS = [
  { value: 'all', label: 'All fields' },
  { value: 'agreement', label: 'Agreement #' },
  { value: 'customer', label: 'Customer' },
  { value: 'facility', label: 'Facility' },
  { value: 'product', label: 'Product / part' },
  { value: 'activity', label: 'Activity / user' },
  { value: 'date', label: 'Date' },
]
const SYSTEM_GRADIENT = 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)'
const SYSTEM_PANEL_BORDER = '#BFDBFE'
const SYSTEM_PANEL_BG = '#F0F9FF'
const ACTION_MENU_PAPER = {
  mt: 1,
  minWidth: 260,
  borderRadius: '18px',
  border: '1px solid #BFDBFE',
  boxShadow: '0 22px 55px rgba(30,64,175,0.18)',
  overflow: 'hidden',
  '& .MuiList-root': { p: 0.8 },
}
const ACTION_MENU_ITEM = {
  mx: 0.4,
  my: 0.3,
  gap: 1,
  borderRadius: '12px',
  fontWeight: 900,
  color: '#1E3A8A',
  '&:hover': { bgcolor: '#EFF6FF', color: '#1D4ED8' },
  '&.Mui-disabled': { opacity: 0.45 },
}
const ACTION_MENU_DANGER = {
  ...ACTION_MENU_ITEM,
  color: '#DC2626',
  '&:hover': { bgcolor: '#FEF2F2', color: '#B91C1C' },
}

const statusChip = (value: string) => {
  const map: Record<string, { bg: string; color: string }> = {
    active: { bg: '#E0F2FE', color: '#0369A1' },
    completed: { bg: '#D1FAE5', color: '#047857' },
    cancelled: { bg: '#F3F4F6', color: '#6B7280' },
    pending: { bg: '#EEF2FF', color: '#4338CA' },
    paid: { bg: '#D1FAE5', color: '#047857' },
    unpaid: { bg: '#FEE2E2', color: '#DC2626' },
    partially_paid: { bg: '#FEF3C7', color: '#B45309' },
    overdue: { bg: '#FEE2E2', color: '#DC2626' },
  }
  return map[value] || { bg: '#F3F4F6', color: '#374151' }
}

const money = (value: number | string | null | undefined) => `$${Number(value || 0).toFixed(2)}`

const auditDetailsText = (details: Record<string, any> | null | undefined) => {
  const labels: Record<string, string> = {
    invoice: 'Invoice', amount: 'Amount', rental_period: 'Period', period: 'Period',
    items: 'Items', revision: 'Revision', card_saved: 'Card saved', auto_charge: 'Auto-charge',
    expires_at: 'Link expires', billing_date: 'Billing date', reason: 'Reason', attempts: 'Attempts',
  }
  return Object.entries(details || {}).map(([key, value]) => {
    const label = labels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
    let display = String(value ?? '-')
    if (key === 'amount') display = money(value)
    else if (key.endsWith('_at') || key.endsWith('_date')) display = formatDate(String(value || ''))
    else if (typeof value === 'boolean') display = value ? 'Yes' : 'No'
    else if (typeof value === 'object' && value !== null) display = Object.values(value).join(', ')
    return `${label}: ${display}`
  }).join(' · ')
}


const formatDate = (value: string | null | undefined) => {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
}

const normalizeDateInput = (value: string | null | undefined) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (match) {
    const [, month, day, year] = match
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return raw
  return parsed.toISOString().slice(0, 10)
}

const normalizeMoneyInput = (value: number | string | null | undefined) => Number(value || 0)

const apiErrorMessage = (error: any, fallback: string) => {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => item?.msg || item?.message)
      .filter(Boolean)
      .join(', ') || fallback
  }
  return fallback
}

interface RentalItemForm {
  key: string
  part_id: number | null
  part_number: string
  part_description: string
  quantity: number
  rental_rate: number
  item_condition: string
  shipping_fee: number
  setup_fee: number
  labor_fee: number
  removal_fee: number
  initial_condition: string
  initial_meter_reading: string
}

interface RentalAgreementFormState {
  facility_id: number | null
  customer_user_id: number | null
  customer_name: string
  customer_email: string
  customer_phone: string
  customer_address: string
  delivery_street: string
  delivery_city: string
  delivery_state: string
  delivery_zip: string
  billing_frequency: BillingFrequency
  security_deposit: number
  start_date: string
  end_date: string
  terms_and_conditions: string
  auto_charge: boolean
  committed_periods: number | ''
  discount_type: '' | 'flat' | 'percent'
  discount_value: number
  discount_apply_after_periods: number | ''
  items: RentalItemForm[]
}

const emptyAgreement = (): RentalAgreementFormState => ({
  facility_id: null,
  customer_user_id: null,
  customer_name: '',
  customer_email: '',
  customer_phone: '',
  customer_address: '',
  delivery_street: '',
  delivery_city: '',
  delivery_state: '',
  delivery_zip: '',
  billing_frequency: 'monthly',
  security_deposit: 0,
  start_date: new Date().toISOString().slice(0, 10),
  end_date: '',
  terms_and_conditions: '',
  auto_charge: false,
  committed_periods: '',
  discount_type: '',
  discount_value: 0,
  discount_apply_after_periods: '',
  items: [],
})

const newRentalItem = (): RentalItemForm => ({
  key: Math.random().toString(36).slice(2),
  part_id: null,
  part_number: '',
  part_description: '',
  quantity: 1,
  rental_rate: 0,
  item_condition: 'New',
  shipping_fee: 0,
  setup_fee: 0,
  labor_fee: 0,
  removal_fee: 0,
  initial_condition: '',
  initial_meter_reading: '',
})

const rateForFrequency = (card: RentalProductRate | null, freq: BillingFrequency): number | null => {
  if (!card) return null
  if (freq === 'weekly') return card.weekly_rate
  if (freq === 'biweekly') return card.biweekly_rate
  if (freq === 'monthly') return card.monthly_rate
  if (freq === 'quarterly') return card.quarterly_rate
  return null
}

// Python Decimal uses half-even rounding for invoice values. Mirror it in the
// live preview so a .005 tax boundary never differs by one cent from the saved
// backend invoice.
const roundRentalMoney = (value: number) => {
  const sign = value < 0 ? -1 : 1
  const scaled = Math.abs(value) * 100
  const lower = Math.floor(scaled)
  const fraction = scaled - lower
  if (Math.abs(fraction - 0.5) < 1e-9) {
    return sign * ((lower % 2 === 0 ? lower : lower + 1) / 100)
  }
  return sign * (Math.round(scaled) / 100)
}

// Mirror the backend billing calendar so the previewed end date matches how periods
// are actually advanced (rental_billing.advance_billing_date).
const RENTAL_PERIOD_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3 }
const RENTAL_PERIOD_DAYS: Record<string, number> = { weekly: 7, biweekly: 14, daily: 1 }

const addClampedMonths = (start: Date, months: number): Date => {
  const day = start.getDate()
  const shifted = new Date(start.getFullYear(), start.getMonth() + months, 1)
  const lastDay = new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate()
  shifted.setDate(Math.min(day, lastDay))
  return shifted
}

// Compose the single-line delivery address from its parts (mirrors the backend), e.g.
// "123 Main St, Springfield, IL 62704".
const composeDeliveryAddress = (street: string, city: string, state: string, zip: string): string => {
  const s = (street || '').trim()
  const c = (city || '').trim()
  const st = (state || '').trim()
  const z = (zip || '').trim()
  if (![s, c, st, z].some(Boolean)) return ''
  let locality = [c, st].filter(Boolean).join(', ')
  if (z) locality = `${locality} ${z}`.trim()
  return [s, locality].filter(Boolean).join(', ')
}

const deriveRentalEndDate = (startISO: string, frequency: BillingFrequency, periods: number | ''): string => {
  const count = Number(periods)
  if (!startISO || !count || count < 1) return ''
  const start = new Date(`${startISO}T00:00:00`)
  if (Number.isNaN(start.getTime())) return ''
  let end: Date
  if (frequency in RENTAL_PERIOD_MONTHS) {
    end = addClampedMonths(start, RENTAL_PERIOD_MONTHS[frequency] * count)
  } else {
    end = new Date(start)
    end.setDate(end.getDate() + (RENTAL_PERIOD_DAYS[frequency] ?? 30) * count)
  }
  return end.toISOString().slice(0, 10)
}

const calculateInitialRentalPricing = (agreement: RentalAgreementFormState) => {
  const rental = roundRentalMoney(agreement.items.reduce(
    (sum, item) => sum + Number(item.rental_rate || 0) * Math.max(1, Number(item.quantity || 1)),
    0,
  ))
  const shipping = roundRentalMoney(agreement.items.reduce((sum, item) => sum + Number(item.shipping_fee || 0), 0))
  const setup = roundRentalMoney(agreement.items.reduce((sum, item) => sum + Number(item.setup_fee || 0), 0))
  const labor = roundRentalMoney(agreement.items.reduce((sum, item) => sum + Number(item.labor_fee || 0), 0))
  const removal = roundRentalMoney(agreement.items.reduce((sum, item) => sum + Number(item.removal_fee || 0), 0))
  const deposit = roundRentalMoney(Number(agreement.security_deposit || 0))

  // The commitment discount reaches period one only when it is explicitly
  // configured to apply after zero paid periods, matching backend billing.
  let discount = 0
  if (agreement.discount_type && agreement.discount_apply_after_periods !== '' && Number(agreement.discount_apply_after_periods) === 0) {
    discount = agreement.discount_type === 'percent'
      ? roundRentalMoney(rental * Number(agreement.discount_value || 0) / 100)
      : Math.min(rental, roundRentalMoney(Number(agreement.discount_value || 0)))
  }

  const taxableRental = Math.max(0, rental - discount)
  const taxableTotal = taxableRental + shipping + setup + removal
  const tax = roundRentalMoney(taxableTotal * SALES_TAX_FACTOR)
  const rentalTax = taxableTotal > 0 ? roundRentalMoney(tax * taxableRental / taxableTotal) : 0
  const shippingTax = taxableTotal > 0 ? roundRentalMoney(tax * shipping / taxableTotal) : 0
  const removalTax = taxableTotal > 0 ? roundRentalMoney(tax * removal / taxableTotal) : 0
  const setupTax = roundRentalMoney(tax - rentalTax - shippingTax - removalTax)
  const subtotal = roundRentalMoney(rental + deposit + shipping + setup + labor + removal)

  return {
    rental,
    deposit,
    shipping,
    setup,
    labor,
    removal,
    discount,
    tax,
    rentalTax,
    shippingTax,
    setupTax,
    removalTax,
    subtotal,
    total: roundRentalMoney(Math.max(0, subtotal - discount + tax)),
  }
}

const emptyInvoiceDetails = (): RentalInvoiceCreatePayload => ({
  labour_hours: 0,
  worked_hours: 0,
  setup_fee: 0,
  service_fee: 0,
  shipping_fee: 0,
  application_fee: 0,
  tax_rate: 0,
  discount_type: 'fixed',
  discount_amount: 0,
  payment_method: 'bank_transfer',
  action: 'convert_to_invoice',
  due_date: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().slice(0, 10),
  notes: '',
})

interface RentalPartInfo {
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

const Rentals = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const currentUser = useAuthStore(state => state.user)
  const isRentalCustomer = ['facility_admin', 'facility_manager', 'client'].includes(currentUser?.role || '')
    || (currentUser?.role === 'admin' && Boolean(currentUser.facility_id))
  const isInternalRentalOperator = currentUser?.role === 'superadmin'
    || (currentUser?.role === 'admin' && !currentUser.facility_id)
  const queryClient = useQueryClient()
  const theme = useTheme()
  const fullScreenDialog = useMediaQuery(theme.breakpoints.down('sm'))

  // Mouse-wheel over a focused number input silently changes its value; blur on
  // wheel so scrolling the form never mutates an entered value.
  useEffect(() => {
    const stopWheelMutation = () => {
      const active = document.activeElement as HTMLInputElement | null
      if (active && active.tagName === 'INPUT' && active.type === 'number') active.blur()
    }
    document.addEventListener('wheel', stopWheelMutation, { passive: true })
    return () => document.removeEventListener('wheel', stopWheelMutation)
  }, [])

  const routeParams = new URLSearchParams(location.search)
  const routeSearch = routeParams.get('search') || ''
  const searchField = routeParams.get('search_field') || 'all'
  const dateFrom = routeParams.get('date_from') || ''
  const dateTo = routeParams.get('date_to') || ''
  const invalidDateRange = Boolean(dateFrom && dateTo && dateFrom > dateTo)
  const [search, setSearch] = useState(routeSearch)
  const [debouncedSearch, setDebouncedSearch] = useState(routeSearch)
  const [agreementPage, setAgreementPage] = useState(0)
  const [agreementRowsPerPage, setAgreementRowsPerPage] = useState(25)
  const [invoicesPage, setInvoicesPage] = useState(0)
  const [historyPage, setHistoryPage] = useState(0)
  const [productsPage, setProductsPage] = useState(0)
  const [agreementDialog, setAgreementDialog] = useState(false)
  const [editingAgreement, setEditingAgreement] = useState<Rental | null>(null)
  const [viewAgreement, setViewAgreement] = useState<Rental | null>(null)
  const [agreementForm, setAgreementForm] = useState<RentalAgreementFormState>(emptyAgreement())
  // Item picker row state (add-an-item), separate from the committed items list.
  const [selectedRentalPart, setSelectedRentalPart] = useState<RentalPart | null>(null)
  const [itemDraft, setItemDraft] = useState<RentalItemForm>(newRentalItem())

  const [returnDialog, setReturnDialog] = useState<Rental | null>(null)
  const [returnForm, setReturnForm] = useState<RentalReturnPayload>({
    actual_return_date: new Date().toISOString().slice(0, 10),
    return_condition: '',
    final_meter_reading: 0,
  })

  const [convertAgreement, setConvertAgreement] = useState<Rental | null>(null)
  const [invoiceDetails, setInvoiceDetails] = useState<RentalInvoiceCreatePayload>(emptyInvoiceDetails())

  const [invoiceEdit, setInvoiceEdit] = useState<RentalInvoice | null>(null)
  const [invoiceForm, setInvoiceForm] = useState({ amount_paid: 0, due_date: '', status: 'pending', payment_method: '', notes: '' })
  const [viewInvoice, setViewInvoice] = useState<RentalInvoice | null>(null)
  const [refundInvoice, setRefundInvoice] = useState<RentalInvoice | null>(null)
  const [refundForm, setRefundForm] = useState({ amount: 0, payment_method: '', notes: '' })
  const [printAgreement, setPrintAgreement] = useState<Rental | null>(null)
  const [printInvoice, setPrintInvoice] = useState<RentalInvoice | null>(null)
  const [invoiceActionAnchor, setInvoiceActionAnchor] = useState<HTMLElement | null>(null)
  const [actionInvoice, setActionInvoice] = useState<RentalInvoice | null>(null)
  const [cardAuthDialog, setCardAuthDialog] = useState<{ rental?: Rental; invoice?: RentalInvoice } | null>(null)

  const [actionAnchor, setActionAnchor] = useState<HTMLElement | null>(null)
  const [actionAgreement, setActionAgreement] = useState<Rental | null>(null)
  const [deliveryLink, setDeliveryLink] = useState('')
  const [deliveryLinkKind, setDeliveryLinkKind] = useState<'agreement' | 'extension'>('agreement')
  const [extensionOfferEnd, setExtensionOfferEnd] = useState('')
  const [extensionOfferPeriods, setExtensionOfferPeriods] = useState('')
  const [extensionOfferTerms, setExtensionOfferTerms] = useState('')
  const [extensionDecisionNotes, setExtensionDecisionNotes] = useState('')
  const [startExtEnd, setStartExtEnd] = useState('')
  const [startExtPeriods, setStartExtPeriods] = useState('')
  const [startExtTerms, setStartExtTerms] = useState('')
  const [startExtNotes, setStartExtNotes] = useState('')
  const [partInfo, setPartInfo] = useState<RentalPartInfo | null>(null)
  const [rateCardPart, setRateCardPart] = useState<RentalPart | null>(null)
  const [rateCardForm, setRateCardForm] = useState({ weekly_rate: '', biweekly_rate: '', monthly_rate: '', quarterly_rate: '', default_deposit: '' })

  const tab = Math.max(0, ROUTE_TABS.findIndex(path => location.pathname === path || location.pathname.startsWith(`${path}/`)))
  const highlightInvoiceId = Number(new URLSearchParams(location.search).get('highlightInvoice') || 0)
  const highlightAgreementId = Number(new URLSearchParams(location.search).get('highlightAgreement') || 0)

  useEffect(() => {
    if (location.pathname === '/rentals') navigate('/rentals/agreements', { replace: true })
  }, [location.pathname, navigate])

  // The agreement end date is derived from start date, billing frequency, and committed
  // periods — never hand-entered — so the term always matches the billing calendar.
  useEffect(() => {
    const computed = deriveRentalEndDate(agreementForm.start_date, agreementForm.billing_frequency, agreementForm.committed_periods)
    if (computed && computed !== agreementForm.end_date) {
      setAgreementForm(prev => ({ ...prev, end_date: computed }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agreementForm.start_date, agreementForm.billing_frequency, agreementForm.committed_periods])

  useEffect(() => {
    if (isRentalCustomer && tab > 1) navigate('/rentals/agreements', { replace: true })
  }, [isRentalCustomer, navigate, tab])

  useEffect(() => {
    setSearch(routeSearch)
    setDebouncedSearch(routeSearch)
  }, [routeSearch])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(search.trim())
      setAgreementPage(0)
      setInvoicesPage(0)
      setHistoryPage(0)
      setProductsPage(0)
    }, 350)

    return () => window.clearTimeout(handle)
  }, [search])

  const facilityCustomersQ = useQuery({
    queryKey: ['rental-facility-customers', agreementForm.facility_id],
    queryFn: () => fetchRentalFacilityCustomers(Number(agreementForm.facility_id)),
    enabled: agreementDialog && Boolean(agreementForm.facility_id),
    staleTime: 60_000,
  })
  const partsQ = useQuery({
    queryKey: ['rental-parts', debouncedSearch, searchField, dateFrom, dateTo, productsPage],
    queryFn: () => fetchRentalParts(
      debouncedSearch || undefined,
      PAGE_SIZE,
      productsPage * PAGE_SIZE,
      searchField === 'all' ? undefined : searchField,
      dateFrom || undefined,
      dateTo || undefined,
    ),
    enabled: isInternalRentalOperator && tab === 2 && !invalidDateRange,
    placeholderData: previousData => previousData,
  })
  const rentalsQ = useQuery({
    queryKey: ['rental-agreements', tab, debouncedSearch, searchField, dateFrom, dateTo, agreementPage, agreementRowsPerPage],
    queryFn: () => fetchRentals({
      search: debouncedSearch || undefined,
      search_field: searchField === 'all' ? undefined : searchField,
      date_from: tab === 0 ? dateFrom || undefined : undefined,
      date_to: tab === 0 ? dateTo || undefined : undefined,
      skip: agreementPage * agreementRowsPerPage,
      limit: agreementRowsPerPage,
    }),
    enabled: tab !== 0 || !invalidDateRange,
    placeholderData: previousData => previousData,
  })
  const activeRentalsCountQ = useQuery({
    queryKey: ['rental-agreements', 'active-count'],
    queryFn: () => fetchRentals({ status: 'active', skip: 0, limit: 1 }),
    staleTime: 60_000,
    placeholderData: previousData => previousData,
  })
  const invoicesQ = useQuery({
    queryKey: ['rental-invoices', debouncedSearch, searchField, dateFrom, dateTo, invoicesPage],
    queryFn: () => fetchRentalInvoices({ search: debouncedSearch || undefined, search_field: searchField === 'all' ? undefined : searchField, date_from: dateFrom || undefined, date_to: dateTo || undefined, skip: invoicesPage * PAGE_SIZE, limit: PAGE_SIZE }),
    enabled: tab === 1 && !invalidDateRange,
    placeholderData: previousData => previousData,
  })
  const historyQ = useQuery({
    queryKey: ['rental-history', debouncedSearch, searchField, dateFrom, dateTo, historyPage],
    queryFn: () => fetchRentalHistory({
      search: debouncedSearch || undefined,
      search_field: searchField === 'all' ? undefined : searchField,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      skip: historyPage * PAGE_SIZE,
      limit: PAGE_SIZE,
    }),
    enabled: isInternalRentalOperator && tab === 3 && !invalidDateRange,
    placeholderData: previousData => previousData,
  })
  const summaryQ = useQuery({ queryKey: ['rental-summary'], queryFn: fetchRentalSummary, placeholderData: previousData => previousData })

  const facilityCustomers = facilityCustomersQ.data?.items || []
  const selectedFacilityCustomer = facilityCustomers.find(
    customer => customer.id === agreementForm.customer_user_id,
  ) || null
  const parts = partsQ.data?.items || []
  const rentals = rentalsQ.data?.items || []
  const totalRentals = rentalsQ.data?.total || 0
  const invoices = invoicesQ.data?.items || []

  const totalInvoiced = summaryQ.data?.total_invoiced || 0
  const totalCollected = summaryQ.data?.total_collected || 0
  const collectionPercent = totalInvoiced > 0 ? Math.min(100, Math.round((totalCollected / totalInvoiced) * 100)) : 0

  useEffect(() => {
    if (!highlightInvoiceId || invoices.length === 0) return
    window.setTimeout(() => {
      document.getElementById(`rental-invoice-${highlightInvoiceId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)
  }, [highlightInvoiceId, invoices.length])

  useEffect(() => {
    if (!highlightAgreementId || rentals.length === 0) return
    window.setTimeout(() => {
      document.getElementById(`rental-agreement-${highlightAgreementId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)
  }, [highlightAgreementId, rentals.length])

  const stats = useMemo(() => ({
    agreements: totalRentals,
    active: activeRentalsCountQ.data?.total || 0,
    invoiced: totalInvoiced,
    products: summaryQ.data?.products ?? parts.length,
    history: historyQ.data?.total || 0,
  }), [totalRentals, activeRentalsCountQ.data?.total, totalInvoiced, summaryQ.data?.products, parts.length, historyQ.data?.total])

  const initialAgreementPricing = useMemo(
    () => calculateInitialRentalPricing(agreementForm),
    [agreementForm],
  )

  const invalidateRentals = () => {
    queryClient.invalidateQueries({ queryKey: ['rental-agreements'] })
    queryClient.invalidateQueries({ queryKey: ['rental-invoices'] })
    queryClient.invalidateQueries({ queryKey: ['rental-history'] })
    queryClient.invalidateQueries({ queryKey: ['rental-summary'] })
    queryClient.invalidateQueries({ queryKey: ['rental-parts'] })
  }

  const openCustomerRentalDocument = (rentalId: number | null | undefined) => {
    if (!rentalId) return toast.error('This invoice is not linked to a rental agreement')
    navigate(`/rentals/account/${rentalId}`)
  }

  const openAgreementDetails = async (agreement: Rental) => {
    if (isRentalCustomer) {
      openCustomerRentalDocument(agreement.id)
      return
    }
    setViewAgreement(agreement)
    try {
      const detail = await fetchRentalDetail(agreement.id)
      setViewAgreement(detail)
      setExtensionOfferEnd(detail.extension?.offered_end_date || detail.extension?.requested_end_date || '')
      setExtensionOfferPeriods(detail.extension?.offered_total_periods ? String(detail.extension.offered_total_periods) : '')
      setExtensionOfferTerms(detail.extension?.offered_terms || '')
      setExtensionDecisionNotes(detail.extension?.decision_notes || '')
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Could not load the complete rental billing schedule'))
    }
  }

  const buildAgreementItems = (): RentalItemPayload[] => agreementForm.items.map(item => ({
    part_id: item.part_id,
    quantity: Math.max(1, Number(item.quantity || 1)),
    rental_rate: normalizeMoneyInput(item.rental_rate),
    item_condition: item.item_condition || null,
    shipping_fee: normalizeMoneyInput(item.shipping_fee),
    setup_fee: normalizeMoneyInput(item.setup_fee),
    labor_fee: normalizeMoneyInput(item.labor_fee),
    removal_fee: normalizeMoneyInput(item.removal_fee),
    initial_condition: item.initial_condition?.trim() || null,
    initial_meter_reading: item.initial_meter_reading?.trim() || null,
  }))

  const buildAgreementCreatePayload = (): RentalPayload => ({
    facility_id: agreementForm.facility_id,
    customer_user_id: agreementForm.customer_user_id,
    customer_name: agreementForm.customer_name.trim(),
    customer_email: agreementForm.customer_email.trim(),
    customer_phone: digitsOnly(agreementForm.customer_phone),
    customer_address: composeDeliveryAddress(agreementForm.delivery_street, agreementForm.delivery_city, agreementForm.delivery_state, agreementForm.delivery_zip) || agreementForm.customer_address.trim(),
    delivery_street: agreementForm.delivery_street.trim() || null,
    delivery_city: agreementForm.delivery_city.trim() || null,
    delivery_state: agreementForm.delivery_state.trim() || null,
    delivery_zip: agreementForm.delivery_zip.trim() || null,
    billing_frequency: agreementForm.billing_frequency,
    security_deposit: normalizeMoneyInput(agreementForm.security_deposit),
    start_date: normalizeDateInput(agreementForm.start_date),
    end_date: normalizeDateInput(agreementForm.end_date),
    terms_and_conditions: agreementForm.terms_and_conditions?.trim() || null,
    items: buildAgreementItems(),
    auto_charge: agreementForm.auto_charge,
    committed_periods: agreementForm.committed_periods === '' ? null : Number(agreementForm.committed_periods),
    discount_type: agreementForm.discount_type || null,
    discount_value: agreementForm.discount_type ? normalizeMoneyInput(agreementForm.discount_value) : null,
    discount_apply_after_periods: agreementForm.discount_apply_after_periods === '' ? null : Number(agreementForm.discount_apply_after_periods),
  })

  const buildAgreementUpdatePayload = (): Partial<RentalPayload> => buildAgreementCreatePayload()

  const saveAgreementMut = useMutation({
    mutationFn: () => (
      editingAgreement
        ? updateRental(editingAgreement.id, buildAgreementUpdatePayload())
        : createRental(buildAgreementCreatePayload())
    ),
    onSuccess: () => {
      toast.success(editingAgreement ? 'Rental agreement updated' : 'Rental agreement created')
      setAgreementDialog(false)
      setEditingAgreement(null)
      setAgreementForm(emptyAgreement())
      invalidateRentals()
    },
    onError: (e: any) => toast.error(apiErrorMessage(e, 'Could not save rental agreement')),
  })

  const deleteAgreementMut = useMutation({
    mutationFn: deleteRental,
    onSuccess: () => {
      toast.success('Rental agreement deleted')
      closeActions()
      invalidateRentals()
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not delete agreement'),
  })

  const returnMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: RentalReturnPayload }) => returnRental(id, data),
    onSuccess: () => {
      toast.success('Equipment returned successfully')
      setReturnDialog(null)
      setReturnForm({ actual_return_date: new Date().toISOString().slice(0, 10), return_condition: '', final_meter_reading: 0 })
      invalidateRentals()
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not return equipment'),
  })

  const convertMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: RentalInvoiceCreatePayload }) => convertRentalToInvoice(id, data),
    onSuccess: () => {
      toast.success('Rental agreement converted to invoice')
      setConvertAgreement(null)
      setInvoiceDetails(emptyInvoiceDetails())
      invalidateRentals()
      navigate('/rentals/invoices')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not convert to invoice'),
  })

  const invoiceMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => updateRentalInvoice(id, data),
    onSuccess: () => {
      toast.success('Rental invoice updated')
      setInvoiceEdit(null)
      invalidateRentals()
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not update invoice'),
  })

  const refundMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { amount: number; payment_method?: string; notes?: string } }) => refundRentalInvoice(id, data),
    onSuccess: (invoice) => {
      const refunded = (invoice.transactions || []).filter(t => t.transaction_type === 'refund').slice(-1)[0]
      toast.success(refunded?.payment_method === 'square_card' ? 'Refund issued to card and recorded' : 'Refund recorded in the invoice ledger')
      setRefundInvoice(null)
      invalidateRentals()
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not record refund'),
  })

  const refundableOf = (invoice: RentalInvoice | null) =>
    Math.max(0, Number(invoice?.amount_paid || 0) - Number(invoice?.refunded_amount || 0))

  const openInvoiceRefund = (invoice: RentalInvoice) => {
    setRefundForm({ amount: refundableOf(invoice), payment_method: invoice.payment_method || '', notes: '' })
    setRefundInvoice(invoice)
  }

  const openCreate = () => {
    setEditingAgreement(null)
    setSelectedRentalPart(null)
    setItemDraft(newRentalItem())
    setAgreementForm(emptyAgreement())
    setAgreementDialog(true)
  }

  const openEdit = (rental: Rental) => {
    closeActions()
    setEditingAgreement(rental)
    setSelectedRentalPart(null)
    setItemDraft(newRentalItem())
    setAgreementForm({
      facility_id: rental.facility_id,
      customer_user_id: rental.customer_user_id,
      customer_name: rental.customer_name,
      customer_email: rental.customer_email,
      customer_phone: formatUSPhoneInput(rental.customer_phone),
      customer_address: rental.customer_address,
      delivery_street: rental.delivery_street || '',
      delivery_city: rental.delivery_city || '',
      delivery_state: rental.delivery_state || '',
      delivery_zip: rental.delivery_zip || '',
      billing_frequency: rental.billing_frequency,
      security_deposit: Number(rental.security_deposit || 0),
      start_date: rental.start_date || '',
      end_date: rental.end_date || '',
      terms_and_conditions: rental.terms_and_conditions || '',
      auto_charge: Boolean(rental.auto_charge),
      committed_periods: rental.committed_periods ?? '',
      discount_type: (rental.discount_type as '' | 'flat' | 'percent') || '',
      discount_value: Number(rental.discount_value || 0),
      discount_apply_after_periods: rental.discount_apply_after_periods ?? '',
      items: (rental.items || []).map(item => ({
        key: `existing-${item.id}`,
        part_id: item.part_id,
        part_number: item.part_number || '',
        part_description: item.part_description || '',
        quantity: Number(item.quantity || 1),
        rental_rate: Number(item.rental_rate || 0),
        item_condition: item.item_condition || 'New',
        shipping_fee: Number(item.shipping_fee || 0),
        setup_fee: Number(item.setup_fee || 0),
        labor_fee: Number(item.labor_fee || 0),
        removal_fee: Number(item.removal_fee || 0),
        initial_condition: item.initial_condition || '',
        initial_meter_reading: item.initial_meter_reading || '',
      })),
    })
    setAgreementDialog(true)
  }

  const syncCustomerFromFacility = (facility: Facility | null) => {
    setAgreementForm(prev => {
      if (!facility) return { ...prev, facility_id: null, customer_user_id: null }
      const street = [facility.billing_street || facility.address, facility.billing_suite || facility.suite].filter(Boolean).join(', ')
      const city = facility.billing_city || facility.city || ''
      const state = facility.billing_state || facility.state || ''
      const zip = facility.billing_zip_code || facility.zip_code || ''
      return {
        ...prev,
        facility_id: facility.id || null,
        customer_user_id: null,
        customer_name: facility.billing_name || facility.name || '',
        customer_email: facility.billing_email || facility.email || '',
        customer_phone: facility.phone ? formatUSPhoneInput(facility.phone) : '',
        delivery_street: street,
        delivery_city: city,
        delivery_state: state,
        delivery_zip: zip,
        customer_address: composeDeliveryAddress(street, city, state, zip),
      }
    })
  }

  const setDeliveryField = (field: 'delivery_street' | 'delivery_city' | 'delivery_state' | 'delivery_zip', value: string) => {
    setAgreementForm(prev => {
      const next = { ...prev, [field]: value }
      return { ...next, customer_address: composeDeliveryAddress(next.delivery_street, next.delivery_city, next.delivery_state, next.delivery_zip) }
    })
  }

  const handlePartSelect = async (part: RentalPart | null) => {
    setSelectedRentalPart(part)
    if (!part) {
      setItemDraft(prev => ({ ...prev, part_id: null, part_number: '', part_description: '', item_condition: '' }))
      return
    }
    setItemDraft(prev => ({
      ...prev,
      part_id: part.id,
      part_number: part.part_number,
      part_description: part.description,
      // Condition is sourced directly from parts/inventory, not entered by the operator.
      item_condition: part.condition || '',
      rental_rate: Number(part.unit_price || 0),
    }))
    // Auto-fill the rate from the product's tiered rate card for the chosen frequency.
    try {
      const card = await fetchRentalProductRate(part.id)
      const tierRate = rateForFrequency(card, agreementForm.billing_frequency)
      if (tierRate != null) setItemDraft(prev => ({ ...prev, rental_rate: Number(tierRate) }))
    } catch {
      /* no rate card configured yet — keep the unit price as the default */
    }
  }

  // Units of a part already placed on lines in the current form.
  const qtyUsedInForm = (partId: number) =>
    agreementForm.items.filter(item => item.part_id === partId).reduce((sum, item) => sum + Math.max(1, Number(item.quantity || 1)), 0)

  // Units this agreement already reserved before editing. Renting decrements on-hand stock
  // directly, so while editing we add the agreement's own reservation back (save reconciles
  // by delta), otherwise a part it already holds would look out of stock.
  const qtyReservedByThisAgreement = (partId: number) =>
    (editingAgreement?.items || []).filter(item => item.part_id === partId).reduce((sum, item) => sum + Math.max(1, Number(item.quantity || 1)), 0)

  // How many more units of a part can still be placed on this agreement.
  const partRemaining = (partId: number, onHand: number) =>
    Math.max(0, Number(onHand || 0) + qtyReservedByThisAgreement(partId) - qtyUsedInForm(partId))

  const selectedPartRemaining = selectedRentalPart
    ? partRemaining(selectedRentalPart.id, Number(selectedRentalPart.quantity_on_hand || 0))
    : undefined

  const addRentalItem = () => {
    if (!itemDraft.part_id) return toast.error('Select a rental product to add')
    const qty = Math.max(0, Number(itemDraft.quantity || 0))
    if (qty < 1) return toast.error('Quantity must be greater than zero')
    const remaining = partRemaining(itemDraft.part_id, Number(selectedRentalPart?.quantity_on_hand || 0))
    if (qty > remaining) {
      return toast.error(remaining > 0
        ? `Only ${remaining} more unit(s) of ${itemDraft.part_number} are in stock`
        : `${itemDraft.part_number || 'This product'} has no available stock left`)
    }
    setAgreementForm(prev => {
      const existing = prev.items.find(item => item.part_id === itemDraft.part_id)
      if (existing) {
        // Same part → one line with a combined quantity, never a duplicate line.
        return { ...prev, items: prev.items.map(item => item.part_id === itemDraft.part_id ? { ...item, quantity: Math.max(1, Number(item.quantity || 1)) + qty } : item) }
      }
      return { ...prev, items: [...prev.items, { ...itemDraft, quantity: qty, key: Math.random().toString(36).slice(2) }] }
    })
    setSelectedRentalPart(null)
    setItemDraft(newRentalItem())
  }

  const removeRentalItem = (key: string) => {
    setAgreementForm(prev => ({ ...prev, items: prev.items.filter(item => item.key !== key) }))
  }

  const submitAgreement = () => {
    if (agreementForm.facility_id && !agreementForm.customer_user_id) {
      return toast.error('Select an attached facility admin, manager, or client')
    }
    if (!agreementForm.customer_name.trim()) return toast.error('Customer name is required')
    if (!agreementForm.customer_email.trim()) return toast.error('Customer email is required')
    if (!agreementForm.delivery_street.trim() || !agreementForm.delivery_city.trim() || !agreementForm.delivery_state.trim() || !agreementForm.delivery_zip.trim()) {
      return toast.error('Enter the full delivery address — street, city, state, and ZIP')
    }
    if (agreementForm.items.length === 0) return toast.error('Add at least one rental product')
    if (agreementForm.billing_frequency === 'daily') return toast.error('Daily billing is no longer offered')
    if (agreementForm.committed_periods === '' || Number(agreementForm.committed_periods) < 1) {
      return toast.error('Enter the committed billing periods — this sets the agreement term and end date')
    }
    if (!agreementForm.end_date) return toast.error('Set a start date and committed periods so the end date can be calculated')
    saveAgreementMut.mutate()
  }

  const openRateCard = async (part: RentalPart) => {
    setRateCardPart(part)
    setRateCardForm({ weekly_rate: '', biweekly_rate: '', monthly_rate: '', quarterly_rate: '', default_deposit: '' })
    try {
      const card = await fetchRentalProductRate(part.id)
      const s = (v: number | null) => (v != null ? String(v) : '')
      setRateCardForm({
        weekly_rate: s(card.weekly_rate),
        biweekly_rate: s(card.biweekly_rate),
        monthly_rate: s(card.monthly_rate),
        quarterly_rate: s(card.quarterly_rate),
        default_deposit: s(card.default_deposit),
      })
    } catch {
      /* no rate card configured yet */
    }
  }

  const rateCardMut = useMutation({
    mutationFn: () => {
      if (!rateCardPart) return Promise.reject(new Error('No product selected'))
      const num = (v: string) => (v.trim() === '' ? null : Number(v))
      return upsertRentalProductRate(rateCardPart.id, {
        weekly_rate: num(rateCardForm.weekly_rate),
        biweekly_rate: num(rateCardForm.biweekly_rate),
        monthly_rate: num(rateCardForm.monthly_rate),
        quarterly_rate: num(rateCardForm.quarterly_rate),
        default_deposit: num(rateCardForm.default_deposit),
      })
    },
    onSuccess: () => {
      toast.success('Rate card saved')
      setRateCardPart(null)
    },
    onError: (e: any) => toast.error(apiErrorMessage(e, 'Could not save rate card')),
  })

  const billingMut = useMutation({
    mutationFn: runRecurringBilling,
    onSuccess: (result) => {
      toast.success(`Recurring billing ran: ${result.billed || 0} invoiced, ${result.charged || 0} charged, ${result.emailed || 0} emailed`)
      invalidateRentals()
    },
    onError: (e: any) => toast.error(apiErrorMessage(e, 'Could not run recurring billing')),
  })

  const sendMut = useMutation({
    mutationFn: (id: number) => sendRentalPortalLink(id),
    onSuccess: (result) => {
      setDeliveryLinkKind('agreement')
      setDeliveryLink(result.link)
      toast.success('Secure link emailed to the customer')
      closeActions()
      invalidateRentals()
    },
    onError: (e: any) => toast.error(apiErrorMessage(e, 'Could not send the customer link')),
  })

  const extensionOfferMut = useMutation({
    mutationFn: () => {
      if (!viewAgreement?.extension) return Promise.reject(new Error('No extension request selected'))
      return offerRentalExtension(viewAgreement.id, viewAgreement.extension.id, {
        end_date: extensionOfferEnd,
        total_periods: extensionOfferPeriods ? Number(extensionOfferPeriods) : null,
        terms: extensionOfferTerms.trim() || null,
        decision_notes: extensionDecisionNotes.trim() || null,
      })
    },
    onSuccess: async (result) => {
      setDeliveryLinkKind('extension')
      setDeliveryLink(result.link)
      toast.success('Extension offer emailed to the customer')
      invalidateRentals()
      if (viewAgreement) setViewAgreement(await fetchRentalDetail(viewAgreement.id))
    },
    onError: (e: any) => toast.error(apiErrorMessage(e, 'Could not send the extension offer')),
  })

  const extensionRejectMut = useMutation({
    mutationFn: () => {
      if (!viewAgreement?.extension) return Promise.reject(new Error('No extension request selected'))
      return rejectRentalExtension(viewAgreement.id, viewAgreement.extension.id, extensionDecisionNotes)
    },
    onSuccess: async () => {
      toast.success('Extension request rejected')
      invalidateRentals()
      if (viewAgreement) setViewAgreement(await fetchRentalDetail(viewAgreement.id))
    },
    onError: (e: any) => toast.error(apiErrorMessage(e, 'Could not reject the extension request')),
  })

  const extensionCreateMut = useMutation({
    mutationFn: () => {
      if (!viewAgreement) return Promise.reject(new Error('No agreement selected'))
      return createRentalExtension(viewAgreement.id, {
        end_date: startExtEnd,
        total_periods: startExtPeriods ? Number(startExtPeriods) : null,
        terms: startExtTerms.trim() || null,
        decision_notes: startExtNotes.trim() || null,
      })
    },
    onSuccess: async (result) => {
      setDeliveryLinkKind('extension')
      setDeliveryLink(result.link)
      toast.success('Extension offer emailed to the customer')
      setStartExtEnd(''); setStartExtPeriods(''); setStartExtTerms(''); setStartExtNotes('')
      invalidateRentals()
      if (viewAgreement) setViewAgreement(await fetchRentalDetail(viewAgreement.id))
    },
    onError: (e: any) => toast.error(apiErrorMessage(e, 'Could not start the extension')),
  })

  const extensionCancelMut = useMutation({
    mutationFn: () => {
      if (!viewAgreement?.extension) return Promise.reject(new Error('No extension request selected'))
      return cancelRentalExtension(viewAgreement.id, viewAgreement.extension.id, extensionDecisionNotes)
    },
    onSuccess: async () => {
      toast.success('Extension withdrawn')
      invalidateRentals()
      if (viewAgreement) setViewAgreement(await fetchRentalDetail(viewAgreement.id))
    },
    onError: (e: any) => toast.error(apiErrorMessage(e, 'Could not cancel the extension')),
  })

  const openRentalPartInfo = (
    part?: Partial<RentalPart> | null,
    fallback?: { part_id?: number | null; part_number?: string | null; part_description?: string | null; quantity?: number | null; rental_rate?: number | null; item_condition?: string | null },
  ) => {
    const partNumber = part?.part_number || fallback?.part_number || ''
    const matchedPart = part || parts.find(item =>
      (fallback?.part_id && item.id === fallback.part_id) ||
      (partNumber && item.part_number === partNumber),
    )
    setPartInfo({
      partNumber: matchedPart?.part_number || partNumber || String(fallback?.part_id || '-'),
      description: matchedPart?.description || fallback?.part_description || '-',
      make: matchedPart?.make ?? null,
      model: matchedPart?.model ?? null,
      serialNumber: matchedPart?.serial_number ?? null,
      condition: matchedPart?.condition || fallback?.item_condition || null,
      quantity: matchedPart?.quantity_on_hand ?? fallback?.quantity ?? null,
      unitPrice: matchedPart?.unit_price ?? fallback?.rental_rate ?? null,
      facilityName: matchedPart?.facility_name ?? null,
      status: matchedPart?.status ?? null,
      imageUrl: matchedPart?.default_picture_url || null,
    })
  }

  const openActions = (event: MouseEvent<HTMLElement>, rental: Rental) => {
    setActionAnchor(event.currentTarget)
    setActionAgreement(rental)
  }

  const closeActions = () => {
    setActionAnchor(null)
    setActionAgreement(null)
  }

  const openInvoiceActions = (event: MouseEvent<HTMLElement>, invoice: RentalInvoice) => {
    setInvoiceActionAnchor(event.currentTarget)
    setActionInvoice(invoice)
  }

  const closeInvoiceActions = () => {
    setInvoiceActionAnchor(null)
    setActionInvoice(null)
  }

  const openCardAuthorization = (target: { rental?: Rental; invoice?: RentalInvoice }) => {
    closeActions()
    closeInvoiceActions()
    setCardAuthDialog(target)
  }

  const openInvoiceEdit = (invoice: RentalInvoice) => {
    setInvoiceEdit(invoice)
    setInvoiceForm({
      amount_paid: Number(invoice.amount_paid || 0),
      due_date: invoice.due_date || '',
      status: invoice.status || 'pending',
      payment_method: invoice.payment_method || 'bank_transfer',
      notes: invoice.notes || '',
    })
  }

  const openConvertDialog = (rental: Rental) => {
    closeActions()
    setConvertAgreement(rental)
    setInvoiceDetails({
      ...emptyInvoiceDetails(),
      payment_method: rental.converted_invoice_payment_method || 'bank_transfer',
      action: 'convert_to_invoice',
    })
  }

  const openReturnDialog = (rental: Rental) => {
    closeActions()
    setReturnDialog(rental)
    setReturnForm({
      actual_return_date: new Date().toISOString().slice(0, 10),
      return_condition: rental.initial_condition || '',
      final_meter_reading: Number(rental.initial_meter_reading) || 0,
    })
  }

  // calculations for invoice conversion
  const durationDays = useMemo(() => {
    if (!convertAgreement) return 0
    const end = convertAgreement.actual_return_date ? new Date(convertAgreement.actual_return_date) : new Date(convertAgreement.end_date)
    const start = new Date(convertAgreement.start_date)
    const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    return diff < 1 ? 1 : diff
  }, [convertAgreement])

  // Number of billing periods covering the rental duration (mirrors the backend).
  const billingPeriods = useMemo(() => {
    if (!convertAgreement) return 1
    switch (convertAgreement.billing_frequency) {
      case 'weekly': return Math.ceil(durationDays / 7)
      case 'biweekly': return Math.ceil(durationDays / 14)
      case 'monthly': return Math.ceil(durationDays / 30)
      case 'quarterly': return Math.ceil(durationDays / 91)
      case 'daily': return durationDays
      default: return Math.ceil(durationDays / 30)
    }
  }, [convertAgreement, durationDays])

  // Every item on the agreement (falls back to the legacy single item for old records).
  const convertItems = useMemo(() => {
    if (!convertAgreement) return [] as RentalItem[]
    if (convertAgreement.items && convertAgreement.items.length > 0) return convertAgreement.items
    return [{
      id: 0,
      part_id: convertAgreement.part_id,
      equipment_id: convertAgreement.equipment_id,
      part_number: convertAgreement.part_number,
      part_description: convertAgreement.part_description,
      default_picture_url: null,
      quantity: convertAgreement.quantity || 1,
      rental_rate: convertAgreement.rental_rate || 0,
      item_condition: convertAgreement.item_condition,
      shipping_fee: convertAgreement.shipping_fee || 0,
      setup_fee: convertAgreement.setup_fee || 0,
      labor_fee: 0,
      removal_fee: 0,
      initial_condition: null,
      return_condition: null,
      initial_meter_reading: null,
      final_meter_reading: null,
      returned_at: null,
      item_status: 'out',
    } as RentalItem]
  }, [convertAgreement])

  // Base rental = periods × rate × qty, summed across every item.
  const calculatedBaseRental = useMemo(
    () => convertItems.reduce((sum, item) => sum + billingPeriods * Number(item.rental_rate || 0) * Number(item.quantity || 1), 0),
    [convertItems, billingPeriods],
  )
  const itemsShippingTotal = useMemo(() => convertItems.reduce((sum, item) => sum + Number(item.shipping_fee || 0), 0), [convertItems])
  const itemsSetupTotal = useMemo(() => convertItems.reduce((sum, item) => sum + Number(item.setup_fee || 0), 0), [convertItems])

  const itemsLaborTotal = useMemo(() => convertItems.reduce((sum, item) => sum + Number(item.labor_fee || 0), 0), [convertItems])
  const itemsRemovalTotal = useMemo(() => convertItems.reduce((sum, item) => sum + Number(item.removal_fee || 0), 0), [convertItems])
  const convertShippingTotal = Number(invoiceDetails.shipping_fee || 0) + itemsShippingTotal
  const convertSetupTotal = Number(invoiceDetails.setup_fee || 0) + itemsSetupTotal
  // Same tax rule as Sales: 8.25% on rent + shipping & packing + delivery & setup + removal.
  // Labor is non-taxable.
  const convertTaxableBase = calculatedBaseRental + convertShippingTotal + convertSetupTotal + itemsRemovalTotal
  const convertTaxAmount = roundSalesMoney(convertTaxableBase * SALES_TAX_FACTOR)
  const convertSubtotal =
    calculatedBaseRental +
    Number(invoiceDetails.worked_hours || 0) +
    convertSetupTotal +
    Number(invoiceDetails.service_fee || 0) +
    convertShippingTotal +
    itemsRemovalTotal +
    Number(invoiceDetails.application_fee || 0) +
    itemsLaborTotal
  const convertDiscountAmount = invoiceDetails.discount_type === 'percent'
    ? convertSubtotal * Number(invoiceDetails.discount_amount || 0) / 100
    : Number(invoiceDetails.discount_amount || 0)
  const convertGrandTotal = convertSubtotal + convertTaxAmount - convertDiscountAmount

  const renderKpi = (label: string, value: string | number, icon: JSX.Element, color: string) => (
    <Card sx={{ p: 2.2, borderRadius: '18px', border: '1px solid #EEF0F6', boxShadow: '0 14px 34px rgba(59,130,246,0.07)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.4 }}>
        <Avatar sx={{ bgcolor: `${color}18`, color, borderRadius: '14px' }}>{icon}</Avatar>
        <Box>
          <Typography sx={{ color: '#6B7280', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>{label}</Typography>
          <Typography sx={{ color: '#1E1B4B', fontSize: 24, fontWeight: 900, lineHeight: 1.2 }}>{value}</Typography>
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

  const sameInvoiceAccount = (left: RentalInvoice, right: RentalInvoice) => {
    return isSameBillingAccount(
      {
        facilityId: left.facility_id,
        customerEmail: left.customer_email,
        recordKey: `rental-invoice-${left.id}`,
      },
      {
        facilityId: right.facility_id,
        customerEmail: right.customer_email,
        recordKey: `rental-invoice-${right.id}`,
      },
    )
  }

  const invoiceLineItems = (invoice: RentalInvoice | null): PrintableLineItem[] => {
    if (!invoice) return []
    // Prefer the invoice's own stored line items (deposit invoice shows deposit +
    // shipping & packing + delivery & setup; cycle invoices show the period rental).
    if (invoice.line_items && invoice.line_items.length > 0) {
      return invoice.line_items.map((li: any) => ({
        item_number: li.item_number || '-',
        description: li.description || '',
        quantity: Number(li.quantity || 1),
        unit_price: Number(li.unit_price || 0),
        shipping_fee: Number(li.shipping_fee || 0),
        setup_fee: Number(li.setup_fee || 0),
        condition: li.condition ?? null,
        total_amount: Number(li.total_amount || 0),
      }))
    }
    const rental = rentals.find(item => item.id === invoice.rental_id)
    if (rental) return agreementLineItems(rental)
    return [{
      item_number: invoice.invoice_number,
      description: invoice.notes || 'Rental invoice',
      quantity: 1,
      unit_price: Number(invoice.subtotal || invoice.total_amount || 0),
      shipping_fee: 0,
      setup_fee: 0,
      condition: null,
      total_amount: Number(invoice.subtotal || invoice.total_amount || 0),
    }]
  }

  const agreementLineItems = (rental: Rental | null): PrintableLineItem[] => {
    if (!rental) return []
    const items = (rental.items && rental.items.length > 0)
      ? rental.items
      : [{
          part_number: rental.part_number,
          part_description: rental.part_description,
          quantity: rental.quantity || 1,
          rental_rate: rental.rental_rate || 0,
          shipping_fee: rental.shipping_fee || 0,
          setup_fee: rental.setup_fee || 0,
          item_condition: rental.item_condition,
        }]
    return items.map(item => ({
      item_number: item.part_number || rental.rental_number,
      description: item.part_description || 'Rental product',
      quantity: Number(item.quantity || 1),
      unit_price: Number(item.rental_rate || 0),
      shipping_fee: Number(item.shipping_fee || 0),
      setup_fee: Number(item.setup_fee || 0),
      condition: item.item_condition || null,
      total_amount: Number(item.rental_rate || 0) * Number(item.quantity || 1) + Number(item.shipping_fee || 0) + Number(item.setup_fee || 0),
    }))
  }

  const agreementLedgerTransactions = (rental: Rental | null): PrintableLedgerTransaction[] => {
    if (!rental) return []
    return invoices
      .filter(invoice => {
        if (invoice.rental_id === rental.id) return true
        return isSameBillingAccount(
          {
            customerEmail: rental.customer_email,
            recordKey: `rental-${rental.id}`,
          },
          {
            facilityId: invoice.facility_id,
            customerEmail: invoice.customer_email,
            recordKey: `rental-invoice-${invoice.id}`,
          },
        )
      })
      .flatMap(invoice => (invoice.transactions || []).map(transaction => ({
        ...transaction,
        invoice_number: invoice.invoice_number,
      })))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }

  const invoiceLedgerTransactions = (invoice: RentalInvoice | null): PrintableLedgerTransaction[] => {
    if (!invoice) return []
    return invoices
      .filter(item => sameInvoiceAccount(invoice, item))
      .flatMap(item => (item.transactions || []).map(transaction => ({
        ...transaction,
        invoice_number: item.invoice_number,
      })))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }

  const cardAuthorizationRental = cardAuthDialog?.rental
    || rentals.find(item => item.id === cardAuthDialog?.invoice?.rental_id)
    || null

  const cardAuthorizationItems: AuthorizationLineItem[] = cardAuthorizationRental
    ? [{
      item_number: cardAuthorizationRental.part_number || cardAuthorizationRental.rental_number,
      description: cardAuthorizationRental.part_description || 'Rental product',
      amount: Number(cardAuthorizationRental.rental_rate || 0),
      quantity: Number(cardAuthorizationRental.quantity || 1),
      total_amount: Number(cardAuthorizationRental.rental_rate || 0) * Number(cardAuthorizationRental.quantity || 1) + Number(cardAuthorizationRental.shipping_fee || 0) + Number(cardAuthorizationRental.setup_fee || 0),
    }]
    : cardAuthDialog?.invoice
      ? [{
        item_number: cardAuthDialog.invoice.invoice_number,
        description: cardAuthDialog.invoice.rental_number || 'Rental invoice',
        amount: Number(cardAuthDialog.invoice.total_amount || 0),
        quantity: 1,
        total_amount: Number(cardAuthDialog.invoice.total_amount || 0),
      }]
      : []

  const submitCardAuthorization = (_payload: CreditCardAuthorizationPayload) => {
    toast.success('Rental credit card authorization form prepared')
    setCardAuthDialog(null)
  }

  const applyRentalConvertAction = () => {
    if (!convertAgreement) return
    const action = invoiceDetails.action || 'convert_to_invoice'
    if (action === 'approve') {
      convertRentalToInvoice(convertAgreement.id, invoiceDetails)
        .then(() => {
          toast.success('Rental quotation approved')
          setConvertAgreement(null)
          invalidateRentals()
        })
        .catch((e: any) => toast.error(e.response?.data?.detail || 'Could not approve rental quotation'))
      return
    }
    if (action === 'reject') {
      convertRentalToInvoice(convertAgreement.id, invoiceDetails)
        .then(() => {
          toast.success('Rental quotation rejected')
          setConvertAgreement(null)
          invalidateRentals()
        })
        .catch((e: any) => toast.error(e.response?.data?.detail || 'Could not reject rental quotation'))
      return
    }
    if (action === 'mark_pending') {
      convertRentalToInvoice(convertAgreement.id, invoiceDetails)
        .then(() => {
          toast.success('Rental quotation marked pending')
          setConvertAgreement(null)
          invalidateRentals()
        })
        .catch((e: any) => toast.error(e.response?.data?.detail || 'Could not mark rental quotation pending'))
      return
    }
    convertMut.mutate({ id: convertAgreement.id, data: invoiceDetails })
  }

  const renderAgreementsTable = (items: Rental[], emptyText: string) => (
    <TableContainer className="list-scroll-panel">
      <Table stickyHeader>
        <TableHead>
          <TableRow sx={{ bgcolor: '#F9FAFB' }}>
            <TableCell sx={{ fontWeight: 900 }}>Agreement #</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Product / Part</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Customer</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Rate</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Qty</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Fees</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Frequency</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Start Date</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>End Date</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Status</TableCell>
            <TableCell align="right" sx={{ fontWeight: 900 }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rentalsQ.isLoading ? Array.from({ length: 5 }).map((_, index) => (
            <TableRow key={index}><TableCell colSpan={11}><Skeleton /></TableCell></TableRow>
          )) : items.length === 0 ? (
            <TableRow><TableCell colSpan={11} align="center" sx={{ py: 5, color: '#6B7280', fontWeight: 700 }}>{emptyText}</TableCell></TableRow>
          ) : items.map(item => {
            const status = statusChip(item.status)
            const highlighted = highlightAgreementId === item.id
            return (
              <ContextTableRow
                key={item.id}
                recordKey={`rental-agreement-${item.id}`}
                recordLabel={item.rental_number}
                id={`rental-agreement-${item.id}`}
                hover
                sx={highlighted ? {
                  bgcolor: '#EFF6FF',
                  outline: '2px solid #2563EB',
                  outlineOffset: '-2px',
                  '& td': { borderTop: '1px solid #BFDBFE', borderBottom: '1px solid #BFDBFE' },
                } : undefined}
              >
                <TableCell><ClippedTooltipText value={item.rental_number} monospace color="#1D4ED8" fontWeight={900} onClick={() => { void openAgreementDetails(item) }} /></TableCell>
                <TableCell><ClippedTooltipText value={item.part_number ? `${item.part_number} - ${item.part_description || ''}` : '-'} fontWeight={800} field onClick={() => openRentalPartInfo(parts.find(part => part.id === item.part_id), item)} /></TableCell>
                <TableCell><ClippedTooltipText value={item.customer_name} fontWeight={800} /></TableCell>
                <TableCell sx={{ color: '#047857', fontWeight: 800 }}>{money(item.rental_rate)}</TableCell>
                <TableCell>{item.quantity || 1}</TableCell>
                <TableCell>{money(Number(item.shipping_fee || 0) + Number(item.setup_fee || 0))}</TableCell>
                <TableCell sx={{ textTransform: 'capitalize' }}>{item.billing_frequency}</TableCell>
                <TableCell>{formatDate(item.start_date)}</TableCell>
                <TableCell>{formatDate(item.end_date)}</TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, flexWrap: 'wrap' }}>
                    <Chip size="small" label={item.status} sx={{ bgcolor: status.bg, color: status.color, fontWeight: 900, textTransform: 'uppercase' }} />
                    {item.is_overdue && <Chip size="small" label="Overdue" sx={{ bgcolor: '#FEE2E2', color: '#B91C1C', fontWeight: 900, textTransform: 'uppercase' }} />}
                  </Box>
                </TableCell>
                <TableCell align="right">
                  {highlighted && (
                    <Chip size="small" label="Selected" sx={{ mr: 1, bgcolor: '#DBEAFE', color: '#1D4ED8', fontWeight: 900 }} />
                  )}
                  {isRentalCustomer ? (
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<VisibilityIcon />}
                      onClick={() => openCustomerRentalDocument(item.id)}
                      sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 900, whiteSpace: 'nowrap' }}
                    >
                      Open
                    </Button>
                  ) : isInternalRentalOperator ? (
                    <IconButton
                      size="small"
                      onClick={(event) => openActions(event, item)}
                      sx={{ borderRadius: '12px', bgcolor: '#F3F4F6', color: '#2563EB', '&:hover': { bgcolor: '#DBEAFE' } }}
                    >
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  ) : null}
                </TableCell>
              </ContextTableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )

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

  const renderInvoices = () => (
    <TableContainer className="list-scroll-panel">
      <Table stickyHeader>
        <TableHead>
          <TableRow sx={{ bgcolor: '#F9FAFB' }}>
            <TableCell sx={{ fontWeight: 900 }}>Invoice #</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Agreement #</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Customer</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Amount</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Paid</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Status</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Due</TableCell>
            <TableCell align="right" sx={{ fontWeight: 900 }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {invoicesQ.isLoading ? Array.from({ length: 5 }).map((_, index) => (
            <TableRow key={index}><TableCell colSpan={8}><Skeleton /></TableCell></TableRow>
          )) : invoices.length === 0 ? (
            <TableRow><TableCell colSpan={8} align="center" sx={{ py: 5, color: '#6B7280', fontWeight: 700 }}>No rental invoices yet.</TableCell></TableRow>
          ) : invoices.map(invoice => {
            const chip = statusChip(invoice.status)
            const highlighted = highlightInvoiceId === invoice.id
            return (
              <ContextTableRow
                key={invoice.id}
                recordKey={`rental-invoice-${invoice.id}`}
                recordLabel={invoice.invoice_number}
                id={`rental-invoice-${invoice.id}`}
                hover
                sx={highlighted ? {
                  bgcolor: '#EFF6FF',
                  outline: '2px solid #2563EB',
                  outlineOffset: '-2px',
                  '& td': { borderTop: '1px solid #BFDBFE', borderBottom: '1px solid #BFDBFE' },
                } : undefined}
              >
                <TableCell><ClippedTooltipText value={invoice.invoice_number} monospace color="#1D4ED8" fontWeight={900} onClick={() => {
                  if (isRentalCustomer) openCustomerRentalDocument(invoice.rental_id)
                  else setPrintInvoice(invoice)
                }} /></TableCell>
                <TableCell><ClippedTooltipText value={invoice.rental_number || '-'} monospace fontWeight={800} onClick={() => {
                  const agreement = rentals.find(item => item.id === invoice.rental_id)
                  if (agreement) void openAgreementDetails(agreement)
                }} /></TableCell>
                <TableCell><ClippedTooltipText value={invoice.customer_name} fontWeight={800} /></TableCell>
                <TableCell sx={{ color: '#059669', fontWeight: 900 }}>{money(invoice.total_amount)}</TableCell>
                <TableCell>{money(invoice.amount_paid)}</TableCell>
                <TableCell><Chip size="small" label={invoice.status.replace('_', ' ')} sx={{ bgcolor: chip.bg, color: chip.color, fontWeight: 900, textTransform: 'uppercase' }} /></TableCell>
                <TableCell>{formatDate(invoice.due_date)}</TableCell>
                <TableCell align="right">
                  {highlighted && (
                    <Chip size="small" label="Selected from Billing" sx={{ mr: 1, bgcolor: '#DBEAFE', color: '#1D4ED8', fontWeight: 900 }} />
                  )}
                  {isRentalCustomer ? (
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<VisibilityIcon />}
                      onClick={() => openCustomerRentalDocument(invoice.rental_id)}
                      sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 900, whiteSpace: 'nowrap' }}
                    >
                      Open
                    </Button>
                  ) : isInternalRentalOperator ? (
                    <IconButton
                      size="small"
                      onClick={(event) => openInvoiceActions(event, invoice)}
                      sx={{ borderRadius: '12px', bgcolor: '#F3F4F6', color: '#2563EB', '&:hover': { bgcolor: '#DBEAFE' } }}
                    >
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  ) : null}
                </TableCell>
              </ContextTableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )

  const renderProducts = () => (
    <TableContainer className="list-scroll-panel">
      <Table stickyHeader>
        <TableHead>
          <TableRow sx={{ bgcolor: '#F9FAFB' }}>
            <TableCell sx={{ fontWeight: 900 }}>Image</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Part Number</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Description</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Facility</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Make/Model</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Standard Rate</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Qty Available</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Condition</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Status</TableCell>
            <TableCell sx={{ fontWeight: 900 }} align="right">Rental Rates</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {partsQ.isLoading ? Array.from({ length: 5 }).map((_, index) => (
            <TableRow key={index}><TableCell colSpan={10}><Skeleton /></TableCell></TableRow>
          )) : parts.length === 0 ? (
            <TableRow><TableCell colSpan={10} align="center" sx={{ py: 5, color: '#6B7280', fontWeight: 700 }}>No rental products found.</TableCell></TableRow>
          ) : parts.map(part => (
            <ContextTableRow
              key={part.id}
              recordKey={`rental-product-${part.id}`}
              recordLabel={part.part_number}
              hover
            >
              <TableCell>
                <Avatar src={resolveUploadUrl(part.default_picture_url)} variant="rounded" imgProps={{ loading: 'lazy' }} sx={{ width: 46, height: 46, bgcolor: '#EFF6FF', color: '#2563EB', borderRadius: '12px' }}>
                  <LocalShippingIcon fontSize="small" />
                </Avatar>
              </TableCell>
              <TableCell><ClippedTooltipText value={part.part_number} monospace fontWeight={900} onClick={() => openRentalPartInfo(part)} /></TableCell>
              <TableCell><ClippedTooltipText value={part.description} fontWeight={800} field /></TableCell>
              <TableCell><ClippedTooltipText value={part.facility_name || 'Global / Independent'} onClick={part.facility_name ? () => navigate(`/facilities?search=${encodeURIComponent(part.facility_name!)}`) : undefined} /></TableCell>
              <TableCell><ClippedTooltipText value={[part.make, part.model].filter(Boolean).join(' / ') || '-'} /></TableCell>
              <TableCell sx={{ color: '#2563EB', fontWeight: 800 }}>{money(part.unit_price)}</TableCell>
              <TableCell sx={{ fontWeight: 900, color: part.quantity_on_hand > 0 ? '#059669' : '#DC2626' }}>
                {part.quantity_on_hand}
              </TableCell>
              <TableCell sx={{ textTransform: 'capitalize' }}>{part.condition}</TableCell>
              <TableCell><Chip size="small" label={part.status} color={part.status === 'active' ? 'success' : 'default'} sx={{ fontWeight: 900, textTransform: 'uppercase' }} /></TableCell>
              <TableCell align="right">
                <Button size="small" startIcon={<CalendarMonthIcon fontSize="small" />} onClick={() => openRateCard(part)} sx={{ fontWeight: 800, textTransform: 'none', borderRadius: '10px' }}>Set Rates</Button>
              </TableCell>
            </ContextTableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )

  const renderHistory = () => (
    <TableContainer className="list-scroll-panel">
      <Table stickyHeader>
        <TableHead>
          <TableRow sx={{ bgcolor: '#F9FAFB' }}>
            <TableCell sx={{ fontWeight: 900 }}>Date</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Agreement #</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Customer</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Facility</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Product / Part</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Activity</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>By</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {historyQ.isLoading ? Array.from({ length: 5 }).map((_, index) => (
            <TableRow key={index}><TableCell colSpan={7}><Skeleton /></TableCell></TableRow>
          )) : (historyQ.data?.items || []).length === 0 ? (
            <TableRow><TableCell colSpan={7} align="center" sx={{ py: 5, color: '#6B7280', fontWeight: 700 }}>No rental history logs yet.</TableCell></TableRow>
          ) : historyQ.data!.items.map((item, index) => (
            <ContextTableRow
              key={`${item.rental_id}-${item.action}-${index}`}
              recordKey={`rental-history-${item.rental_id}-${index}`}
              recordLabel={`${item.rental_number} · ${item.action.replace(/_/g, ' ')}`}
              hover
            >
              <TableCell>{formatDate(item.at)}</TableCell>
              <TableCell><ClippedTooltipText value={item.rental_number} monospace color="#1D4ED8" fontWeight={900} onClick={() => {
                const agreement = rentals.find(rental => rental.id === item.rental_id)
                if (agreement) void openAgreementDetails(agreement)
              }} /></TableCell>
              <TableCell><ClippedTooltipText value={item.customer_name} fontWeight={800} /></TableCell>
              <TableCell><ClippedTooltipText value={item.facility_name || '-'} onClick={item.facility_name ? () => navigate(`/facilities?search=${encodeURIComponent(item.facility_name!)}`) : undefined} /></TableCell>
              <TableCell><ClippedTooltipText value={item.part_number ? `${item.part_number} - ${item.part_description || ''}` : '-'} field onClick={() => openRentalPartInfo(parts.find(part => part.part_number === item.part_number), item)} /></TableCell>
              <TableCell sx={{ textTransform: 'capitalize', fontWeight: 800 }}>{item.action.replace(/_/g, ' ')}</TableCell>
              <TableCell>{item.by}</TableCell>
            </ContextTableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )

  const activeSearchFields = tab === 1
    ? RENTAL_INVOICE_SEARCH_FIELDS
    : tab === 2
      ? RENTAL_PRODUCT_SEARCH_FIELDS
      : tab === 3
        ? RENTAL_HISTORY_SEARCH_FIELDS
        : RENTAL_AGREEMENT_SEARCH_FIELDS

  const handleSearchFieldChange = (value: string) => {
    const params = new URLSearchParams(location.search)
    if (value === 'all') params.delete('search_field')
    else params.set('search_field', value)
    navigate(`${location.pathname}${params.size ? `?${params.toString()}` : ''}`, { replace: true })
    setAgreementPage(0)
    setInvoicesPage(0)
    setHistoryPage(0)
    setProductsPage(0)
  }

  const setRouteParam = (key: string, value: string) => {
    const params = new URLSearchParams(location.search)
    if (value) params.set(key, value)
    else params.delete(key)
    navigate(`${location.pathname}${params.size ? `?${params.toString()}` : ''}`, { replace: true })
    setAgreementPage(0)
    setInvoicesPage(0)
    setHistoryPage(0)
    setProductsPage(0)
  }

  const handleTabChange = (value: number) => {
    const params = new URLSearchParams()
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)
    navigate(`${ROUTE_TABS[value]}${params.size ? `?${params.toString()}` : ''}`)
  }

  const renderSearchControl = (label: string) => (
    <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center', flexWrap: 'wrap' }}>
      <SearchFieldSelect
        value={searchField}
        options={activeSearchFields}
        onChange={handleSearchFieldChange}
        ariaLabel="Rental search field"
      />
      <TextField
        size="small"
        label={label}
        placeholder={`Search ${activeSearchFields.find((field) => field.value === searchField)?.label.toLowerCase() || 'rentals'}...`}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        sx={{ minWidth: 280, bgcolor: '#fff' }}
      />
      <DateRangeFilter
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={(value) => setRouteParam('date_from', value)}
        onDateToChange={(value) => setRouteParam('date_to', value)}
        label={tab === 0 ? 'agreement start date' : tab === 1 ? 'invoice issue date' : tab === 2 ? 'inventory date' : 'history date'}
      />
    </Box>
  )

  return (
    <Box className="page-enter" sx={{ maxWidth: 1440, mx: 'auto' }}>
      <Card sx={{ p: 3, mb: 3, borderRadius: '24px', border: '1px solid #BFDBFE', background: 'linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 100%)', boxShadow: '0 18px 45px rgba(59,130,246,0.08)' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <Box>
            <Typography variant="h4" sx={{ color: '#1E3A8A', fontWeight: 900 }}>Rental Management</Typography>
            <Typography sx={{ color: '#4B5563', fontWeight: 700 }}>
              {isRentalCustomer
                ? 'Review and sign your facility rental agreements, view invoices, and complete secure payments.'
                : 'Create agreements for rental products from inventory, process periodic billing invoices, track equipment handovers, returns and history logs.'}
            </Typography>
          </Box>
          {isInternalRentalOperator && <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <Button
              startIcon={billingMut.isPending ? <CircularProgress size={16} /> : <PaymentIcon />}
              variant="outlined"
              onClick={() => billingMut.mutate()}
              disabled={billingMut.isPending}
              sx={{ borderRadius: '14px', px: 2.5, py: 1.4, textTransform: 'none', fontWeight: 900, borderColor: '#BFDBFE', color: '#1D4ED8' }}
            >
              Run Recurring Billing
            </Button>
            <Button startIcon={<AddIcon />} variant="contained" onClick={openCreate} sx={{ borderRadius: '14px', px: 3, py: 1.4, textTransform: 'none', fontWeight: 900, background: SYSTEM_GRADIENT }}>
              New Agreement
            </Button>
          </Box>}
        </Box>
      </Card>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: `repeat(${isInternalRentalOperator ? 5 : 3}, 1fr)` }, gap: 2, mb: 3 }}>
        {renderKpi('Total Agreements', stats.agreements, <AssignmentIcon />, '#3B82F6')}
        {renderKpi('Active Rentals', stats.active, <LocalShippingIcon />, '#2563EB')}
        {renderKpi('Total Invoiced', money(stats.invoiced), <ReceiptLongIcon />, '#059669')}
        {isInternalRentalOperator && renderKpi('Rental Products', stats.products, <InfoIcon />, '#8B5CF6')}
        {isInternalRentalOperator && renderKpi('History Entries', stats.history, <HistoryIcon />, '#6B7280')}
      </Box>

      <Card sx={{ borderRadius: '24px', overflow: 'hidden', border: '1px solid #EEF0F6', boxShadow: '0 18px 45px rgba(59,130,246,0.08)' }}>
        <Tabs value={tab} onChange={(_, value) => handleTabChange(value)} variant="scrollable" scrollButtons={false} sx={{ px: 2, borderBottom: '1px solid #EEF0F6' }}>
          <Tab icon={<AssignmentIcon />} iconPosition="start" label="Agreements" />
          <Tab icon={<ReceiptLongIcon />} iconPosition="start" label="Invoices" />
          {isInternalRentalOperator && <Tab icon={<InfoIcon />} iconPosition="start" label="Rental Products" />}
          {isInternalRentalOperator && <Tab icon={<HistoryIcon />} iconPosition="start" label="History" />}
        </Tabs>

        {tab === 0 && (
          <Box>
            <Box sx={{ px: 3, py: 2, display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center', borderBottom: '1px solid #EEF0F6', flexWrap: 'wrap' }}>
              <Box>
                <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Agreements List</Typography>
                <Typography sx={{ color: '#6B7280', fontWeight: 700, fontSize: 13 }}>Track your active agreements and return schedules.</Typography>
              </Box>
              {renderSearchControl('Search agreements')}
            </Box>
            <Box sx={{ p: 3 }}>
              {renderAgreementsTable(rentals, 'No rental agreements found.')}
              <TablePagination
                component="div"
                count={totalRentals}
                page={agreementPage}
                onPageChange={(_, nextPage) => setAgreementPage(nextPage)}
                rowsPerPage={agreementRowsPerPage}
                onRowsPerPageChange={(event) => {
                  setAgreementRowsPerPage(Number(event.target.value))
                  setAgreementPage(0)
                }}
                rowsPerPageOptions={[10, 25, 50, 100]}
              />
            </Box>
          </Box>
        )}

        {tab === 1 && (
          <Box>
            <Box sx={{ px: 3, py: 2.5, display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', borderBottom: '1px solid #EEF0F6' }}>
              <Box>
                <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Rental Invoices</Typography>
                <Typography sx={{ color: '#6B7280', fontWeight: 700, fontSize: 13 }}>Periodic invoices generated from rental durations.</Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
                {renderSearchControl('Search invoices')}
                <Card sx={{ px: 2, py: 0.8, display: 'flex', alignItems: 'center', gap: 2, border: '1px solid #E5E7EB', borderRadius: '12px', bgcolor: '#F9FAFB' }}>
                  <Typography sx={{ fontWeight: 850, fontSize: 12, color: '#4B5563' }}>Collections Progress: {collectionPercent}%</Typography>
                  <Box sx={{ width: 100 }}>
                    <LinearProgress variant="determinate" value={collectionPercent} sx={{ height: 6, borderRadius: 3 }} />
                  </Box>
                </Card>
              </Box>
            </Box>
            {renderInvoices()}
            {renderPagination(invoicesQ.data?.total || 0, invoicesPage, setInvoicesPage)}
          </Box>
        )}

        {isInternalRentalOperator && tab === 2 && (
          <Box>
            <Box sx={{ px: 3, py: 2, display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center', borderBottom: '1px solid #EEF0F6' }}>
              <Box>
                <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Rental Products catalog</Typography>
                <Typography sx={{ color: '#6B7280', fontWeight: 700, fontSize: 13 }}>Inventory parts marked as rental products.</Typography>
              </Box>
              {renderSearchControl('Search products')}
            </Box>
            <Box sx={{ p: 3 }}>
              {renderProducts()}
              {renderPagination(partsQ.data?.total || 0, productsPage, setProductsPage)}
            </Box>
          </Box>
        )}

        {isInternalRentalOperator && tab === 3 && (
          <Box>
            <Box sx={{ px: 3, py: 2, display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center', borderBottom: '1px solid #EEF0F6', flexWrap: 'wrap' }}>
              <Box>
                <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Rental History</Typography>
                <Typography sx={{ color: '#6B7280', fontWeight: 700, fontSize: 13 }}>Search by agreement, customer, facility, product, activity, user, or date.</Typography>
              </Box>
              {renderSearchControl('Search history')}
            </Box>
            {renderHistory()}
            {renderPagination(historyQ.data?.total || 0, historyPage, setHistoryPage)}
          </Box>
        )}
      </Card>

      <Menu anchorEl={actionAnchor} open={Boolean(actionAnchor)} onClose={closeActions} PaperProps={{ sx: ACTION_MENU_PAPER }}>
        {isInternalRentalOperator ? (<>
        <MenuItem sx={ACTION_MENU_ITEM} disabled={!actionAgreement || actionAgreement.status === 'completed'} onClick={() => actionAgreement && openReturnDialog(actionAgreement)}>
          <ListItemIcon sx={{ color: 'inherit', minWidth: 34 }}><CheckCircleIcon fontSize="small" /></ListItemIcon>
          Return Equipment
        </MenuItem>
        <MenuItem sx={ACTION_MENU_ITEM} disabled={!actionAgreement || Boolean(actionAgreement.converted_invoice_id)} onClick={() => actionAgreement && openConvertDialog(actionAgreement)}>
          <ListItemIcon sx={{ color: 'inherit', minWidth: 34 }}><ReceiptLongIcon fontSize="small" /></ListItemIcon>
          Convert to Invoice
        </MenuItem>
        <MenuItem sx={ACTION_MENU_ITEM} disabled={!actionAgreement || actionAgreement.status === 'completed'} onClick={() => actionAgreement && openEdit(actionAgreement)}>
          <ListItemIcon sx={{ color: 'inherit', minWidth: 34 }}><EditIcon fontSize="small" /></ListItemIcon>
          Edit
        </MenuItem>
        {actionAgreement?.extension && ['requested', 'offered'].includes(actionAgreement.extension.status) && (
          <MenuItem sx={{ ...ACTION_MENU_ITEM, bgcolor: '#F5F3FF', color: '#7C3AED' }} onClick={() => { if (actionAgreement) void openAgreementDetails(actionAgreement); closeActions() }}>
            <ListItemIcon sx={{ color: 'inherit', minWidth: 34 }}><CalendarMonthIcon fontSize="small" /></ListItemIcon>
            Review Extension Request
          </MenuItem>
        )}
        <MenuItem sx={ACTION_MENU_ITEM} onClick={() => { if (actionAgreement) void openAgreementDetails(actionAgreement); closeActions() }}>
          <ListItemIcon sx={{ color: 'inherit', minWidth: 34 }}><VisibilityIcon fontSize="small" /></ListItemIcon>
          View Details
        </MenuItem>
        <MenuItem sx={ACTION_MENU_ITEM} disabled={!actionAgreement || sendMut.isPending} onClick={() => actionAgreement && sendMut.mutate(actionAgreement.id)}>
          <ListItemIcon sx={{ color: 'inherit', minWidth: 34 }}><CreditCardIcon fontSize="small" /></ListItemIcon>
          Send Link to Customer
        </MenuItem>
        <MenuItem sx={ACTION_MENU_ITEM} onClick={() => { if (actionAgreement) setPrintAgreement(actionAgreement); closeActions() }}>
          <ListItemIcon sx={{ color: 'inherit', minWidth: 34 }}><PrintIcon fontSize="small" /></ListItemIcon>
          Print Documents
        </MenuItem>
        <MenuItem sx={ACTION_MENU_ITEM} onClick={() => actionAgreement && openCardAuthorization({ rental: actionAgreement })}>
          <ListItemIcon sx={{ color: 'inherit', minWidth: 34 }}><CreditCardIcon fontSize="small" /></ListItemIcon>
          Request Credit Card Authorization
        </MenuItem>
        <MenuItem sx={ACTION_MENU_DANGER} disabled={!actionAgreement || Boolean(actionAgreement.converted_invoice_id)} onClick={() => actionAgreement && deleteAgreementMut.mutate(actionAgreement.id)}>
          <ListItemIcon sx={{ color: 'inherit', minWidth: 34 }}><DeleteIcon fontSize="small" /></ListItemIcon>
          Delete
        </MenuItem>
        </>) : null}
      </Menu>

      <Dialog open={Boolean(deliveryLink)} onClose={() => setDeliveryLink('')} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '20px' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>{deliveryLinkKind === 'extension' ? 'Extension Offer Sent' : 'Rental Link Sent'}</DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ color: '#4B5563', mb: 2 }}>
            The customer was notified. You can also copy this secure {deliveryLinkKind === 'extension' ? 'extension amendment' : 'rental agreement'} link.
          </Typography>
          <TextField
            fullWidth
            value={deliveryLink}
            InputProps={{ readOnly: true }}
            onFocus={event => event.target.select()}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDeliveryLink('')}>Close</Button>
          <Button
            variant="contained"
            onClick={() => {
              navigator.clipboard.writeText(deliveryLink)
                .then(() => toast.success('Rental link copied'))
                .catch(() => toast.error('Copy the link from the field'))
            }}
            sx={{ fontWeight: 900 }}
          >
            Copy Link
          </Button>
        </DialogActions>
      </Dialog>

      <Menu anchorEl={invoiceActionAnchor} open={Boolean(invoiceActionAnchor)} onClose={closeInvoiceActions} PaperProps={{ sx: ACTION_MENU_PAPER }}>
        {isInternalRentalOperator ? (<>
        <MenuItem sx={ACTION_MENU_ITEM} onClick={() => { if (actionInvoice) setPrintInvoice(actionInvoice); closeInvoiceActions() }}>
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
        <MenuItem sx={ACTION_MENU_ITEM} disabled={refundableOf(actionInvoice) <= 0} onClick={() => { if (actionInvoice) openInvoiceRefund(actionInvoice); closeInvoiceActions() }}>
          <ListItemIcon sx={{ color: 'inherit', minWidth: 34 }}><CurrencyExchangeIcon fontSize="small" /></ListItemIcon>
          Record Refund
        </MenuItem>
        <MenuItem sx={ACTION_MENU_ITEM} onClick={() => actionInvoice && openCardAuthorization({ invoice: actionInvoice })}>
          <ListItemIcon sx={{ color: 'inherit', minWidth: 34 }}><CreditCardIcon fontSize="small" /></ListItemIcon>
          Request Card Authorization
        </MenuItem>
        <MenuItem sx={ACTION_MENU_ITEM} disabled={!actionInvoice?.rental_id} onClick={() => {
          if (actionInvoice?.rental_id) returnMut.mutate({ id: actionInvoice.rental_id, data: { actual_return_date: new Date().toISOString().slice(0, 10), return_condition: 'Completed sale workflow', final_meter_reading: null } })
          closeInvoiceActions()
        }}>
          <ListItemIcon sx={{ color: 'inherit', minWidth: 34 }}><LocalShippingIcon fontSize="small" /></ListItemIcon>
          Sale
        </MenuItem>
        </>) : null}
      </Menu>

      <CreditCardAuthorizationDialog
        open={Boolean(cardAuthDialog)}
        customerName={cardAuthDialog?.rental?.customer_name || cardAuthDialog?.invoice?.customer_name}
        requestType="Rental"
        items={cardAuthorizationItems}
        onClose={() => setCardAuthDialog(null)}
        onSubmit={submitCardAuthorization}
      />

      <InvoicePrintDialog
        open={Boolean(printAgreement)}
        onClose={() => setPrintAgreement(null)}
        invoice={printAgreement ? {
          invoice_number: printAgreement.rental_number,
          invoice_type: printAgreement.billing_frequency,
          reference_number: printAgreement.converted_invoice_number,
          customer_name: printAgreement.customer_name,
          customer_email: printAgreement.customer_email,
          facility_name: printAgreement.facility_name,
          subtotal: agreementLineItems(printAgreement).reduce((sum, item) => sum + item.total_amount, 0),
          tax_amount: 0,
          discount_amount: 0,
          total_amount: agreementLineItems(printAgreement).reduce((sum, item) => sum + item.total_amount, 0),
          amount_paid: Number(printAgreement.converted_invoice_amount_paid || 0),
          balance_due: Number(printAgreement.converted_invoice_balance_due || 0),
          status: String(printAgreement.status || ''),
          issue_date: printAgreement.created_at,
          due_date: printAgreement.end_date,
          payment_method: printAgreement.converted_invoice_payment_method,
          notes: printAgreement.terms_and_conditions,
        } : null}
        lineItems={agreementLineItems(printAgreement)}
        ledgerTransactions={agreementLedgerTransactions(printAgreement)}
        moduleLabel="Rental"
        primaryDocumentLabel="Rental Agreement"
        accent="#2563EB"
      />

      <InvoicePrintDialog
        open={Boolean(printInvoice)}
        onClose={() => setPrintInvoice(null)}
        invoice={printInvoice ? (() => {
          const rental = rentals.find(item => item.id === printInvoice.rental_id)
          const baseRentalTotal = rental
            ? Number(rental.rental_rate || 0) * Number(rental.quantity || 1) + Number(rental.shipping_fee || 0) + Number(rental.setup_fee || 0)
            : 0
          const additionalFees = Number(printInvoice.subtotal || 0) - baseRentalTotal
          const hasAdditionalFees = additionalFees > 0.005
          return {
            invoice_number: printInvoice.invoice_number,
            invoice_type: printInvoice.invoice_type,
            reference_number: printInvoice.rental_number,
            customer_name: printInvoice.customer_name,
            customer_email: printInvoice.customer_email,
            facility_name: printInvoice.facility_name,
            subtotal: Number(printInvoice.subtotal || 0),
            tax_amount: Number(printInvoice.tax_amount || 0),
            discount_amount: Number(printInvoice.discount_amount || 0),
            total_amount: Number(printInvoice.total_amount || 0),
            amount_paid: Number(printInvoice.amount_paid || 0),
            balance_due: Number(printInvoice.balance_due || 0),
            status: String(printInvoice.status || ''),
            issue_date: printInvoice.issue_date,
            due_date: printInvoice.due_date,
            payment_method: printInvoice.payment_method,
            notes: printInvoice.notes,
            ...(hasAdditionalFees ? {
              parts_total: baseRentalTotal,
              additional_service_fees: additionalFees,
            } : {}),
          }
        })() : null}
        lineItems={invoiceLineItems(printInvoice)}
        ledgerTransactions={invoiceLedgerTransactions(printInvoice)}
        moduleLabel="Rental"
        accent="#2563EB"
      />

      {/* Agreement Modal CREATE / EDIT */}
      <Dialog open={agreementDialog} onClose={() => setAgreementDialog(false)} maxWidth="lg" fullWidth fullScreen={fullScreenDialog} PaperProps={{ sx: { borderRadius: fullScreenDialog ? 0 : '22px' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>
          {editingAgreement ? 'Edit Rental Agreement' : 'Create Rental Agreement'}
        </DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ color: '#1E1B4B', fontWeight: 900, mb: 1.5 }}>Customer &amp; Agreement Details</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 2, pt: 1 }}>
            <FacilitySearchAutocomplete
              label="Facility"
              value={agreementForm.facility_id || ''}
              enabled={agreementDialog}
              allowClear
              helperText="Leave empty for an independent customer"
              onChange={facilityId => setAgreementForm(previous => ({
                ...previous,
                facility_id: facilityId ? Number(facilityId) : null,
                customer_user_id: null,
              }))}
              onFacilityChange={syncCustomerFromFacility}
            />
            {agreementForm.facility_id ? (
              <Autocomplete<RentalFacilityCustomer>
                options={facilityCustomers}
                value={selectedFacilityCustomer}
                loading={facilityCustomersQ.isLoading}
                getOptionLabel={option => `${option.full_name} · ${option.email}`}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                onChange={(_, customer) => setAgreementForm(previous => ({
                  ...previous,
                  customer_user_id: customer?.id || null,
                  customer_name: customer?.full_name || previous.customer_name,
                  customer_email: customer?.email || previous.customer_email,
                  customer_phone: customer?.phone ? formatUSPhoneInput(customer.phone) : previous.customer_phone,
                }))}
                renderInput={params => (
                  <TextField
                    {...params}
                    required
                    label="Facility Customer / Primary Contact"
                    helperText={facilityCustomers.length === 0 && !facilityCustomersQ.isLoading
                      ? 'No active facility admin, manager, or client is attached to this facility'
                      : 'This person receives, signs, and pays the rental agreement'}
                  />
                )}
              />
            ) : null}
            <TextField label="Customer Name *" value={agreementForm.customer_name} onChange={e => setAgreementForm(prev => ({ ...prev, customer_name: e.target.value }))} />
            <TextField label="Customer Email *" value={agreementForm.customer_email} onChange={e => setAgreementForm(prev => ({ ...prev, customer_email: e.target.value }))} />
            <TextField label="Customer Phone" value={agreementForm.customer_phone} onChange={e => setAgreementForm(prev => ({ ...prev, customer_phone: formatUSPhoneInput(e.target.value) }))} />
            <TextField label="Delivery Street Address *" value={agreementForm.delivery_street} onChange={e => setDeliveryField('delivery_street', e.target.value)} sx={{ gridColumn: '1 / -1' }} />
            <TextField label="City *" value={agreementForm.delivery_city} onChange={e => setDeliveryField('delivery_city', e.target.value)} />
            <TextField label="State *" value={agreementForm.delivery_state} onChange={e => setDeliveryField('delivery_state', e.target.value)} />
            <TextField label="ZIP Code *" value={agreementForm.delivery_zip} onChange={e => setDeliveryField('delivery_zip', e.target.value)} />
            <TextField select label="Billing Frequency" value={agreementForm.billing_frequency} onChange={e => setAgreementForm(prev => ({ ...prev, billing_frequency: e.target.value as BillingFrequency }))}>
              <MenuItem value="weekly">Weekly</MenuItem>
              <MenuItem value="biweekly">Bi-weekly</MenuItem>
              <MenuItem value="monthly">Monthly</MenuItem>
              <MenuItem value="quarterly">Quarterly</MenuItem>
            </TextField>
            <TextField label="Start Date" type="date" value={agreementForm.start_date} onChange={e => setAgreementForm(prev => ({ ...prev, start_date: e.target.value }))} InputLabelProps={{ shrink: true }} />
            <TextField label="End Date" type="date" value={agreementForm.end_date} InputProps={{ readOnly: true }} InputLabelProps={{ shrink: true }} helperText="Auto-set from frequency × committed periods" />
            <TextField label="Security Deposit" type="number" value={agreementForm.security_deposit} onChange={e => setAgreementForm(prev => ({ ...prev, security_deposit: Number(e.target.value) }))} />
          </Box>

          <Divider sx={{ my: 3 }} />
          <Typography sx={{ color: '#1E1B4B', fontWeight: 900, mb: 1.5 }}>Rental Products</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'minmax(190px, 1.5fr) 60px minmax(95px, .7fr) minmax(105px, .8fr) minmax(110px, .9fr) minmax(110px, .9fr) minmax(90px, .7fr) auto' }, gap: 2, mb: 2, alignItems: 'start' }}>
            <Box sx={{ gridColumn: { xs: '1 / -1', lg: 'auto' } }}>
              <PartSearchAutocomplete<RentalPart>
                label="Rental product"
                value={selectedRentalPart}
                onChange={handlePartSelect}
                fetchParts={fetchRentalParts}
                queryKey="rental-parts-picker"
                icon={<LocalShippingIcon fontSize="small" />}
                avatarBg="#EFF6FF"
                avatarColor="#2563EB"
                getOptionDisabled={option => partRemaining(option.id, Number(option.quantity_on_hand || 0)) <= 0}
              />
            </Box>
            <TextField
              label="Qty" type="number" value={itemDraft.quantity}
              onChange={e => setItemDraft(prev => ({ ...prev, quantity: Number(e.target.value) }))}
              inputProps={{ min: 1, max: selectedPartRemaining }}
              error={Boolean(selectedRentalPart) && Number(itemDraft.quantity || 0) > (selectedPartRemaining ?? 0)}
              helperText={selectedRentalPart ? `${selectedPartRemaining} available` : undefined}
            />
            <TextField label={`Rate / ${agreementForm.billing_frequency}`} type="number" value={itemDraft.rental_rate} onChange={e => setItemDraft(prev => ({ ...prev, rental_rate: Number(e.target.value) }))} />
            <TextField label="Condition" value={itemDraft.item_condition || ''} InputProps={{ readOnly: true }} helperText="From parts inventory" placeholder={selectedRentalPart ? '—' : 'Select a product'} />
            <TextField label="Shipping & Packing" type="number" value={itemDraft.shipping_fee} onChange={e => setItemDraft(prev => ({ ...prev, shipping_fee: Number(e.target.value) }))} />
            <TextField label="Delivery & Setup" type="number" value={itemDraft.setup_fee} onChange={e => setItemDraft(prev => ({ ...prev, setup_fee: Number(e.target.value) }))} />
            <TextField label="Labor" type="number" value={itemDraft.labor_fee} onChange={e => setItemDraft(prev => ({ ...prev, labor_fee: Number(e.target.value) }))} />
            <TextField label="Removal / Pickup" type="number" value={itemDraft.removal_fee} onChange={e => setItemDraft(prev => ({ ...prev, removal_fee: Number(e.target.value) }))} />
            <Button startIcon={<AddIcon />} variant="contained" onClick={addRentalItem} sx={{ borderRadius: '12px', textTransform: 'none', fontWeight: 900, height: 56, whiteSpace: 'nowrap', alignSelf: 'start' }}>Add</Button>
          </Box>

          <TableContainer sx={{ border: '1px solid #EEF0F6', borderRadius: '16px', overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 760 }}>
              <TableHead>
                <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                  <TableCell sx={{ fontWeight: 900 }}>Product</TableCell>
                  <TableCell sx={{ fontWeight: 900 }} align="right">Qty</TableCell>
                  <TableCell sx={{ fontWeight: 900 }} align="right">Rate</TableCell>
                  <TableCell sx={{ fontWeight: 900 }}>Condition</TableCell>
                  <TableCell sx={{ fontWeight: 900 }} align="right">Ship &amp; Pack</TableCell>
                  <TableCell sx={{ fontWeight: 900 }} align="right">Deliv &amp; Setup</TableCell>
                  <TableCell sx={{ fontWeight: 900 }} align="right">Labor</TableCell>
                  <TableCell sx={{ fontWeight: 900 }} align="right">Removal</TableCell>
                  <TableCell sx={{ fontWeight: 900 }} align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {agreementForm.items.length === 0 ? (
                  <TableRow><TableCell colSpan={9} align="center" sx={{ py: 3, color: '#6B7280', fontWeight: 700 }}>No products added yet. Pick a rental product above and click Add.</TableCell></TableRow>
                ) : agreementForm.items.map(item => (
                  <TableRow key={item.key}>
                    <TableCell>
                      <Typography sx={{ fontWeight: 800, color: '#1E1B4B' }}>{item.part_number}</Typography>
                      <Typography sx={{ fontSize: 12, color: '#6B7280' }}>{item.part_description}</Typography>
                    </TableCell>
                    <TableCell align="right">{item.quantity}</TableCell>
                    <TableCell align="right">{money(item.rental_rate)}</TableCell>
                    <TableCell>{item.item_condition}</TableCell>
                    <TableCell align="right">{money(item.shipping_fee)}</TableCell>
                    <TableCell align="right">{money(item.setup_fee)}</TableCell>
                    <TableCell align="right">{money(item.labor_fee)}</TableCell>
                    <TableCell align="right">{money(item.removal_fee)}</TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => removeRentalItem(item.key)} sx={{ color: '#DC2626' }}><DeleteIcon fontSize="small" /></IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Divider sx={{ my: 3 }} />
          <Typography sx={{ color: '#1E1B4B', fontWeight: 900, mb: 1.5 }}>Billing &amp; Discount</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(6, minmax(0, 1fr))' }, gap: 2, alignItems: 'start' }}>
            <FormControlLabel
              control={<Switch checked={agreementForm.auto_charge} onChange={e => setAgreementForm(prev => ({ ...prev, auto_charge: e.target.checked }))} />}
              label="Auto-charge saved card each period"
              sx={{ gridColumn: { xs: '1 / -1', sm: 'span 1', md: 'span 2' }, minHeight: 56, m: 0, alignItems: 'center' }}
            />
            <TextField sx={{ gridColumn: { md: 'span 2' } }} label="Committed periods" type="number" value={agreementForm.committed_periods} onChange={e => setAgreementForm(prev => ({ ...prev, committed_periods: e.target.value === '' ? '' : Number(e.target.value) }))} helperText="Sets the term & end date (e.g. 4 for a 4-period deal)" inputProps={{ min: 1 }} />
            <TextField sx={{ gridColumn: { md: 'span 2' } }} select label="Discount type" value={agreementForm.discount_type} onChange={e => setAgreementForm(prev => ({ ...prev, discount_type: e.target.value as '' | 'flat' | 'percent' }))}>
              <MenuItem value="">No discount</MenuItem>
              <MenuItem value="flat">Flat amount</MenuItem>
              <MenuItem value="percent">Percent</MenuItem>
            </TextField>
            {agreementForm.discount_type && (
              <>
                <TextField sx={{ gridColumn: { md: 'span 3' } }} label={agreementForm.discount_type === 'percent' ? 'Discount %' : 'Discount amount'} type="number" value={agreementForm.discount_value} onChange={e => setAgreementForm(prev => ({ ...prev, discount_value: Number(e.target.value) }))} />
                <TextField sx={{ gridColumn: { md: 'span 3' } }} label="Apply after N periods" type="number" value={agreementForm.discount_apply_after_periods} onChange={e => setAgreementForm(prev => ({ ...prev, discount_apply_after_periods: e.target.value === '' ? '' : Number(e.target.value) }))} helperText="e.g. after 3 paid periods" inputProps={{ min: 0 }} />
              </>
            )}
            <TextField label="Terms and Conditions" value={agreementForm.terms_and_conditions} onChange={e => setAgreementForm(prev => ({ ...prev, terms_and_conditions: e.target.value }))} multiline rows={2} sx={{ gridColumn: '1 / -1' }} />
          </Box>

          <Divider sx={{ my: 3 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 1.5, flexWrap: 'wrap' }}>
            <Box>
              <Typography sx={{ color: '#1E1B4B', fontWeight: 900 }}>Initial Invoice Calculation</Typography>
              <Typography sx={{ color: '#64748B', fontSize: 13 }}>Internal live preview. This calculation is not shown on the customer agreement.</Typography>
            </Box>
            <Chip label="Internal preview" size="small" sx={{ bgcolor: '#FEF3C7', color: '#92400E', fontWeight: 900 }} />
          </Box>
          <TableContainer sx={{ border: '1px solid #D8DEE9', borderRadius: '16px', overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 600 }}>
              <TableHead>
                <TableRow sx={{ bgcolor: '#F8FAFC' }}>
                  <TableCell sx={{ fontWeight: 900 }}>Description</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 900 }}>Cost</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 900 }}>Tax {SALES_TAX_RATE}%</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 900 }}>Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {[
                  { label: `First ${agreementForm.billing_frequency === 'biweekly' ? 'bi-weekly' : agreementForm.billing_frequency} rental period`, cost: initialAgreementPricing.rental, tax: initialAgreementPricing.rentalTax, color: '#1D4ED8' },
                  { label: 'Security Deposit', cost: initialAgreementPricing.deposit, tax: 0, color: '#334155' },
                  { label: 'Shipping & Packing', cost: initialAgreementPricing.shipping, tax: initialAgreementPricing.shippingTax, color: '#7C3AED' },
                  { label: 'Delivery & Setup', cost: initialAgreementPricing.setup, tax: initialAgreementPricing.setupTax, color: '#7C3AED' },
                  { label: 'Removal & Pickup', cost: initialAgreementPricing.removal, tax: initialAgreementPricing.removalTax, color: '#7C3AED' },
                  { label: 'Labor', cost: initialAgreementPricing.labor, tax: 0, color: '#334155' },
                ].map(row => (
                  <TableRow key={row.label}>
                    <TableCell sx={{ fontWeight: 850, color: row.color }}>{row.label}</TableCell>
                    <TableCell align="right">{money(row.cost)}</TableCell>
                    <TableCell align="right">{money(row.tax)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 900 }}>{money(row.cost + row.tax)}</TableCell>
                  </TableRow>
                ))}
                {initialAgreementPricing.discount > 0 && (
                  <TableRow>
                    <TableCell sx={{ fontWeight: 850, color: '#DC2626' }}>Initial Period Discount</TableCell>
                    <TableCell align="right" sx={{ color: '#DC2626' }}>-{money(initialAgreementPricing.discount)}</TableCell>
                    <TableCell align="right">{money(0)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 900, color: '#DC2626' }}>-{money(initialAgreementPricing.discount)}</TableCell>
                  </TableRow>
                )}
                <TableRow sx={{ bgcolor: '#FAF9FF' }}>
                  <TableCell colSpan={2} sx={{ fontWeight: 950 }}>Total Tax</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 950 }}>{money(initialAgreementPricing.tax)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 950 }}>{money(initialAgreementPricing.tax)}</TableCell>
                </TableRow>
                <TableRow sx={{ bgcolor: '#EEF2FF' }}>
                  <TableCell colSpan={3} sx={{ fontWeight: 950, fontSize: 16 }}>Initial Amount Due</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 950, color: '#059669', fontSize: 18 }}>{money(initialAgreementPricing.total)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setAgreementDialog(false)} sx={{ fontWeight: 900 }}>Cancel</Button>
          <Button startIcon={saveAgreementMut.isPending ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <AddIcon />} onClick={submitAgreement} variant="contained" sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none', background: SYSTEM_GRADIENT }}>
            {editingAgreement ? 'Update Agreement' : 'Create Agreement'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rate Card Dialog */}
      <Dialog open={Boolean(rateCardPart)} onClose={() => !rateCardMut.isPending && setRateCardPart(null)} PaperProps={{ sx: { borderRadius: '22px', maxWidth: 560, width: '100%' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>
          Rental Rates — {rateCardPart?.part_number}
          <Typography sx={{ color: '#6B7280', fontWeight: 700, fontSize: 13 }}>
            Set the price per billing period. These auto-fill on the agreement when the frequency is chosen.
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 2, pt: 1 }}>
            <TextField label="Weekly rate" type="number" value={rateCardForm.weekly_rate} onChange={e => setRateCardForm(prev => ({ ...prev, weekly_rate: e.target.value }))} />
            <TextField label="Bi-weekly rate" type="number" value={rateCardForm.biweekly_rate} onChange={e => setRateCardForm(prev => ({ ...prev, biweekly_rate: e.target.value }))} />
            <TextField label="Monthly rate" type="number" value={rateCardForm.monthly_rate} onChange={e => setRateCardForm(prev => ({ ...prev, monthly_rate: e.target.value }))} />
            <TextField label="Quarterly rate" type="number" value={rateCardForm.quarterly_rate} onChange={e => setRateCardForm(prev => ({ ...prev, quarterly_rate: e.target.value }))} />
            <TextField label="Default deposit" type="number" value={rateCardForm.default_deposit} onChange={e => setRateCardForm(prev => ({ ...prev, default_deposit: e.target.value }))} sx={{ gridColumn: { xs: '1', sm: '1 / -1' } }} />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setRateCardPart(null)} sx={{ fontWeight: 900 }}>Cancel</Button>
          <Button variant="contained" onClick={() => rateCardMut.mutate()} disabled={rateCardMut.isPending} startIcon={rateCardMut.isPending ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : undefined} sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none', background: SYSTEM_GRADIENT }}>
            Save Rates
          </Button>
        </DialogActions>
      </Dialog>

      {/* Return Dialog */}
      <Dialog open={Boolean(returnDialog)} onClose={() => setReturnDialog(null)} PaperProps={{ sx: { borderRadius: '22px', maxWidth: 500, width: '100%' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E3A8A' }}>Handover / Return Equipment</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gap: 2, pt: 1 }}>
            <TextField label="Actual Return Date" type="date" value={returnForm.actual_return_date} onChange={e => setReturnForm(prev => ({ ...prev, actual_return_date: e.target.value }))} InputLabelProps={{ shrink: true }} />
            <TextField label="Return Condition *" value={returnForm.return_condition} onChange={e => setReturnForm(prev => ({ ...prev, return_condition: e.target.value }))} placeholder="E.g. Returned clean and functioning" />
            <TextField label="Final Meter Reading" type="number" value={returnForm.final_meter_reading || 0} onChange={e => setReturnForm(prev => ({ ...prev, final_meter_reading: Number(e.target.value) }))} />
            {Number(returnDialog?.security_deposit || 0) > 0 && (
              <Box sx={{ p: 1.5, borderRadius: '12px', bgcolor: '#F0F9FF', border: '1px solid #BFDBFE' }}>
                <Typography sx={{ fontWeight: 900, color: '#1E3A8A', mb: 1 }}>Security Deposit — {money(returnDialog?.security_deposit)}</Typography>
                <TextField
                  select fullWidth size="small" label="Deposit settlement"
                  value={returnForm.deposit_action || ''}
                  onChange={e => setReturnForm(prev => ({ ...prev, deposit_action: (e.target.value || null) as 'refund' | 'deduct' | 'waive' | null }))}
                >
                  <MenuItem value="">Decide later</MenuItem>
                  <MenuItem value="refund">Refund the full deposit</MenuItem>
                  <MenuItem value="deduct">Deduct damages / fees</MenuItem>
                  <MenuItem value="waive">Waive (keep full deposit)</MenuItem>
                </TextField>
                {returnForm.deposit_action === 'deduct' && (
                  <TextField
                    fullWidth size="small" type="number" label="Amount to deduct" sx={{ mt: 1.5 }}
                    value={returnForm.deposit_deduction || 0}
                    onChange={e => setReturnForm(prev => ({ ...prev, deposit_deduction: Number(e.target.value) }))}
                    helperText={`Refunds ${money(Math.max(0, Number(returnDialog?.security_deposit || 0) - Number(returnForm.deposit_deduction || 0)))} to the customer`}
                  />
                )}
                {(() => {
                  const refundAmt = returnForm.deposit_action === 'refund'
                    ? Number(returnDialog?.security_deposit || 0)
                    : returnForm.deposit_action === 'deduct'
                      ? Math.max(0, Number(returnDialog?.security_deposit || 0) - Number(returnForm.deposit_deduction || 0))
                      : 0
                  if (refundAmt <= 0) return null
                  return (
                    <Typography sx={{ mt: 1.25, fontSize: 12.5, fontWeight: 700, color: '#1E3A8A' }}>
                      {returnDialog?.saved_card?.last4
                        ? `${money(refundAmt)} is refunded to the card ending ••••${returnDialog.saved_card.last4} if the deposit was paid by card — otherwise recorded for a manual refund.`
                        : `${money(refundAmt)} is refunded to the card that paid the deposit, or recorded for a manual refund if it was paid offline.`}
                    </Typography>
                  )
                })()}
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setReturnDialog(null)} sx={{ fontWeight: 900 }}>Cancel</Button>
          <Button variant="contained" color="success" onClick={() => returnDialog && returnMut.mutate({ id: returnDialog.id, data: returnForm })} sx={{ borderRadius: '12px', fontWeight: 900 }}>
            Submit Return
          </Button>
        </DialogActions>
      </Dialog>

      {/* Convert to Invoice Acknowledgement Modal */}
      <Dialog open={Boolean(convertAgreement)} onClose={() => setConvertAgreement(null)} maxWidth="lg" fullWidth PaperProps={{ sx: { borderRadius: '22px', overflow: 'hidden' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E3A8A', textAlign: 'center' }}>
          Rental Agreement Quotation
          <Typography sx={{ color: '#6B7280', fontSize: 13, fontWeight: 700 }}>
            Acknowledgement and Periodic Billing Form
          </Typography>
        </DialogTitle>
        <DialogContent dividers sx={{ bgcolor: SYSTEM_PANEL_BG }}>
          {convertAgreement && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 340px' }, gap: 2 }}>
              <Box sx={{ display: 'grid', gap: 2 }}>
                <Card sx={{ borderRadius: '14px', overflow: 'hidden', border: `1px solid ${SYSTEM_PANEL_BORDER}` }}>
                  <Box sx={{ background: SYSTEM_GRADIENT, color: '#fff', px: 2, py: 1.3, fontWeight: 900 }}>Agreement Details</Box>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 900 }}>Agreement #</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Customer Name</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Email</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Phone</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Billing Address</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      <TableRow>
                        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 900 }}>{convertAgreement.rental_number}</TableCell>
                        <TableCell>{convertAgreement.customer_name}</TableCell>
                        <TableCell>{convertAgreement.customer_email || '-'}</TableCell>
                        <TableCell>{formatUSPhone(convertAgreement.customer_phone) || '-'}</TableCell>
                        <TableCell>{convertAgreement.customer_address || '-'}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </Card>

                <Card sx={{ borderRadius: '14px', overflow: 'hidden', border: `1px solid ${SYSTEM_PANEL_BORDER}` }}>
                  <Box sx={{ background: SYSTEM_GRADIENT, color: '#fff', px: 2, py: 1.3, fontWeight: 900 }}>Rental Product Details</Box>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 900 }}>Product / Part</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Billing Cycle</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Rental Rate</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Quantity</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Ship &amp; Pack</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Deliv &amp; Setup</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Labor</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Condition</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Periods</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 900 }}>Rental Base Total</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {convertItems.map((item, index) => (
                        <TableRow key={item.id || index}>
                          <TableCell sx={{ fontWeight: 800 }}>{item.part_number ? `${item.part_number} - ${item.part_description || ''}` : '-'}</TableCell>
                          <TableCell sx={{ textTransform: 'capitalize' }}>{convertAgreement.billing_frequency}</TableCell>
                          <TableCell>{money(item.rental_rate)}</TableCell>
                          <TableCell>{item.quantity || 1}</TableCell>
                          <TableCell>{money(item.shipping_fee)}</TableCell>
                          <TableCell>{money(item.setup_fee)}</TableCell>
                          <TableCell>{money(item.labor_fee)}</TableCell>
                          <TableCell>{item.item_condition || '-'}</TableCell>
                          <TableCell>{billingPeriods}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 900, color: '#047857' }}>{money(billingPeriods * Number(item.rental_rate || 0) * Number(item.quantity || 1))}</TableCell>
                        </TableRow>
                      ))}
                      {[
                        ['Base Rental Total', calculatedBaseRental],
                        ['Security Deposit (held separately)', Number(convertAgreement.security_deposit || 0)],
                        ['Working Hours Fee', Number(invoiceDetails.worked_hours || 0)],
                        ['Shipping & Packing', convertShippingTotal],
                        ['Delivery & Setup', convertSetupTotal],
                        ['Removal & Pickup', itemsRemovalTotal],
                        ['Labor', itemsLaborTotal],
                        ['Service Fee', Number(invoiceDetails.service_fee || 0)],
                        ['Application Fee', Number(invoiceDetails.application_fee || 0)],
                        [`Tax (${SALES_TAX_RATE}%)`, convertTaxAmount],
                        ['Discount', -convertDiscountAmount],
                      ].map(([label, value]) => (
                        <TableRow key={String(label)}>
                          <TableCell colSpan={9} align="right" sx={{ fontWeight: 900, color: '#4B5563' }}>{label}</TableCell>
                          <TableCell align="right">{money(value as number)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow sx={{ bgcolor: '#EFF6FF' }}>
                        <TableCell colSpan={9} align="right" sx={{ fontWeight: 900, fontSize: 15 }}>Grand Total Due</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 900, fontSize: 16, color: '#1E3A8A' }}>{money(convertGrandTotal)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </Card>
              </Box>

              <Card sx={{ borderRadius: '14px', border: `1px solid ${SYSTEM_PANEL_BORDER}`, p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 900, color: '#1E3A8A' }}>Configure Invoice</Typography>
                <TextField select label="Select Action" size="small" value={invoiceDetails.action || ''} onChange={e => setInvoiceDetails(p => ({ ...p, action: e.target.value }))}>
                  <MenuItem value="">Select Action</MenuItem>
                  <MenuItem value="approve">Approve Quotation</MenuItem>
                  <MenuItem value="reject">Reject Quotation</MenuItem>
                  <MenuItem value="mark_pending">Mark as Pending</MenuItem>
                  <MenuItem value="convert_to_invoice">Convert to Invoice</MenuItem>
                </TextField>
                <TextField select label="Payment Method" size="small" value={invoiceDetails.payment_method} onChange={e => setInvoiceDetails(p => ({ ...p, payment_method: e.target.value }))}>
                  <MenuItem value="credit_card">Credit Card</MenuItem>
                  <MenuItem value="cheque">Cheque</MenuItem>
                  <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
                </TextField>
                <TextField label="Labour Hours" type="number" size="small" value={invoiceDetails.labour_hours} onChange={e => setInvoiceDetails(p => ({ ...p, labour_hours: Number(e.target.value) }))} />
                <TextField label="Working Hours Fee ($)" type="number" size="small" value={invoiceDetails.worked_hours} onChange={e => setInvoiceDetails(p => ({ ...p, worked_hours: Number(e.target.value) }))} />
                <TextField label="Service Fee" type="number" size="small" value={invoiceDetails.service_fee} onChange={e => setInvoiceDetails(p => ({ ...p, service_fee: Number(e.target.value) }))} />
                <TextField label="Setup Fee" type="number" size="small" value={invoiceDetails.setup_fee} onChange={e => setInvoiceDetails(p => ({ ...p, setup_fee: Number(e.target.value) }))} />
                <TextField label="Shipping / Delivery Fee" type="number" size="small" value={invoiceDetails.shipping_fee} onChange={e => setInvoiceDetails(p => ({ ...p, shipping_fee: Number(e.target.value) }))} />
                <TextField label="Application / Training Fee" type="number" size="small" value={invoiceDetails.application_fee} onChange={e => setInvoiceDetails(p => ({ ...p, application_fee: Number(e.target.value) }))} />
                <TextField label="Tax Rate" size="small" value={`${SALES_TAX_RATE}% (auto, taxes rent + shipping + setup)`} InputProps={{ readOnly: true }} disabled />
                <TextField select label="Discount Type" size="small" value={invoiceDetails.discount_type || 'fixed'} onChange={e => setInvoiceDetails(p => ({ ...p, discount_type: e.target.value as 'fixed' | 'percent' }))}>
                  <MenuItem value="fixed">Fixed ($)</MenuItem>
                  <MenuItem value="percent">Percent (%)</MenuItem>
                </TextField>
                <TextField label="Discount Amount" type="number" size="small" value={invoiceDetails.discount_amount} onChange={e => setInvoiceDetails(p => ({ ...p, discount_amount: Number(e.target.value) }))} />
                <TextField label="Invoice Due Date" type="date" size="small" value={invoiceDetails.due_date} onChange={e => setInvoiceDetails(p => ({ ...p, due_date: e.target.value }))} InputLabelProps={{ shrink: true }} />
                <TextField label="Billing Notes" size="small" multiline rows={2} value={invoiceDetails.notes} onChange={e => setInvoiceDetails(p => ({ ...p, notes: e.target.value }))} />
              </Card>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setConvertAgreement(null)} sx={{ fontWeight: 900 }}>Cancel</Button>
          <Button variant="contained" startIcon={<ReceiptLongIcon />} onClick={applyRentalConvertAction} sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none', background: SYSTEM_GRADIENT }}>
            Apply Action
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(viewInvoice)} onClose={() => setViewInvoice(null)} PaperProps={{ sx: { borderRadius: '22px', maxWidth: 520, width: '100%' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E3A8A' }}>Rental Invoice Details</DialogTitle>
        <DialogContent dividers>
          {viewInvoice && (
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <Typography><strong>Invoice:</strong> {viewInvoice.invoice_number}</Typography>
              <Typography><strong>Agreement:</strong> {viewInvoice.rental_number || '-'}</Typography>
              <Typography><strong>Customer:</strong> {viewInvoice.customer_name}</Typography>
              <Typography><strong>Facility:</strong> {viewInvoice.facility_name || '-'}</Typography>
              <Typography><strong>Total:</strong> {money(viewInvoice.total_amount)}</Typography>
              <Typography><strong>Paid:</strong> {money(viewInvoice.amount_paid)}</Typography>
              <Typography><strong>Balance:</strong> {money(viewInvoice.balance_due)}</Typography>
              <Typography><strong>Payment:</strong> {paymentMethodLabel(viewInvoice.payment_method)}</Typography>
              <Typography sx={{ gridColumn: '1 / -1' }}><strong>Notes:</strong> {viewInvoice.notes || '-'}</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setViewInvoice(null)} variant="contained" sx={{ borderRadius: '12px', fontWeight: 900, background: SYSTEM_GRADIENT }}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Record Refund Dialog */}
      <Dialog open={Boolean(refundInvoice)} onClose={() => setRefundInvoice(null)} PaperProps={{ sx: { borderRadius: '22px', maxWidth: 460, width: '100%' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E3A8A' }}>Record Refund</DialogTitle>
        <DialogContent dividers>
          {refundInvoice && (() => {
            const refundable = refundableOf(refundInvoice)
            const cardPaid = (refundInvoice.transactions || []).some(t => t.transaction_type === 'payment' && Boolean(t.reference_number))
            return (
              <Box sx={{ display: 'grid', gap: 2, pt: 1 }}>
                <Typography sx={{ fontWeight: 800 }}>Invoice #: {refundInvoice.invoice_number}</Typography>
                <Typography sx={{ color: '#4B5563', fontWeight: 700 }}>Refundable (paid − already refunded): {money(refundable)}</Typography>
                <TextField
                  label="Refund amount" type="number" size="small"
                  value={refundForm.amount}
                  onChange={e => setRefundForm(p => ({ ...p, amount: Number(e.target.value) }))}
                  inputProps={{ min: 0, max: refundable, step: '0.01' }}
                />
                <TextField select label="Refund method" size="small"
                  value={refundForm.payment_method}
                  onChange={e => setRefundForm(p => ({ ...p, payment_method: e.target.value }))}
                >
                  <MenuItem value="credit_card">Credit Card</MenuItem>
                  <MenuItem value="cheque">Cheque</MenuItem>
                  <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
                  <MenuItem value="cash">Cash</MenuItem>
                </TextField>
                <TextField label="Notes" size="small" multiline rows={2}
                  value={refundForm.notes}
                  onChange={e => setRefundForm(p => ({ ...p, notes: e.target.value }))}
                />
                <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: cardPaid ? '#047857' : '#92400E' }}>
                  {cardPaid
                    ? `${money(refundForm.amount)} will be refunded to the customer's card through Square.`
                    : `This invoice was paid offline — ${money(refundForm.amount)} is recorded as a manual refund (return the money via the original method).`}
                </Typography>
              </Box>
            )
          })()}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setRefundInvoice(null)} sx={{ fontWeight: 900 }}>Cancel</Button>
          <Button
            variant="contained" color="error"
            disabled={!refundInvoice || refundMut.isPending || refundForm.amount <= 0 || refundForm.amount > refundableOf(refundInvoice)}
            onClick={() => refundInvoice && refundMut.mutate({ id: refundInvoice.id, data: { amount: refundForm.amount, payment_method: refundForm.payment_method || undefined, notes: refundForm.notes || undefined } })}
            sx={{ borderRadius: '12px', fontWeight: 900 }}
          >
            {refundMut.isPending ? 'Processing…' : 'Record Refund'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Rental Invoice Dialog */}
      <Dialog open={Boolean(invoiceEdit)} onClose={() => setInvoiceEdit(null)} PaperProps={{ sx: { borderRadius: '22px', maxWidth: 450, width: '100%' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E3A8A' }}>Update Rental Invoice</DialogTitle>
        <DialogContent dividers>
          {invoiceEdit && (
            <Box sx={{ display: 'grid', gap: 2, pt: 1 }}>
              <Typography sx={{ fontWeight: 800 }}>Invoice #: {invoiceEdit.invoice_number}</Typography>
              <Typography sx={{ color: '#4B5563', fontWeight: 700 }}>Total Due: {money(invoiceEdit.total_amount)}</Typography>
              <TextField label="Amount Paid" type="number" value={invoiceForm.amount_paid} onChange={e => setInvoiceForm(p => ({ ...p, amount_paid: Number(e.target.value) }))} />
              <TextField select label="Status" value={invoiceForm.status} onChange={e => setInvoiceForm(p => ({ ...p, status: e.target.value }))}>
                <MenuItem value="pending">Pending</MenuItem>
                <MenuItem value="partially_paid">Partially Paid</MenuItem>
                <MenuItem value="paid">Paid</MenuItem>
                <MenuItem value="overdue">Overdue</MenuItem>
                <MenuItem value="cancelled">Cancelled</MenuItem>
              </TextField>
              <TextField select label="Payment Method" value={invoiceForm.payment_method} onChange={e => setInvoiceForm(p => ({ ...p, payment_method: e.target.value }))}>
                <MenuItem value="credit_card">Credit Card</MenuItem>
                <MenuItem value="cheque">Cheque</MenuItem>
                <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
              </TextField>
              <TextField label="Due Date" type="date" value={invoiceForm.due_date} onChange={e => setInvoiceForm(p => ({ ...p, due_date: e.target.value }))} InputLabelProps={{ shrink: true }} />
              <TextField label="Invoice Notes" value={invoiceForm.notes} onChange={e => setInvoiceForm(p => ({ ...p, notes: e.target.value }))} multiline rows={2} />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setInvoiceEdit(null)} sx={{ fontWeight: 900 }}>Cancel</Button>
          <Button variant="contained" onClick={() => invoiceEdit && invoiceMut.mutate({ id: invoiceEdit.id, data: invoiceForm })} sx={{ borderRadius: '12px', fontWeight: 900, background: SYSTEM_GRADIENT }}>
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(partInfo)} onClose={() => setPartInfo(null)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '22px' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E3A8A' }}>
          Rental Product Details
          <Typography sx={{ color: '#6B7280', fontSize: 13, fontWeight: 700 }}>
            View-only inventory information
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          {partInfo && (
            <Box sx={{ display: 'grid', gap: 2 }}>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <Avatar src={resolveUploadUrl(partInfo.imageUrl)} variant="rounded" sx={{ width: 76, height: 76, bgcolor: '#EFF6FF', color: '#2563EB', borderRadius: '18px' }}>
                  <LocalShippingIcon />
                </Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <ClippedTooltipText value={partInfo.partNumber} monospace color="#1D4ED8" fontWeight={900} />
                  <ClippedTooltipText value={partInfo.description} field fontWeight={800} />
                </Box>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5 }}>
                {[
                  ['Make / Model', [partInfo.make, partInfo.model].filter(Boolean).join(' / ') || '-'],
                  ['Serial #', partInfo.serialNumber || '-'],
                  ['Condition', partInfo.condition || '-'],
                  ['Qty Available', partInfo.quantity ?? '-'],
                  ['Standard Rate', partInfo.unitPrice === null ? '-' : money(partInfo.unitPrice)],
                  ['Facility', partInfo.facilityName || 'Global / Independent'],
                  ['Status', partInfo.status || '-'],
                ].map(([label, value]) => (
                  <Card key={label} sx={{ p: 1.5, borderRadius: '14px', border: '1px solid #DBEAFE', bgcolor: '#F8FAFC' }}>
                    <Typography sx={{ color: '#6B7280', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>{label}</Typography>
                    <Typography sx={{ color: '#1E3A8A', fontWeight: 850 }}>{value}</Typography>
                  </Card>
                ))}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setPartInfo(null)} variant="contained" sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none', background: SYSTEM_GRADIENT }}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Details View Dialog */}
      <Dialog open={Boolean(viewAgreement)} onClose={() => setViewAgreement(null)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '22px' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E3A8A', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Rental Agreement Details
          {viewAgreement && (
            <Chip label={viewAgreement.status} sx={{ bgcolor: statusChip(viewAgreement.status).bg, color: statusChip(viewAgreement.status).color, fontWeight: 950, textTransform: 'uppercase' }} />
          )}
        </DialogTitle>
        <DialogContent dividers>
          {viewAgreement && (
            <Box sx={{ display: 'grid', gap: 3 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2 }}>
                <Box>
                  <Typography variant="subtitle2" sx={{ color: '#6B7280', fontWeight: 800 }}>AGREEMENT NO.</Typography>
                  <Typography sx={{ fontWeight: 900, color: '#1E3A8A', fontFamily: 'monospace' }}>{viewAgreement.rental_number}</Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" sx={{ color: '#6B7280', fontWeight: 800 }}>RENTAL PRODUCTS</Typography>
                  <Typography sx={{ fontWeight: 900 }}>{(viewAgreement.items?.length || 0)} item{(viewAgreement.items?.length || 0) === 1 ? '' : 's'}</Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" sx={{ color: '#6B7280', fontWeight: 800 }}>CUSTOMER NAME</Typography>
                  <Typography sx={{ fontWeight: 800 }}>{viewAgreement.customer_name}</Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" sx={{ color: '#6B7280', fontWeight: 800 }}>FACILITY</Typography>
                  <Typography sx={{ fontWeight: 800 }}>{viewAgreement.facility_name || 'Independent customer'}</Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" sx={{ color: '#6B7280', fontWeight: 800 }}>PRIMARY FACILITY CONTACT</Typography>
                  <Typography sx={{ fontWeight: 800 }}>{viewAgreement.customer_user_name || 'External customer'}</Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" sx={{ color: '#6B7280', fontWeight: 800 }}>CUSTOMER CONTACT</Typography>
                  <Typography sx={{ fontWeight: 800 }}>{viewAgreement.customer_email} / {formatUSPhone(viewAgreement.customer_phone) || '-'}</Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" sx={{ color: '#6B7280', fontWeight: 800 }}>RENTAL PERIOD</Typography>
                  <Typography sx={{ fontWeight: 800 }}>{formatDate(viewAgreement.start_date)} to {formatDate(viewAgreement.end_date)}</Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" sx={{ color: '#6B7280', fontWeight: 800 }}>ACTUAL RETURN DATE</Typography>
                  <Typography sx={{ fontWeight: 800, color: '#B45309' }}>{formatDate(viewAgreement.actual_return_date)}</Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" sx={{ color: '#6B7280', fontWeight: 800 }}>BILLING FREQUENCY</Typography>
                  <Typography sx={{ fontWeight: 900, color: '#047857', textTransform: 'capitalize' }}>{viewAgreement.billing_frequency}{viewAgreement.auto_charge ? ' · auto-charge' : ''}</Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" sx={{ color: '#6B7280', fontWeight: 800 }}>NEXT PAYMENT</Typography>
                  <Typography sx={{ fontWeight: 900, color: '#1E3A8A' }}>
                    {viewAgreement.next_payment
                      ? `${money(viewAgreement.next_payment.amount)} · ${formatDate(viewAgreement.next_payment.billing_date)} · Period ${viewAgreement.next_payment.period}`
                      : 'Schedule complete'}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" sx={{ color: '#6B7280', fontWeight: 800 }}>DISCOUNT</Typography>
                  <Typography sx={{ fontWeight: 900 }}>
                    {viewAgreement.discount_type
                      ? `${viewAgreement.discount_type === 'percent' ? `${viewAgreement.discount_value}%` : money(viewAgreement.discount_value)}${viewAgreement.discount_apply_after_periods ? ` after ${viewAgreement.discount_apply_after_periods} periods` : ''}`
                      : 'None'}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" sx={{ color: '#6B7280', fontWeight: 800 }}>SECURITY DEPOSIT</Typography>
                  <Typography sx={{ fontWeight: 900 }}>{money(viewAgreement.security_deposit)}</Typography>
                </Box>
                <Box sx={{ gridColumn: '1 / -1' }}>
                  <Typography variant="subtitle2" sx={{ color: '#6B7280', fontWeight: 800 }}>CUSTOMER ADDRESS</Typography>
                  <Typography sx={{ fontWeight: 800 }}>{viewAgreement.customer_address}</Typography>
                </Box>
              </Box>

              <Card variant="outlined" sx={{ p: 2, borderRadius: '14px', borderColor: viewAgreement.acceptance ? '#86EFAC' : '#FDE68A', bgcolor: viewAgreement.acceptance ? '#F0FDF4' : '#FFFBEB' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                  <Box>
                    <Typography sx={{ fontWeight: 900, color: '#1E3A8A' }}>Customer Acceptance</Typography>
                    {viewAgreement.acceptance ? (
                      <>
                        <Typography sx={{ fontWeight: 800, color: '#166534' }}>Signed by {viewAgreement.acceptance.accepted_by_name} on {formatDate(viewAgreement.acceptance.accepted_at)}</Typography>
                        <Typography sx={{ fontFamily: '"Segoe Script", "Brush Script MT", cursive', fontSize: 24, mt: 0.5 }}>{viewAgreement.acceptance.signature_name}</Typography>
                        <Typography sx={{ fontSize: 12, color: '#64748B' }}>Agreement revision {viewAgreement.acceptance.agreement_revision}</Typography>
                      </>
                    ) : <Typography sx={{ color: '#92400E', fontWeight: 800 }}>Awaiting customer signature</Typography>}
                  </Box>
                  <Box sx={{ textAlign: { xs: 'left', md: 'right' } }}>
                    <Typography sx={{ fontWeight: 900, color: '#1E3A8A' }}>Saved Payment Method</Typography>
                    <Typography sx={{ fontWeight: 800 }}>
                      {viewAgreement.saved_card
                        ? `${viewAgreement.saved_card.brand || 'Card'} ending in ${viewAgreement.saved_card.last4 || '••••'}`
                        : 'No card saved'}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: viewAgreement.auto_charge_authorized_at ? '#047857' : '#64748B', fontWeight: 700 }}>
                      {viewAgreement.auto_charge_authorized_at
                        ? `Auto-charge authorized by ${viewAgreement.auto_charge_authorized_by || 'customer'}`
                        : 'Recurring auto-charge not authorized'}
                    </Typography>
                  </Box>
                </Box>
              </Card>

              {viewAgreement.extension && (
                <Card variant="outlined" sx={{ p: 2, borderRadius: '14px', borderColor: '#C4B5FD', bgcolor: '#FAF9FF' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 1.5 }}>
                    <Box>
                      <Typography sx={{ fontWeight: 950, color: '#1E3A8A' }}>Extension Amendment #{viewAgreement.extension.sequence}</Typography>
                      <Typography sx={{ color: '#64748B', fontSize: 13 }}>
                        Requested by {viewAgreement.extension.requested_by_name} on {formatDate(viewAgreement.extension.requested_at)}
                      </Typography>
                    </Box>
                    <Chip label={viewAgreement.extension.status} sx={{ fontWeight: 900, textTransform: 'uppercase', bgcolor: statusChip(viewAgreement.extension.status).bg, color: statusChip(viewAgreement.extension.status).color }} />
                  </Box>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5, mb: 1.5 }}>
                    <TextField label="Current end date" value={viewAgreement.extension.original_end_date || ''} InputProps={{ readOnly: true }} InputLabelProps={{ shrink: true }} />
                    <TextField type="date" label="Offered end date" value={extensionOfferEnd} onChange={event => setExtensionOfferEnd(event.target.value)} InputLabelProps={{ shrink: true }} disabled={!['requested', 'offered'].includes(viewAgreement.extension.status)} />
                    <TextField type="number" label="Total billing periods" value={extensionOfferPeriods} onChange={event => setExtensionOfferPeriods(event.target.value)} inputProps={{ min: 1, max: 1200 }} disabled={!['requested', 'offered'].includes(viewAgreement.extension.status)} />
                    <TextField label="Customer request" value={viewAgreement.extension.request_reason || 'No reason supplied'} InputProps={{ readOnly: true }} />
                  </Box>
                  {['requested', 'offered'].includes(viewAgreement.extension.status) ? (
                    <>
                      <TextField fullWidth multiline minRows={2} label="Extension terms shown to customer" value={extensionOfferTerms} onChange={event => setExtensionOfferTerms(event.target.value)} sx={{ mb: 1.5 }} />
                      <TextField fullWidth multiline minRows={2} label="Internal decision notes" value={extensionDecisionNotes} onChange={event => setExtensionDecisionNotes(event.target.value)} sx={{ mb: 1.5 }} />
                      <Alert severity="info" sx={{ mb: 1.5, borderRadius: '12px' }}>
                        Sending the offer does not alter billing. The end date and future schedule update only after the customer signs.
                      </Alert>
                      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        <Button variant="contained" disabled={!extensionOfferEnd || extensionOfferMut.isPending} onClick={() => extensionOfferMut.mutate()} sx={{ fontWeight: 900, textTransform: 'none' }}>
                          {viewAgreement.extension.status === 'offered' ? 'Resend Extension' : 'Send Signable Extension'}
                        </Button>
                        {viewAgreement.extension.status === 'offered' ? (
                          <Button color="error" variant="outlined" disabled={extensionCancelMut.isPending} onClick={() => extensionCancelMut.mutate()} sx={{ fontWeight: 900, textTransform: 'none' }}>
                            Cancel Offer
                          </Button>
                        ) : (
                          <Button color="error" variant="outlined" disabled={extensionRejectMut.isPending} onClick={() => extensionRejectMut.mutate()} sx={{ fontWeight: 900, textTransform: 'none' }}>
                            Reject Request
                          </Button>
                        )}
                      </Box>
                    </>
                  ) : viewAgreement.extension.status === 'accepted' ? (
                    <Box sx={{ p: 1.5, borderRadius: '12px', bgcolor: '#ECFDF5', border: '1px solid #A7F3D0' }}>
                      <Typography sx={{ fontWeight: 900, color: '#047857' }}>
                        Signed by {viewAgreement.extension.accepted_by_name} · extended through {formatDate(viewAgreement.extension.offered_end_date)}
                      </Typography>
                      <Typography sx={{ fontFamily: '"Segoe Script", "Brush Script MT", cursive', fontSize: 24 }}>{viewAgreement.extension.signature_name}</Typography>
                    </Box>
                  ) : (
                    <Typography sx={{ color: '#64748B', fontWeight: 700 }}>{viewAgreement.extension.decision_notes || 'This extension request is closed.'}</Typography>
                  )}
                </Card>
              )}

              {viewAgreement.status === 'active' && !['requested', 'offered'].includes(viewAgreement.extension?.status || '') && (
                <Card variant="outlined" sx={{ p: 2, borderRadius: '14px', borderColor: '#C4B5FD', bgcolor: '#FAF9FF' }}>
                  <Typography sx={{ fontWeight: 950, color: '#1E3A8A', mb: 0.25 }}>Start a new extension</Typography>
                  <Typography sx={{ color: '#64748B', fontSize: 13, mb: 1.5 }}>
                    Propose new terms and email the customer a signing link. Billing changes only after they sign.
                  </Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5, mb: 1.5 }}>
                    <TextField label="Current end date" value={viewAgreement.end_date || ''} InputProps={{ readOnly: true }} InputLabelProps={{ shrink: true }} />
                    <TextField type="date" label="New end date" value={startExtEnd} onChange={event => setStartExtEnd(event.target.value)} InputLabelProps={{ shrink: true }} />
                    <TextField type="number" label="Total billing periods (optional)" value={startExtPeriods} onChange={event => setStartExtPeriods(event.target.value)} inputProps={{ min: 1, max: 1200 }} />
                  </Box>
                  <TextField fullWidth multiline minRows={2} label="Extension terms shown to customer" value={startExtTerms} onChange={event => setStartExtTerms(event.target.value)} sx={{ mb: 1.5 }} />
                  <TextField fullWidth multiline minRows={2} label="Internal decision notes" value={startExtNotes} onChange={event => setStartExtNotes(event.target.value)} sx={{ mb: 1.5 }} />
                  <Alert severity="info" sx={{ mb: 1.5, borderRadius: '12px' }}>
                    Leave periods blank to bill every period up to the new end date. The current agreement is unchanged until the customer signs.
                  </Alert>
                  <Button variant="contained" disabled={!startExtEnd || extensionCreateMut.isPending} onClick={() => extensionCreateMut.mutate()} sx={{ fontWeight: 900, textTransform: 'none' }}>
                    Start Extension &amp; Send Link
                  </Button>
                </Card>
              )}

              <Box>
                <Typography sx={{ fontWeight: 900, color: '#1E3A8A', mb: 1 }}>Items</Typography>
                <TableContainer sx={{ border: '1px solid #EEF0F6', borderRadius: '12px', overflowX: 'auto' }}>
                  <Table size="small" sx={{ minWidth: 720 }}>
                    <TableHead>
                      <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                        <TableCell sx={{ fontWeight: 900 }}>Product</TableCell>
                        <TableCell sx={{ fontWeight: 900 }} align="right">Qty</TableCell>
                        <TableCell sx={{ fontWeight: 900 }} align="right">Rate</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Condition</TableCell>
                        <TableCell sx={{ fontWeight: 900 }} align="right">Shipping</TableCell>
                        <TableCell sx={{ fontWeight: 900 }} align="right">Setup</TableCell>
                        <TableCell sx={{ fontWeight: 900 }} align="right">Removal</TableCell>
                        <TableCell sx={{ fontWeight: 900 }} align="right">Labor</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(viewAgreement.items || []).map(item => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Typography sx={{ fontWeight: 800, color: '#1E1B4B' }}>{item.part_number || '-'}</Typography>
                            <Typography sx={{ fontSize: 12, color: '#6B7280' }}>{item.part_description}</Typography>
                          </TableCell>
                          <TableCell align="right">{item.quantity}</TableCell>
                          <TableCell align="right">{money(item.rental_rate)}</TableCell>
                          <TableCell>{item.item_condition || '-'}</TableCell>
                          <TableCell align="right">{money(item.shipping_fee)}</TableCell>
                          <TableCell align="right">{money(item.setup_fee)}</TableCell>
                          <TableCell align="right">{money(item.removal_fee)}</TableCell>
                          <TableCell align="right">{money(item.labor_fee)}</TableCell>
                          <TableCell>
                            <Chip size="small" label={item.item_status === 'returned' ? 'Returned' : 'Out'} sx={{ fontWeight: 800, bgcolor: item.item_status === 'returned' ? '#DCFCE7' : '#DBEAFE', color: item.item_status === 'returned' ? '#15803D' : '#1D4ED8' }} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>

              <Divider />
              
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                <Card sx={{ p: 2, border: '1px solid #E5E7EB', borderRadius: '12px', bgcolor: '#F9FAFB' }}>
                  <Typography sx={{ fontWeight: 900, color: '#1E3A8A', mb: 1 }}>Handover Information</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 800, color: '#4B5563' }}>Condition: {viewAgreement.initial_condition || 'N/A'}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 800, color: '#4B5563', mt: 0.5 }}>Initial Reading: {viewAgreement.initial_meter_reading || '-'}</Typography>
                </Card>
                <Card sx={{ p: 2, border: '1px solid #E5E7EB', borderRadius: '12px', bgcolor: '#F9FAFB' }}>
                  <Typography sx={{ fontWeight: 900, color: '#047857', mb: 1 }}>Return Information</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 800, color: '#4B5563' }}>Condition: {viewAgreement.return_condition || 'N/A'}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 800, color: '#4B5563', mt: 0.5 }}>Meter Reading: {viewAgreement.final_meter_reading || 0}</Typography>
                </Card>
              </Box>

              {viewAgreement.converted_invoice_id && (
                <>
                  <Divider />
                  <Typography sx={{ fontWeight: 900, color: '#1E3A8A' }}>Billing and Invoices</Typography>
                  <Card sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #BFDBFE', bgcolor: '#EFF6FF', borderRadius: '12px' }}>
                    <Box>
                      <Typography sx={{ fontWeight: 900, color: '#1D4ED8' }}>Invoice {viewAgreement.converted_invoice_number}</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 800 }}>Payment Method: {paymentMethodLabel(viewAgreement.converted_invoice_payment_method)}</Typography>
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography sx={{ fontWeight: 950, color: '#047857' }}>Total: {money(viewAgreement.converted_invoice_balance_due)} due (paid: {money(viewAgreement.converted_invoice_amount_paid)})</Typography>
                      <Chip label={viewAgreement.converted_invoice_status} size="small" sx={{ bgcolor: statusChip(viewAgreement.converted_invoice_status || '').bg, color: statusChip(viewAgreement.converted_invoice_status || '').color, fontWeight: 900, textTransform: 'uppercase', mt: 0.5 }} />
                    </Box>
                  </Card>
                </>
              )}

              <Divider />
              <Box>
                <Typography sx={{ fontWeight: 900, color: '#1E3A8A', mb: 0.5 }}>Payment Schedule</Typography>
                <Typography sx={{ color: '#64748B', fontSize: 13, fontWeight: 700, mb: 1.5 }}>
                  First payment includes upfront charges. Future periods contain recurring rent, applicable discount, and tax.
                </Typography>
                <TableContainer sx={{ border: '1px solid #DBEAFE', borderRadius: '14px', overflowX: 'auto' }}>
                  <Table size="small" sx={{ minWidth: 700 }}>
                    <TableHead><TableRow sx={{ bgcolor: '#F8FAFC' }}>
                      <TableCell sx={{ fontWeight: 900 }}>Period</TableCell>
                      <TableCell sx={{ fontWeight: 900 }}>Billing Date</TableCell>
                      <TableCell sx={{ fontWeight: 900 }} align="right">Rent</TableCell>
                      <TableCell sx={{ fontWeight: 900 }} align="right">Discount</TableCell>
                      <TableCell sx={{ fontWeight: 900 }} align="right">Tax</TableCell>
                      <TableCell sx={{ fontWeight: 900 }} align="right">Expected Total</TableCell>
                      <TableCell sx={{ fontWeight: 900 }}>Status</TableCell>
                    </TableRow></TableHead>
                    <TableBody>
                      {(viewAgreement.billing_schedule || []).map(period => {
                        const isNext = viewAgreement.next_payment?.period === period.period
                        const style = statusChip(period.status)
                        return (
                          <TableRow key={period.period} sx={{ bgcolor: isNext ? '#F5F3FF' : undefined }}>
                            <TableCell sx={{ fontWeight: 900, color: isNext ? '#7C3AED' : '#1E3A8A' }}>
                              {period.period}{isNext ? ' · Next' : ''}
                            </TableCell>
                            <TableCell>{formatDate(period.billing_date)}</TableCell>
                            <TableCell align="right">{money(period.rental_amount)}</TableCell>
                            <TableCell align="right">{Number(period.discount || 0) ? `-${money(period.discount)}` : '-'}</TableCell>
                            <TableCell align="right">{money(period.tax)}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 900 }}>{money(period.total)}</TableCell>
                            <TableCell>
                              <Chip
                                size="small"
                                label={period.invoice_number ? `${period.status} · ${period.invoice_number}` : period.status}
                                sx={{ bgcolor: style.bg, color: style.color, fontWeight: 900, textTransform: 'capitalize' }}
                              />
                            </TableCell>
                          </TableRow>
                        )
                      })}
                      {(viewAgreement.billing_schedule || []).length === 0 && (
                        <TableRow><TableCell colSpan={7} align="center" sx={{ py: 3, color: '#64748B', fontWeight: 700 }}>No future billing periods remain.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>

              <Divider />
              <Typography sx={{ fontWeight: 900, color: '#1E3A8A' }}>Agreement Audit History</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {viewAgreement.history?.map((h, i) => (
                  <Box key={i} sx={{ p: 1.4, border: '1px solid #F3F4F6', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', bgcolor: '#FAF5FF' }}>
                    <Box>
                      <Typography sx={{ fontWeight: 850, textTransform: 'capitalize', color: '#7C3AED' }}>{h.action.replace(/_/g, ' ')}</Typography>
                      <Typography sx={{ color: '#6B7280', fontSize: 12 }}>by {h.by} at {formatDate(h.at)}</Typography>
                    </Box>
                    <Typography variant="body2" title={auditDetailsText(h.details)} sx={{ color: '#4B5563', alignSelf: 'center', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {auditDetailsText(h.details)}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setViewAgreement(null)} variant="contained" sx={{ borderRadius: '12px', fontWeight: 900, background: SYSTEM_GRADIENT }}>
            Close Details
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default Rentals
