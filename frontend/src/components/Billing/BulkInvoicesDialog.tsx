/**
 * Bulk invoices in Billing: the list, and one bulk invoice in full.
 *
 * The list shows every bulk invoice with what it owes and where it stands.
 * One opens to the document as the customer sees it (front page, then each
 * invoice), its payments, and what can be done with it: send it by email or
 * copy its link, print it, change what is in it, cancel it (before any
 * payment). A Super Admin can record a payment on it, or take a card.
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton,
  InputAdornment, MenuItem, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import BlockRoundedIcon from '@mui/icons-material/BlockRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import CreditCardRoundedIcon from '@mui/icons-material/CreditCardRounded'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined'
import LinkRoundedIcon from '@mui/icons-material/LinkRounded'
import MoveToInboxRoundedIcon from '@mui/icons-material/MoveToInboxRounded'
import PriceCheckRoundedIcon from '@mui/icons-material/PriceCheckRounded'
import PrintRoundedIcon from '@mui/icons-material/PrintRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import SyncRoundedIcon from '@mui/icons-material/SyncRounded'
import { toast } from 'react-toastify'
import {
  cancelBulkInvoice,
  fetchBulkInvoice,
  fetchBulkInvoices,
  recordBulkPayment,
  sendBulkInvoice,
  settleBulkInvoice,
  type BulkInvoiceDetail,
  type BulkInvoiceRow,
  type BulkInvoiceStatus,
} from '@/api/bulkInvoices'
import CardPaymentPanel from '@/components/Billing/CardPaymentPanel'
import ServiceInvoiceFrame from '@/components/Billing/ServiceInvoiceFrame'
import BulkInvoiceWorkspace from '@/components/Billing/BulkInvoiceWorkspace'
import { buildBulkInvoiceHtml } from '@/utils/bulkInvoiceHtml'
import { printHtmlDocument } from '@/utils/printHtmlDocument'

const GRADIENT = 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)'

const money = (value: string | number | null | undefined) =>
  `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const when = (value?: string | null) => {
  if (!value) return '-'
  const parsed = new Date(/Z|[+-]\d{2}:\d{2}$/.test(value) || value.length <= 10 ? value : `${value}Z`)
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export const BULK_STATUS: Record<BulkInvoiceStatus, { label: string; bg: string; color: string }> = {
  draft: { label: 'Draft', bg: '#F1F5F9', color: '#475569' },
  sent: { label: 'Sent', bg: '#DBEAFE', color: '#1D4ED8' },
  partially_paid: { label: 'Partially paid', bg: '#FEF3C7', color: '#B45309' },
  paid: { label: 'Paid', bg: '#D1FAE5', color: '#047857' },
  cancelled: { label: 'Cancelled', bg: '#FEE2E2', color: '#B91C1C' },
}

const RECORD_METHODS = [
  { value: 'cheque', label: 'Cheque' },
  { value: 'ach', label: 'ACH' },
  { value: 'mbmts_ach', label: 'MBMTS ACH' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'credit_card', label: 'Card (taken elsewhere)' },
  { value: 'other', label: 'Other' },
]

const StatusChip = ({ status, attention }: { status: BulkInvoiceStatus; attention?: boolean }) => {
  const style = BULK_STATUS[status] || BULK_STATUS.draft
  return (
    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
      <Chip size="small" label={style.label} sx={{ fontWeight: 800, bgcolor: style.bg, color: style.color }} />
      {attention && <Chip size="small" label="Needs attention" sx={{ fontWeight: 800, bgcolor: '#FEE2E2', color: '#B91C1C' }} />}
    </Box>
  )
}

const errorText = (error: any, fallback: string) => {
  const detail = error?.response?.data?.detail
  return typeof detail === 'string' ? detail : fallback
}

const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? crypto.randomUUID().replace(/-/g, '')
  : `${Date.now()}${Math.random().toString(16).slice(2)}`).padEnd(24, '0')

interface Props {
  open: boolean
  onClose: () => void
  /** Open straight to a new bulk invoice. */
  startNew?: boolean
  /** Open straight to this bulk invoice (by number), e.g. from a notification. */
  openNumber?: string | null
  isSuperAdmin: boolean
  /** Billing's lists changed: invoices were paid, or went in or out of a bulk invoice. */
  onChanged: () => void
}

