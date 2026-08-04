import { useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Alert, Box, Button, Card, Checkbox, Chip, CircularProgress, Divider,
  FormControlLabel, Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Typography,
} from '@mui/material'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import CreditCardIcon from '@mui/icons-material/CreditCard'
import DrawIcon from '@mui/icons-material/Draw'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'

import SquareCardCheckout from '@/components/Billing/SquareCardCheckout'
import {
  acceptPublicRental,
  fetchRentalPortal,
  payPublicRentalInvoice,
  savePublicRentalCard,
  type RentalPortal,
  type RentalPortalInvoice,
} from '@/api/rentals'

const money = (value: number | string | null | undefined) => `$${Number(value || 0).toFixed(2)}`
const dateLabel = (value?: string | null) => (value
  ? new Date(`${value}${value.length === 10 ? 'T00:00:00' : ''}`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  : '—')
const frequencyLabel = (value: string) => value === 'biweekly' ? 'Bi-weekly' : `${value.charAt(0).toUpperCase()}${value.slice(1)}`

const statusStyle = (status: string) => (
  status === 'paid' ? { bg: '#DCFCE7', color: '#15803D' }
    : status === 'overdue' ? { bg: '#FEE2E2', color: '#B91C1C' }
      : { bg: '#DBEAFE', color: '#1D4ED8' }
)

const Centered = ({ children }: { children: React.ReactNode }) => (
  <Box sx={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#F5F3FF', p: 3 }}>
    {children}
  </Box>
)

const DetailTable = ({ portal }: { portal: RentalPortal }) => {
  const { agreement, pricing } = portal
  const rows = [
    {
      label: `First ${frequencyLabel(agreement.billing_frequency).toLowerCase()} rental period`,
      cost: pricing.rental,
      tax: pricing.rental_tax,
      total: Number(pricing.rental) + Number(pricing.rental_tax),
      color: '#1D4ED8',
    },
    { label: 'Security Deposit', cost: pricing.deposit, tax: 0, total: pricing.deposit, color: '#475569' },
    { label: 'Shipping & Packing', cost: pricing.shipping, tax: pricing.shipping_tax, total: Number(pricing.shipping) + Number(pricing.shipping_tax), color: '#7C3AED' },
    { label: 'Delivery & Setup', cost: pricing.setup, tax: pricing.setup_tax, total: Number(pricing.setup) + Number(pricing.setup_tax), color: '#7C3AED' },
    { label: 'Labor', cost: pricing.labor, tax: 0, total: pricing.labor, color: '#475569' },
  ]
  if (Number(pricing.discount || 0) > 0) {
    rows.push({ label: 'Discount', cost: -Number(pricing.discount), tax: 0, total: -Number(pricing.discount), color: '#DC2626' })
  }

  return (
    <Box sx={{ border: '1px solid #D8DEE9', borderRadius: '14px', overflowX: 'auto', mb: 3 }}>
      <Table size="small" sx={{ minWidth: 580 }}>
        <TableHead>
          <TableRow sx={{ bgcolor: '#F8FAFC' }}>
            <TableCell sx={{ fontWeight: 900 }}>Description</TableCell>
            <TableCell align="right" sx={{ fontWeight: 900 }}>Cost</TableCell>
            <TableCell align="right" sx={{ fontWeight: 900 }}>Tax 8.25%</TableCell>
            <TableCell align="right" sx={{ fontWeight: 900 }}>Total</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map(row => (
            <TableRow key={row.label}>
              <TableCell sx={{ fontWeight: 850, color: row.color }}>{row.label}</TableCell>
              <TableCell align="right">{money(row.cost)}</TableCell>
              <TableCell align="right">{money(row.tax)}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 800 }}>{money(row.total)}</TableCell>
            </TableRow>
          ))}
          <TableRow sx={{ bgcolor: '#FAF9FF' }}>
            <TableCell colSpan={2} sx={{ fontWeight: 950 }}>Total Tax</TableCell>
            <TableCell align="right" sx={{ fontWeight: 950 }}>{money(pricing.tax)}</TableCell>
            <TableCell align="right" sx={{ fontWeight: 950 }}>{money(pricing.tax)}</TableCell>
          </TableRow>
          <TableRow sx={{ bgcolor: '#EEF2FF' }}>
            <TableCell colSpan={3} sx={{ fontWeight: 950, fontSize: 16 }}>Initial Amount Due</TableCell>
            <TableCell align="right" sx={{ fontWeight: 950, color: '#059669', fontSize: 18 }}>{money(pricing.grand_total)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Box>
  )
}

