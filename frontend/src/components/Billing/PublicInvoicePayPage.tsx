/**
 * What a customer sees through an invoice link, without signing in: the
 * invoice, paying its balance by card through Square, or reporting an ACH,
 * MBMTS ACH or cheque payment for Billing to check. Nothing else is offered.
 * Service and inspection invoices use it, each with its own document.
 */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Card, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography,
} from '@mui/material'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import CreditCardIcon from '@mui/icons-material/CreditCard'
import PrintIcon from '@mui/icons-material/Print'
import { toast } from 'react-toastify'
import type { LinkPaymentReport, PublicServiceInvoice } from '@/api/serviceRequests'
import SquareCardCheckout, { clearSquarePaymentKey } from '@/components/Billing/SquareCardCheckout'
import CardChargeBreakdown from '@/components/Billing/CardChargeBreakdown'
import ServiceInvoiceFrame from '@/components/Billing/ServiceInvoiceFrame'
import LinkPaymentReportDialog from '@/components/Billing/LinkPaymentReportDialog'

const money = (value?: string | number | null) => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const printDocument = (title: string, html: string) => {
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(frame)
  const doc = frame.contentWindow?.document
  if (!doc) return
  doc.open()
  doc.write(`<!doctype html><html><head><title>${title.replace(/</g, '&lt;')}</title></head><body style="margin:0">${html}</body></html>`)
  doc.close()
  frame.onload = () => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    window.setTimeout(() => frame.remove(), 800)
  }
}

const Notice = ({ children }: { children: React.ReactNode }) => (
  <Box sx={{ height: '100dvh', overflowY: 'auto', display: 'grid', placeItems: 'center', bgcolor: '#F1F5F9', p: 2 }}>
    <Card sx={{ p: 4, maxWidth: 480, borderRadius: '18px', textAlign: 'center' }}>{children}</Card>
  </Box>
)

type CardPayment = { source_id: string; idempotency_key: string; payer_name: string; charge_amount?: string }
/** The link page's response, whichever invoice it is: only its document differs. */
type PublicInvoice<D> = Omit<PublicServiceInvoice, 'document'> & { document: D | null }

interface Props<D> {
  token: string
  /** Its cache key, and the start of its card payment's retry scope ("service-invoice"). */
  kind: 'service-invoice' | 'inspection-invoice'
  fetchInvoice: (token: string) => Promise<PublicInvoice<D>>
  payByCard: (token: string, data: CardPayment) => Promise<PublicInvoice<D>>
  reportPayment: (token: string, report: LinkPaymentReport) => Promise<PublicInvoice<D>>
  buildHtml: (document: D) => Promise<string> | string
}

