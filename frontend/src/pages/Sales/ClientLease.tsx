/**
 * The customer's lease-to-own page, reached from the link they are emailed.
 *
 * Before signing it is a full disclosure: every figure, the whole schedule,
 * what happens if a payment is missed, and the exact words being agreed to.
 * After signing it is where they pay, set up automatic payments, follow their
 * schedule and buy out early. Everything is priced by the server; nothing on
 * this page computes money.
 */
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Container, Divider, FormControlLabel,
  Grid, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
  Typography,
} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import { toast } from 'react-toastify'

import {
  fetchLeasePortal, payLeaseInvoice, removeLeaseCard, requestLeaseBuyout, saveLeaseCard, signLease,
  type LeaseDetail, type LeaseInvoiceBrief,
} from '@/api/leases'
import SquareCardCheckout, { clearSquarePaymentKey } from '@/components/Billing/SquareCardCheckout'

const usd = (value?: string | number | null) =>
  Number(value ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

const errorText = (error: unknown, fallback: string) => {
  const detail = (error as any)?.response?.data?.detail
  return typeof detail === 'string' ? detail : fallback
}

const FREQUENCY_WORD: Record<string, string> = {
  weekly: 'weekly', biweekly: 'every two weeks', monthly: 'monthly', quarterly: 'quarterly',
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.4 }}>
      <Typography variant="body2" color={strong ? 'text.primary' : 'text.secondary'} sx={{ fontWeight: strong ? 800 : 400 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: strong ? 800 : 600 }}>{value}</Typography>
    </Box>
  )
}

