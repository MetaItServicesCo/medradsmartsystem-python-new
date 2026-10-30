/**
 * The customer's lease-to-own page, reached from the link they are sent.
 *
 * Before signing it is a full disclosure: every figure, the whole schedule,
 * what happens if a payment is missed, and the exact words being agreed to.
 * After signing it is where they pay, set up automatic payments, follow their
 * schedule and buy out early. Everything is priced by the server; nothing on
 * this page computes money.
 *
 * Built from the same customer document kit as the rental agreement and the
 * sales quotation, so all three read as one family of documents.
 */
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Card, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, FormControlLabel, Table, TableBody, TableCell, TableHead, TableRow, TextField,
  Typography,
} from '@mui/material'
import CreditCardIcon from '@mui/icons-material/CreditCard'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import DrawIcon from '@mui/icons-material/Draw'
import { toast } from 'react-toastify'

import {
  fetchLeasePortal, payLeaseInvoice, removeLeaseCard, requestLeaseBuyout, saveLeaseCard, signLease,
  type LeaseDetail, type LeaseInvoiceBrief,
} from '@/api/leases'
import SquareCardCheckout, { clearSquarePaymentKey } from '@/components/Billing/SquareCardCheckout'
import {
  CustomerDetailsCard,
  CustomerDocumentHeader,
  CustomerDocumentProgress,
  CustomerRecipientCard,
  CustomerSignaturePreview,
  CustomerSignatureRecord,
  customerConsentLabelSx,
  customerDocumentCardSx,
  customerDocumentStatusStyle,
  customerPortalSx,
} from '@/components/Documents/CustomerDocumentUI'

const COMPANY_NAME = 'Mr. BioMed Tech Services'

