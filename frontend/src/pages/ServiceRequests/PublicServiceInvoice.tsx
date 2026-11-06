/**
 * What a customer sees through a service invoice link, without signing in: the
 * invoice, and paying its balance by Square. Nothing else is offered here.
 */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Card, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography,
} from '@mui/material'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import CreditCardIcon from '@mui/icons-material/CreditCard'
import PrintIcon from '@mui/icons-material/Print'
import { toast } from 'react-toastify'
import { fetchPublicServiceInvoice, payPublicServiceInvoice } from '@/api/serviceRequests'
import SquareCardCheckout, { clearSquarePaymentKey } from '@/components/Billing/SquareCardCheckout'
import ServiceInvoiceFrame from '@/components/Billing/ServiceInvoiceFrame'
import { buildServiceInvoiceHtml } from '@/utils/serviceInvoiceHtml'

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
  <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: '#F1F5F9', p: 2 }}>
    <Card sx={{ p: 4, maxWidth: 480, borderRadius: '18px', textAlign: 'center' }}>{children}</Card>
  </Box>
)

const PublicServiceInvoice = () => {
  const { token = '' } = useParams()
  const queryClient = useQueryClient()
  const queryKey = ['public-service-invoice', token]
  const [html, setHtml] = useState('')
  const [payOpen, setPayOpen] = useState(false)
  const [payerName, setPayerName] = useState('')

  // A private page: nothing should list it, even if a link gets shared somewhere public.
  useEffect(() => {
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex, nofollow'
    document.head.appendChild(robots)
    return () => { robots.remove() }
  }, [])

  const invoiceQ = useQuery({ queryKey, queryFn: () => fetchPublicServiceInvoice(token), retry: false })
  const data = invoiceQ.data

  useEffect(() => {
    let current = true
    if (data?.document) {
      buildServiceInvoiceHtml(data.document)
        .then((built) => { if (current) setHtml(built) })
        .catch(() => { if (current) toast.error('The invoice could not be shown. Please refresh the page.') })
    }
    return () => { current = false }
  }, [data?.document])

  useEffect(() => {
    if (data?.payer_name && !payerName) setPayerName(data.payer_name)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.payer_name])

  const scope = data ? `service-invoice-${data.invoice_number}-${Number(data.balance_due).toFixed(2)}` : ''

  const pay = useMutation({
    mutationFn: ({ sourceId, idempotencyKey }: { sourceId: string; idempotencyKey: string }) => payPublicServiceInvoice(token, {
      source_id: sourceId,
      idempotency_key: idempotencyKey,
      payer_name: payerName.trim(),
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
      if (!(error.response?.status === 409 || /pending|verif/i.test(message))) clearSquarePaymentKey(scope)
      toast.error(message)
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
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#F1F5F9', p: { xs: 1, sm: 3 } }}>
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
          <Alert severity="info">Card payment is not available right now. Please contact us to pay this invoice.</Alert>
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
          <Typography sx={{ mb: 2, fontWeight: 800, color: '#475569' }}>Balance {money(data.balance_due)}</Typography>
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
                amount={Number(data.balance_due)}
                currency={square.currency}
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
    </Box>
  )
}

export default PublicServiceInvoice