const BulkInvoicesDialog = ({ open, onClose, startNew, openNumber, isSuperAdmin, onChanged }: Props) => {
  const queryClient = useQueryClient()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'' | BulkInvoiceStatus>('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [workspace, setWorkspace] = useState<{ bulk: BulkInvoiceDetail | null } | null>(null)
  const [sendOpen, setSendOpen] = useState(false)
  const [sendEmail, setSendEmail] = useState('')
  const [recordOpen, setRecordOpen] = useState(false)
  const [record, setRecord] = useState({ amount: '', method: 'cheque', reference: '', notes: '', key: '' })
  const [cardOpen, setCardOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [html, setHtml] = useState('')

  useEffect(() => {
    if (!open) return
    setSelectedId(null)
    setStatus('')
    setSearchInput(openNumber || '')
    setSearch(openNumber || '')
    setWorkspace(startNew ? { bulk: null } : null)
  }, [open, startNew, openNumber])

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const listQ = useQuery({
    queryKey: ['bulk-invoices', search, status],
    queryFn: () => fetchBulkInvoices({ search, status }),
    enabled: open,
    staleTime: 0,
  })
  const rows = listQ.data || []

  // Opened from a link to one bulk invoice: go straight to it.
  useEffect(() => {
    if (!open || !openNumber || selectedId != null || !listQ.data) return
    const match = listQ.data.find(row => row.bulk_number === openNumber)
    if (match) setSelectedId(match.id)
  }, [open, openNumber, listQ.data, selectedId])

  const detailQ = useQuery({
    queryKey: ['bulk-invoice', selectedId],
    queryFn: () => fetchBulkInvoice(selectedId!),
    enabled: open && selectedId != null,
    staleTime: 0,
  })
  const bulk = selectedId != null ? detailQ.data : undefined

  useEffect(() => {
    let current = true
    setHtml('')
    if (bulk?.document) {
      buildBulkInvoiceHtml(bulk.document)
        .then((built) => { if (current) setHtml(built) })
        .catch(() => { if (current) toast.error('The bulk invoice could not be shown') })
    }
    return () => { current = false }
  }, [bulk?.document])

  const refresh = (detail?: BulkInvoiceDetail) => {
    if (detail) queryClient.setQueryData(['bulk-invoice', detail.id], detail)
    void queryClient.invalidateQueries({ queryKey: ['bulk-invoices'] })
    void queryClient.invalidateQueries({ queryKey: ['bulk-invoice'] })
    onChanged()
  }

  const send = useMutation({
    mutationFn: (channel: 'email' | 'link') => sendBulkInvoice(bulk!.id, { channel, email: channel === 'email' ? sendEmail.trim() : null }),
    onSuccess: async (result, channel) => {
      refresh(result)
      setSendOpen(false)
      if (channel === 'link') {
        try {
          await navigator.clipboard.writeText(result.share_url)
          toast.success('Link copied. It works for 90 days.')
        } catch {
          window.prompt('Copy the bulk invoice link:', result.share_url)
        }
      } else {
        toast.success(`${result.bulk_number} sent to ${result.email}`)
      }
    },
    onError: (error: any) => toast.error(errorText(error, 'The bulk invoice could not be sent')),
  })

  const recordMut = useMutation({
    mutationFn: () => recordBulkPayment(bulk!.id, {
      amount: record.amount,
      payment_method: record.method,
      reference: record.reference.trim() || undefined,
      notes: record.notes.trim() || undefined,
      idempotency_key: record.key,
    }),
    onSuccess: (detail) => {
      refresh(detail)
      setRecordOpen(false)
      toast.success(detail.status === 'paid'
        ? `${detail.bulk_number} is paid in full; its invoices are marked paid`
        : `Payment recorded. ${money(detail.balance_due)} left to pay.`)
    },
    onError: (error: any) => toast.error(errorText(error, 'The payment could not be recorded')),
  })

  const cancelMut = useMutation({
    mutationFn: () => cancelBulkInvoice(bulk!.id),
    onSuccess: (detail) => {
      refresh(detail)
      setCancelOpen(false)
      toast.success(`${detail.bulk_number} cancelled. Its invoices can be paid on their own again.`)
    },
    onError: (error: any) => toast.error(errorText(error, 'The bulk invoice could not be cancelled')),
  })

  const settleMut = useMutation({
    mutationFn: () => settleBulkInvoice(bulk!.id),
    onSuccess: (detail) => {
      refresh(detail)
      toast.success('Its invoices are marked paid')
    },
    onError: (error: any) => {
      toast.error(errorText(error, 'Its invoices could not be marked paid'))
      void detailQ.refetch()
    },
  })

  const counts = useMemo(() => {
    const balance = rows.filter(row => row.status !== 'cancelled').reduce((sum, row) => sum + Number(row.balance_due || 0), 0)
    return { balance, open: rows.filter(row => ['draft', 'sent', 'partially_paid'].includes(row.status)).length }
  }, [rows])

  const openRecord = () => {
    setRecord({ amount: Number(bulk?.balance_due || 0).toFixed(2), method: 'cheque', reference: '', notes: '', key: newKey() })
    setRecordOpen(true)
  }

  const recordAmount = Number(record.amount)
  const recordProblem = !record.amount || !(recordAmount > 0)
    ? 'Enter the amount received'
    : recordAmount > Number(bulk?.balance_due || 0) + 0.001
      ? `It cannot be more than the balance, ${money(bulk?.balance_due)}`
      : ''

  const list = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
        <TextField
          size="small"
          value={searchInput}
          onChange={event => setSearchInput(event.target.value)}
          placeholder="Search bulk invoice, facility or invoice number…"
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ color: '#7C3AED' }} /></InputAdornment> }}
          sx={{ minWidth: 300, flex: '1 1 300px', bgcolor: '#fff', '& fieldset': { borderRadius: '12px' } }}
        />
        {(['', 'draft', 'sent', 'partially_paid', 'paid', 'cancelled'] as const).map(value => (
          <Chip
            key={value || 'all'}
            label={value ? BULK_STATUS[value].label : 'All'}
            onClick={() => setStatus(value)}
            sx={{ fontWeight: 800, cursor: 'pointer', bgcolor: status === value ? '#7C3AED' : '#F3F4F6', color: status === value ? '#fff' : '#374151' }}
          />
        ))}
        <Button
          variant="contained"
          startIcon={<AddRoundedIcon />}
          onClick={() => setWorkspace({ bulk: null })}
          sx={{ ml: 'auto', borderRadius: '12px', fontWeight: 900, textTransform: 'none', background: GRADIENT }}
          data-new-bulk
        >
          New Bulk Invoice
        </Button>
      </Box>
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        <Chip label={`${counts.open} open`} sx={{ fontWeight: 800, bgcolor: '#EDE9FE', color: '#5B21B6' }} />
        <Chip label={`${money(counts.balance)} outstanding`} sx={{ fontWeight: 800, bgcolor: '#FEE2E2', color: '#B91C1C' }} />
      </Box>
      <Card sx={{ flex: 1, minHeight: 0, borderRadius: '18px', border: '1px solid #EEF0F6', boxShadow: 'none', display: 'flex', flexDirection: 'column' }}>
        <TableContainer sx={{ flex: 1, minHeight: 0 }}>
          <Table stickyHeader size="small" sx={{ minWidth: 860 }}>
            <TableHead>
              <TableRow>
                {['Bulk Invoice', 'Bill To', 'Facilities', 'Invoices', 'Total', 'Paid', 'Balance', 'Status', 'Created'].map(head => (
                  <TableCell key={head} align={['Total', 'Paid', 'Balance', 'Invoices'].includes(head) ? 'right' : 'left'}
                    sx={{ fontWeight: 900, color: '#475569', bgcolor: '#F9FAFB', whiteSpace: 'nowrap' }}>{head}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {listQ.isLoading ? (
                <TableRow><TableCell colSpan={9} align="center" sx={{ py: 6 }}><CircularProgress /></TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={9} align="center" sx={{ py: 6, color: '#64748B', fontWeight: 800 }}>
                  {search || status ? 'No bulk invoices match.' : 'No bulk invoices yet. Create one to send several invoices as one.'}
                </TableCell></TableRow>
              ) : rows.map((row: BulkInvoiceRow) => (
                <TableRow key={row.id} hover onClick={() => setSelectedId(row.id)} sx={{ cursor: 'pointer' }} data-bulk-row={row.bulk_number}>
                  <TableCell sx={{ fontFamily: 'monospace', fontWeight: 800, color: '#5B21B6', whiteSpace: 'nowrap' }}>{row.bulk_number}</TableCell>
                  <TableCell sx={{ fontWeight: 800, color: '#1E1B4B' }}>{row.bill_to_name}</TableCell>
                  <TableCell sx={{ color: '#475569', maxWidth: 240 }}>
                    <Tooltip title={row.facilities.join(', ')}><Typography noWrap sx={{ fontSize: 13.5 }}>{row.facilities.join(', ') || '-'}</Typography></Tooltip>
                  </TableCell>
                  <TableCell align="right">{row.invoice_count}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{money(row.total_amount)}</TableCell>
                  <TableCell align="right" sx={{ color: '#059669', fontWeight: 800, whiteSpace: 'nowrap' }}>{money(row.amount_paid)}</TableCell>
                  <TableCell align="right" sx={{ color: Number(row.balance_due) > 0 ? '#DC2626' : '#059669', fontWeight: 800, whiteSpace: 'nowrap' }}>{money(row.balance_due)}</TableCell>
                  <TableCell><StatusChip status={row.status} attention={row.needs_attention} /></TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', color: '#64748B' }}>{when(row.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </Box>
  )

  const isOpenBulk = bulk ? ['draft', 'sent', 'partially_paid'].includes(bulk.status) : false
  const detail = bulk ? (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '380px 1fr' }, gap: 2, minHeight: 0, height: '100%' }}>
      <Box sx={{ display: 'grid', alignContent: 'start', gap: 1.5, overflowY: 'auto', minHeight: 0, pr: 0.5 }}>
        <Card sx={{ p: 2, borderRadius: '18px', border: '1px solid #EEF0F6', boxShadow: 'none' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
            <Box>
              <Typography sx={{ fontFamily: 'monospace', fontWeight: 900, color: '#5B21B6', fontSize: 18 }}>{bulk.bulk_number}</Typography>
              <Typography sx={{ color: '#64748B', fontSize: 12.5, fontWeight: 700 }}>Created {when(bulk.created_at)}{bulk.created_by ? ` by ${bulk.created_by}` : ''}</Typography>
            </Box>
            <StatusChip status={bulk.status} attention={bulk.needs_attention} />
          </Box>
          <Divider sx={{ my: 1.5 }} />
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, textAlign: 'center' }}>
            {[['Total', bulk.total_amount, '#1E1B4B'], ['Paid', bulk.amount_paid, '#059669'], ['Balance', bulk.balance_due, Number(bulk.balance_due) > 0 ? '#DC2626' : '#059669']].map(([label, value, color]) => (
              <Box key={label} sx={{ p: 1, borderRadius: '12px', bgcolor: '#F8FAFC' }}>
                <Typography sx={{ color: '#64748B', fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>{label}</Typography>
                <Typography sx={{ fontWeight: 950, color, fontSize: 16 }} data-bulk-figure={label}>{money(value)}</Typography>
              </Box>
            ))}
          </Box>
          <Typography sx={{ mt: 1.5, color: '#475569', fontSize: 13, fontWeight: 700 }}>
            {bulk.invoice_count} invoice{bulk.invoice_count === 1 ? '' : 's'} · {bulk.facilities.join(', ')}
          </Typography>
        </Card>

        {bulk.needs_attention && (
          <Alert severity="error" sx={{ borderRadius: '14px' }}
            action={bulk.can_settle ? (
              <Button color="inherit" size="small" startIcon={<SyncRoundedIcon />} disabled={settleMut.isPending} onClick={() => settleMut.mutate()} sx={{ fontWeight: 900 }}>Settle</Button>
            ) : undefined}>
            Paid in full, but its invoices could not be marked paid: {bulk.settlement_error}
          </Alert>
        )}
        {!bulk.needs_attention && bulk.can_settle && (
          <Alert severity="warning" sx={{ borderRadius: '14px' }}
            action={<Button color="inherit" size="small" startIcon={<SyncRoundedIcon />} disabled={settleMut.isPending} onClick={() => settleMut.mutate()} sx={{ fontWeight: 900 }}>Settle</Button>}>
            Nothing is left to pay; its invoices can now be marked paid.
          </Alert>
        )}
        {bulk.busy && <Alert severity="warning" sx={{ borderRadius: '14px' }}>{bulk.busy}</Alert>}
        {bulk.being_updated && (
          <Alert severity="info" sx={{ borderRadius: '14px' }}>An invoice in it waits for billing approval. It cannot be sent or paid until that invoice is approved.</Alert>
        )}

        <Card sx={{ p: 2, borderRadius: '18px', border: '1px solid #EEF0F6', boxShadow: 'none' }}>
          <Typography sx={{ fontWeight: 900, color: '#1E1B4B', mb: 0.5 }}>Bill To</Typography>
          <Typography sx={{ fontWeight: 800, color: '#334155' }}>{bulk.bill_to_name}</Typography>
          {bulk.bill_to_email && <Typography sx={{ color: '#64748B', fontSize: 13 }}>{bulk.bill_to_email}</Typography>}
          {bulk.bill_to_address && <Typography sx={{ color: '#64748B', fontSize: 13, whiteSpace: 'pre-line' }}>{bulk.bill_to_address}</Typography>}
          {bulk.public_link_sent_at && (
            <Typography sx={{ mt: 1, color: '#475569', fontSize: 12.5, fontWeight: 700 }}>
              Link sent {when(bulk.public_link_sent_at)}{bulk.public_link_email ? ` to ${bulk.public_link_email}` : ''}{bulk.public_link_expires_at ? `; works until ${when(bulk.public_link_expires_at)}` : ''}
            </Typography>
          )}
        </Card>

        <Card sx={{ p: 2, borderRadius: '18px', border: '1px solid #EEF0F6', boxShadow: 'none' }}>
          <Typography sx={{ fontWeight: 900, color: '#1E1B4B', mb: 1 }}>Payments</Typography>
          {bulk.payments.length === 0 ? (
            <Typography sx={{ color: '#64748B', fontSize: 13 }}>None yet.</Typography>
          ) : bulk.payments.map(payment => (
            <Box key={payment.id} sx={{ py: 0.75, borderTop: '1px dashed #EEF0F6' }} data-bulk-payment>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                <Typography sx={{ fontWeight: 800, color: '#334155', fontSize: 13.5 }}>{payment.method_label}{payment.card_last4 ? ` ····${payment.card_last4}` : ''}</Typography>
                <Typography sx={{ fontWeight: 900, color: '#059669', fontSize: 13.5 }}>{money(payment.amount)}</Typography>
              </Box>
              <Typography sx={{ color: '#64748B', fontSize: 12 }}>
                {when(payment.paid_at)}{payment.reference_number ? ` · Ref ${payment.reference_number}` : ''}
                {Number(payment.card_fee_amount) > 0 ? ` · + ${money(payment.card_fee_amount)} card fee` : ''}
                {payment.recorded_by ? ` · ${payment.recorded_by}` : payment.payer_name ? ` · ${payment.payer_name}` : ''}
              </Typography>
            </Box>
          ))}
        </Card>
      </Box>

      <Card sx={{ borderRadius: '18px', border: '1px solid #EEF0F6', boxShadow: 'none', overflow: 'auto', minHeight: 0, bgcolor: '#EEF0F6' }}>
        {html
          ? <ServiceInvoiceFrame html={html} title={`Bulk invoice ${bulk.bulk_number}`} />
          : <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress /></Box>}
      </Card>
    </Box>
  ) : null

  return (
    <>
      <Dialog open={open} onClose={onClose} fullScreen PaperProps={{ sx: { bgcolor: '#F7F6FC' } }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Box sx={{ px: { xs: 2, md: 3 }, py: 2, background: GRADIENT, color: '#fff', display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            {selectedId != null ? (
              <IconButton onClick={() => setSelectedId(null)} sx={{ color: '#fff' }} aria-label="Back to the list"><ArrowBackRoundedIcon /></IconButton>
            ) : <MoveToInboxRoundedIcon sx={{ fontSize: 32 }} />}
            <Box sx={{ flex: 1, minWidth: 200 }}>
              <Typography sx={{ fontWeight: 950, fontSize: { xs: 18, md: 22 } }}>{bulk ? `Bulk Invoice ${bulk.bulk_number}` : 'Bulk Invoices'}</Typography>
              <Typography sx={{ opacity: 0.9, fontWeight: 700, fontSize: 13 }}>
                {bulk ? 'One invoice for several: the customer sees a front page and every invoice, and pays it once.' : 'Several invoices, of one or more facilities, sent and paid as one.'}
              </Typography>
            </Box>
            {bulk && (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button startIcon={<PrintRoundedIcon />} disabled={!html} onClick={() => printHtmlDocument(`Invoice ${bulk.bulk_number}`, html)} sx={{ color: '#fff', fontWeight: 800 }}>Print</Button>
                {isOpenBulk && (
                  <>
                    <Button startIcon={<LinkRoundedIcon />} disabled={!bulk.can_send || send.isPending} onClick={() => send.mutate('link')} sx={{ color: '#fff', fontWeight: 800 }}>Copy Link</Button>
                    <Button startIcon={<EmailOutlinedIcon />} disabled={!bulk.can_send} onClick={() => { setSendEmail(bulk.public_link_email || bulk.bill_to_email || ''); setSendOpen(true) }} sx={{ color: '#fff', fontWeight: 800 }}>Send by Email</Button>
                    <Button startIcon={<EditOutlinedIcon />} disabled={!bulk.can_edit} onClick={() => setWorkspace({ bulk })} sx={{ color: '#fff', fontWeight: 800 }}>Edit</Button>
                  </>
                )}
                {isSuperAdmin && bulk.can_record_payment && (
                  <>
                    <Button variant="contained" startIcon={<PriceCheckRoundedIcon />} onClick={openRecord} sx={{ bgcolor: '#fff', color: '#5B21B6', fontWeight: 900, '&:hover': { bgcolor: '#F5F3FF' } }}>Record Payment</Button>
                    <Button variant="contained" startIcon={<CreditCardRoundedIcon />} onClick={() => setCardOpen(true)} sx={{ bgcolor: '#fff', color: '#5B21B6', fontWeight: 900, '&:hover': { bgcolor: '#F5F3FF' } }}>Pay by Card</Button>
                  </>
                )}
                {bulk.can_cancel && (
                  <Button startIcon={<BlockRoundedIcon />} onClick={() => setCancelOpen(true)} sx={{ color: '#fff', fontWeight: 800 }}>Cancel</Button>
                )}
              </Box>
            )}
            <IconButton onClick={onClose} sx={{ color: '#fff' }} aria-label="Close"><CloseRoundedIcon /></IconButton>
          </Box>
          <Box sx={{ flex: 1, minHeight: 0, p: { xs: 1.5, md: 2.5 } }}>
            {selectedId == null ? list : detailQ.isLoading || !bulk ? (
              detailQ.isError ? <Alert severity="error">{errorText(detailQ.error, 'The bulk invoice could not be loaded')}</Alert> : <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress /></Box>
            ) : detail}
          </Box>
        </Box>
      </Dialog>

      <BulkInvoiceWorkspace
        open={Boolean(workspace)}
        bulk={workspace?.bulk || null}
        onClose={() => {
          setWorkspace(null)
          if (startNew && selectedId == null && !workspace?.bulk) onClose()
        }}
        onSaved={(saved) => {
          setWorkspace(null)
          refresh(saved)
          setSelectedId(saved.id)
        }}
      />

      <Dialog open={sendOpen} onClose={() => !send.isPending && setSendOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '20px' } }}>
        <DialogTitle sx={{ fontWeight: 900 }}>Send {bulk?.bulk_number}</DialogTitle>
        <DialogContent dividers sx={{ display: 'grid', gap: 1.5 }}>
          <Typography sx={{ color: '#475569', fontWeight: 650 }}>
            The customer gets one email with a secure link to view every invoice and pay {money(bulk?.balance_due)} at once.
          </Typography>
          <TextField label="Email" value={sendEmail} onChange={event => setSendEmail(event.target.value)} autoFocus inputProps={{ maxLength: 320 }} />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setSendOpen(false)} disabled={send.isPending}>Cancel</Button>
          <Button variant="contained" onClick={() => send.mutate('email')} disabled={!sendEmail.trim() || send.isPending}
            startIcon={send.isPending ? <CircularProgress size={18} color="inherit" /> : <EmailOutlinedIcon />}
            sx={{ borderRadius: '12px', fontWeight: 900, background: GRADIENT }}>Send</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={recordOpen} onClose={() => !recordMut.isPending && setRecordOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '20px' } }}>
        <DialogTitle sx={{ fontWeight: 900 }}>
          Record Payment
          <Typography sx={{ color: '#64748B', fontSize: 13, fontWeight: 700 }}>{bulk?.bulk_number} · balance {money(bulk?.balance_due)}</Typography>
        </DialogTitle>
        <DialogContent dividers sx={{ display: 'grid', gap: 1.75 }}>
          <Typography sx={{ color: '#475569', fontWeight: 650, fontSize: 13.5, lineHeight: 1.5 }}>
            Recorded on the bulk invoice. When it is paid in full, each of its invoices is marked paid.
          </Typography>
          <TextField label="Amount received ($)" type="number" value={record.amount} onChange={event => setRecord(current => ({ ...current, amount: event.target.value }))}
            error={Boolean(recordProblem)} helperText={recordProblem || (recordAmount < Number(bulk?.balance_due || 0) ? 'Part of the balance: it will show as partially paid' : 'The whole balance')}
            inputProps={{ min: 0, step: 0.01 }} />
          <TextField select label="How it was paid" value={record.method} onChange={event => setRecord(current => ({ ...current, method: event.target.value }))}>
            {RECORD_METHODS.map(method => <MenuItem key={method.value} value={method.value}>{method.label}</MenuItem>)}
          </TextField>
          <TextField label="Reference (optional)" placeholder="Cheque number, transaction ID…" value={record.reference}
            onChange={event => setRecord(current => ({ ...current, reference: event.target.value }))} inputProps={{ maxLength: 120 }} />
          <TextField label="Note (optional)" value={record.notes} onChange={event => setRecord(current => ({ ...current, notes: event.target.value }))}
            multiline minRows={2} inputProps={{ maxLength: 1000 }} />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setRecordOpen(false)} disabled={recordMut.isPending}>Cancel</Button>
          <Button variant="contained" onClick={() => recordMut.mutate()} disabled={Boolean(recordProblem) || recordMut.isPending}
            startIcon={recordMut.isPending ? <CircularProgress size={18} color="inherit" /> : <PriceCheckRoundedIcon />}
            sx={{ borderRadius: '12px', fontWeight: 900, bgcolor: '#047857', '&:hover': { bgcolor: '#065F46' } }}>Record {record.amount ? money(record.amount) : ''}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={cardOpen} onClose={() => setCardOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '20px' } }}>
        <DialogTitle sx={{ fontWeight: 900 }}>Pay {bulk?.bulk_number} by card</DialogTitle>
        <DialogContent dividers>
          {bulk && cardOpen && (
            <CardPaymentPanel
              key={`bulk-${bulk.id}-${bulk.balance_due}`}
              target={{ kind: 'bulk', id: bulk.id, number: bulk.bulk_number }}
              onPaid={() => {
                setCardOpen(false)
                void detailQ.refetch()
                refresh()
              }}
            />
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}><Button onClick={() => setCardOpen(false)}>Close</Button></DialogActions>
      </Dialog>

      <Dialog open={cancelOpen} onClose={() => !cancelMut.isPending && setCancelOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '20px' } }}>
        <DialogTitle sx={{ fontWeight: 900 }}>Cancel {bulk?.bulk_number}?</DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ color: '#475569', fontWeight: 650, lineHeight: 1.6 }}>
            Its {bulk?.invoice_count} invoice{bulk?.invoice_count === 1 ? '' : 's'} go back to being paid on their own, and its link stops working. The invoices themselves do not change.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setCancelOpen(false)} disabled={cancelMut.isPending}>Keep it</Button>
          <Button variant="contained" color="error" onClick={() => cancelMut.mutate()} disabled={cancelMut.isPending}
            startIcon={cancelMut.isPending ? <CircularProgress size={18} color="inherit" /> : <BlockRoundedIcon />}
            sx={{ borderRadius: '12px', fontWeight: 900 }}>Cancel Bulk Invoice</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

export default BulkInvoicesDialog
