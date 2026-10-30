/**
 * Lease to Own, for staff.
 *
 * Every figure on this page comes from the server. The draft dialog asks the
 * backend to price the terms rather than doing the arithmetic here, so what
 * staff see while drafting is exactly what the customer will be shown and
 * charged. Customers never use this page; they act through the link they are
 * emailed.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControlLabel, Grid, IconButton, MenuItem, Paper,
  Stack, Switch, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination,
  TableRow, Tabs, TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import SendIcon from '@mui/icons-material/Send'
import { toast } from 'react-toastify'

import {
  cancelLease, cancelLeaseBuyout, collectLeaseNow, createLease, fetchLease, fetchLeasableProducts,
  fetchLeases, previewLeaseQuote, sendLease, startLeaseBuyout, updateLease,
  type LeaseDetail, type LeaseFrequency, type LeaseInput, type LeaseQuotePreview, type LeaseStage,
  type LeaseStatus,
} from '@/api/leases'
import SearchableSelect from '@/components/SearchableSelect'

const STAGE_LOOK: Record<LeaseStage, { label: string; color: 'default' | 'info' | 'warning' | 'success' | 'error' | 'primary' }> = {
  draft: { label: 'Draft', color: 'default' },
  sent: { label: 'Sent', color: 'info' },
  awaiting_signature: { label: 'Awaiting signature', color: 'info' },
  awaiting_down_payment: { label: 'Awaiting down payment', color: 'warning' },
  active: { label: 'Active', color: 'primary' },
  buyout_pending: { label: 'Buyout pending', color: 'warning' },
  in_default: { label: 'In default', color: 'error' },
  completed: { label: 'Owned', color: 'success' },
  cancelled: { label: 'Cancelled', color: 'default' },
}

const STATUS_TABS: Array<{ value: LeaseStatus | ''; label: string }> = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'sent', label: 'Sent' },
  { value: 'active', label: 'Active' },
  { value: 'in_default', label: 'In default' },
  { value: 'completed', label: 'Owned' },
  { value: 'cancelled', label: 'Cancelled' },
]

const FREQUENCIES: Array<{ value: LeaseFrequency; label: string }> = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'biweekly', label: 'Every two weeks' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'quarterly', label: 'Quarterly' },
]

const usd = (value?: string | number | null) => {
  const number = Number(value ?? 0)
  return number.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

const errorText = (error: unknown, fallback: string) => {
  const detail = (error as any)?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((d: any) => d?.msg).filter(Boolean).join('; ') || fallback
  return fallback
}

const StageChip = ({ stage }: { stage: LeaseStage }) => {
  const look = STAGE_LOOK[stage] ?? STAGE_LOOK.draft
  return <Chip size="small" label={look.label} color={look.color} variant={stage === 'completed' ? 'filled' : 'outlined'} />
}

const nextMonth = () => {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const emptyForm = (): LeaseInput => ({
  customer_name: '', customer_email: '', customer_phone: '', customer_address: '',
  part_id: 0, quantity: 1, unit_cash_price: null, markup_percent: '15', down_payment: '0',
  installment_count: 12, frequency: 'monthly', first_due_date: nextMonth(), tax_rate_percent: '8.25',
  grace_days: 5, late_fee_amount: '25.00', default_after_missed: 3, invoice_lead_days: 7, notes: '',
})

// ── Draft dialog ─────────────────────────────────────────────────────────────

function LeaseFormDialog({ open, editing, onClose, onSaved }: {
  open: boolean
  editing: LeaseDetail | null
  onClose: () => void
  onSaved: (lease: LeaseDetail) => void
}) {
  const [form, setForm] = useState<LeaseInput>(emptyForm())
  const [productSearch, setProductSearch] = useState('')
  const [preview, setPreview] = useState<LeaseQuotePreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setForm({
        customer_name: editing.customer_name, customer_email: editing.customer_email,
        customer_phone: editing.customer_phone ?? '', customer_address: editing.customer_address ?? '',
        facility_id: editing.facility_id, part_id: editing.part_id ?? 0, quantity: editing.quantity,
        unit_cash_price: editing.unit_cash_price, markup_percent: editing.markup_percent,
        down_payment: editing.down_payment, installment_count: editing.installment_count,
        frequency: editing.frequency, first_due_date: editing.first_due_date ?? nextMonth(),
        tax_rate_percent: editing.tax_rate_percent, grace_days: editing.grace_days,
        late_fee_amount: editing.late_fee_amount, default_after_missed: editing.default_after_missed,
        invoice_lead_days: editing.invoice_lead_days, notes: editing.notes ?? '',
      })
    } else {
      setForm(emptyForm())
    }
    setPreview(null)
    setPreviewError(null)
  }, [open, editing])

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ['leasable-products', productSearch],
    queryFn: () => fetchLeasableProducts(productSearch),
    enabled: open,
  })
  const product = products.find(p => p.id === form.part_id)

  const set = <K extends keyof LeaseInput>(key: K, value: LeaseInput[K]) => setForm(f => ({ ...f, [key]: value }))

  const unitPrice = form.unit_cash_price ?? product?.unit_price ?? ''
  const cashPrice = (Number(unitPrice || 0) * Number(form.quantity || 0)).toFixed(2)

  // Priced by the server, debounced, so the preview is the bill, not a guess.
  useEffect(() => {
    if (!open || Number(cashPrice) <= 0 || !form.first_due_date || !form.installment_count) {
      setPreview(null)
      return
    }
    const timer = window.setTimeout(() => {
      previewLeaseQuote({
        cash_price: cashPrice, markup_percent: form.markup_percent || '0', down_payment: form.down_payment || '0',
        installment_count: Number(form.installment_count), frequency: form.frequency,
        first_due_date: form.first_due_date, tax_rate_percent: form.tax_rate_percent || '0',
      })
        .then(result => { setPreview(result); setPreviewError(null) })
        .catch(error => { setPreview(null); setPreviewError(errorText(error, 'These terms cannot be offered')) })
    }, 350)
    return () => window.clearTimeout(timer)
  }, [open, cashPrice, form.markup_percent, form.down_payment, form.installment_count, form.frequency,
      form.first_due_date, form.tax_rate_percent])

  const save = useMutation({
    mutationFn: () => {
      const payload: LeaseInput = {
        ...form,
        unit_cash_price: form.unit_cash_price || null,
        customer_phone: form.customer_phone || null,
        customer_address: form.customer_address || null,
        notes: form.notes || null,
      }
      return editing ? updateLease(editing.id, payload) : createLease(payload)
    },
    onSuccess: lease => {
      toast.success(editing ? 'Agreement updated' : `Draft ${lease.agreement_number} created`)
      onSaved(lease)
    },
    onError: error => toast.error(errorText(error, 'Could not save the agreement')),
  })

  const canSave = form.customer_name.trim() && form.customer_email.includes('@') && form.part_id > 0
    && preview && !previewError

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>{editing ? `Edit ${editing.agreement_number}` : 'New lease-to-own agreement'}</DialogTitle>
      <DialogContent dividers>
        <Grid container spacing={3}>
          <Grid item xs={12} md={7}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Product</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <SearchableSelect
                  label="Product"
                  value={form.part_id || ''}
                  loading={productsLoading}
                  serverFiltered
                  onInputChange={setProductSearch}
                  options={products.map(p => ({
                    value: p.id,
                    label: `${p.part_number} — ${p.description}`,
                    secondary: `${usd(p.unit_price)} · ${p.quantity_available} available`,
                    disabled: p.quantity_available < 1,
                  }))}
                  onChange={value => setForm(f => ({ ...f, part_id: Number(value) || 0, unit_cash_price: null }))}
                  placeholder="Search sellable products"
                  noOptionsText="No sellable product matches"
                />
              </Grid>
              <Grid item xs={4}>
                <TextField label="Quantity" type="number" size="small" fullWidth value={form.quantity}
                  inputProps={{ min: 1 }}
                  onChange={e => set('quantity', Math.max(1, Number(e.target.value) || 1))}
                  helperText={product ? `${product.quantity_available} available` : ' '} />
              </Grid>
              <Grid item xs={8}>
                <TextField label="Cash price per unit" type="number" size="small" fullWidth
                  value={unitPrice} inputProps={{ min: 0, step: '0.01' }}
                  onChange={e => set('unit_cash_price', e.target.value || null)}
                  helperText="Defaults to the catalogue price" />
              </Grid>
            </Grid>

            <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 2, mb: 1 }}>Terms</Typography>
            <Grid container spacing={2}>
              <Grid item xs={6} sm={4}>
                <TextField label="Markup %" type="number" size="small" fullWidth value={form.markup_percent}
                  inputProps={{ min: 0, step: '0.01' }} onChange={e => set('markup_percent', e.target.value)} />
              </Grid>
              <Grid item xs={6} sm={4}>
                <TextField label="Down payment" type="number" size="small" fullWidth value={form.down_payment}
                  inputProps={{ min: 0, step: '0.01' }} onChange={e => set('down_payment', e.target.value)} />
              </Grid>
              <Grid item xs={6} sm={4}>
                <TextField label="Tax %" type="number" size="small" fullWidth value={form.tax_rate_percent}
                  inputProps={{ min: 0, step: '0.01' }} onChange={e => set('tax_rate_percent', e.target.value)} />
              </Grid>
              <Grid item xs={6} sm={4}>
                <TextField label="Installments" type="number" size="small" fullWidth value={form.installment_count}
                  inputProps={{ min: 1, max: 120 }}
                  onChange={e => set('installment_count', Math.max(1, Number(e.target.value) || 1))} />
              </Grid>
              <Grid item xs={6} sm={4}>
                <TextField select label="Frequency" size="small" fullWidth value={form.frequency}
                  onChange={e => set('frequency', e.target.value as LeaseFrequency)}>
                  {FREQUENCIES.map(f => <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField label="First payment due" type="date" size="small" fullWidth value={form.first_due_date}
                  InputLabelProps={{ shrink: true }} onChange={e => set('first_due_date', e.target.value)} />
              </Grid>
            </Grid>

            <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 2, mb: 1 }}>If payments are missed</Typography>
            <Grid container spacing={2}>
              <Grid item xs={6} sm={3}>
                <TextField label="Grace days" type="number" size="small" fullWidth value={form.grace_days}
                  inputProps={{ min: 0, max: 60 }} onChange={e => set('grace_days', Number(e.target.value) || 0)} />
              </Grid>
              <Grid item xs={6} sm={3}>
                <TextField label="Late fee" type="number" size="small" fullWidth value={form.late_fee_amount}
                  inputProps={{ min: 0, step: '0.01' }} onChange={e => set('late_fee_amount', e.target.value)} />
              </Grid>
              <Grid item xs={6} sm={3}>
                <TextField label="Default after" type="number" size="small" fullWidth value={form.default_after_missed}
                  inputProps={{ min: 1, max: 24 }} helperText="missed payments"
                  onChange={e => set('default_after_missed', Math.max(1, Number(e.target.value) || 1))} />
              </Grid>
              <Grid item xs={6} sm={3}>
                <TextField label="Invoice ahead" type="number" size="small" fullWidth value={form.invoice_lead_days}
                  inputProps={{ min: 0, max: 30 }} helperText="days before due"
                  onChange={e => set('invoice_lead_days', Number(e.target.value) || 0)} />
              </Grid>
            </Grid>

            <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 2, mb: 1 }}>Customer</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField label="Customer name" size="small" fullWidth required value={form.customer_name}
                  onChange={e => set('customer_name', e.target.value)} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="Email (the agreement is sent here)" size="small" fullWidth required
                  value={form.customer_email} onChange={e => set('customer_email', e.target.value)} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="Phone" size="small" fullWidth value={form.customer_phone ?? ''}
                  onChange={e => set('customer_phone', e.target.value)} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField label="Address" size="small" fullWidth value={form.customer_address ?? ''}
                  onChange={e => set('customer_address', e.target.value)} />
              </Grid>
              <Grid item xs={12}>
                <TextField label="Internal notes" size="small" fullWidth multiline minRows={2} value={form.notes ?? ''}
                  onChange={e => set('notes', e.target.value)} />
              </Grid>
            </Grid>
          </Grid>

          <Grid item xs={12} md={5}>
            <Paper variant="outlined" sx={{ p: 2, position: { md: 'sticky' }, top: 0 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>What the customer will see</Typography>
              <Typography variant="caption" color="text.secondary">Priced by the server, exactly as it will be billed.</Typography>
              {previewError && <Alert severity="error" sx={{ mt: 1.5 }}>{previewError}</Alert>}
              {!preview && !previewError && (
                <Typography color="text.secondary" sx={{ mt: 2 }}>Choose a product to see the terms.</Typography>
              )}
              {preview && (
                <Box sx={{ mt: 1.5 }}>
                  {[
                    ['Cash price', usd(preview.cash_price)],
                    ['Markup', usd(preview.markup_amount)],
                    ['Lease price', usd(preview.lease_price)],
                    ['Down payment (with tax)', usd(preview.down_payment_total)],
                    ['Total tax', usd(preview.total_tax)],
                  ].map(([label, value]) => (
                    <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25 }}>
                      <Typography variant="body2" color="text.secondary">{label}</Typography>
                      <Typography variant="body2">{value}</Typography>
                    </Box>
                  ))}
                  <Divider sx={{ my: 1 }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography sx={{ fontWeight: 800 }}>{preview.installments.length} payments of</Typography>
                    <Typography sx={{ fontWeight: 800 }}>{usd(preview.regular_installment)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>Total of payments</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{usd(preview.total_of_payments)}</Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary">Last payment {preview.final_due_date}</Typography>
                  <TableContainer sx={{ maxHeight: 260, mt: 1.5 }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell>#</TableCell><TableCell>Due</TableCell><TableCell align="right">Amount</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {preview.installments.map(i => (
                          <TableRow key={i.number}>
                            <TableCell>{i.number}</TableCell>
                            <TableCell>{i.due_date}</TableCell>
                            <TableCell align="right">{usd(i.total)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}
            </Paper>
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" disabled={!canSave || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Create draft'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── Detail dialog ────────────────────────────────────────────────────────────

function LeaseDetailDialog({ leaseId, onClose, onEdit }: {
  leaseId: number | null
  onClose: () => void
  onEdit: (lease: LeaseDetail) => void
}) {
  const qc = useQueryClient()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [deliveryLink, setDeliveryLink] = useState('')
  const [returnStock, setReturnStock] = useState(true)

  const { data: lease, isLoading, isError, error } = useQuery({
    queryKey: ['lease', leaseId],
    queryFn: () => fetchLease(leaseId as number),
    enabled: leaseId != null,
  })

  const refresh = (next?: LeaseDetail) => {
    if (next) qc.setQueryData(['lease', leaseId], next)
    qc.invalidateQueries({ queryKey: ['leases'] })
  }
  const action = (fn: () => Promise<any>, done: string) => ({
    mutationFn: fn,
    onSuccess: (result: any) => { toast.success(done); refresh(result?.lease ?? result) },
    onError: (e: unknown) => toast.error(errorText(e, 'That did not work')),
  })
  const send = useMutation({
    ...action(() => sendLease(leaseId as number), 'Agreement sent to the customer'),
    onSuccess: (result: LeaseDetail & { share_url?: string }) => {
      toast.success('Agreement sent to the customer')
      const { share_url: link, ...next } = result
      refresh(next as LeaseDetail)
      if (link) setDeliveryLink(link)
    },
  })
  const collect = useMutation(action(() => collectLeaseNow(leaseId as number), 'Collection run complete'))
  const buyout = useMutation(action(() => startLeaseBuyout(leaseId as number), 'Buyout invoice raised'))
  const withdraw = useMutation(action(() => cancelLeaseBuyout(leaseId as number), 'Buyout withdrawn'))
  const cancel = useMutation({
    ...action(() => cancelLease(leaseId as number, cancelReason, returnStock), 'Agreement cancelled'),
    onSettled: () => setCancelOpen(false),
  })

  const open = lease?.status ?? ''
  const busy = send.isPending || collect.isPending || buyout.isPending || withdraw.isPending || cancel.isPending

  return (
    <Dialog open={leaseId != null} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ flexGrow: 1 }}>
          {lease ? `${lease.agreement_number} — ${lease.customer_name}` : 'Agreement'}
        </Box>
        {lease && <StageChip stage={lease.stage} />}
        <IconButton onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {isLoading && <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>}
        {isError && <Alert severity="error">{errorText(error, 'Could not load the agreement')}</Alert>}
        {lease && (
          <Stack spacing={2}>
            {lease.status === 'in_default' && (
              <Alert severity="error">
                In default: {lease.default_after_missed} or more payments are missed and automatic charging has
                stopped. Contact the customer, then decide whether to recover the item or cancel.
              </Alert>
            )}
            {Number(lease.overpayment_amount ?? 0) > 0 && (
              <Alert severity="warning">
                The customer overpaid {usd(lease.overpayment_amount)} during their buyout. Refund it from Billing.
              </Alert>
            )}
            {lease.card_cleanup_pending && (
              <Alert severity="info">A replaced card is still being removed at Square; it can no longer be charged.</Alert>
            )}

            <Grid container spacing={2}>
              {[
                ['Item', `${lease.quantity} × ${lease.item_description}`],
                ['Cash price', usd(lease.cash_price)],
                ['Lease price', `${usd(lease.lease_price)} (${lease.markup_percent}% markup)`],
                ['Payments', `${lease.installments_paid} of ${lease.installment_count} × ${usd(lease.regular_installment)}`],
                ['Total of payments', usd(lease.total_of_payments)],
                ['Outstanding now', usd(lease.amount_outstanding)],
                ['Card', lease.card ? `${lease.card.brand ?? 'Card'} •••• ${lease.card.last4}${lease.auto_charge ? ' · auto-charge on' : ''}` : 'None saved'],
                ['Signed', lease.signed_at ? `${lease.signed_by_name} · ${new Date(lease.signed_at).toLocaleString()}` : 'Not yet'],
              ].map(([label, value]) => (
                <Grid item xs={12} sm={6} md={3} key={label}>
                  <Card variant="outlined">
                    <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                      <Typography variant="caption" color="text.secondary">{label}</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{value}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>

            {lease.buyout_quote && !lease.buyout_invoice && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>Early buyout today</Typography>
                <Typography variant="body2">
                  {usd(lease.buyout_quote.total)} — remaining cash price {usd(lease.buyout_quote.remaining_principal)}
                  {' '}plus tax {usd(lease.buyout_quote.tax)}
                  {Number(lease.buyout_quote.outstanding_fees) > 0 && ` and late fees ${usd(lease.buyout_quote.outstanding_fees)}`}.
                  {' '}{usd(lease.buyout_quote.waived_markup)} of markup is waived.
                </Typography>
              </Paper>
            )}

            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 360 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell><TableCell>Due</TableCell><TableCell align="right">Amount</TableCell>
                    <TableCell>Status</TableCell><TableCell>Invoice</TableCell><TableCell>Late fee</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {lease.installments.map(i => (
                    <TableRow key={i.number} hover>
                      <TableCell>{i.number}</TableCell>
                      <TableCell>{i.due_date}</TableCell>
                      <TableCell align="right">{usd(i.total)}</TableCell>
                      <TableCell>
                        <Chip size="small" variant="outlined" label={i.status === 'cancelled' ? 'settled/waived' : i.status}
                          color={i.status === 'paid' ? 'success' : i.status === 'invoiced' ? 'info' : 'default'} />
                      </TableCell>
                      <TableCell>
                        {i.invoice ? `${i.invoice.invoice_number}${i.invoice.payable ? ` · ${usd(i.invoice.balance_due)} due` : ''}` : '—'}
                      </TableCell>
                      <TableCell>{i.late_fee ? `${usd(i.late_fee.total_amount)} (${i.late_fee.status})` : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {(lease.history?.length ?? 0) > 0 && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>History</Typography>
                <Box sx={{ maxHeight: 220, overflow: 'auto' }}>
                  {lease.history!.map((h, idx) => (
                    <Typography key={idx} variant="body2" sx={{ py: 0.25 }}>
                      <strong>{h.action.replace(/_/g, ' ')}</strong> · {h.by} · {new Date(h.at).toLocaleString()}
                    </Typography>
                  ))}
                </Box>
              </Paper>
            )}
            {(lease.authorizations?.length ?? 0) > 0 && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>Consent evidence</Typography>
                {lease.authorizations!.map((a, idx) => (
                  <Box key={idx} sx={{ mb: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {a.event_type} by {a.accepted_by_name} via {a.channel}
                      {a.created_at ? ` · ${new Date(a.created_at).toLocaleString()}` : ''}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{a.consent_text}</Typography>
                  </Box>
                ))}
              </Paper>
            )}
          </Stack>
        )}
      </DialogContent>
      {lease && (
        <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
          {open === 'draft' && <Button onClick={() => onEdit(lease)} disabled={busy}>Edit</Button>}
          {(open === 'draft' || (open === 'sent' && !lease.signed_at)) && (
            <Button variant="contained" startIcon={<SendIcon />} disabled={busy} onClick={() => send.mutate()}>
              {open === 'draft' ? 'Send to customer' : 'Resend link'}
            </Button>
          )}
          {['sent', 'active', 'in_default'].includes(open) && lease.signed_at && (
            <Tooltip title="Raise anything due and charge the saved card now, by the same rules the scheduler uses">
              <span><Button disabled={busy} onClick={() => collect.mutate()}>Collect now</Button></span>
            </Tooltip>
          )}
          {['active', 'in_default'].includes(open) && !lease.buyout_invoice && (
            <Button disabled={busy} onClick={() => buyout.mutate()}>Start buyout</Button>
          )}
          {lease.buyout_invoice && lease.buyout_invoice.payable && (
            <Button disabled={busy} color="warning" onClick={() => withdraw.mutate()}>Withdraw buyout</Button>
          )}
          {!['completed', 'cancelled'].includes(open) && (
            <Button color="error" disabled={busy} onClick={() => setCancelOpen(true)}>Cancel agreement</Button>
          )}
        </DialogActions>
      )}

      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Cancel {lease?.agreement_number}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Unpaid invoices are cancelled with it. Payments already taken are left alone; refund them from Billing if due.
          </Typography>
          <TextField label="Reason" fullWidth multiline minRows={2} value={cancelReason}
            onChange={e => setCancelReason(e.target.value)} />
          {lease?.stock_committed && !lease?.stock_returned && (
            <FormControlLabel sx={{ mt: 1 }} control={<Switch checked={returnStock} onChange={e => setReturnStock(e.target.checked)} />}
              label="The item is back with us — return it to stock" />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelOpen(false)}>Keep it</Button>
          <Button color="error" variant="contained" disabled={cancelReason.trim().length < 3 || cancel.isPending}
            onClick={() => cancel.mutate()}>Cancel agreement</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deliveryLink)} onClose={() => setDeliveryLink('')} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '20px' } }}>
        <DialogTitle sx={{ fontWeight: 900, color: '#1E1B4B' }}>Lease Agreement Sent</DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ color: '#4B5563', mb: 2 }}>
            The customer was notified. You can also copy this secure lease agreement link and share it any way you like.
            Sending again issues a new link and the previous one stops working.
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
                .then(() => toast.success('Lease link copied'))
                .catch(() => toast.error('Copy the link from the field'))
            }}
            sx={{ fontWeight: 900 }}
          >
            Copy Link
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LeaseToOwn() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [status, setStatus] = useState<LeaseStatus | ''>('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<LeaseDetail | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const pageSize = 20

  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(searchInput.trim()); setPage(0) }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['leases', status, search, page],
    queryFn: () => fetchLeases({ status, search, skip: page * pageSize, limit: pageSize }),
  })
  const rows = useMemo(() => data?.items ?? [], [data])

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h5" fontWeight={800}>Lease to Own</Typography>
          <Typography variant="body2" color="text.secondary">
            Customers pay in installments and own the product when the last one clears.
          </Typography>
        </Box>
        <Button onClick={() => navigate('/sales/quotations')}>Back to Sales</Button>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setEditing(null); setFormOpen(true) }}>
          New agreement
        </Button>
      </Box>

      <Paper variant="outlined">
        <Tabs value={status} onChange={(_, v) => { setStatus(v); setPage(0) }} variant="scrollable"
          sx={{ px: 2, borderBottom: '1px solid #EEF0F6' }}>
          {STATUS_TABS.map(t => <Tab key={t.label} value={t.value} label={t.label} />)}
        </Tabs>
        <Box sx={{ p: 2 }}>
          <TextField size="small" fullWidth placeholder="Search by agreement, customer, email or item"
            value={searchInput} onChange={e => setSearchInput(e.target.value)} />
        </Box>
        {isError && <Alert severity="error" sx={{ mx: 2, mb: 2 }}>{errorText(error, 'Could not load agreements')}</Alert>}
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Agreement</TableCell><TableCell>Customer</TableCell><TableCell>Item</TableCell>
                <TableCell>Payments</TableCell><TableCell align="right">Installment</TableCell>
                <TableCell>Next due</TableCell><TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4 }}><CircularProgress size={28} /></TableCell></TableRow>
              )}
              {!isLoading && rows.map(lease => (
                <TableRow key={lease.id} hover sx={{ cursor: 'pointer' }} onClick={() => setSelected(lease.id)}>
                  <TableCell sx={{ fontWeight: 700 }}>{lease.agreement_number}</TableCell>
                  <TableCell>{lease.customer_name}</TableCell>
                  <TableCell>{lease.quantity} × {lease.item_description}</TableCell>
                  <TableCell>{lease.installments_paid} / {lease.installment_count}</TableCell>
                  <TableCell align="right">{usd(lease.regular_installment)}</TableCell>
                  <TableCell>{lease.next_due_date ?? '—'}</TableCell>
                  <TableCell><StageChip stage={lease.stage} /></TableCell>
                </TableRow>
              ))}
              {!isLoading && !rows.length && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                    No lease-to-own agreements yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination component="div" count={data?.total ?? 0} page={page} rowsPerPage={pageSize}
          rowsPerPageOptions={[pageSize]} onPageChange={(_, p) => setPage(p)} />
      </Paper>

      <LeaseFormDialog
        open={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={lease => {
          setFormOpen(false)
          qc.invalidateQueries({ queryKey: ['leases'] })
          qc.setQueryData(['lease', lease.id], lease)
          setSelected(lease.id)
        }}
      />
      <LeaseDetailDialog
        leaseId={selected}
        onClose={() => setSelected(null)}
        onEdit={lease => { setEditing(lease); setFormOpen(true) }}
      />
    </Box>
  )
}
