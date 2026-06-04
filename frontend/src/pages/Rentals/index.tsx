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
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import PaymentIcon from '@mui/icons-material/Payment'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import VisibilityIcon from '@mui/icons-material/Visibility'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import InfoIcon from '@mui/icons-material/Info'
import { toast } from 'react-toastify'

import { fetchFacilities } from '@/api/facilities'
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

const ROUTE_TABS = ['/rentals/agreements', '/rentals/invoices', '/rentals/products', '/rentals/history']
const SYSTEM_GRADIENT = 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)'
const SYSTEM_PANEL_BORDER = '#BFDBFE'
const SYSTEM_PANEL_BG = '#F0F9FF'

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

const emptyAgreement = (): RentalPayload => ({
  part_id: 0,
  customer_name: '',
  customer_email: '',
  customer_phone: '',
  customer_address: '',
  billing_frequency: 'monthly',
  rental_rate: 0,
  security_deposit: 0,
  start_date: new Date().toISOString().slice(0, 10),
  end_date: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().slice(0, 10),
  initial_condition: '',
  initial_meter_reading: 0,
  terms_and_conditions: '',
})

const emptyInvoiceDetails = (): RentalInvoiceCreatePayload => ({
  worked_hours: 0,
  setup_fee: 0,
  service_fee: 0,
  shipping_fee: 0,
  application_fee: 0,
  tax_rate: 0,
  discount_amount: 0,
  payment_method: 'bank_transfer',
  due_date: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().slice(0, 10),
  notes: '',
})