const InvoiceBreakdown = ({ invoice }: { invoice: RentalPortalInvoice }) => (
  <Box sx={{ mt: 1.5, border: '1px solid #E5E7EB', borderRadius: '12px', overflowX: 'auto' }}>
    <Table size="small" sx={{ minWidth: 560 }}>
      <TableHead>
        <TableRow sx={{ bgcolor: '#F8FAFC' }}>
          <TableCell sx={{ fontWeight: 900 }}>Description</TableCell>
          <TableCell align="right" sx={{ fontWeight: 900 }}>Qty</TableCell>
          <TableCell align="right" sx={{ fontWeight: 900 }}>Rate</TableCell>
          <TableCell align="right" sx={{ fontWeight: 900 }}>Amount</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {(invoice.line_items || []).map((line, index) => (
          <TableRow key={`${line.item_number || line.description}-${index}`}>
            <TableCell>{line.description || line.item_number || 'Rental charge'}</TableCell>
            <TableCell align="right">{Number(line.quantity || 1)}</TableCell>
            <TableCell align="right">{money(line.unit_price)}</TableCell>
            <TableCell align="right" sx={{ fontWeight: 800 }}>{money(line.total_amount)}</TableCell>
          </TableRow>
        ))}
        <TableRow><TableCell colSpan={3} sx={{ fontWeight: 800 }}>Subtotal</TableCell><TableCell align="right">{money(invoice.subtotal)}</TableCell></TableRow>
        {Number(invoice.discount_amount || 0) > 0 && (
          <TableRow><TableCell colSpan={3} sx={{ fontWeight: 800, color: '#DC2626' }}>Discount</TableCell><TableCell align="right" sx={{ color: '#DC2626' }}>-{money(invoice.discount_amount)}</TableCell></TableRow>
        )}
        <TableRow><TableCell colSpan={3} sx={{ fontWeight: 800 }}>Tax (8.25%)</TableCell><TableCell align="right">{money(invoice.tax_amount)}</TableCell></TableRow>
        <TableRow sx={{ bgcolor: '#F8FAFC' }}><TableCell colSpan={3} sx={{ fontWeight: 950 }}>Invoice Total</TableCell><TableCell align="right" sx={{ fontWeight: 950 }}>{money(invoice.total_amount)}</TableCell></TableRow>
        {Number(invoice.amount_paid || 0) > 0 && (
          <TableRow><TableCell colSpan={3} sx={{ fontWeight: 800, color: '#059669' }}>Paid</TableCell><TableCell align="right" sx={{ color: '#059669' }}>{money(invoice.amount_paid)}</TableCell></TableRow>
        )}
        <TableRow sx={{ bgcolor: '#EEF2FF' }}><TableCell colSpan={3} sx={{ fontWeight: 950 }}>Balance Due</TableCell><TableCell align="right" sx={{ fontWeight: 950 }}>{money(invoice.balance_due)}</TableCell></TableRow>
      </TableBody>
    </Table>
  </Box>
)

