import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Alert, Box, Button, Card, Checkbox, Chip, CircularProgress, Divider,
  FormControlLabel, Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Typography,
} from '@mui/material'
import CreditCardIcon from '@mui/icons-material/CreditCard'
import DrawIcon from '@mui/icons-material/Draw'
import PrintIcon from '@mui/icons-material/Print'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'

import SquareCardCheckout from '@/components/Billing/SquareCardCheckout'
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
import {
  acceptPublicRental,
  fetchRentalPortal,
  payPublicRentalInvoice,
  type RentalPortalInvoice,
} from '@/api/rentals'

const money = (value: number | string | null | undefined) => `$${Number(value || 0).toFixed(2)}`
const dateLabel = (value?: string | null) => (value
  ? new Date(`${value}${value.length === 10 ? 'T00:00:00' : ''}`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  : '—')
const frequencyLabel = (value: string) => value === 'biweekly' ? 'Bi-weekly' : `${value.charAt(0).toUpperCase()}${value.slice(1)}`

const Centered = ({ children }: { children: React.ReactNode }) => (
  <Box sx={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#F5F3FF', p: 3 }}>
    {children}
  </Box>
)

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
  const [authorizeFuturePayments, setAuthorizeFuturePayments] = useState(false)
  const [thankYouInvoice, setThankYouInvoice] = useState('')
  const [printInvoiceId, setPrintInvoiceId] = useState<number | null>(null)

  useEffect(() => {
    const clearPrintSelection = () => setPrintInvoiceId(null)
    window.addEventListener('afterprint', clearPrintSelection)
    return () => window.removeEventListener('afterprint', clearPrintSelection)
  }, [])

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

  const payMut = useMutation({
    mutationFn: ({ invoiceId, sourceId, idempotencyKey }: { invoiceId: number; sourceId: string; idempotencyKey: string }) =>
      payPublicRentalInvoice(token, invoiceId, sourceId, idempotencyKey, authorizeFuturePayments, authorizeFuturePayments),
    onSuccess: (data) => {
      queryClient.setQueryData(['rental-portal', token], data)
      setThankYouInvoice(payTarget?.invoice_number || '')
      setPayTarget(null)
      setAuthorizeFuturePayments(false)
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
  const initialInvoice = invoices[0]
  const initialInvoiceId = initialInvoice?.id
  const displayedInvoice = printInvoiceId
    ? invoices.find(invoice => invoice.id === printInvoiceId) || initialInvoice
    : initialInvoice
  const initialPaymentComplete = Boolean(
    initialInvoice
    && (initialInvoice.status === 'paid' || Number(initialInvoice.balance_due || 0) <= 0),
  )
  const autoChargeStatus = agreement.auto_charge_authorized
    ? 'Authorized'
    : authorizeFuturePayments
      ? 'Selected — activates after payment'
    : initialPaymentComplete
      ? 'Not authorized'
      : 'Choose during payment'
  const documentLabel = acceptance && displayedInvoice ? 'Rental Invoice' : 'Rental Agreement'
  const documentNumber = acceptance && displayedInvoice
    ? displayedInvoice.invoice_number
    : agreement.rental_number
  const documentStatus = acceptance && displayedInvoice ? displayedInvoice.status : agreement.status

  const printInvoice = (invoiceId: number) => {
    setPrintInvoiceId(invoiceId)
    window.setTimeout(() => window.print(), 50)
  }

  return (
    <Box sx={{
      ...customerPortalSx,
      ...(printInvoiceId ? {
        '@media print': {
          height: 'auto',
          overflow: 'visible',
          bgcolor: '#FFFFFF',
          p: 0,
          '& .rental-agreement-content': { display: 'none' },
          '& .rental-screen-only': { display: 'none !important' },
          '& .rental-invoice-card': { breakInside: 'avoid', boxShadow: 'none' },
        },
      } : {}),
    }}>
      <Card sx={customerDocumentCardSx}>
        <CustomerDocumentHeader
          label={documentLabel}
          number={documentNumber}
          companyName={company_name}
          meta={acceptance && displayedInvoice ? `Agreement ${agreement.rental_number}` : `Revision ${agreement.revision}`}
          status={documentStatus}
        />

        <Box className="rental-agreement-content">
        <CustomerDocumentProgress steps={[
          { label: 'Review agreement', complete: true },
          { label: acceptance ? 'Agreement signed' : 'Sign agreement', complete: Boolean(acceptance) },
          { label: initialPaymentComplete ? 'Payment complete' : 'Pay initial invoice', complete: initialPaymentComplete },
        ]} />

        {!acceptance && (
          <Alert
            severity="info"
            action={(
              <Button
                color="inherit"
                size="small"
                onClick={() => document.getElementById('rental-acceptance')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                sx={{ fontWeight: 900, whiteSpace: 'nowrap' }}
              >
                Continue to signature
              </Button>
            )}
            sx={{ mb: 3, borderRadius: '14px', alignItems: 'center' }}
          >
            Review the agreement and its terms, then sign before making the initial payment.
          </Alert>
        )}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5, mb: 3 }}>
          <CustomerRecipientCard name={agreement.customer_name} email={agreement.customer_email} address={agreement.customer_address} />
          <CustomerDetailsCard rows={[
            { label: 'Billing', value: frequencyLabel(agreement.billing_frequency) },
            { label: 'Rental period', value: `${dateLabel(agreement.start_date)} – ${dateLabel(agreement.end_date)}` },
            { label: 'Next billing', value: dateLabel(agreement.next_bill_date) },
            { label: 'Auto-charge', value: autoChargeStatus },
          ]} />
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

        {agreement.terms_and_conditions && (
          <Box sx={{ mb: 3, p: 2, borderRadius: '14px', bgcolor: '#FAF9FF', border: '1px solid #EDE9FE' }}>
            <Typography sx={{ color: '#7C3AED', fontWeight: 900, fontSize: 11, textTransform: 'uppercase', mb: 0.5 }}>Terms &amp; Conditions</Typography>
            <Typography sx={{ color: '#475569', whiteSpace: 'pre-wrap', fontSize: 13 }}>{agreement.terms_and_conditions}</Typography>
          </Box>
        )}
        </Box>

        {!acceptance ? (
          <Card id="rental-acceptance" className="rental-agreement-content" variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderRadius: '18px', mb: 3, borderColor: '#C4B5FD', bgcolor: '#FAF9FF', scrollMarginTop: 24 }}>
            <Typography sx={{ fontWeight: 950, color: '#1E1B4B', fontSize: 20 }}>Sign and approve this rental agreement</Typography>
            <Typography sx={{ color: '#64748B', mt: 0.5, mb: 2 }}>Review the agreement, type your full legal name, and accept the terms before paying.</Typography>
            <TextField fullWidth label="Type your full legal name" value={signatureName} onChange={event => setSignatureName(event.target.value)} helperText="Your typed name will be rendered as your electronic signature." sx={{ mb: 2 }} />
            <CustomerSignaturePreview name={signatureName} />
            <FormControlLabel
              sx={{ ...customerConsentLabelSx, mt: 1.5 }}
              control={<Checkbox checked={termsAccepted} onChange={event => setTermsAccepted(event.target.checked)} />}
              label="I have reviewed this rental agreement and agree to its terms and initial payment obligations."
            />
            <Button variant="contained" startIcon={<DrawIcon />} disabled={!termsAccepted || signatureName.trim().length < 2 || acceptMut.isPending} onClick={() => acceptMut.mutate()} sx={{ mt: 1, fontWeight: 900, textTransform: 'none' }}>
              Sign &amp; Approve Agreement
            </Button>
          </Card>
        ) : <CustomerSignatureRecord context="Agreement" acceptedBy={acceptance.accepted_by_name} acceptedAt={dateLabel(acceptance.accepted_at)} signature={acceptance.signature_name} detail={`Revision ${acceptance.agreement_revision}`} />}

        {acceptance && (
          <>
            <Divider sx={{ my: 3 }} />
            <Typography sx={{ fontWeight: 900, color: '#1E3A8A', mb: 1 }}>Rental Invoices</Typography>
            {thankYouInvoice && <Alert severity="success" sx={{ mb: 2, borderRadius: '14px' }}><strong>Thank you.</strong> Payment for {thankYouInvoice} was received successfully.</Alert>}
            {invoices.length === 0 ? <Typography sx={{ color: '#6B7280', fontWeight: 700 }}>No invoices yet.</Typography> : (
          <Box sx={{ display: 'grid', gap: 1.5 }}>
            {invoices.map(invoice => {
              const style = customerDocumentStatusStyle(invoice.status)
              const unpaid = Number(invoice.balance_due || 0) > 0 && invoice.status !== 'paid'
              return (
                <Card
                  key={invoice.id}
                  className="rental-invoice-card"
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderRadius: '14px',
                    '@media print': { display: printInvoiceId === null || printInvoiceId === invoice.id ? 'block' : 'none' },
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                    <Box><Typography sx={{ fontWeight: 900, color: '#1E3A8A' }}>{invoice.invoice_number}</Typography><Typography sx={{ color: '#6B7280', fontSize: 13 }}>{invoice.id === initialInvoiceId ? 'Initial rental invoice' : invoice.notes || 'Recurring rental invoice'} · due {dateLabel(invoice.due_date)}</Typography></Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                      <Box sx={{ textAlign: 'right' }}><Typography sx={{ fontWeight: 950, color: '#1E3A8A', fontSize: 18 }}>{money(invoice.total_amount)}</Typography><Chip size="small" label={invoice.status.replace('_', ' ')} sx={{ fontWeight: 900, textTransform: 'uppercase', bgcolor: style.bg, color: style.color }} /></Box>
                      <Button
                        className="rental-screen-only"
                        variant="outlined"
                        startIcon={<PrintIcon />}
                        onClick={() => printInvoice(invoice.id)}
                        sx={{ borderRadius: '10px', fontWeight: 900, textTransform: 'none', whiteSpace: 'nowrap' }}
                      >
                        Print / Save PDF
                      </Button>
                    </Box>
                  </Box>
                  <InvoiceBreakdown invoice={invoice} />
                  {unpaid && !acceptance && <Alert className="rental-screen-only" severity="info" sx={{ mt: 1.5 }}>Sign and approve the agreement above to unlock payment.</Alert>}
                  {unpaid && acceptance && canPay && (
                    payTarget?.id === invoice.id ? (
                      <Box className="rental-screen-only" sx={{ mt: 2 }}>
                        {agreement.auto_charge_authorized && agreement.saved_card ? (
                          <Alert severity="success" sx={{ mb: 1.5, borderRadius: '12px' }}>
                            Automatic {frequencyLabel(agreement.billing_frequency).toLowerCase()} payments are authorized using {agreement.saved_card.brand || 'the saved card'} ending in {agreement.saved_card.last4 || '••••'}.
                          </Alert>
                        ) : (
                          <FormControlLabel
                            sx={{ ...customerConsentLabelSx, mb: 0.5 }}
                            control={<Checkbox checked={authorizeFuturePayments} onChange={event => setAuthorizeFuturePayments(event.target.checked)} />}
                            label={`Save this card securely and authorize automatic ${frequencyLabel(agreement.billing_frequency).toLowerCase()} payments for future billing periods`}
                          />
                        )}
                        <Typography sx={{ color: '#64748B', fontSize: 12, mb: 1 }}>
                          Leave the option unchecked for a one-time payment. MedRad never stores the full card number or security code.
                        </Typography>
                        <SquareCardCheckout applicationId={square.application_id!} locationId={square.location_id!} sdkUrl={square.sdk_url} amount={Number(invoice.balance_due || 0)} currency={square.currency} payerName={agreement.customer_name} payerEmail={agreement.customer_email} processing={payMut.isPending} onPaymentToken={(sourceId, idempotencyKey) => payMut.mutate({ invoiceId: invoice.id, sourceId, idempotencyKey })} />
                        <Button onClick={() => { setPayTarget(null); setAuthorizeFuturePayments(false) }} sx={{ mt: 1, fontWeight: 800 }}>Cancel</Button>
                      </Box>
                    ) : (
                      <Button className="rental-screen-only" variant="contained" startIcon={<CreditCardIcon />} onClick={() => { setAuthorizeFuturePayments(false); setPayTarget(invoice) }} sx={{ mt: 1.5, borderRadius: '12px', fontWeight: 900, textTransform: 'none' }}>
                        {invoice.id === initialInvoiceId ? 'Pay Initial Invoice' : 'Pay Invoice'} · {money(invoice.balance_due)}
                      </Button>
                    )
                  )}
                </Card>
              )
            })}
          </Box>
            )}
          </>
        )}
      </Card>
    </Box>
  )
}

export default ClientRental
