import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Alert, Box, Button, Card, Checkbox, Chip, CircularProgress, Divider,
  Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Typography,
} from '@mui/material'
import CreditCardIcon from '@mui/icons-material/CreditCard'
import DrawIcon from '@mui/icons-material/Draw'
import PrintIcon from '@mui/icons-material/Print'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'

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
import {
  acceptAccountRental,
  acceptAccountRentalExtension,
  acceptPublicRental,
  acceptPublicRentalExtension,
  acceptRentalLinkExtension,
  cancelAccountRentalExtension,
  cancelExtensionByToken,
  cancelRentalLinkExtension,
  fetchAccountRental,
  fetchRentalExtensionPortal,
  fetchRentalPortal,
  payAccountRentalInvoice,
  payPublicRentalInvoice,
  removeAccountRentalCard,
  removePublicRentalCard,
  requestAccountRentalExtension,
  requestPublicRentalExtension,
  saveAccountRentalCard,
  savePublicRentalCard,
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
  const { token = '', rentalId = '', extensionToken = '' } = useParams()
  const accountRentalId = Number(rentalId || 0)
  const isAccountView = accountRentalId > 0
  const isExtensionView = Boolean(extensionToken)
  const queryClient = useQueryClient()
  const [signatureName, setSignatureName] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [payTarget, setPayTarget] = useState<RentalPortalInvoice | null>(null)
  const [authorizeFuturePayments, setAuthorizeFuturePayments] = useState(false)
  const [thankYouInvoice, setThankYouInvoice] = useState('')
  const [printInvoiceId, setPrintInvoiceId] = useState<number | null>(null)
  const [showExtensionRequest, setShowExtensionRequest] = useState(false)
  const [extensionEndDate, setExtensionEndDate] = useState('')
  const [extensionPeriods, setExtensionPeriods] = useState('')
  const [extensionReason, setExtensionReason] = useState('')
  const [extensionSignature, setExtensionSignature] = useState('')
  const [extensionTermsAccepted, setExtensionTermsAccepted] = useState(false)
  const [continueAutoCharge, setContinueAutoCharge] = useState(false)
  const [showCardEditor, setShowCardEditor] = useState(false)
  const [authorizeReplacement, setAuthorizeReplacement] = useState(false)
  const [confirmCardRemoval, setConfirmCardRemoval] = useState(false)

  const portalKey = isAccountView
    ? ['rental-account', accountRentalId]
    : isExtensionView
      ? ['rental-extension', extensionToken]
      : ['rental-portal', token]

  useEffect(() => {
    const clearPrintSelection = () => setPrintInvoiceId(null)
    window.addEventListener('afterprint', clearPrintSelection)
    return () => window.removeEventListener('afterprint', clearPrintSelection)
  }, [])

  const portalQ = useQuery({
    queryKey: portalKey,
    queryFn: () => isAccountView
      ? fetchAccountRental(accountRentalId)
      : isExtensionView
        ? fetchRentalExtensionPortal(extensionToken)
        : fetchRentalPortal(token),
    enabled: isAccountView || isExtensionView || Boolean(token),
    retry: false,
  })

  const acceptMut = useMutation({
    mutationFn: () => isAccountView
      ? acceptAccountRental(accountRentalId, signatureName.trim())
      : acceptPublicRental(token, signatureName.trim()),
    onSuccess: (data) => {
      queryClient.setQueryData(
        portalKey,
        data,
      )
      queryClient.invalidateQueries({ queryKey: ['rentals'] })
      queryClient.invalidateQueries({ queryKey: ['rental-invoices'] })
      queryClient.invalidateQueries({ queryKey: ['rental-summary'] })
      toast.success('Rental agreement signed and approved')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not approve the agreement'),
  })

  const requestExtensionMut = useMutation({
    mutationFn: () => {
      const payload = {
        requested_end_date: extensionEndDate || null,
        additional_periods: extensionPeriods ? Number(extensionPeriods) : null,
        reason: extensionReason.trim() || null,
      }
      return isAccountView
        ? requestAccountRentalExtension(accountRentalId, payload)
        : requestPublicRentalExtension(token, payload)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(portalKey, data)
      queryClient.invalidateQueries({ queryKey: ['rentals'] })
      setShowExtensionRequest(false)
      toast.success('Extension request sent for review')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not request the extension'),
  })

  const acceptExtensionMut = useMutation({
    mutationFn: () => {
      if (!portalQ.data?.extension) throw new Error('Extension is unavailable')
      return isAccountView
        ? acceptAccountRentalExtension(accountRentalId, portalQ.data.extension.id, extensionSignature.trim(), continueAutoCharge)
        : isExtensionView
          ? acceptPublicRentalExtension(extensionToken, extensionSignature.trim(), continueAutoCharge)
          : acceptRentalLinkExtension(token, portalQ.data.extension.id, extensionSignature.trim(), continueAutoCharge)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(portalKey, data)
      queryClient.invalidateQueries({ queryKey: ['rentals'] })
      queryClient.invalidateQueries({ queryKey: ['rental-summary'] })
      toast.success('Rental extension signed and activated')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not accept the extension'),
  })

  const withdrawExtensionMut = useMutation({
    mutationFn: () => {
      if (!portalQ.data?.extension) throw new Error('Extension is unavailable')
      return isAccountView
        ? cancelAccountRentalExtension(accountRentalId, portalQ.data.extension.id)
        : isExtensionView
          ? cancelExtensionByToken(extensionToken)
          : cancelRentalLinkExtension(token, portalQ.data.extension.id)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(portalKey, data)
      queryClient.invalidateQueries({ queryKey: ['rentals'] })
      toast.success('Extension withdrawn')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not withdraw the extension'),
  })

  const payMut = useMutation({
    mutationFn: ({ invoiceId, sourceId, idempotencyKey }: { invoiceId: number; sourceId: string; idempotencyKey: string }) =>
      isAccountView
        ? payAccountRentalInvoice(accountRentalId, invoiceId, sourceId, idempotencyKey, authorizeFuturePayments, authorizeFuturePayments)
        : payPublicRentalInvoice(token, invoiceId, sourceId, idempotencyKey, authorizeFuturePayments, authorizeFuturePayments),
    onSuccess: (data) => {
      queryClient.setQueryData(
        isAccountView ? ['rental-account', accountRentalId] : ['rental-portal', token],
        data,
      )
      queryClient.invalidateQueries({ queryKey: ['rentals'] })
      queryClient.invalidateQueries({ queryKey: ['rental-invoices'] })
      queryClient.invalidateQueries({ queryKey: ['rental-summary'] })
      setThankYouInvoice(payTarget?.invoice_number || '')
      setPayTarget(null)
      setAuthorizeFuturePayments(false)
      toast.success('Payment successful — thank you!')
    },
    onError: (e: any, variables) => {
      const detail = e.response?.data?.detail || 'Payment could not be completed'
      const verificationPending = e.response?.status === 409 || /pending|verif/i.test(String(detail))
      if (!verificationPending && payTarget) {
        clearSquarePaymentKey(`rental-invoice-${variables.invoiceId}-${Number(payTarget.balance_due || 0).toFixed(2)}`)
      }
      toast.error(detail)
    },
  })

  const saveCardMut = useMutation({
    mutationFn: ({ sourceId, idempotencyKey }: { sourceId: string; idempotencyKey: string }) =>
      isAccountView
        ? saveAccountRentalCard(accountRentalId, sourceId, authorizeReplacement, idempotencyKey)
        : savePublicRentalCard(token, sourceId, authorizeReplacement, idempotencyKey),
    onSuccess: (data) => {
      clearSquarePaymentKey(`rental-saved-card-${isAccountView ? accountRentalId : token}`)
      queryClient.setQueryData(portalKey, data)
      queryClient.invalidateQueries({ queryKey: ['rentals'] })
      queryClient.invalidateQueries({ queryKey: ['rental-invoices'] })
      setShowCardEditor(false)
      setAuthorizeReplacement(false)
      toast.success('Saved payment method updated securely')
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Could not update the saved payment method'),
  })

  const removeCardMut = useMutation({
    mutationFn: () => isAccountView
      ? removeAccountRentalCard(accountRentalId)
      : removePublicRentalCard(token),
    onSuccess: (data) => {
      queryClient.setQueryData(portalKey, data)
      queryClient.invalidateQueries({ queryKey: ['rentals'] })
      queryClient.invalidateQueries({ queryKey: ['rental-invoices'] })
      setConfirmCardRemoval(false)
      setShowCardEditor(false)
      toast.success('Saved card removed and automatic payments stopped')
    },
    onError: (e: any) => {
      setConfirmCardRemoval(false)
      void portalQ.refetch()
      toast.error(e.response?.data?.detail || 'Could not remove the saved card')
    },
  })

  if (portalQ.isLoading) return <Centered><CircularProgress /></Centered>
  if (portalQ.isError || !portalQ.data) {
    return <Centered><Alert severity="error" sx={{ borderRadius: '14px' }}>
      {isAccountView ? 'This rental agreement is unavailable or outside your facility access.' : 'This rental link is invalid or has expired.'}
    </Alert></Centered>
  }

  const portal = portalQ.data
  const { agreement, acceptance, invoices, billing_schedule, next_payment, square, company_name, extension } = portal
  const canTransact = portal.can_transact !== false
  const canPay = canTransact && !isExtensionView && square.enabled && Boolean(square.application_id) && Boolean(square.location_id)
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
          '& .rental-screen-only': { display: 'none !important' },
          '& .rental-invoice-card': {
            breakInside: 'auto',
            pageBreakInside: 'auto',
            boxShadow: 'none',
          },
          '& .rental-invoice-card tr': {
            breakInside: 'avoid',
            pageBreakInside: 'avoid',
          },
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
          { label: acceptance ? 'Agreement signed' : canTransact ? 'Sign agreement' : 'Awaiting primary signature', complete: Boolean(acceptance) },
          { label: initialPaymentComplete ? 'Payment complete' : 'Pay initial invoice', complete: initialPaymentComplete },
        ]} />

        {!acceptance && canTransact && (
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
        {!acceptance && !canTransact && (
          <Alert severity="info" sx={{ mb: 3, borderRadius: '14px' }}>
            You are a copied recipient. You can review this agreement and its invoices; the selected primary recipient will sign and pay.
          </Alert>
        )}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5, mb: 3 }}>
          <CustomerRecipientCard name={agreement.customer_name} email={agreement.customer_email} address={agreement.customer_address} />
          <CustomerDetailsCard rows={[
            { label: 'Billing', value: frequencyLabel(agreement.billing_frequency) },
            { label: 'Rental period', value: `${dateLabel(agreement.start_date)} – ${dateLabel(agreement.end_date)}` },
            { label: 'Security deposit', value: money(agreement.security_deposit) },
            { label: 'Next billing', value: dateLabel(agreement.next_bill_date) },
            { label: 'Next payment', value: next_payment ? `${money(next_payment.amount)} · ${next_payment.status === 'due' ? 'Due now' : `Period ${next_payment.period}`}` : 'Schedule complete' },
            { label: 'Auto-charge', value: autoChargeStatus },
          ]} />
        </Box>

        <Typography sx={{ fontWeight: 900, color: '#1E3A8A', mb: 1 }}>Rented Products</Typography>
        <Box sx={{ overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: '14px', mb: 3 }}>
          <Table size="small" sx={{ minWidth: 700 }}>
            <TableHead><TableRow sx={{ bgcolor: '#F8FAFC' }}>
              <TableCell sx={{ fontWeight: 900 }}>Product</TableCell><TableCell align="right" sx={{ fontWeight: 900 }}>Qty</TableCell>
              <TableCell align="right" sx={{ fontWeight: 900 }}>Rental Rate</TableCell><TableCell align="right" sx={{ fontWeight: 900 }}>Ship &amp; Pack</TableCell>
              <TableCell align="right" sx={{ fontWeight: 900 }}>Delivery &amp; Setup</TableCell><TableCell align="right" sx={{ fontWeight: 900 }}>Removal</TableCell><TableCell align="right" sx={{ fontWeight: 900 }}>Labor</TableCell><TableCell align="right" sx={{ fontWeight: 900 }}>Deposit / unit</TableCell>
            </TableRow></TableHead>
            <TableBody>{agreement.items.map(item => (
              <TableRow key={item.id}>
                <TableCell><Typography sx={{ fontWeight: 800, color: '#1E1B4B' }}>{item.part_number}</Typography><Typography sx={{ fontSize: 12, color: '#6B7280' }}>{item.part_description}</Typography></TableCell>
                <TableCell align="right">{item.quantity}</TableCell><TableCell align="right">{money(item.rental_rate)}</TableCell>
                <TableCell align="right">{money(item.shipping_fee)}</TableCell><TableCell align="right">{money(item.setup_fee)}</TableCell><TableCell align="right">{money(item.removal_fee)}</TableCell><TableCell align="right">{money(item.labor_fee)}</TableCell><TableCell align="right">{money(item.security_deposit)}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </Box>

        <Typography sx={{ fontWeight: 900, color: '#1E3A8A', mb: 1 }}>Billing Schedule</Typography>
        <Box sx={{ overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: '14px', mb: 3 }}>
          <Table size="small" sx={{ minWidth: 720 }}>
            <TableHead><TableRow sx={{ bgcolor: '#F8FAFC' }}>
              <TableCell sx={{ fontWeight: 900 }}>Period</TableCell>
              <TableCell sx={{ fontWeight: 900 }}>Billing Period</TableCell>
              <TableCell align="right" sx={{ fontWeight: 900 }}>Rent</TableCell>
              <TableCell align="right" sx={{ fontWeight: 900 }}>Discount</TableCell>
              <TableCell align="right" sx={{ fontWeight: 900 }}>Tax</TableCell>
              <TableCell align="right" sx={{ fontWeight: 900 }}>Expected Total</TableCell>
              <TableCell align="right" sx={{ fontWeight: 900 }}>Status</TableCell>
            </TableRow></TableHead>
            <TableBody>{billing_schedule.map(period => {
              const style = customerDocumentStatusStyle(period.status)
              return (
                <TableRow key={period.period} sx={{ bgcolor: next_payment?.period === period.period ? '#FAF9FF' : undefined }}>
                  <TableCell sx={{ fontWeight: 850 }}>{period.period} of {agreement.effective_periods}</TableCell>
                  <TableCell>{dateLabel(period.billing_date)} – {dateLabel(period.period_end)}</TableCell>
                  <TableCell align="right">{money(period.rental_amount)}</TableCell>
                  <TableCell align="right">
                    {Number(period.discount || 0) > 0 ? `-${money(period.discount)}` : '—'}
                    {period.discount_conditional ? <Typography component="span" sx={{ display: 'block', fontSize: 10, color: '#B45309', fontWeight: 800 }}>with saved-card authorization</Typography> : null}
                  </TableCell>
                  <TableCell align="right">{money(period.tax)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 900 }}>{money(period.total)}</TableCell>
                  <TableCell align="right"><Chip size="small" label={period.status.replace('_', ' ')} sx={{ fontWeight: 900, textTransform: 'uppercase', bgcolor: style.bg, color: style.color }} /></TableCell>
                </TableRow>
              )
            })}</TableBody>
          </Table>
        </Box>

        {agreement.terms_and_conditions && (
          <Box sx={{ mb: 3, p: 2, borderRadius: '14px', bgcolor: '#FAF9FF', border: '1px solid #EDE9FE' }}>
            <Typography sx={{ color: '#7C3AED', fontWeight: 900, fontSize: 11, textTransform: 'uppercase', mb: 0.5 }}>Terms &amp; Conditions</Typography>
            <Typography sx={{ color: '#475569', whiteSpace: 'pre-wrap', fontSize: 13 }}>{agreement.terms_and_conditions}</Typography>
          </Box>
        )}

        {acceptance && (
          <Card className="rental-screen-only" variant="outlined" sx={{ mb: 3, p: { xs: 2, md: 2.5 }, borderRadius: '16px', borderColor: '#C4B5FD', bgcolor: '#FAF9FF' }}>
            <Typography sx={{ fontWeight: 950, color: '#1E1B4B', fontSize: 19 }}>Agreement Extension</Typography>
            {extension?.status === 'requested' && (
              <Box sx={{ mt: 1.5 }}>
                <Alert severity="info" sx={{ borderRadius: '12px' }}>
                  Your extension request is under review. The current agreement and billing schedule remain unchanged.
                </Alert>
                <Button variant="outlined" color="error" disabled={withdrawExtensionMut.isPending} onClick={() => withdrawExtensionMut.mutate()} sx={{ mt: 1.5, fontWeight: 900, textTransform: 'none' }}>
                  Withdraw Request
                </Button>
              </Box>
            )}
            {extension?.status === 'rejected' && (
              <Alert severity="warning" sx={{ mt: 1.5, borderRadius: '12px' }}>
                The latest extension request was not approved{extension.decision_notes ? `: ${extension.decision_notes}` : '.'}
              </Alert>
            )}
            {extension?.status === 'accepted' && (
              <CustomerSignatureRecord
                context={`Extension #${extension.sequence}`}
                acceptedBy={extension.accepted_by_name || ''}
                acceptedAt={dateLabel(extension.accepted_at)}
                signature={extension.signature_name || ''}
                detail={`Extended through ${dateLabel(extension.offered_end_date)}`}
              />
            )}
            {extension?.status === 'offered' && (
              <Box sx={{ mt: 1.5 }}>
                <Alert severity="success" sx={{ mb: 2, borderRadius: '12px' }}>
                  Extension #{extension.sequence} is ready for your review. Your live schedule changes only after you sign.
                </Alert>
                <CustomerDetailsCard rows={[
                  { label: 'Current end date', value: dateLabel(extension.original_end_date) },
                  { label: 'New end date', value: dateLabel(extension.offered_end_date) },
                  { label: 'Total billing periods', value: String(extension.offered_total_periods || '—') },
                  { label: 'Future billing', value: 'Rental charges only; upfront fees are not repeated' },
                ]} />
                {extension.offered_terms && <Typography sx={{ mt: 1.5, color: '#475569', whiteSpace: 'pre-wrap' }}>{extension.offered_terms}</Typography>}
                <TextField fullWidth label="Type your full legal name" value={extensionSignature} onChange={event => setExtensionSignature(event.target.value)} sx={{ mt: 2, mb: 1.5 }} />
                <CustomerSignaturePreview name={extensionSignature} />
                <FormControlLabel
                  sx={{ ...customerConsentLabelSx, mt: 1.5 }}
                  control={<Checkbox checked={extensionTermsAccepted} onChange={event => setExtensionTermsAccepted(event.target.checked)} />}
                  label="I accept this extension amendment and its updated rental term."
                />
                {agreement.auto_charge_authorized && agreement.has_card_on_file && (
                  <FormControlLabel
                    sx={customerConsentLabelSx}
                    control={<Checkbox checked={continueAutoCharge} onChange={event => setContinueAutoCharge(event.target.checked)} />}
                    label="Continue authorized automatic payments for the extended billing periods."
                  />
                )}
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                  <Button variant="contained" startIcon={<DrawIcon />} disabled={!extensionTermsAccepted || extensionSignature.trim().length < 2 || acceptExtensionMut.isPending} onClick={() => acceptExtensionMut.mutate()} sx={{ fontWeight: 900, textTransform: 'none' }}>
                    Sign &amp; Accept Extension
                  </Button>
                  <Button variant="outlined" color="error" disabled={withdrawExtensionMut.isPending} onClick={() => withdrawExtensionMut.mutate()} sx={{ fontWeight: 900, textTransform: 'none' }}>
                    Decline Extension
                  </Button>
                </Box>
              </Box>
            )}
            {portal.can_request_extension && !isExtensionView && !showExtensionRequest && (
              <Button variant="outlined" onClick={() => setShowExtensionRequest(true)} sx={{ mt: 1.5, fontWeight: 900, textTransform: 'none' }}>Request Extension</Button>
            )}
            {portal.can_request_extension && !isExtensionView && showExtensionRequest && (
              <Box sx={{ mt: 2, display: 'grid', gap: 1.5 }}>
                <Typography sx={{ color: '#64748B' }}>Enter a desired end date, additional periods, or both. Staff will review and send a signable amendment.</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                  <TextField type="date" label="Requested end date" InputLabelProps={{ shrink: true }} value={extensionEndDate} onChange={event => setExtensionEndDate(event.target.value)} inputProps={{ min: agreement.end_date }} />
                  <TextField type="number" label="Additional billing periods" value={extensionPeriods} onChange={event => setExtensionPeriods(event.target.value)} inputProps={{ min: 1, max: 1200 }} />
                </Box>
                <TextField multiline minRows={2} label="Reason or notes (optional)" value={extensionReason} onChange={event => setExtensionReason(event.target.value)} />
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button variant="contained" disabled={(!extensionEndDate && !extensionPeriods) || requestExtensionMut.isPending} onClick={() => requestExtensionMut.mutate()} sx={{ fontWeight: 900, textTransform: 'none' }}>Submit Request</Button>
                  <Button onClick={() => setShowExtensionRequest(false)} sx={{ fontWeight: 800 }}>Cancel</Button>
                </Box>
              </Box>
            )}
          </Card>
        )}
        </Box>

        {!acceptance && canTransact ? (
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
        ) : acceptance ? <CustomerSignatureRecord context="Agreement" acceptedBy={acceptance.accepted_by_name} acceptedAt={dateLabel(acceptance.accepted_at)} signature={acceptance.signature_name} detail={`Revision ${acceptance.agreement_revision}`} /> : null}

        {acceptance && canTransact && !isExtensionView && (
          <Card className="rental-screen-only" variant="outlined" sx={{ mt: 2.5, p: { xs: 2, md: 2.5 }, borderRadius: '16px', borderColor: '#C4B5FD', bgcolor: '#FAF9FF' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 1.5, flexWrap: 'wrap' }}>
              <Box>
                <Typography sx={{ fontWeight: 950, color: '#1E1B4B', fontSize: 19 }}>Secure payment method</Typography>
                {agreement.saved_card ? (
                  <Typography sx={{ color: '#475569', mt: 0.5 }}>
                    {agreement.saved_card.brand || 'Card'} ending in {agreement.saved_card.last4 || '••••'}
                    {agreement.saved_card.exp_month && agreement.saved_card.exp_year
                      ? ` · expires ${String(agreement.saved_card.exp_month).padStart(2, '0')}/${String(agreement.saved_card.exp_year).slice(-2)}`
                      : ''}
                  </Typography>
                ) : (
                  <Typography sx={{ color: '#64748B', mt: 0.5 }}>No reusable payment method is stored by MedRad. Card details are vaulted by Square.</Typography>
                )}
              </Box>
              <Chip
                label={agreement.auto_charge_authorized ? 'Auto-pay authorized' : agreement.saved_card ? 'Stored only' : 'No card on file'}
                sx={{ fontWeight: 900, bgcolor: agreement.auto_charge_authorized ? '#D1FAE5' : '#EEF2FF', color: agreement.auto_charge_authorized ? '#047857' : '#4338CA' }}
              />
            </Box>
            {agreement.card_removal_pending && (
              <Alert severity="warning" sx={{ mt: 1.5, borderRadius: '12px' }}>
                Automatic payments are disabled. The saved card is pending removal from Square and cannot be used for recurring charges.
              </Alert>
            )}

            {!showCardEditor ? (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
                <Button
                  variant="outlined"
                  startIcon={<CreditCardIcon />}
                  disabled={!canPay || agreement.card_removal_pending}
                  onClick={() => {
                    setAuthorizeReplacement(agreement.auto_charge_authorized)
                    setShowCardEditor(true)
                  }}
                  sx={{ fontWeight: 900, textTransform: 'none' }}
                >
                  {agreement.saved_card ? 'Replace saved card' : 'Add saved card'}
                </Button>
                {agreement.saved_card && (
                  <Button
                    color="error"
                    variant="outlined"
                    startIcon={<DeleteOutlineIcon />}
                    onClick={() => setConfirmCardRemoval(true)}
                    sx={{ fontWeight: 900, textTransform: 'none' }}
                  >
                    Remove card &amp; stop auto-pay
                  </Button>
                )}
              </Box>
            ) : (
              <Box sx={{ mt: 2 }}>
                <FormControlLabel
                  sx={{ ...customerConsentLabelSx, mb: 0.75 }}
                  control={<Checkbox checked={authorizeReplacement} onChange={event => setAuthorizeReplacement(event.target.checked)} />}
                  label={agreement.auto_charge_consent_text}
                />
                <Typography sx={{ color: '#64748B', fontSize: 12, mb: 1.5 }}>
                  Leave unchecked to store the card without automatic-charge authorization. MedRad never stores the full card number or security code.
                </Typography>
                <SquareCardCheckout
                  applicationId={square.application_id!}
                  locationId={square.location_id!}
                  sdkUrl={square.sdk_url}
                  amount={0}
                  currency={square.currency}
                  payerName={agreement.customer_name}
                  payerEmail={agreement.customer_email}
                  processing={saveCardMut.isPending}
                  intent="STORE"
                  submitLabel={agreement.saved_card ? 'Securely replace saved card' : 'Securely save card'}
                  idempotencyScope={`rental-saved-card-${isAccountView ? accountRentalId : token}`}
                  onPaymentToken={(sourceId, idempotencyKey) => saveCardMut.mutate({ sourceId, idempotencyKey })}
                />
                <Button onClick={() => { setShowCardEditor(false); setAuthorizeReplacement(false) }} sx={{ mt: 1, fontWeight: 800 }}>Cancel</Button>
              </Box>
            )}
          </Card>
        )}

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
                  {invoice.payment_attempt_count > 0 && unpaid && (
                    <Alert severity={invoice.next_payment_retry_at ? 'warning' : 'error'} sx={{ mt: 1.5, borderRadius: '12px' }}>
                      {invoice.next_payment_retry_at
                        ? `Automatic payment attempt ${invoice.payment_attempt_count} was declined. The next retry is scheduled for ${dateLabel(invoice.next_payment_retry_at)}.`
                        : `${invoice.payment_attempt_count} payment attempt${invoice.payment_attempt_count === 1 ? '' : 's'} recorded. Please pay manually or contact support to update the payment method.`}
                    </Alert>
                  )}
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
                            label={agreement.auto_charge_consent_text}
                          />
                        )}
                        <Typography sx={{ color: '#64748B', fontSize: 12, mb: 1 }}>
                          Leave the option unchecked for a one-time payment. MedRad never stores the full card number or security code.
                        </Typography>
                        <SquareCardCheckout applicationId={square.application_id!} locationId={square.location_id!} sdkUrl={square.sdk_url} amount={Number(invoice.balance_due || 0)} currency={square.currency} payerName={agreement.customer_name} payerEmail={agreement.customer_email} processing={payMut.isPending} idempotencyScope={`rental-invoice-${invoice.id}-${Number(invoice.balance_due || 0).toFixed(2)}`} onPaymentToken={(sourceId, idempotencyKey) => payMut.mutate({ invoiceId: invoice.id, sourceId, idempotencyKey })} />
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
      <Dialog open={confirmCardRemoval} onClose={() => !removeCardMut.isPending && setConfirmCardRemoval(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 950, color: '#1E1B4B' }}>Remove saved card?</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#475569' }}>
            The card will be disabled in Square and removed from this agreement. Automatic payments stop immediately. Future invoices must be paid manually until another card is authorized.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button disabled={removeCardMut.isPending} onClick={() => setConfirmCardRemoval(false)} sx={{ fontWeight: 800 }}>Keep card</Button>
          <Button disabled={removeCardMut.isPending} color="error" variant="contained" onClick={() => removeCardMut.mutate()} sx={{ fontWeight: 900 }}>
            Remove card
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default ClientRental