const Rentals = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
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

  const [actionAnchor, setActionAnchor] = useState<HTMLElement | null>(null)
  const [actionAgreement, setActionAgreement] = useState<Rental | null>(null)

  const tab = Math.max(0, ROUTE_TABS.findIndex(path => location.pathname === path || location.pathname.startsWith(`${path}/`)))

  useEffect(() => {
    if (location.pathname === '/rentals') navigate('/rentals/agreements', { replace: true })
  }, [location.pathname, navigate])

  const facilitiesQ = useQuery({ queryKey: ['rental-facilities'], queryFn: () => fetchFacilities({ limit: 500 }) })
  const partsQ = useQuery({ queryKey: ['rental-parts', search], queryFn: () => fetchRentalParts(search || undefined) })
  const rentalsQ = useQuery({ queryKey: ['rental-agreements', search], queryFn: () => fetchRentals({ search: search || undefined }) })
  const invoicesQ = useQuery({ queryKey: ['rental-invoices'], queryFn: () => fetchRentalInvoices() })
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
      customer_phone: rental.customer_phone,
      customer_address: rental.customer_address,
      billing_frequency: rental.billing_frequency,
      rental_rate: Number(rental.rental_rate),
      security_deposit: Number(rental.security_deposit),
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
      }))
      if (part.facility_id) {
        const fac = facilities.find(f => f.id === part.facility_id)
        if (fac) {
          setAgreementForm(prev => ({
            ...prev,
            customer_name: fac.billing_name || fac.name || prev.customer_name,
            customer_email: fac.billing_email || fac.email || prev.customer_email,
            customer_phone: fac.phone || prev.customer_phone,
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
    saveAgreementMut.mutate()
  }

  const openActions = (event: MouseEvent<HTMLElement>, rental: Rental) => {
    setActionAnchor(event.currentTarget)
    setActionAgreement(rental)
  }

  const closeActions = () => {
    setActionAnchor(null)
    setActionAgreement(null)
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
    const freq = convertAgreement.billing_frequency
    if (freq === 'daily') {
      return durationDays * rate
    } else if (freq === 'weekly') {
      return Math.ceil(durationDays / 7) * rate
    } else if (freq === 'monthly') {
      return Math.ceil(durationDays / 30) * rate
    }
    return durationDays * rate
  }, [convertAgreement, durationDays])

  const convertTaxAmount = calculatedBaseRental * Number(invoiceDetails.tax_rate || 0) / 100
  const convertGrandTotal =
    calculatedBaseRental +
    Number(invoiceDetails.worked_hours || 0) +
    Number(invoiceDetails.setup_fee || 0) +
    Number(invoiceDetails.service_fee || 0) +
    Number(invoiceDetails.shipping_fee || 0) +
    Number(invoiceDetails.application_fee || 0) +
    convertTaxAmount -
    Number(invoiceDetails.discount_amount || 0)

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

  const renderAgreementsTable = (items: Rental[], emptyText: string) => (
    <TableContainer>
      <Table>
        <TableHead>
          <TableRow sx={{ bgcolor: '#F9FAFB' }}>
            <TableCell sx={{ fontWeight: 900 }}>Agreement #</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Product / Part</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Customer</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Rate</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Frequency</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Start Date</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>End Date</TableCell>
            <TableCell sx={{ fontWeight: 900 }}>Status</TableCell>
            <TableCell align="right" sx={{ fontWeight: 900 }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rentalsQ.isLoading ? Array.from({ length: 5 }).map((_, index) => (
            <TableRow key={index}><TableCell colSpan={9}><Skeleton /></TableCell></TableRow>
          )) : items.length === 0 ? (
            <TableRow><TableCell colSpan={9} align="center" sx={{ py: 5, color: '#6B7280', fontWeight: 700 }}>{emptyText}</TableCell></TableRow>
          ) : items.map(item => {
            const status = statusChip(item.status)
            return (
              <TableRow key={item.id} hover>
                <TableCell sx={{ fontFamily: 'monospace', color: '#1D4ED8', fontWeight: 900 }}>{item.rental_number}</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>
                  {item.part_number ? `${item.part_number} - ${item.part_description || ''}` : '-'}
                </TableCell>
                <TableCell sx={{ fontWeight: 800 }}>{item.customer_name}</TableCell>
                <TableCell sx={{ color: '#047857', fontWeight: 800 }}>{money(item.rental_rate)}</TableCell>
                <TableCell sx={{ textTransform: 'capitalize' }}>{item.billing_frequency}</TableCell>
                <TableCell>{formatDate(item.start_date)}</TableCell>
                <TableCell>{formatDate(item.end_date)}</TableCell>
                <TableCell>
                  <Chip size="small" label={item.status} sx={{ bgcolor: status.bg, color: status.color, fontWeight: 900, textTransform: 'uppercase' }} />
                </TableCell>
                <TableCell align="right">
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                    <Button size="small" variant="outlined" startIcon={<VisibilityIcon />} onClick={() => setViewAgreement(item)} sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 900 }}>View</Button>
                    <IconButton onClick={(event) => openActions(event, item)} sx={{ bgcolor: '#F3F4F6' }}><MoreVertIcon /></IconButton>
                  </Box>
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
            return (
              <TableRow key={invoice.id} hover>
                <TableCell sx={{ fontFamily: 'monospace', color: '#1D4ED8', fontWeight: 900 }}>{invoice.invoice_number}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace', fontWeight: 800 }}>{invoice.rental_number || '-'}</TableCell>
                <TableCell sx={{ fontWeight: 800 }}>{invoice.customer_name}</TableCell>
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

  const renderProducts = () => (
    <TableContainer>
      <Table>
        <TableHead>
          <TableRow sx={{ bgcolor: '#F9FAFB' }}>
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
            <TableRow key={index}><TableCell colSpan={8}><Skeleton /></TableCell></TableRow>
          )) : parts.length === 0 ? (
            <TableRow><TableCell colSpan={8} align="center" sx={{ py: 5, color: '#6B7280', fontWeight: 700 }}>No rental products found.</TableCell></TableRow>
          ) : parts.map(part => (
            <TableRow key={part.id} hover>
              <TableCell sx={{ fontFamily: 'monospace', fontWeight: 900 }}>{part.part_number}</TableCell>
              <TableCell sx={{ fontWeight: 800 }}>{part.description}</TableCell>
              <TableCell>{part.facility_name || 'Global / Independent'}</TableCell>
              <TableCell>{[part.make, part.model].filter(Boolean).join(' / ') || '-'}</TableCell>
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
    <TableContainer>
      <Table>
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
              <TableCell sx={{ fontFamily: 'monospace', color: '#1D4ED8', fontWeight: 900 }}>{item.rental_number}</TableCell>
              <TableCell sx={{ fontWeight: 800 }}>{item.customer_name}</TableCell>
              <TableCell>{item.facility_name || '-'}</TableCell>
              <TableCell>{item.part_number ? `${item.part_number} - ${item.part_description || ''}` : '-'}</TableCell>
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

      <Menu anchorEl={actionAnchor} open={Boolean(actionAnchor)} onClose={closeActions}>
        <MenuItem disabled={!actionAgreement || actionAgreement.status === 'completed'} onClick={() => actionAgreement && openReturnDialog(actionAgreement)}>
          Return Equipment
        </MenuItem>
        <MenuItem disabled={!actionAgreement || Boolean(actionAgreement.converted_invoice_id)} onClick={() => actionAgreement && openConvertDialog(actionAgreement)}>
          Convert to Invoice
        </MenuItem>
        <MenuItem disabled={!actionAgreement || actionAgreement.status === 'completed'} onClick={() => actionAgreement && openEdit(actionAgreement)}>
          Edit
        </MenuItem>
        <MenuItem onClick={() => { if (actionAgreement) setViewAgreement(actionAgreement); closeActions() }}>
          View Details
        </MenuItem>
        <MenuItem disabled={!actionAgreement || Boolean(actionAgreement.converted_invoice_id)} onClick={() => actionAgreement && deleteAgreementMut.mutate(actionAgreement.id)} sx={{ color: '#DC2626' }}>
          Delete
        </MenuItem>
      </Menu>

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
                      {p.part_number} - {p.description} (Stock: {p.quantity_on_hand}, Rate: {money(p.unit_price)})
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
            <TextField label="Customer Phone" value={agreementForm.customer_phone} onChange={e => setAgreementForm(prev => ({ ...prev, customer_phone: e.target.value }))} />
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
            
            <TextField label="Start Date" type="date" value={agreementForm.start_date} onChange={e => setAgreementForm(prev => ({ ...prev, start_date: e.target.value }))} InputLabelProps={{ shrink: true }} />
            <TextField label="End Date" type="date" value={agreementForm.end_date} onChange={e => setAgreementForm(prev => ({ ...prev, end_date: e.target.value }))} InputLabelProps={{ shrink: true }} />
            
            <TextField label="Customer Address" value={agreementForm.customer_address} onChange={e => setAgreementForm(prev => ({ ...prev, customer_address: e.target.value }))} sx={{ gridColumn: '1 / -1' }} />
            
            <TextField label="Initial Condition" value={agreementForm.initial_condition || ''} onChange={e => setAgreementForm(prev => ({ ...prev, initial_condition: e.target.value }))} />
            <TextField label="Initial Meter Reading" type="number" value={agreementForm.initial_meter_reading || 0} onChange={e => setAgreementForm(prev => ({ ...prev, initial_meter_reading: Number(e.target.value) }))} />
            
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
                        <TableCell>{convertAgreement.customer_phone || '-'}</TableCell>
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
                        <TableCell sx={{ fontWeight: 900 }}>Duration Days</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 900 }}>Rental Base Total</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 800 }}>{convertAgreement.part_number ? `${convertAgreement.part_number} - ${convertAgreement.part_description || ''}` : '-'}</TableCell>
                        <TableCell sx={{ textTransform: 'capitalize' }}>{convertAgreement.billing_frequency}</TableCell>
                        <TableCell>{money(convertAgreement.rental_rate)}</TableCell>
                        <TableCell>{durationDays} day(s)</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 900, color: '#047857' }}>{money(calculatedBaseRental)}</TableCell>
                      </TableRow>
                      {[
                        ['Security Deposit Paid', Number(convertAgreement.security_deposit || 0)],
                        ['Technician Setup Hours', Number(invoiceDetails.worked_hours || 0)],
                        ['Setup Fee', Number(invoiceDetails.setup_fee || 0)],
                        ['Service Fee', Number(invoiceDetails.service_fee || 0)],
                        ['Shipping Fee', Number(invoiceDetails.shipping_fee || 0)],
                        ['Application Fee', Number(invoiceDetails.application_fee || 0)],
                        ['Tax Amount', convertTaxAmount],
                      ].map(([label, value]) => (
                        <TableRow key={String(label)}>
                          <TableCell colSpan={4} align="right" sx={{ fontWeight: 900, color: '#4B5563' }}>{label}</TableCell>
                          <TableCell align="right">{money(value as number)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow sx={{ bgcolor: '#EFF6FF' }}>
                        <TableCell colSpan={4} align="right" sx={{ fontWeight: 900, fontSize: 15 }}>Grand Total Due</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 900, fontSize: 16, color: '#1E3A8A' }}>{money(convertGrandTotal)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </Card>
              </Box>

              <Card sx={{ borderRadius: '14px', border: `1px solid ${SYSTEM_PANEL_BORDER}`, p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 900, color: '#1E3A8A' }}>Configure Invoice</Typography>
                <TextField label="Worked Hours" type="number" size="small" value={invoiceDetails.worked_hours} onChange={e => setInvoiceDetails(p => ({ ...p, worked_hours: Number(e.target.value) }))} />
                <TextField label="Setup Fee" type="number" size="small" value={invoiceDetails.setup_fee} onChange={e => setInvoiceDetails(p => ({ ...p, setup_fee: Number(e.target.value) }))} />
                <TextField label="Service Fee" type="number" size="small" value={invoiceDetails.service_fee} onChange={e => setInvoiceDetails(p => ({ ...p, service_fee: Number(e.target.value) }))} />
                <TextField label="Shipping Fee" type="number" size="small" value={invoiceDetails.shipping_fee} onChange={e => setInvoiceDetails(p => ({ ...p, shipping_fee: Number(e.target.value) }))} />
                <TextField label="Application Fee" type="number" size="small" value={invoiceDetails.application_fee} onChange={e => setInvoiceDetails(p => ({ ...p, application_fee: Number(e.target.value) }))} />
                <TextField label="Tax Rate (%)" type="number" size="small" value={invoiceDetails.tax_rate} onChange={e => setInvoiceDetails(p => ({ ...p, tax_rate: Number(e.target.value) }))} />
                <TextField label="Discount Amount" type="number" size="small" value={invoiceDetails.discount_amount} onChange={e => setInvoiceDetails(p => ({ ...p, discount_amount: Number(e.target.value) }))} />
                
                <TextField select label="Payment Method" size="small" value={invoiceDetails.payment_method} onChange={e => setInvoiceDetails(p => ({ ...p, payment_method: e.target.value }))}>
                  <MenuItem value="credit_card">Credit Card</MenuItem>
                  <MenuItem value="cheque">Cheque</MenuItem>
                  <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
                </TextField>

                <TextField label="Invoice Due Date" type="date" size="small" value={invoiceDetails.due_date} onChange={e => setInvoiceDetails(p => ({ ...p, due_date: e.target.value }))} InputLabelProps={{ shrink: true }} />
                <TextField label="Billing Notes" size="small" multiline rows={2} value={invoiceDetails.notes} onChange={e => setInvoiceDetails(p => ({ ...p, notes: e.target.value }))} />
              </Card>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setConvertAgreement(null)} sx={{ fontWeight: 900 }}>Cancel</Button>
          <Button variant="contained" startIcon={<ReceiptLongIcon />} onClick={() => convertAgreement && convertMut.mutate({ id: convertAgreement.id, data: invoiceDetails })} sx={{ borderRadius: '12px', fontWeight: 900, textTransform: 'none', background: SYSTEM_GRADIENT }}>
            Generate Rental Invoice
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
                  <Typography sx={{ fontWeight: 800 }}>{viewAgreement.customer_email} / {viewAgreement.customer_phone || '-'}</Typography>
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