const ClientRental = () => {
  const { token = '' } = useParams()
  const queryClient = useQueryClient()
  const [signatureName, setSignatureName] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [payTarget, setPayTarget] = useState<RentalPortalInvoice | null>(null)
  const [showCardSave, setShowCardSave] = useState(false)
  const [saveCardForFuture, setSaveCardForFuture] = useState(false)
  const [authorizeAutoCharge, setAuthorizeAutoCharge] = useState(false)
  const [thankYouInvoice, setThankYouInvoice] = useState('')

  const portalQ = useQuery({
    queryKey: ['rental-portal', token],
    queryFn: () => fetchRentalPortal(token),
    enabled: Boolean(token),
    retry: false,
  })

  const acceptMut = useMutation({
    mutationFn: () => acceptPublicRental(token, signatureName.trim()),
    onSuccess: (data) => {
      queryClient.setQueryData(['rental-portal', token], data)
      toast.success('Rental agreement signed and approved')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not approve the agreement'),
  })

  const saveCardMut = useMutation({
    mutationFn: (sourceId: string) => savePublicRentalCard(token, sourceId, authorizeAutoCharge),
    onSuccess: (data) => {
      queryClient.setQueryData(['rental-portal', token], data)
      setShowCardSave(false)
      toast.success(authorizeAutoCharge ? 'Card saved and recurring charges authorized' : 'Card saved securely')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not save the card'),
  })

  const payMut = useMutation({
    mutationFn: ({ invoiceId, sourceId, idempotencyKey }: { invoiceId: number; sourceId: string; idempotencyKey: string }) =>
      payPublicRentalInvoice(token, invoiceId, sourceId, idempotencyKey, saveCardForFuture, authorizeAutoCharge),
    onSuccess: (data) => {
      queryClient.setQueryData(['rental-portal', token], data)
      setThankYouInvoice(payTarget?.invoice_number || '')
      setPayTarget(null)
      setSaveCardForFuture(false)
      setAuthorizeAutoCharge(false)
      toast.success('Payment successful — thank you!')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Payment could not be completed'),
  })

  if (portalQ.isLoading) return <Centered><CircularProgress /></Centered>
  if (portalQ.isError || !portalQ.data) {
    return <Centered><Alert severity="error" sx={{ borderRadius: '14px' }}>This rental link is invalid or has expired.</Alert></Centered>
  }

  const portal = portalQ.data
  const { agreement, acceptance, invoices, square, company_name } = portal
  const canPay = square.enabled && Boolean(square.application_id) && Boolean(square.location_id)
  const initialInvoiceId = invoices[0]?.id

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: '#F5F3FF', py: { xs: 2, md: 5 }, px: 2 }}>
      <Card sx={{ width: 'min(980px, 100%)', mx: 'auto', p: { xs: 2, md: 4 }, borderRadius: '24px', boxShadow: '0 24px 70px rgba(30,58,138,0.14)' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box component="img" src="/mr-biomed-logo.jpeg" alt="Mr. BioMed Tech Services" sx={{ width: 90, height: 58, objectFit: 'contain' }} />
            <Box>
              <Typography sx={{ color: '#2563EB', fontWeight: 900, fontSize: 11, letterSpacing: '2px', textTransform: 'uppercase' }}>Rental Agreement</Typography>
              <Typography variant="h4" sx={{ fontWeight: 950, color: '#1E3A8A', letterSpacing: '-0.5px' }}>{agreement.rental_number}</Typography>
              <Typography sx={{ color: '#6B7280', fontWeight: 700 }}>{company_name} · Revision {agreement.revision}</Typography>
            </Box>
          </Box>
          <Chip label={agreement.status} sx={{ fontWeight: 900, textTransform: 'uppercase', bgcolor: statusStyle(agreement.status).bg, color: statusStyle(agreement.status).color }} />
        </Box>

        <Box sx={{ height: 4, borderRadius: 999, my: 3, background: 'linear-gradient(90deg, #2563EB 0%, #7C3AED 60%, #EC4899 100%)' }} />

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5, mb: 3 }}>
          <Box sx={{ p: 2.2, borderRadius: '16px', bgcolor: '#EFF6FF', border: '1px solid #BFDBFE' }}>
            <Typography sx={{ color: '#2563EB', fontWeight: 900, fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px' }}>Prepared for</Typography>
            <Typography sx={{ color: '#1E3A8A', fontWeight: 900, fontSize: 20, mt: 0.4 }}>{agreement.customer_name}</Typography>
            <Typography sx={{ color: '#4B5563' }}>{agreement.customer_email}</Typography>
            <Typography sx={{ color: '#4B5563' }}>{agreement.customer_address}</Typography>
          </Box>
          <Box sx={{ p: 2.2, borderRadius: '16px', bgcolor: '#F8FAFC', border: '1px solid #E2E8F0', display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 0.8, alignContent: 'start' }}>
            <Typography sx={{ fontWeight: 900, color: '#64748B' }}>Billing</Typography><Typography sx={{ textAlign: 'right' }}>{frequencyLabel(agreement.billing_frequency)}</Typography>
            <Typography sx={{ fontWeight: 900, color: '#64748B' }}>Rental period</Typography><Typography sx={{ textAlign: 'right' }}>{dateLabel(agreement.start_date)} – {dateLabel(agreement.end_date)}</Typography>
            <Typography sx={{ fontWeight: 900, color: '#64748B' }}>Next billing</Typography><Typography sx={{ textAlign: 'right' }}>{dateLabel(agreement.next_bill_date)}</Typography>
            <Typography sx={{ fontWeight: 900, color: '#64748B' }}>Auto-charge</Typography><Typography sx={{ textAlign: 'right' }}>{agreement.auto_charge_authorized ? 'Customer authorized' : agreement.auto_charge ? 'Requested; consent pending' : 'Off'}</Typography>
          </Box>
        </Box>

        <Typography sx={{ fontWeight: 900, color: '#1E3A8A', mb: 1 }}>Rented Products</Typography>
        <Box sx={{ overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: '14px', mb: 3 }}>
          <Table size="small" sx={{ minWidth: 700 }}>
            <TableHead><TableRow sx={{ bgcolor: '#F8FAFC' }}>
              <TableCell sx={{ fontWeight: 900 }}>Product</TableCell><TableCell align="right" sx={{ fontWeight: 900 }}>Qty</TableCell>
              <TableCell align="right" sx={{ fontWeight: 900 }}>Rental Rate</TableCell><TableCell align="right" sx={{ fontWeight: 900 }}>Ship &amp; Pack</TableCell>
              <TableCell align="right" sx={{ fontWeight: 900 }}>Delivery &amp; Setup</TableCell><TableCell align="right" sx={{ fontWeight: 900 }}>Labor</TableCell>
            </TableRow></TableHead>
            <TableBody>{agreement.items.map(item => (
              <TableRow key={item.id}>
                <TableCell><Typography sx={{ fontWeight: 800, color: '#1E1B4B' }}>{item.part_number}</Typography><Typography sx={{ fontSize: 12, color: '#6B7280' }}>{item.part_description}</Typography></TableCell>
                <TableCell align="right">{item.quantity}</TableCell><TableCell align="right">{money(item.rental_rate)}</TableCell>
                <TableCell align="right">{money(item.shipping_fee)}</TableCell><TableCell align="right">{money(item.setup_fee)}</TableCell><TableCell align="right">{money(item.labor_fee)}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </Box>

        <Typography sx={{ fontWeight: 900, color: '#1E3A8A', mb: 1 }}>Initial Invoice Calculation</Typography>
        <DetailTable portal={portal} />

        {agreement.terms_and_conditions && (
          <Box sx={{ mb: 3, p: 2, borderRadius: '14px', bgcolor: '#FAF9FF', border: '1px solid #EDE9FE' }}>
            <Typography sx={{ color: '#7C3AED', fontWeight: 900, fontSize: 11, textTransform: 'uppercase', mb: 0.5 }}>Terms &amp; Conditions</Typography>
            <Typography sx={{ color: '#475569', whiteSpace: 'pre-wrap', fontSize: 13 }}>{agreement.terms_and_conditions}</Typography>
          </Box>
        )}

        {!acceptance ? (
          <Card variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: '18px', mb: 3, borderColor: '#C4B5FD', bgcolor: '#FAF9FF' }}>
            <Typography sx={{ fontWeight: 950, color: '#1E1B4B', fontSize: 20 }}>Sign and approve this rental agreement</Typography>
            <Typography sx={{ color: '#64748B', mt: 0.5, mb: 2 }}>Review the agreement, type your full legal name, and accept the terms before paying.</Typography>
            <TextField fullWidth label="Full legal name" value={signatureName} onChange={event => setSignatureName(event.target.value)} />
            {signatureName.trim() && <Typography sx={{ mt: 1.5, px: 2, py: 1, borderBottom: '1px solid #94A3B8', fontFamily: '"Segoe Script", "Brush Script MT", cursive', fontSize: 28, color: '#1E1B4B' }}>{signatureName.trim()}</Typography>}
            <FormControlLabel
              sx={{ mt: 1.5, alignItems: 'flex-start' }}
              control={<Checkbox checked={termsAccepted} onChange={event => setTermsAccepted(event.target.checked)} />}
              label="I have reviewed this rental agreement and agree to its terms and initial invoice calculation."
            />
            <Button variant="contained" startIcon={<DrawIcon />} disabled={!termsAccepted || signatureName.trim().length < 2 || acceptMut.isPending} onClick={() => acceptMut.mutate()} sx={{ mt: 1, fontWeight: 900, textTransform: 'none' }}>
              Sign &amp; Approve Agreement
            </Button>
          </Card>
        ) : (
          <Alert icon={<CheckCircleOutlineIcon />} severity="success" sx={{ mb: 3, borderRadius: '14px', alignItems: 'center' }}>
            <Typography sx={{ fontWeight: 900 }}>Agreement signed by {acceptance.accepted_by_name}</Typography>
            <Typography sx={{ fontSize: 13 }}>Accepted {dateLabel(acceptance.accepted_at)} · Revision {acceptance.agreement_revision}</Typography>
            <Typography sx={{ fontFamily: '"Segoe Script", "Brush Script MT", cursive', fontSize: 25, mt: 0.5 }}>{acceptance.signature_name}</Typography>
          </Alert>
        )}

        {acceptance && canPay && (
          <Card variant="outlined" sx={{ p: 2, borderRadius: '16px', mb: 3, borderColor: '#BFDBFE', bgcolor: '#F8FBFF' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
              <Box>
                <Typography sx={{ fontWeight: 900, color: '#1E3A8A' }}>Saved payment method</Typography>
                <Typography sx={{ color: '#6B7280', fontSize: 13 }}>
                  {agreement.saved_card
                    ? `${agreement.saved_card.brand || 'Card'} ending in ${agreement.saved_card.last4 || '••••'}${agreement.saved_card.exp_month && agreement.saved_card.exp_year ? ` · expires ${String(agreement.saved_card.exp_month).padStart(2, '0')}/${agreement.saved_card.exp_year}` : ''}`
                    : 'No card is saved. Saving a card is optional unless you authorize recurring auto-charge.'}
                </Typography>
                {agreement.auto_charge_authorized && <Typography sx={{ color: '#059669', fontSize: 13, fontWeight: 800 }}>Recurring {frequencyLabel(agreement.billing_frequency).toLowerCase()} charges are authorized.</Typography>}
              </Box>
              <Chip label={agreement.has_card_on_file ? 'Card saved' : 'Not saved'} sx={{ fontWeight: 900, bgcolor: agreement.has_card_on_file ? '#DCFCE7' : '#FEF3C7', color: agreement.has_card_on_file ? '#15803D' : '#B45309' }} />
            </Box>
            {!showCardSave ? (
              <Button startIcon={<CreditCardIcon />} variant="outlined" onClick={() => setShowCardSave(true)} sx={{ mt: 1.5, borderRadius: '12px', fontWeight: 800, textTransform: 'none' }}>
                {agreement.has_card_on_file ? 'Replace saved card' : 'Save a card for future payments'}
              </Button>
            ) : (
              <Box sx={{ mt: 2 }}>
                <FormControlLabel control={<Checkbox checked={authorizeAutoCharge} onChange={event => setAuthorizeAutoCharge(event.target.checked)} />} label={`I authorize automatic ${frequencyLabel(agreement.billing_frequency).toLowerCase()} charges under this agreement.`} />
                <SquareCardCheckout
                  applicationId={square.application_id!} locationId={square.location_id!} sdkUrl={square.sdk_url}
                  amount={0} currency={square.currency} payerName={agreement.customer_name} payerEmail={agreement.customer_email}
                  intent="STORE" submitLabel="Save card securely" processing={saveCardMut.isPending}
                  onPaymentToken={(sourceId) => saveCardMut.mutate(sourceId)}
                />
                <Button onClick={() => setShowCardSave(false)} sx={{ mt: 1, fontWeight: 800 }}>Cancel</Button>
              </Box>
            )}
          </Card>
        )}

        <Divider sx={{ my: 3 }} />
        <Typography sx={{ fontWeight: 900, color: '#1E3A8A', mb: 1 }}>Rental Invoices</Typography>
        {thankYouInvoice && <Alert severity="success" sx={{ mb: 2, borderRadius: '14px' }}><strong>Thank you.</strong> Payment for {thankYouInvoice} was received successfully.</Alert>}
        {invoices.length === 0 ? <Typography sx={{ color: '#6B7280', fontWeight: 700 }}>No invoices yet.</Typography> : (
          <Box sx={{ display: 'grid', gap: 1.5 }}>
            {invoices.map(invoice => {
              const style = statusStyle(invoice.status)
              const unpaid = Number(invoice.balance_due || 0) > 0 && invoice.status !== 'paid'
              return (
                <Card key={invoice.id} variant="outlined" sx={{ p: 2, borderRadius: '14px' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                    <Box><Typography sx={{ fontWeight: 900, color: '#1E3A8A' }}>{invoice.invoice_number}</Typography><Typography sx={{ color: '#6B7280', fontSize: 13 }}>{invoice.id === initialInvoiceId ? 'Initial rental invoice' : invoice.notes || 'Recurring rental invoice'} · due {dateLabel(invoice.due_date)}</Typography></Box>
                    <Box sx={{ textAlign: 'right' }}><Typography sx={{ fontWeight: 950, color: '#1E3A8A', fontSize: 18 }}>{money(invoice.total_amount)}</Typography><Chip size="small" label={invoice.status.replace('_', ' ')} sx={{ fontWeight: 900, textTransform: 'uppercase', bgcolor: style.bg, color: style.color }} /></Box>
                  </Box>
                  <InvoiceBreakdown invoice={invoice} />
                  {unpaid && !acceptance && <Alert severity="info" sx={{ mt: 1.5 }}>Sign and approve the agreement above to unlock payment.</Alert>}
                  {unpaid && acceptance && canPay && (
                    payTarget?.id === invoice.id ? (
                      <Box sx={{ mt: 2 }}>
                        <FormControlLabel control={<Checkbox checked={saveCardForFuture} onChange={event => { setSaveCardForFuture(event.target.checked); if (!event.target.checked) setAuthorizeAutoCharge(false) }} />} label="Save this card securely for future rental payments" />
                        <FormControlLabel disabled={!saveCardForFuture} control={<Checkbox checked={authorizeAutoCharge} onChange={event => setAuthorizeAutoCharge(event.target.checked)} />} label={`Authorize automatic ${frequencyLabel(agreement.billing_frequency).toLowerCase()} charges under this agreement`} />
                        <Typography sx={{ color: '#64748B', fontSize: 12, mb: 1 }}>Saving a card and recurring authorization are optional and recorded separately. Full card details are never stored by MedRad.</Typography>
                        <SquareCardCheckout applicationId={square.application_id!} locationId={square.location_id!} sdkUrl={square.sdk_url} amount={Number(invoice.balance_due || 0)} currency={square.currency} payerName={agreement.customer_name} payerEmail={agreement.customer_email} processing={payMut.isPending} onPaymentToken={(sourceId, idempotencyKey) => payMut.mutate({ invoiceId: invoice.id, sourceId, idempotencyKey })} />
                        <Button onClick={() => setPayTarget(null)} sx={{ mt: 1, fontWeight: 800 }}>Cancel</Button>
                      </Box>
                    ) : (
                      <Button variant="contained" startIcon={<CreditCardIcon />} onClick={() => setPayTarget(invoice)} sx={{ mt: 1.5, borderRadius: '12px', fontWeight: 900, textTransform: 'none' }}>
                        {invoice.id === initialInvoiceId ? 'Pay Initial Invoice' : 'Pay Invoice'} · {money(invoice.balance_due)}
                      </Button>
                    )
                  )}
                </Card>
              )
            })}
          </Box>
        )}
      </Card>
    </Box>
  )
}

export default ClientRental