export default function ClientLease() {
  const { token = '' } = useParams<{ token: string }>()
  const qc = useQueryClient()
  const [signedName, setSignedName] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [payTarget, setPayTarget] = useState<LeaseInvoiceBrief | null>(null)
  const [showCard, setShowCard] = useState(false)
  const [authorize, setAuthorize] = useState(true)

  const { data: lease, isLoading, isError, error } = useQuery({
    queryKey: ['lease-portal', token],
    queryFn: () => fetchLeasePortal(token),
    retry: false,
  })
  const update = (next: LeaseDetail) => qc.setQueryData(['lease-portal', token], next)

  const sign = useMutation({
    mutationFn: () => signLease(token, signedName.trim(), lease!.revision),
    onSuccess: next => { update(next); toast.success('Signed. Thank you.') },
    onError: e => toast.error(errorText(e, 'Could not sign the agreement')),
  })
  const pay = useMutation({
    mutationFn: (v: { invoice: LeaseInvoiceBrief; sourceId: string; key: string }) =>
      payLeaseInvoice(token, v.invoice.id, v.sourceId, v.key),
    onSuccess: (next, v) => {
      clearSquarePaymentKey(`lease-invoice-${v.invoice.id}-${Number(v.invoice.balance_due).toFixed(2)}`)
      update(next)
      setPayTarget(null)
      toast.success('Payment received. A receipt is on its way.')
    },
    onError: e => toast.error(errorText(e, 'The payment did not go through')),
  })
  const saveCard = useMutation({
    mutationFn: (v: { sourceId: string; key: string }) => saveLeaseCard(token, v.sourceId, v.key, authorize),
    onSuccess: next => {
      clearSquarePaymentKey(`lease-card-${token}`)
      update(next)
      setShowCard(false)
      toast.success(authorize ? 'Automatic payments are set up' : 'Card saved')
    },
    onError: e => toast.error(errorText(e, 'Could not save the card')),
  })
  const removeCard = useMutation({
    mutationFn: () => removeLeaseCard(token),
    onSuccess: next => { update(next); toast.success('Saved card removed') },
    onError: e => toast.error(errorText(e, 'Could not remove the card')),
  })
  const buyout = useMutation({
    mutationFn: () => requestLeaseBuyout(token),
    onSuccess: next => { update(next); toast.success('Your buyout amount is ready to pay below') },
    onError: e => toast.error(errorText(e, 'Could not prepare the buyout')),
  })

  if (isLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box>
  }
  if (isError || !lease) {
    return (
      <Container maxWidth="sm" sx={{ mt: 8 }}>
        <Alert severity="error">{errorText(error, 'This link is not valid.')}</Alert>
      </Container>
    )
  }

  const square = lease.square
  const canPayByCard = Boolean(square?.enabled && square.application_id && square.location_id)
  const signed = Boolean(lease.signed_at)
  const awaitingSignature = lease.stage === 'awaiting_signature'

  return (
    <Container maxWidth="md" sx={{ py: { xs: 3, md: 6 } }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="overline" color="text.secondary">Lease-to-own agreement {lease.agreement_number}</Typography>
          <Typography variant="h4" fontWeight={800}>{lease.quantity} × {lease.item_description}</Typography>
          <Typography color="text.secondary">For {lease.customer_name}</Typography>
        </Box>

        {lease.status === 'completed' && (
          <Alert icon={<CheckCircleIcon />} severity="success">
            Paid in full{lease.completion_method === 'buyout' ? ' by early buyout' : ''}. You own it.
          </Alert>
        )}
        {lease.status === 'in_default' && (
          <Alert severity="error">
            Several payments are overdue and automatic payments have stopped. Please pay what is outstanding below,
            or contact us.
          </Alert>
        )}

        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
          <Typography variant="h6" fontWeight={800} gutterBottom>The terms</Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <Row label="Cash price" value={usd(lease.cash_price)} />
              <Row label={`Markup (${lease.markup_percent}%)`} value={usd(lease.markup_amount)} />
              <Row label="Lease price" value={usd(lease.lease_price)} />
              {Number(lease.down_payment) > 0 && <Row label="Down payment, with tax" value={usd(lease.down_payment_total)} />}
              <Row label={`Sales tax at ${lease.tax_rate_percent}%`} value={usd(lease.total_tax)} />
              <Divider sx={{ my: 1 }} />
              <Row strong label="Total of payments" value={usd(lease.total_of_payments)} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Row strong label={`${lease.installment_count} payments, ${FREQUENCY_WORD[lease.frequency] ?? lease.frequency}`}
                value={usd(lease.regular_installment)} />
              <Row label="First payment" value={lease.first_due_date ?? '—'} />
              <Row label="Late fee" value={`${usd(lease.late_fee_amount)} if unpaid ${lease.grace_days} days after it is due`} />
              <Row label="Default" value={`after ${lease.default_after_missed} missed payments`} />
              <Row label="Early buyout" value="unpaid cash price plus tax" />
            </Grid>
          </Grid>
        </Paper>

        {awaitingSignature && (
          <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderColor: '#6366F1' }}>
            <Typography variant="h6" fontWeight={800} gutterBottom>Review and sign</Typography>
            <Paper variant="outlined" sx={{ p: 2, bgcolor: '#F8FAFF', mb: 2 }}>
              <Typography variant="body2">{lease.consent_text}</Typography>
            </Paper>
            <TextField label="Type your full name to sign" fullWidth value={signedName}
              onChange={e => setSignedName(e.target.value)} sx={{ mb: 1 }} />
            <FormControlLabel control={<Checkbox checked={agreed} onChange={e => setAgreed(e.target.checked)} />}
              label="I have read these terms and agree to them" />
            <Box sx={{ mt: 1 }}>
              <Button variant="contained" size="large" disabled={!agreed || signedName.trim().length < 2 || sign.isPending}
                onClick={() => sign.mutate()}>
                {sign.isPending ? 'Signing…' : 'Sign agreement'}
              </Button>
            </Box>
          </Paper>
        )}

        {signed && lease.outstanding_invoices.length > 0 && (
          <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
            <Typography variant="h6" fontWeight={800} gutterBottom>
              Due now · {usd(lease.amount_outstanding)}
            </Typography>
            <Stack spacing={1.5}>
              {lease.outstanding_invoices.map(invoice => (
                <Paper key={invoice.id} variant="outlined" sx={{ p: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography sx={{ fontWeight: 700 }}>{invoice.invoice_number}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Due {invoice.due_date} · {invoice.status.replace('_', ' ')}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontWeight: 800 }}>{usd(invoice.balance_due)}</Typography>
                    {canPayByCard && payTarget?.id !== invoice.id && (
                      <Button variant="contained" onClick={() => setPayTarget(invoice)}>Pay</Button>
                    )}
                  </Box>
                  {canPayByCard && payTarget?.id === invoice.id && square && (
                    <Box sx={{ mt: 1.5 }}>
                      <SquareCardCheckout
                        applicationId={square.application_id!} locationId={square.location_id!}
                        sdkUrl={square.sdk_url} amount={Number(invoice.balance_due)} currency={square.currency}
                        payerName={lease.customer_name} payerEmail={lease.customer_email}
                        processing={pay.isPending}
                        idempotencyScope={`lease-invoice-${invoice.id}-${Number(invoice.balance_due).toFixed(2)}`}
                        onPaymentToken={(sourceId, key) => pay.mutate({ invoice, sourceId, key })}
                      />
                      <Button onClick={() => setPayTarget(null)} sx={{ mt: 1 }}>Cancel</Button>
                    </Box>
                  )}
                </Paper>
              ))}
            </Stack>
            {!canPayByCard && (
              <Alert severity="info" sx={{ mt: 2 }}>Online card payment is not available right now. Please contact us to pay.</Alert>
            )}
          </Paper>
        )}

        {signed && ['sent', 'active', 'in_default'].includes(lease.status) && canPayByCard && square && (
          <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
            <Typography variant="h6" fontWeight={800} gutterBottom>Automatic payments</Typography>
            {lease.card ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <Typography sx={{ flexGrow: 1 }}>
                  {lease.card.brand ?? 'Card'} ending {lease.card.last4}
                  {lease.auto_charge ? ' is charged automatically on each due date.' : ' is saved.'}
                </Typography>
                <Button onClick={() => setShowCard(true)}>Replace card</Button>
                <Button color="error" disabled={removeCard.isPending} onClick={() => removeCard.mutate()}>
                  Stop automatic payments
                </Button>
              </Box>
            ) : (
              !showCard && (
                <Box>
                  <Typography color="text.secondary" sx={{ mb: 1 }}>
                    Save a card and each payment is taken on its due date, so nothing is missed.
                  </Typography>
                  <Button variant="outlined" onClick={() => setShowCard(true)}>Set up automatic payments</Button>
                </Box>
              )
            )}
            {showCard && (
              <Box sx={{ mt: 2 }}>
                <FormControlLabel control={<Checkbox checked={authorize} onChange={e => setAuthorize(e.target.checked)} />}
                  label="Charge this card automatically for each payment as it falls due" />
                {authorize && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                    {lease.auto_charge_consent}
                  </Typography>
                )}
                <SquareCardCheckout
                  applicationId={square.application_id!} locationId={square.location_id!} sdkUrl={square.sdk_url}
                  amount={0} currency={square.currency} payerName={lease.customer_name} payerEmail={lease.customer_email}
                  processing={saveCard.isPending} intent="STORE"
                  submitLabel={lease.card ? 'Securely replace card' : 'Securely save card'}
                  idempotencyScope={`lease-card-${token}`}
                  onPaymentToken={(sourceId, key) => saveCard.mutate({ sourceId, key })}
                />
                <Button onClick={() => setShowCard(false)} sx={{ mt: 1 }}>Cancel</Button>
              </Box>
            )}
          </Paper>
        )}

        {signed && lease.buyout_quote && !lease.buyout_invoice && ['active', 'in_default'].includes(lease.status) && (
          <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
            <Typography variant="h6" fontWeight={800} gutterBottom>Own it today</Typography>
            <Typography variant="body2" sx={{ mb: 1.5 }}>
              Pay {usd(lease.buyout_quote.total)} now and it is yours: the remaining cash price of
              {' '}{usd(lease.buyout_quote.remaining_principal)} plus {usd(lease.buyout_quote.tax)} tax
              {Number(lease.buyout_quote.outstanding_fees) > 0 && `, and ${usd(lease.buyout_quote.outstanding_fees)} of late fees`}.
              {' '}You save {usd(lease.buyout_quote.waived_markup)} of markup.
            </Typography>
            <Button variant="outlined" disabled={buyout.isPending} onClick={() => buyout.mutate()}>Buy out early</Button>
          </Paper>
        )}

        <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
          <Typography variant="h6" fontWeight={800} gutterBottom>Payment schedule</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell><TableCell>Due</TableCell><TableCell align="right">Amount</TableCell>
                  <TableCell align="right">Of which tax</TableCell><TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {lease.installments.map(i => (
                  <TableRow key={i.number}>
                    <TableCell>{i.number}</TableCell>
                    <TableCell>{i.due_date}</TableCell>
                    <TableCell align="right">{usd(i.total)}</TableCell>
                    <TableCell align="right">{usd(i.tax)}</TableCell>
                    <TableCell>
                      <Chip size="small" variant="outlined"
                        label={i.status === 'paid' ? 'Paid' : i.status === 'invoiced' ? 'Due' : i.status === 'cancelled' ? 'Settled' : 'Upcoming'}
                        color={i.status === 'paid' ? 'success' : i.status === 'invoiced' ? 'warning' : 'default'} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Stack>
    </Container>
  )
}