function PublicInvoicePayPage<D>({ token, kind, fetchInvoice, payByCard, reportPayment, buildHtml }: Props<D>) {
  const queryClient = useQueryClient()
  const queryKey = [`public-${kind}`, token]
  const [html, setHtml] = useState('')
  const [payOpen, setPayOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [payerName, setPayerName] = useState('')

  // A private page: nothing should list it, even if a link gets shared somewhere public.
  useEffect(() => {
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex, nofollow'
    document.head.appendChild(robots)
    return () => { robots.remove() }
  }, [])

  const invoiceQ = useQuery({ queryKey, queryFn: () => fetchInvoice(token), retry: false })
  const data = invoiceQ.data

  useEffect(() => {
    let current = true
    if (data?.document) {
      Promise.resolve(buildHtml(data.document))
        .then((built) => { if (current) setHtml(built) })
        .catch(() => { if (current) toast.error('The invoice could not be shown. Please refresh the page.') })
    }
    return () => { current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.document])

  useEffect(() => {
    if (data?.payer_name && !payerName) setPayerName(data.payer_name)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.payer_name])

  const chargeAmount = data?.charge_amount || data?.balance_due || '0'
  const scope = data ? `${kind}-${data.invoice_number}-${Number(chargeAmount).toFixed(2)}` : ''

  const pay = useMutation({
    mutationFn: ({ sourceId, idempotencyKey }: { sourceId: string; idempotencyKey: string }) => payByCard(token, {
      source_id: sourceId,
      idempotency_key: idempotencyKey,
      payer_name: payerName.trim(),
      charge_amount: data?.charge_amount,
    }),
    onSuccess: (response) => {
      queryClient.setQueryData(queryKey, response)
      setPayOpen(false)
      toast.success('Payment completed. Thank you.')
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail
      const message = typeof detail === 'string' ? detail : error.message || 'Square could not complete the payment'
      // An uncertain result keeps its key, so a retry can never charge twice.
      if (/has changed/i.test(message)) {
        clearSquarePaymentKey(scope)
        void queryClient.invalidateQueries({ queryKey })
      } else if (!(error.response?.status === 409 || /pending|verif/i.test(message))) clearSquarePaymentKey(scope)
      toast.error(message)
    },
  })

  const report = useMutation({
    mutationFn: (payment: LinkPaymentReport) => reportPayment(token, payment),
    onSuccess: (response) => {
      queryClient.setQueryData(queryKey, response)
      setReportOpen(false)
      toast.success('Thank you. Your payment was sent to our billing team to check.')
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'The payment could not be sent. Please try again.')
      // The invoice may have changed (paid, or another payment waiting): show it as it is now.
      if (error.response?.status === 409) void queryClient.invalidateQueries({ queryKey })
    },
  })

  if (invoiceQ.isLoading) return <Notice><CircularProgress /></Notice>
  if (invoiceQ.isError) {
    const detail = (invoiceQ.error as any)?.response?.data?.detail
    return (
      <Notice>
        <Typography sx={{ fontWeight: 900, fontSize: 18, mb: 1 }}>This invoice is not available</Typography>
        <Typography sx={{ color: '#475569' }}>{typeof detail === 'string' ? detail : 'Please check the link, or ask for a new one.'}</Typography>
      </Notice>
    )
  }
  if (!data) return null
  if (data.state === 'under_review') {
    return (
      <Notice>
        <Typography sx={{ fontWeight: 900, fontSize: 18, mb: 1 }}>Invoice {data.invoice_number} is being updated</Typography>
        <Typography sx={{ color: '#475569' }}>Please check back shortly. It cannot be paid until the update is finished.</Typography>
      </Notice>
    )
  }

  const square = data.square_payment
  const otherMethods = data.other_methods || []
  const offersOther = data.state === 'payable' && otherMethods.length > 0
  return (
    // The app's body does not scroll, so this page scrolls itself.
    <Box sx={{ height: '100dvh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', bgcolor: '#F1F5F9', p: { xs: 1, sm: 3 } }}>
      <Box sx={{ maxWidth: 960, mx: 'auto', display: 'grid', gap: 2 }}>
        <Card sx={{ p: 2, borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          {data.state === 'paid' ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#047857' }}>
              <CheckCircleOutlineIcon />
              <Typography sx={{ fontWeight: 900 }}>Invoice {data.invoice_number} is paid. Thank you.</Typography>
            </Box>
          ) : (
            <Box>
              <Typography sx={{ fontWeight: 900 }}>Invoice {data.invoice_number}</Typography>
              <Typography sx={{ color: '#475569' }}>Balance {money(data.balance_due)}</Typography>
            </Box>
          )}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button startIcon={<PrintIcon />} disabled={!html} onClick={() => printDocument(`Invoice ${data.invoice_number}`, html)} sx={{ fontWeight: 800 }}>
              Print
            </Button>
            {offersOther && (
              <Button
                variant="outlined"
                startIcon={<AccountBalanceIcon />}
                disabled={!data.can_report_payment}
                onClick={() => setReportOpen(true)}
                data-pay-other
                sx={{ fontWeight: 900, borderRadius: '12px' }}
              >
                Pay by ACH or cheque
              </Button>
            )}
            {data.state === 'payable' && (
              <Button
                variant="contained"
                startIcon={<CreditCardIcon />}
                disabled={!data.can_pay}
                onClick={() => setPayOpen(true)}
                sx={{ fontWeight: 900, borderRadius: '12px' }}
              >
                Pay {money(data.balance_due)}
              </Button>
            )}
          </Box>
        </Card>
        {data.state === 'payable' && Boolean(data.pending_reports) && (
          <Alert severity="warning">A payment for this invoice is waiting for approval. It cannot be paid another way until that payment has been checked.</Alert>
        )}
        {data.state === 'payable' && !data.can_pay && !data.pending_reports && (
          <Alert severity="info">
            {offersOther && data.can_report_payment
              ? 'Card payment is not available right now. You can still pay by ACH, MBMTS ACH or cheque.'
              : 'Card payment is not available right now. Please contact us to pay this invoice.'}
          </Alert>
        )}
        <Card sx={{ borderRadius: '16px', overflow: 'hidden' }}>
          {html
            ? <ServiceInvoiceFrame html={html} title={`Invoice ${data.invoice_number}`} />
            : <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>}
        </Card>
      </Box>

      <Dialog open={payOpen} onClose={() => !pay.isPending && setPayOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 900 }}>Pay invoice {data.invoice_number}</DialogTitle>
        <DialogContent dividers>
          {data.charge_amount ? (
            <CardChargeBreakdown charge={{
              base_amount: data.base_amount || data.balance_due || '0',
              card_fee: data.card_fee || '0',
              card_fee_percent: data.card_fee_percent || '',
              card_fee_label: data.card_fee_label || 'Card processing fee',
              charge_amount: data.charge_amount,
            }} />
          ) : (
            <Typography sx={{ mb: 2, fontWeight: 800, color: '#475569' }}>Balance {money(data.balance_due)}</Typography>
          )}
          <TextField
            label="Your name"
            value={payerName}
            onChange={event => setPayerName(event.target.value)}
            required
            fullWidth
            sx={{ mb: 2 }}
          />
          {square?.application_id && square.location_id && (
            payerName.trim().length >= 2 ? (
              <SquareCardCheckout
                applicationId={square.application_id}
                locationId={square.location_id}
                sdkUrl={square.sdk_url}
                amount={Number(chargeAmount)}
                currency={square.currency}
                submitLabel={`Pay ${money(chargeAmount)} by card`}
                payerName={payerName.trim()}
                payerEmail={data.payer_email}
                processing={pay.isPending}
                idempotencyScope={scope}
                onPaymentToken={(sourceId, idempotencyKey) => pay.mutate({ sourceId, idempotencyKey })}
              />
            ) : <Typography sx={{ color: '#64748B' }}>Enter your name to continue to the card form.</Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setPayOpen(false)} disabled={pay.isPending}>Cancel</Button>
        </DialogActions>
      </Dialog>

      <LinkPaymentReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        invoiceNumber={data.invoice_number}
        balanceDue={Number(data.balance_due || 0)}
        methods={otherMethods}
        defaultName={data.payer_name}
        defaultEmail={data.payer_email}
        submitting={report.isPending}
        onSubmit={payment => report.mutate(payment)}
      />
    </Box>
  )
}

export default PublicInvoicePayPage