const money = (value?: string | number | null) =>
  Number(value ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const dateLabel = (value?: string | null) => (value
  ? new Date(`${value}${value.length === 10 ? 'T00:00:00' : ''}`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  : '—')

const errorText = (error: unknown, fallback: string) => {
  const detail = (error as any)?.response?.data?.detail
  return typeof detail === 'string' ? detail : fallback
}

const FREQUENCY_WORD: Record<string, string> = {
  weekly: 'weekly', biweekly: 'every two weeks', monthly: 'monthly', quarterly: 'quarterly',
}

// Schedule rows wear the same status colours as every other customer document.
const INSTALLMENT_STATUS: Record<string, { label: string; style: string }> = {
  paid: { label: 'Paid', style: 'paid' },
  invoiced: { label: 'Due', style: 'sent' },
  cancelled: { label: 'Settled', style: 'pending' },
  scheduled: { label: 'Upcoming', style: 'pending' },
}

const headCell = { fontWeight: 900 }
const tableBox = { overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: '14px', mb: 3 }
const sectionTitle = { fontWeight: 900, color: '#1E3A8A', mb: 1 }
const actionCard = { p: { xs: 2, md: 2.5 }, borderRadius: '16px', borderColor: '#C4B5FD', bgcolor: '#FAF9FF' }
const buttonSx = { fontWeight: 900, textTransform: 'none' }

const Centered = ({ children }: { children: React.ReactNode }) => (
  <Box sx={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#F5F3FF', p: 3 }}>
    {children}
  </Box>
)

export default function ClientLease() {
  const { token = '' } = useParams<{ token: string }>()
  const qc = useQueryClient()
  const [signedName, setSignedName] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [payTarget, setPayTarget] = useState<LeaseInvoiceBrief | null>(null)
  const [showCard, setShowCard] = useState(false)
  const [authorize, setAuthorize] = useState(true)
  const [confirmCardRemoval, setConfirmCardRemoval] = useState(false)

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
    onSuccess: next => { update(next); setConfirmCardRemoval(false); toast.success('Saved card removed') },
    onError: e => toast.error(errorText(e, 'Could not remove the card')),
  })
  const buyout = useMutation({
    mutationFn: () => requestLeaseBuyout(token),
    onSuccess: next => { update(next); toast.success('Your buyout amount is ready to pay below') },
    onError: e => toast.error(errorText(e, 'Could not prepare the buyout')),
  })

  if (isLoading) return <Centered><CircularProgress /></Centered>
  if (isError || !lease) {
    return <Centered><Alert severity="error" sx={{ borderRadius: '14px' }}>{errorText(error, 'This lease link is invalid or has expired.')}</Alert></Centered>
  }

  const square = lease.square
  const canPayByCard = Boolean(square?.enabled && square.application_id && square.location_id)
  const signed = Boolean(lease.signed_at)
  const awaitingSignature = lease.stage === 'awaiting_signature'
  const hasDownPayment = Number(lease.down_payment) > 0
  const downPaid = signed && lease.stage !== 'awaiting_down_payment'
  const owned = lease.status === 'completed'
  const live = ['sent', 'active', 'in_default'].includes(lease.status)
  const frequency = FREQUENCY_WORD[lease.frequency] ?? lease.frequency

  return (
    <Box sx={customerPortalSx}>
      <Card sx={customerDocumentCardSx}>
        <CustomerDocumentHeader
          label="Lease-to-Own Agreement"
          number={lease.agreement_number}
          companyName={COMPANY_NAME}
          meta={`Revision ${lease.revision}`}
          status={lease.status === 'in_default' ? 'overdue' : lease.status}
        />

        <CustomerDocumentProgress steps={[
          { label: 'Review agreement', complete: true },
          { label: signed ? 'Agreement signed' : 'Sign agreement', complete: signed },
          ...(hasDownPayment ? [{ label: downPaid ? 'Down payment complete' : 'Pay down payment', complete: downPaid }] : []),
          { label: owned ? 'Owned' : 'Own it', complete: owned },
        ]} />

        {owned && (
          <Alert severity="success" sx={{ mb: 3, borderRadius: '14px' }}>
            Paid in full{lease.completion_method === 'buyout' ? ' by early buyout' : ''}. You own it.
          </Alert>
        )}
        {lease.status === 'in_default' && (
          <Alert severity="error" sx={{ mb: 3, borderRadius: '14px' }}>
            Several payments are overdue and automatic payments have stopped. Please pay what is outstanding below,
            or contact us.
          </Alert>
        )}
        {awaitingSignature && (
          <Alert
            severity="info"
            action={(
              <Button
                color="inherit"
                size="small"
                onClick={() => document.getElementById('lease-acceptance')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                sx={{ fontWeight: 900, whiteSpace: 'nowrap' }}
              >
                Continue to signature
              </Button>
            )}
            sx={{ mb: 3, borderRadius: '14px', alignItems: 'center' }}
          >
            Review the agreement, its payment schedule and terms, then sign{hasDownPayment ? ' before paying the down payment' : ''}.
          </Alert>
        )}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5, mb: 3 }}>
          <CustomerRecipientCard name={lease.customer_name} email={lease.customer_email} address={lease.customer_address} />
          <CustomerDetailsCard rows={[
            { label: 'Payments', value: `${lease.installment_count} × ${money(lease.regular_installment)}, ${frequency}` },
            { label: 'First payment', value: dateLabel(lease.first_due_date) },
            { label: 'Total of payments', value: <strong>{money(lease.total_of_payments)}</strong> },
            { label: 'Late fee', value: `${money(lease.late_fee_amount)} if unpaid ${lease.grace_days} days after due` },
            { label: 'Default', value: `After ${lease.default_after_missed} missed payments` },
            { label: 'Early buyout', value: 'Unpaid cash price plus tax' },
          ]} />
        </Box>

        <Typography sx={sectionTitle}>Leased Product</Typography>
        <Box sx={tableBox}>
          <Table size="small" sx={{ minWidth: 560 }}>
            <TableHead><TableRow sx={{ bgcolor: '#F8FAFC' }}>
              <TableCell sx={headCell}>Product</TableCell>
              <TableCell align="right" sx={headCell}>Qty</TableCell>
              <TableCell align="right" sx={headCell}>Cash Price / Unit</TableCell>
              <TableCell align="right" sx={headCell}>Cash Price</TableCell>
            </TableRow></TableHead>
            <TableBody>
              <TableRow>
                <TableCell>
                  <Typography sx={{ fontWeight: 800, color: '#1E1B4B' }}>{lease.item_part_number || lease.item_description}</Typography>
                  {lease.item_part_number && <Typography sx={{ fontSize: 12, color: '#6B7280' }}>{lease.item_description}</Typography>}
                </TableCell>
                <TableCell align="right">{lease.quantity}</TableCell>
                <TableCell align="right">{money(lease.unit_cash_price)}</TableCell>
                <TableCell align="right">{money(lease.cash_price)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Box>

        <Typography sx={sectionTitle}>Cost of Leasing</Typography>
        <Box sx={tableBox}>
          <Table size="small" sx={{ minWidth: 420 }}>
            <TableBody>
              {[
                ['Cash price', money(lease.cash_price)],
                [`Markup (${lease.markup_percent}%)`, money(lease.markup_amount)],
                ['Lease price', money(lease.lease_price)],
                ...(hasDownPayment ? [['Down payment, with tax', money(lease.down_payment_total)]] : []),
                [`Sales tax at ${lease.tax_rate_percent}%`, money(lease.total_tax)],
              ].map(([label, value]) => (
                <TableRow key={label}>
                  <TableCell sx={{ color: '#64748B', fontWeight: 800 }}>{label}</TableCell>
                  <TableCell align="right">{value}</TableCell>
                </TableRow>
              ))}
              <TableRow sx={{ bgcolor: '#F8FAFC' }}>
                <TableCell sx={{ fontWeight: 950, color: '#1E3A8A' }}>Total of payments</TableCell>
                <TableCell align="right" sx={{ fontWeight: 950, color: '#1E3A8A' }}>{money(lease.total_of_payments)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Box>

        <Typography sx={sectionTitle}>Payment Schedule</Typography>
        <Box sx={tableBox}>
          <Table size="small" sx={{ minWidth: 560 }}>
            <TableHead><TableRow sx={{ bgcolor: '#F8FAFC' }}>
              <TableCell sx={headCell}>#</TableCell>
              <TableCell sx={headCell}>Due Date</TableCell>
              <TableCell align="right" sx={headCell}>Amount</TableCell>
              <TableCell align="right" sx={headCell}>Of Which Tax</TableCell>
              <TableCell sx={headCell}>Status</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {lease.installments.map(i => {
                const status = INSTALLMENT_STATUS[i.status] ?? INSTALLMENT_STATUS.scheduled
                const style = customerDocumentStatusStyle(status.style)
                return (
                  <TableRow key={i.number}>
                    <TableCell>{i.number}</TableCell>
                    <TableCell>{dateLabel(i.due_date)}</TableCell>
                    <TableCell align="right">{money(i.total)}</TableCell>
                    <TableCell align="right">{money(i.tax)}</TableCell>
                    <TableCell>
                      <Chip size="small" label={status.label} sx={{ fontWeight: 900, textTransform: 'uppercase', bgcolor: style.bg, color: style.color }} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Box>

        {lease.consent_text && (
          <Box sx={{ mb: 3, p: 2, borderRadius: '14px', bgcolor: '#FAF9FF', border: '1px solid #EDE9FE' }}>
            <Typography sx={{ color: '#7C3AED', fontWeight: 900, fontSize: 11, textTransform: 'uppercase', mb: 0.5 }}>Terms &amp; Conditions</Typography>
            <Typography sx={{ color: '#475569', whiteSpace: 'pre-wrap', fontSize: 13 }}>{lease.consent_text}</Typography>
          </Box>
        )}

        {awaitingSignature ? (
          <Card id="lease-acceptance" variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: '18px', mb: 3, borderColor: '#C4B5FD', bgcolor: '#FAF9FF', scrollMarginTop: 24 }}>
            <Typography sx={{ fontWeight: 950, color: '#1E1B4B', fontSize: 20 }}>Sign and approve this lease-to-own agreement</Typography>
            <Typography sx={{ color: '#64748B', mt: 0.5, mb: 2 }}>Review the agreement, type your full legal name, and accept the terms.</Typography>
            <TextField fullWidth label="Type your full legal name" value={signedName} onChange={e => setSignedName(e.target.value)} helperText="Your typed name will be rendered as your electronic signature." sx={{ mb: 2 }} />
            <CustomerSignaturePreview name={signedName} />
            <FormControlLabel
              sx={{ ...customerConsentLabelSx, mt: 1.5 }}
              control={<Checkbox checked={agreed} onChange={e => setAgreed(e.target.checked)} />}
              label="I have reviewed this lease-to-own agreement and agree to its terms and payment obligations."
            />
            <Button variant="contained" startIcon={<DrawIcon />} disabled={!agreed || signedName.trim().length < 2 || sign.isPending} onClick={() => sign.mutate()} sx={{ ...buttonSx, mt: 1 }}>
              {sign.isPending ? 'Signing…' : 'Sign & Approve Agreement'}
            </Button>
          </Card>
        ) : signed && lease.signed_by_name ? (
          <CustomerSignatureRecord context="Agreement" acceptedBy={lease.signed_by_name} acceptedAt={dateLabel(lease.signed_at)} signature={lease.signed_by_name} detail={`Revision ${lease.revision}`} />
        ) : null}

        {signed && live && canPayByCard && square && (
          <Card variant="outlined" sx={{ ...actionCard, mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 1.5, flexWrap: 'wrap' }}>
              <Box>
                <Typography sx={{ fontWeight: 950, color: '#1E1B4B', fontSize: 19 }}>Secure payment method</Typography>
                {lease.card ? (
                  <Typography sx={{ color: '#475569', mt: 0.5 }}>
                    {lease.card.brand || 'Card'} ending in {lease.card.last4 || '••••'}
                    {lease.card.exp_month && lease.card.exp_year
                      ? ` · expires ${String(lease.card.exp_month).padStart(2, '0')}/${String(lease.card.exp_year).slice(-2)}`
                      : ''}
                  </Typography>
                ) : (
                  <Typography sx={{ color: '#64748B', mt: 0.5 }}>Save a card and each payment is taken on its due date, so nothing is missed. Card details are vaulted by Square.</Typography>
                )}
              </Box>
              <Chip
                label={lease.auto_charge ? 'Auto-pay authorized' : lease.card ? 'Stored only' : 'No card on file'}
                sx={{ fontWeight: 900, bgcolor: lease.auto_charge ? '#D1FAE5' : '#EEF2FF', color: lease.auto_charge ? '#047857' : '#4338CA' }}
              />
            </Box>

            {!showCard ? (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
                <Button variant="outlined" startIcon={<CreditCardIcon />} onClick={() => setShowCard(true)} sx={buttonSx}>
                  {lease.card ? 'Replace saved card' : 'Set up automatic payments'}
                </Button>
                {lease.card && (
                  <Button color="error" variant="outlined" startIcon={<DeleteOutlineIcon />} onClick={() => setConfirmCardRemoval(true)} sx={buttonSx}>
                    Remove card &amp; stop auto-pay
                  </Button>
                )}
              </Box>
            ) : (
              <Box sx={{ mt: 2 }}>
                <FormControlLabel
                  sx={{ ...customerConsentLabelSx, mb: 0.75 }}
                  control={<Checkbox checked={authorize} onChange={e => setAuthorize(e.target.checked)} />}
                  label={lease.auto_charge_consent || 'Charge this card automatically for each payment as it falls due'}
                />
                <Typography sx={{ color: '#64748B', fontSize: 12, mb: 1.5 }}>
                  Leave unchecked to store the card without automatic-charge authorization. MedRad never stores the full card number or security code.
                </Typography>
                <SquareCardCheckout
                  applicationId={square.application_id!} locationId={square.location_id!} sdkUrl={square.sdk_url}
                  amount={0} currency={square.currency} payerName={lease.customer_name} payerEmail={lease.customer_email}
                  processing={saveCard.isPending} intent="STORE"
                  submitLabel={lease.card ? 'Securely replace saved card' : 'Securely save card'}
                  idempotencyScope={`lease-card-${token}`}
                  onPaymentToken={(sourceId, key) => saveCard.mutate({ sourceId, key })}
                />
                <Button onClick={() => setShowCard(false)} sx={{ mt: 1, fontWeight: 800 }}>Cancel</Button>
              </Box>
            )}
          </Card>
        )}

        {signed && lease.buyout_quote && !lease.buyout_invoice && ['active', 'in_default'].includes(lease.status) && (
          <Card variant="outlined" sx={{ ...actionCard, mb: 3 }}>
            <Typography sx={{ fontWeight: 950, color: '#1E1B4B', fontSize: 19 }}>Own it today</Typography>
            <Typography sx={{ color: '#475569', mt: 0.5, mb: 1.5 }}>
              Pay {money(lease.buyout_quote.total)} now and it is yours: the remaining cash price of
              {' '}{money(lease.buyout_quote.remaining_principal)} plus {money(lease.buyout_quote.tax)} tax
              {Number(lease.buyout_quote.outstanding_fees) > 0 && `, and ${money(lease.buyout_quote.outstanding_fees)} of late fees`}.
              {' '}You save {money(lease.buyout_quote.waived_markup)} of markup.
            </Typography>
            <Button variant="outlined" disabled={buyout.isPending} onClick={() => buyout.mutate()} sx={buttonSx}>Buy out early</Button>
          </Card>
        )}

        {signed && (
          <>
            <Divider sx={{ my: 3 }} />
            <Typography sx={sectionTitle}>
              Lease Invoices{lease.outstanding_invoices.length > 0 ? ` · ${money(lease.amount_outstanding)} due` : ''}
            </Typography>
            {lease.outstanding_invoices.length === 0 ? (
              <Typography sx={{ color: '#6B7280', fontWeight: 700 }}>Nothing is due right now.</Typography>
            ) : (
              <Box sx={{ display: 'grid', gap: 1.5 }}>
                {lease.outstanding_invoices.map(invoice => {
                  const style = customerDocumentStatusStyle(invoice.status)
                  const isDown = invoice.id === lease.down_payment_invoice?.id
                  const isBuyout = invoice.id === lease.buyout_invoice?.id
                  return (
                    <Card key={invoice.id} variant="outlined" sx={{ p: 2, borderRadius: '14px' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                        <Box>
                          <Typography sx={{ fontWeight: 900, color: '#1E3A8A' }}>{invoice.invoice_number}</Typography>
                          <Typography sx={{ color: '#6B7280', fontSize: 13 }}>
                            {isDown ? 'Down payment' : isBuyout ? 'Early buyout' : 'Lease payment'} · due {dateLabel(invoice.due_date)}
                          </Typography>
                        </Box>
                        <Box sx={{ textAlign: 'right' }}>
                          <Typography sx={{ fontWeight: 950, color: '#1E3A8A', fontSize: 18 }}>{money(invoice.balance_due)}</Typography>
                          <Chip size="small" label={invoice.status.replace(/_/g, ' ')} sx={{ fontWeight: 900, textTransform: 'uppercase', bgcolor: style.bg, color: style.color }} />
                        </Box>
                      </Box>
                      {canPayByCard && square && (
                        payTarget?.id === invoice.id ? (
                          <Box sx={{ mt: 2 }}>
                            <SquareCardCheckout
                              applicationId={square.application_id!} locationId={square.location_id!}
                              sdkUrl={square.sdk_url} amount={Number(invoice.balance_due)} currency={square.currency}
                              payerName={lease.customer_name} payerEmail={lease.customer_email}
                              processing={pay.isPending}
                              idempotencyScope={`lease-invoice-${invoice.id}-${Number(invoice.balance_due).toFixed(2)}`}
                              onPaymentToken={(sourceId, key) => pay.mutate({ invoice, sourceId, key })}
                            />
                            <Button onClick={() => setPayTarget(null)} sx={{ mt: 1, fontWeight: 800 }}>Cancel</Button>
                          </Box>
                        ) : (
                          <Button variant="contained" startIcon={<CreditCardIcon />} onClick={() => setPayTarget(invoice)} sx={{ ...buttonSx, mt: 1.5, borderRadius: '12px' }}>
                            {isDown ? 'Pay Down Payment' : isBuyout ? 'Pay Buyout' : 'Pay Invoice'} · {money(invoice.balance_due)}
                          </Button>
                        )
                      )}
                    </Card>
                  )
                })}
              </Box>
            )}
            {!canPayByCard && lease.outstanding_invoices.length > 0 && (
              <Alert severity="info" sx={{ mt: 2, borderRadius: '14px' }}>Online card payment is not available right now. Please contact us to pay.</Alert>
            )}
          </>
        )}
      </Card>

      <Dialog open={confirmCardRemoval} onClose={() => !removeCard.isPending && setConfirmCardRemoval(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 950, color: '#1E1B4B' }}>Remove saved card?</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#475569' }}>
            The card will be removed from this agreement and automatic payments stop immediately. Future payments must be made manually until another card is saved.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button disabled={removeCard.isPending} onClick={() => setConfirmCardRemoval(false)} sx={{ fontWeight: 800 }}>Keep card</Button>
          <Button disabled={removeCard.isPending} color="error" variant="contained" onClick={() => removeCard.mutate()} sx={{ fontWeight: 900 }}>
            Remove card
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
