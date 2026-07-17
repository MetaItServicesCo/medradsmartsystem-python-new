import { type MouseEvent, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Avatar, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, FormControl, IconButton, InputLabel, ListItemIcon, Menu, MenuItem, Select,
  LinearProgress, Skeleton, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs,
  TextField, Typography,
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
import { toast } from 'react-toastify'

import { fetchFacilities } from '@/api/facilities'
import { resolveUploadUrl } from '@/api/users'
import CreditCardAuthorizationDialog, { type AuthorizationLineItem, type CreditCardAuthorizationPayload } from '@/components/Billing/CreditCardAuthorizationDialog'
import InvoicePrintDialog, { type PrintableLedgerTransaction, type PrintableLineItem } from '@/components/Billing/InvoicePrintDialog'
import ClippedTooltipText from '@/components/ClippedTooltipText'
import {
  fetchRentalParts,
  fetchRentals,
  createRental,
  updateRental,
  deleteRental,
  returnRental,
  convertRentalToInvoice,
  fetchRentalInvoices,
  updateRentalInvoice,
  fetchRentalHistory,
  type Rental,
  type RentalInvoice,
  type RentalInvoiceCreatePayload,
  type RentalPart,
  type RentalPayload,
  type RentalReturnPayload,
  type BillingFrequency,
  type RentalStatus,
  type RentalInvoiceStatus,
} from '@/api/rentals'
import { formatUSPhone, formatUSPhoneInput } from '@/utils/formatters'

const ROUTE_TABS = ['/rentals/agreements', '/rentals/invoices', '/rentals/products', '/rentals/history']
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

const formatDate = (value: string | null | undefined) => {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
}

const parseIntegerInput = (value: string): number | null => {
  const digits = value.replace(/\D/g, '')
  return digits ? Number(digits) : null
}

const emptyAgreement = (): RentalPayload => ({
  part_id: 0,
  customer_name: '',
  customer_email: '',
  customer_phone: '',
  customer_address: '',
  billing_frequency: 'monthly',
  rental_rate: 0,
  security_deposit: 0,
  quantity: 1,
  shipping_fee: 0,
  setup_fee: 0,
  item_condition: 'New',
  start_date: new Date().toISOString().slice(0, 10),
  end_date: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().slice(0, 10),
  initial_condition: '',
  initial_meter_reading: 0,
  terms_and_conditions: '',
})

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
  const queryClient = useQueryClient()

  const routeSearch = new URLSearchParams(location.search).get('search') || ''
  const [search, setSearch] = useState(routeSearch)
  const [debouncedSearch, setDebouncedSearch] = useState(routeSearch)
  const [agreementDialog, setAgreementDialog] = useState(false)
  const [editingAgreement, setEditingAgreement] = useState<Rental | null>(null)
  const [viewAgreement, setViewAgreement] = useState<Rental | null>(null)
  const [agreementForm, setAgreementForm] = useState<RentalPayload>(emptyAgreement())

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
  const [printAgreement, setPrintAgreement] = useState<Rental | null>(null)
  const [printInvoice, setPrintInvoice] = useState<RentalInvoice | null>(null)
  const [invoiceActionAnchor, setInvoiceActionAnchor] = useState<HTMLElement | null>(null)
  const [actionInvoice, setActionInvoice] = useState<RentalInvoice | null>(null)
  const [cardAuthDialog, setCardAuthDialog] = useState<{ rental?: Rental; invoice?: RentalInvoice } | null>(null)

  const [actionAnchor, setActionAnchor] = useState<HTMLElement | null>(null)
  const [actionAgreement, setActionAgreement] = useState<Rental | null>(null)
  const [partInfo, setPartInfo] = useState<RentalPartInfo | null>(null)

  const tab = Math.max(0, ROUTE_TABS.findIndex(path => location.pathname === path || location.pathname.startsWith(`${path}/`)))
  const highlightInvoiceId = Number(new URLSearchParams(location.search).get('highlightInvoice') || 0)
  const highlightAgreementId = Number(new URLSearchParams(location.search).get('highlightAgreement') || 0)

  useEffect(() => {
    if (location.pathname === '/rentals') navigate('/rentals/agreements', { replace: true })
  }, [location.pathname, navigate])

  useEffect(() => {
    setSearch(routeSearch)
    setDebouncedSearch(routeSearch)
  }, [routeSearch])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearch(search.trim())
    }, 350)

    return () => window.clearTimeout(handle)
  }, [search])

  const facilitiesQ = useQuery({ queryKey: ['rental-facilities'], queryFn: () => fetchFacilities({ limit: 500 }) })
  const partsQ = useQuery({
    queryKey: ['rental-parts', debouncedSearch],
    queryFn: () => fetchRentalParts(debouncedSearch || undefined),
    placeholderData: previousData => previousData,
  })
  const rentalsQ = useQuery({
    queryKey: ['rental-agreements', debouncedSearch],
    queryFn: () => fetchRentals({ search: debouncedSearch || undefined }),
    placeholderData: previousData => previousData,
  })
  const invoicesQ = useQuery({
    queryKey: ['rental-invoices', debouncedSearch],
    queryFn: () => fetchRentalInvoices({ search: debouncedSearch || undefined }),
    placeholderData: previousData => previousData,
  })
  const historyQ = useQuery({ queryKey: ['rental-history'], queryFn: fetchRentalHistory })

  const facilities = facilitiesQ.data?.items || []
  const parts = partsQ.data?.items || []
  const rentals = rentalsQ.data?.items || []
  const invoices = invoicesQ.data?.items || []
  const activeRentals = rentals.filter(r => r.status === 'active')
  const completedRentals = rentals.filter(r => r.status === 'completed')

  const totalInvoiced = invoices.reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0)
  const totalCollected = invoices.reduce((sum, invoice) => sum + Number(invoice.amount_paid || 0), 0)
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
    agreements: rentals.length,
    active: activeRentals.length,
    invoiced: totalInvoiced,
    products: parts.length,
    history: historyQ.data?.total || 0,
  }), [rentals.length, activeRentals.length, totalInvoiced, parts.length, historyQ.data?.total])

  const invalidateRentals = () => {
    queryClient.invalidateQueries({ queryKey: ['rental-agreements'] })
    queryClient.invalidateQueries({ queryKey: ['rental-invoices'] })
    queryClient.invalidateQueries({ queryKey: ['rental-history'] })
    queryClient.invalidateQueries({ queryKey: ['rental-parts'] })
  }

  const saveAgreementMut = useMutation({
    mutationFn: () => editingAgreement ? updateRental(editingAgreement.id, agreementForm) : createRental(agreementForm),
    onSuccess: () => {
      toast.success(editingAgreement ? 'Rental agreement updated' : 'Rental agreement created')
      setAgreementDialog(false)
      setEditingAgreement(null)
      setAgreementForm(emptyAgreement())
      invalidateRentals()
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not save rental agreement'),
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

  const openCreate = () => {
    setEditingAgreement(null)
    setAgreementForm(emptyAgreement())
    setAgreementDialog(true)
  }

  const openEdit = (rental: Rental) => {
    closeActions()
    setEditingAgreement(rental)
    setAgreementForm({
      part_id: rental.part_id,
      customer_name: rental.customer_name,
      customer_email: rental.customer_email,
      customer_phone: formatUSPhoneInput(rental.customer_phone),
      customer_address: rental.customer_address,
      billing_frequency: rental.billing_frequency,
      rental_rate: Number(rental.rental_rate),
      security_deposit: Number(rental.security_deposit),
      quantity: Number(rental.quantity || 1),
      shipping_fee: Number(rental.shipping_fee || 0),
      setup_fee: Number(rental.setup_fee || 0),
      item_condition: rental.item_condition || rental.initial_condition || 'New',
      start_date: rental.start_date || '',
      end_date: rental.end_date || '',
      initial_condition: rental.initial_condition || '',
      initial_meter_reading: rental.initial_meter_reading || 0,
      terms_and_conditions: rental.terms_and_conditions || '',
    })
    setAgreementDialog(true)
  }

  const handlePartChange = (partId: number) => {
    const part = parts.find(p => p.id === partId)
    if (part) {
      setAgreementForm(prev => ({
        ...prev,
        part_id: partId,
        rental_rate: Number(part.unit_price || 0),
        item_condition: part.condition || prev.item_condition || 'New',
      }))
      if (part.facility_id) {
        const fac = facilities.find(f => f.id === part.facility_id)
        if (fac) {
          setAgreementForm(prev => ({
            ...prev,
            customer_name: fac.billing_name || fac.name || prev.customer_name,
            customer_email: fac.billing_email || fac.email || prev.customer_email,
            customer_phone: fac.phone ? formatUSPhoneInput(fac.phone) : prev.customer_phone,
            customer_address: [
              fac.billing_street || fac.address,
              fac.billing_city || fac.city,
              fac.billing_state || fac.state,
              fac.billing_zip_code || fac.zip_code
            ].filter(Boolean).join(', '),
          }))
        }
      }
    }
  }

  const submitAgreement = () => {
    if (!agreementForm.part_id) return toast.error('Rental product is required')
    if (!agreementForm.customer_name) return toast.error('Customer name is required')
    if (!agreementForm.customer_email) return toast.error('Customer email is required')
    if (!agreementForm.rental_rate) return toast.error('Rental rate is required')
    if (!agreementForm.quantity || agreementForm.quantity < 1) return toast.error('Quantity must be greater than zero')
    saveAgreementMut.mutate()
  }

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
      final_meter_reading: rental.initial_meter_reading || 0,
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

  const calculatedBaseRental = useMemo(() => {
    if (!convertAgreement) return 0
    const rate = Number(convertAgreement.rental_rate)
    const quantity = Number(convertAgreement.quantity || 1)
    const freq = convertAgreement.billing_frequency
    if (freq === 'daily') {
      return durationDays * rate * quantity
    } else if (freq === 'weekly') {
      return Math.ceil(durationDays / 7) * rate * quantity
    } else if (freq === 'monthly') {
      return Math.ceil(durationDays / 30) * rate * quantity
    }
    return durationDays * rate * quantity
  }, [convertAgreement, durationDays])

  const convertTaxAmount = calculatedBaseRental * Number(invoiceDetails.tax_rate || 0) / 100
  const convertGrandTotal =
    calculatedBaseRental +
    Number(invoiceDetails.worked_hours || 0) +
    Number(invoiceDetails.setup_fee || 0) +
    Number(convertAgreement?.setup_fee || 0) +
    Number(invoiceDetails.service_fee || 0) +
    Number(invoiceDetails.shipping_fee || 0) +
    Number(convertAgreement?.shipping_fee || 0) +
    Number(invoiceDetails.application_fee || 0) +
    convertTaxAmount -
    (invoiceDetails.discount_type === 'percent'
      ? (calculatedBaseRental + Number(invoiceDetails.worked_hours || 0) + Number(invoiceDetails.setup_fee || 0) + Number(convertAgreement?.setup_fee || 0) + Number(invoiceDetails.service_fee || 0) + Number(invoiceDetails.shipping_fee || 0) + Number(convertAgreement?.shipping_fee || 0) + Number(invoiceDetails.application_fee || 0)) * Number(invoiceDetails.discount_amount || 0) / 100
      : Number(invoiceDetails.discount_amount || 0))

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
    if (left.facility_id && right.facility_id) return left.facility_id === right.facility_id
    return left.customer_name.trim().toLowerCase() === right.customer_name.trim().toLowerCase()
  }

  const invoiceLineItems = (invoice: RentalInvoice | null): PrintableLineItem[] => {
    if (!invoice) return []
    const rental = rentals.find(item => item.id === invoice.rental_id)
    if (rental) {
      return [{
        item_number: rental.part_number || rental.rental_number,
        description: rental.part_description || 'Rental product',
        quantity: Number(rental.quantity || 1),
        unit_price: Number(rental.rental_rate || 0),
        shipping_fee: Number(rental.shipping_fee || 0),
        setup_fee: Number(rental.setup_fee || 0),
        condition: rental.item_condition || rental.initial_condition || null,
        total_amount: Number(rental.rental_rate || 0) * Number(rental.quantity || 1) + Number(rental.shipping_fee || 0) + Number(rental.setup_fee || 0),
      }]
    }
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
    return [{
      item_number: rental.part_number || rental.rental_number,
      description: rental.part_description || 'Rental product',
      quantity: Number(rental.quantity || 1),
      unit_price: Number(rental.rental_rate || 0),
      shipping_fee: Number(rental.shipping_fee || 0),
      setup_fee: Number(rental.setup_fee || 0),
      condition: rental.item_condition || rental.initial_condition || null,
      total_amount: Number(rental.rental_rate || 0) * Number(rental.quantity || 1) + Number(rental.shipping_fee || 0) + Number(rental.setup_fee || 0),
    }]
  }

  const agreementLedgerTransactions = (rental: Rental | null): PrintableLedgerTransaction[] => {
    if (!rental) return []
    return invoices
      .filter(invoice => rental.customer_name.trim().toLowerCase() === invoice.customer_name.trim().toLowerCase())
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
              <TableRow
                key={item.id}
                id={`rental-agreement-${item.id}`}
                hover
                sx={highlighted ? {
                  bgcolor: '#EFF6FF',
                  outline: '2px solid #2563EB',
                  outlineOffset: '-2px',
                  '& td': { borderTop: '1px solid #BFDBFE', borderBottom: '1px solid #BFDBFE' },
                } : undefined}
              >
                <TableCell><ClippedTooltipText value={item.rental_number} monospace color="#1D4ED8" fontWeight={900} onClick={() => setViewAgreement(item)} /></TableCell>
                <TableCell><ClippedTooltipText value={item.part_number ? `${item.part_number} - ${item.part_description || ''}` : '-'} fontWeight={800} field onClick={() => openRentalPartInfo(parts.find(part => part.id === item.part_id), item)} /></TableCell>
                <TableCell><ClippedTooltipText value={item.customer_name} fontWeight={800} /></TableCell>
                <TableCell sx={{ color: '#047857', fontWeight: 800 }}>{money(item.rental_rate)}</TableCell>
                <TableCell>{item.quantity || 1}</TableCell>
                <TableCell>{money(Number(item.shipping_fee || 0) + Number(item.setup_fee || 0))}</TableCell>
                <TableCell sx={{ textTransform: 'capitalize' }}>{item.billing_frequency}</TableCell>
                <TableCell>{formatDate(item.start_date)}</TableCell>
                <TableCell>{formatDate(item.end_date)}</TableCell>
                <TableCell>
                  <Chip size="small" label={item.status} sx={{ bgcolor: status.bg, color: status.color, fontWeight: 900, textTransform: 'uppercase' }} />
                </TableCell>
                <TableCell align="right">
                  {highlighted && (
                    <Chip size="small" label="Selected" sx={{ mr: 1, bgcolor: '#DBEAFE', color: '#1D4ED8', fontWeight: 900 }} />
                  )}
                  <IconButton
                    size="small"
                    onClick={(event) => openActions(event, item)}
                    sx={{ borderRadius: '12px', bgcolor: '#F3F4F6', color: '#2563EB', '&:hover': { bgcolor: '#DBEAFE' } }}
                  >
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
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
              <TableRow
                key={invoice.id}
                id={`rental-invoice-${invoice.id}`}
                hover
                sx={highlighted ? {
                  bgcolor: '#EFF6FF',
                  outline: '2px solid #2563EB',
                  outlineOffset: '-2px',
                  '& td': { borderTop: '1px solid #BFDBFE', borderBottom: '1px solid #BFDBFE' },
                } : undefined}
              >
                <TableCell><ClippedTooltipText value={invoice.invoice_number} monospace color="#1D4ED8" fontWeight={900} onClick={() => setViewInvoice(invoice)} /></TableCell>
                <TableCell><ClippedTooltipText value={invoice.rental_number || '-'} monospace fontWeight={800} onClick={() => {
                  const agreement = rentals.find(item => item.id === invoice.rental_id)
                  if (agreement) setViewAgreement(agreement)
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
                  <IconButton
                    size="small"
                    onClick={(event) => openInvoiceActions(event, invoice)}
                    sx={{ borderRadius: '12px', bgcolor: '#F3F4F6', color: '#2563EB', '&:hover': { bgcolor: '#DBEAFE' } }}
                  >
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
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
          </TableRow>
        </TableHead>
        <TableBody>
          {partsQ.isLoading ? Array.from({ length: 5 }).map((_, index) => (
            <TableRow key={index}><TableCell colSpan={9}><Skeleton /></TableCell></TableRow>
          )) : parts.length === 0 ? (
            <TableRow><TableCell colSpan={9} align="center" sx={{ py: 5, color: '#6B7280', fontWeight: 700 }}>No rental products found.</TableCell></TableRow>
          ) : parts.map(part => (
            <TableRow key={part.id} hover>
              <TableCell>
                <Avatar src={resolveUploadUrl(part.default_picture_url)} variant="rounded" sx={{ width: 46, height: 46, bgcolor: '#EFF6FF', color: '#2563EB', borderRadius: '12px' }}>
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
            </TableRow>
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
            <TableRow key={`${item.rental_id}-${item.action}-${index}`} hover>
              <TableCell>{formatDate(item.at)}</TableCell>
              <TableCell><ClippedTooltipText value={item.rental_number} monospace color="#1D4ED8" fontWeight={900} onClick={() => {
                const agreement = rentals.find(rental => rental.id === item.rental_id)
                if (agreement) setViewAgreement(agreement)
              }} /></TableCell>
              <TableCell><ClippedTooltipText value={item.customer_name} fontWeight={800} /></TableCell>
              <TableCell><ClippedTooltipText value={item.facility_name || '-'} onClick={item.facility_name ? () => navigate(`/facilities?search=${encodeURIComponent(item.facility_name!)}`) : undefined} /></TableCell>
              <TableCell><ClippedTooltipText value={item.part_number ? `${item.part_number} - ${item.part_description || ''}` : '-'} field onClick={() => openRentalPartInfo(parts.find(part => part.part_number === item.part_number), item)} /></TableCell>
              <TableCell sx={{ textTransform: 'capitalize', fontWeight: 800 }}>{item.action.replace(/_/g, ' ')}</TableCell>
              <TableCell>{item.by}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )

  return (
    <Box className="page-enter" sx={{ maxWidth: 1440, mx: 'auto' }}>
      <Card sx={{ p: 3, mb: 3, borderRadius: '24px', border: '1px solid #BFDBFE', background: 'linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 100%)', boxShadow: '0 18px 45px rgba(59,130,246,0.08)' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <Box>
            <Typography variant="h4" sx={{ color: '#1E3A8A', fontWeight: 900 }}>Rental Management</Typography>
            <Typography sx={{ color: '#4B5563', fontWeight: 700 }}>Create agreements for rental products from inventory, process periodic billing invoices, track equipment handovers, returns and history logs.</Typography>
          </Box>
          <Button startIcon={<AddIcon />} variant="contained" onClick={openCreate} sx={{ borderRadius: '14px', px: 3, py: 1.4, textTransform: 'none', fontWeight: 900, background: SYSTEM_GRADIENT }}>
            New Agreement
          </Button>
        </Box>
      </Card>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(5, 1fr)' }, gap: 2, mb: 3 }}>
        {renderKpi('Total Agreements', stats.agreements, <AssignmentIcon />, '#3B82F6')}
        {renderKpi('Active Rentals', stats.active, <LocalShippingIcon />, '#2563EB')}
        {renderKpi('Total Invoiced', money(stats.invoiced), <ReceiptLongIcon />, '#059669')}
        {renderKpi('Rental Products', stats.products, <InfoIcon />, '#8B5CF6')}
        {renderKpi('History Entries', stats.history, <HistoryIcon />, '#6B7280')}
      </Box>

      <Card sx={{ borderRadius: '24px', overflow: 'hidden', border: '1px solid #EEF0F6', boxShadow: '0 18px 45px rgba(59,130,246,0.08)' }}>
        <Tabs value={tab} onChange={(_, value) => navigate(ROUTE_TABS[value])} variant="scrollable" sx={{ px: 2, borderBottom: '1px solid #EEF0F6' }}>
          <Tab icon={<AssignmentIcon />} iconPosition="start" label="Agreements" />
          <Tab icon={<ReceiptLongIcon />} iconPosition="start" label="Invoices" />
          <Tab icon={<InfoIcon />} iconPosition="start" label="Rental Products" />
          <Tab icon={<HistoryIcon />} iconPosition="start" label="History" />
        </Tabs>

        {tab === 0 && (
          <Box>
            <Box sx={{ px: 3, py: 2, display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center', borderBottom: '1px solid #EEF0F6', flexWrap: 'wrap' }}>
              <Box>
                <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Agreements List</Typography>
                <Typography sx={{ color: '#6B7280', fontWeight: 700, fontSize: 13 }}>Track your active agreements and return schedules.</Typography>
              </Box>
              <TextField size="small" label="Search Agreements..." value={search} onChange={e => setSearch(e.target.value)} sx={{ minWidth: 280 }} />
            </Box>
            <Box sx={{ p: 3 }}>
              {renderAgreementsTable(rentals, 'No rental agreements found.')}
            </Box>
          </Box>
        )}

        {tab === 1 && (
          <Box>
            <Box sx={{ px: 3, py: 2.5, display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #EEF0F6' }}>
              <Box>
                <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Rental Invoices</Typography>
                <Typography sx={{ color: '#6B7280', fontWeight: 700, fontSize: 13 }}>Periodic invoices generated from rental durations.</Typography>
              </Box>
              <Card sx={{ px: 2, py: 0.8, display: 'flex', alignItems: 'center', gap: 2, border: '1px solid #E5E7EB', borderRadius: '12px', bgcolor: '#F9FAFB' }}>
                <Typography sx={{ fontWeight: 850, fontSize: 12, color: '#4B5563' }}>Collections Progress: {collectionPercent}%</Typography>
                <Box sx={{ width: 100 }}>
                  <LinearProgress variant="determinate" value={collectionPercent} sx={{ height: 6, borderRadius: 3 }} />
                </Box>
              </Card>
            </Box>
            {renderInvoices()}
          </Box>
        )}

        {tab === 2 && (
          <Box>
            <Box sx={{ px: 3, py: 2, display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center', borderBottom: '1px solid #EEF0F6' }}>
              <Box>
                <Typography sx={{ fontWeight: 900, color: '#1E1B4B' }}>Rental Products catalog</Typography>
                <Typography sx={{ color: '#6B7280', fontWeight: 700, fontSize: 13 }}>Inventory parts marked as rental products.</Typography>
              </Box>
              <TextField size="small" label="Search Products..." value={search} onChange={e => setSearch(e.target.value)} sx={{ minWidth: 280 }} />
            </Box>
            <Box sx={{ p: 3 }}>
              {renderProducts()}
            </Box>
          </Box>
        )}

        {tab === 3 && renderHistory()}
      </Card>

      <Menu anchorEl={actionAnchor} open={Boolean(actionAnchor)} onClose={closeActions} PaperProps={{ sx: ACTION_MENU_PAPER }}>
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
        <MenuItem sx={ACTION_MENU_ITEM} onClick={() => { if (actionAgreement) setViewAgreement(actionAgreement); closeActions() }}>
          <ListItemIcon sx={{ color: 'inherit', minWidth: 34 }}><VisibilityIcon fontSize="small" /></ListItemIcon>
          View Details
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
          facility_name: null,
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
      <Dialog open={agreementDialog} onClose={() => setAgreementDialog(false)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '22px' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E3A8A' }}>
          {editingAgreement ? 'Edit Rental Agreement' : 'Create Rental Agreement'}
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2, pt: 1 }}>
            {!editingAgreement ? (
              <FormControl sx={{ gridColumn: '1 / -1' }}>
                <InputLabel>Select Rental Product *</InputLabel>
                <Select
                  label="Select Rental Product *"
                  value={agreementForm.part_id || ''}
                  onChange={e => handlePartChange(Number(e.target.value))}
                >
                  {parts.map((p: RentalPart) => (
                    <MenuItem key={p.id} value={p.id} disabled={p.quantity_on_hand <= 0}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                        <Avatar src={resolveUploadUrl(p.default_picture_url)} variant="rounded" sx={{ width: 32, height: 32, bgcolor: '#EFF6FF', color: '#2563EB' }}>
                          <LocalShippingIcon fontSize="small" />
                        </Avatar>
                        <span>{p.part_number} - {p.description} (Stock: {p.quantity_on_hand}, Rate: {money(p.unit_price)})</span>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : (
              <TextField
                label="Selected Product"
                value={editingAgreement.part_number ? `${editingAgreement.part_number} - ${editingAgreement.part_description || ''}` : ''}
                disabled
                sx={{ gridColumn: '1 / -1' }}
              />
            )}

            <TextField label="Customer Name *" value={agreementForm.customer_name} onChange={e => setAgreementForm(prev => ({ ...prev, customer_name: e.target.value }))} />
            <TextField label="Customer Email *" value={agreementForm.customer_email} onChange={e => setAgreementForm(prev => ({ ...prev, customer_email: e.target.value }))} />
            <TextField label="Customer Phone" value={agreementForm.customer_phone} onChange={e => setAgreementForm(prev => ({ ...prev, customer_phone: formatUSPhoneInput(e.target.value) }))} />
            <TextField
              select
              label="Billing Frequency"
              value={agreementForm.billing_frequency}
              onChange={e => setAgreementForm(prev => ({ ...prev, billing_frequency: e.target.value as BillingFrequency }))}
            >
              <MenuItem value="daily">Daily</MenuItem>
              <MenuItem value="weekly">Weekly</MenuItem>
              <MenuItem value="monthly">Monthly</MenuItem>
            </TextField>

            <TextField label="Rental Rate (Standard) *" type="number" value={agreementForm.rental_rate} onChange={e => setAgreementForm(prev => ({ ...prev, rental_rate: Number(e.target.value) }))} />
            <TextField label="Security Deposit" type="number" value={agreementForm.security_deposit} onChange={e => setAgreementForm(prev => ({ ...prev, security_deposit: Number(e.target.value) }))} />
            <TextField label="Quantity" type="number" value={agreementForm.quantity || 1} onChange={e => setAgreementForm(prev => ({ ...prev, quantity: Number(e.target.value) }))} />
            <TextField label="Shipping Fee" type="number" value={agreementForm.shipping_fee || 0} onChange={e => setAgreementForm(prev => ({ ...prev, shipping_fee: Number(e.target.value) }))} />
            <TextField label="Setup Fee" type="number" value={agreementForm.setup_fee || 0} onChange={e => setAgreementForm(prev => ({ ...prev, setup_fee: Number(e.target.value) }))} />
            <TextField select label="Condition" value={agreementForm.item_condition || 'New'} onChange={e => setAgreementForm(prev => ({ ...prev, item_condition: e.target.value }))}>
              {['New', 'Used', 'Refurbished', 'Damaged'].map(condition => <MenuItem key={condition} value={condition}>{condition}</MenuItem>)}
            </TextField>
            
            <TextField label="Start Date" type="date" value={agreementForm.start_date} onChange={e => setAgreementForm(prev => ({ ...prev, start_date: e.target.value }))} InputLabelProps={{ shrink: true }} />
            <TextField label="End Date" type="date" value={agreementForm.end_date} onChange={e => setAgreementForm(prev => ({ ...prev, end_date: e.target.value }))} InputLabelProps={{ shrink: true }} />
            
            <TextField label="Customer Address" value={agreementForm.customer_address} onChange={e => setAgreementForm(prev => ({ ...prev, customer_address: e.target.value }))} sx={{ gridColumn: '1 / -1' }} />
            
            <TextField label="Initial Condition" value={agreementForm.initial_condition || ''} onChange={e => setAgreementForm(prev => ({ ...prev, initial_condition: e.target.value }))} />
            <TextField
              label="Initial Reading"
              value={agreementForm.initial_meter_reading ?? ''}
              onChange={e => setAgreementForm(prev => ({ ...prev, initial_meter_reading: parseIntegerInput(e.target.value) }))}
              inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
              helperText="Numbers only"
            />
            
            <TextField label="Terms and Conditions" value={agreementForm.terms_and_conditions || ''} onChange={e => setAgreementForm(prev => ({ ...prev, terms_and_conditions: e.target.value }))} multiline rows={2} sx={{ gridColumn: '1 / -1' }} />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setAgreementDialog(false)} sx={{ fontWeight: 900 }}>Cancel</Button>
          <Button startIcon={saveAgreementMut.isPending ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <AddIcon />} onClick={submitAgreement} variant="contained" sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none', background: SYSTEM_GRADIENT }}>
            {editingAgreement ? 'Update Agreement' : 'Create Agreement'}
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
                        <TableCell sx={{ fontWeight: 900 }}>Shipping Fee</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Setup Fee</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Condition</TableCell>
                        <TableCell sx={{ fontWeight: 900 }}>Duration Days</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 900 }}>Rental Base Total</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 800 }}>{convertAgreement.part_number ? `${convertAgreement.part_number} - ${convertAgreement.part_description || ''}` : '-'}</TableCell>
                        <TableCell sx={{ textTransform: 'capitalize' }}>{convertAgreement.billing_frequency}</TableCell>
                        <TableCell>{money(convertAgreement.rental_rate)}</TableCell>
                        <TableCell>{convertAgreement.quantity || 1}</TableCell>
                        <TableCell>{money(convertAgreement.shipping_fee)}</TableCell>
                        <TableCell>{money(convertAgreement.setup_fee)}</TableCell>
                        <TableCell>{convertAgreement.item_condition || '-'}</TableCell>
                        <TableCell>{durationDays} day(s)</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 900, color: '#047857' }}>{money(calculatedBaseRental)}</TableCell>
                      </TableRow>
                      {[
                        ['Security Deposit Paid', Number(convertAgreement.security_deposit || 0)],
                        ['Working Hours Fee', Number(invoiceDetails.worked_hours || 0)],
                        ['Setup Fee', Number(invoiceDetails.setup_fee || 0) + Number(convertAgreement.setup_fee || 0)],
                        ['Service Fee', Number(invoiceDetails.service_fee || 0)],
                        ['Shipping Fee', Number(invoiceDetails.shipping_fee || 0) + Number(convertAgreement.shipping_fee || 0)],
                        ['Application Fee', Number(invoiceDetails.application_fee || 0)],
                        ['Tax Amount', convertTaxAmount],
                      ].map(([label, value]) => (
                        <TableRow key={String(label)}>
                          <TableCell colSpan={8} align="right" sx={{ fontWeight: 900, color: '#4B5563' }}>{label}</TableCell>
                          <TableCell align="right">{money(value as number)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow sx={{ bgcolor: '#EFF6FF' }}>
                        <TableCell colSpan={8} align="right" sx={{ fontWeight: 900, fontSize: 15 }}>Grand Total Due</TableCell>
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
                <TextField label="Tax Rate (%)" type="number" size="small" value={invoiceDetails.tax_rate} onChange={e => setInvoiceDetails(p => ({ ...p, tax_rate: Number(e.target.value) }))} />
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
                  <Typography variant="subtitle2" sx={{ color: '#6B7280', fontWeight: 800 }}>RENTAL PRODUCT</Typography>
                  <Typography sx={{ fontWeight: 900 }}>{viewAgreement.part_number ? `${viewAgreement.part_number} - ${viewAgreement.part_description || ''}` : '-'}</Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" sx={{ color: '#6B7280', fontWeight: 800 }}>CUSTOMER NAME</Typography>
                  <Typography sx={{ fontWeight: 800 }}>{viewAgreement.customer_name}</Typography>
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
                  <Typography variant="subtitle2" sx={{ color: '#6B7280', fontWeight: 800 }}>BILLING FREQUENCY & RATE</Typography>
                  <Typography sx={{ fontWeight: 900, color: '#047857' }}>{money(viewAgreement.rental_rate)} ({viewAgreement.billing_frequency})</Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" sx={{ color: '#6B7280', fontWeight: 800 }}>QUANTITY / CONDITION</Typography>
                  <Typography sx={{ fontWeight: 900 }}>{viewAgreement.quantity || 1} / {viewAgreement.item_condition || '-'}</Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle2" sx={{ color: '#6B7280', fontWeight: 800 }}>ITEM FEES</Typography>
                  <Typography sx={{ fontWeight: 900 }}>Shipping {money(viewAgreement.shipping_fee)} / Setup {money(viewAgreement.setup_fee)}</Typography>
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

              <Divider />
              
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                <Card sx={{ p: 2, border: '1px solid #E5E7EB', borderRadius: '12px', bgcolor: '#F9FAFB' }}>
                  <Typography sx={{ fontWeight: 900, color: '#1E3A8A', mb: 1 }}>Handover Information</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 800, color: '#4B5563' }}>Condition: {viewAgreement.initial_condition || 'N/A'}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 800, color: '#4B5563', mt: 0.5 }}>Meter Reading: {viewAgreement.initial_meter_reading || 0}</Typography>
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
              <Typography sx={{ fontWeight: 900, color: '#1E3A8A' }}>Agreement Audit History</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {viewAgreement.history?.map((h, i) => (
                  <Box key={i} sx={{ p: 1.4, border: '1px solid #F3F4F6', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', bgcolor: '#FAF5FF' }}>
                    <Box>
                      <Typography sx={{ fontWeight: 850, textTransform: 'capitalize', color: '#7C3AED' }}>{h.action.replace(/_/g, ' ')}</Typography>
                      <Typography sx={{ color: '#6B7280', fontSize: 12 }}>by {h.by} at {formatDate(h.at)}</Typography>
                    </Box>
                    <Typography variant="body2" sx={{ color: '#4B5563', alignSelf: 'center', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {Object.keys(h.details || {}).length > 0 ? JSON.stringify(h.details) : ''}
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
