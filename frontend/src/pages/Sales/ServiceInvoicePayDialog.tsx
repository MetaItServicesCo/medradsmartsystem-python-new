import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography,
} from '@mui/material'
import { toast } from 'react-toastify'
import { fetchServiceInvoiceCardPayment, payServiceInvoiceSignedIn } from '@/api/serviceRequests'
import SquareCardCheckout, { clearSquarePaymentKey } from '@/components/Billing/SquareCardCheckout'

const money = (value?: string | number | null) => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

interface Props {
  invoice: { id: number; number: string } | null
  onClose: () => void
  onPaid: () => void
  /** ACH or cheque instead. `cardAvailable` false means Square is not set up, so the older card report stays. */
  onOtherMethod: (cardAvailable: boolean) => void
}

/** A signed-in facility user paying a service invoice: by card through Square, or another way. */
const ServiceInvoicePayDialog = ({ invoice, onClose, onPaid, onOtherMethod }: Props) => {
  const query = useQuery({
    queryKey: ['service-invoice-card-payment', invoice?.id],
    queryFn: () => fetchServiceInvoiceCardPayment(invoice!.id),
    enabled: Boolean(invoice),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })
  const data = query.data
  const scope = data ? `service-invoice-${data.invoice_number}-${Number(data.balance_due).toFixed(2)}` : ''
  const square = data?.square_payment

  const pay = useMutation({
    mutationFn: ({ sourceId, idempotencyKey }: { sourceId: string; idempotencyKey: string }) => (
      payServiceInvoiceSignedIn(invoice!.id, { source_id: sourceId, idempotency_key: idempotencyKey })
    ),
    onSuccess: () => {
      toast.success('Payment completed. The invoice and ledger are now updated.')
      onPaid()
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail
      const message = typeof detail === 'string' ? detail : error.message || 'Square could not complete the payment'
      // An uncertain result keeps its key, so a retry can never charge twice.
      if (!(error.response?.status === 409 || /pending|verif/i.test(message))) clearSquarePaymentKey(scope)
      toast.error(message)
    },
  })

  const problem = (query.error as any)?.response?.data?.detail

  return (
    <Dialog open={Boolean(invoice)} onClose={() => !pay.isPending && onClose()} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 900 }}>Pay invoice {invoice?.number}</DialogTitle>
      <DialogContent dividers>
        {query.isLoading && <CircularProgress size={24} />}
        {query.isError && <Alert severity="error">{typeof problem === 'string' ? problem : 'This invoice cannot be paid right now.'}</Alert>}
        {data && (
          <Box sx={{ display: 'grid', gap: 2 }}>
            <Typography sx={{ fontWeight: 800, color: '#475569' }}>Balance {money(data.balance_due)}</Typography>
            {data.pending_reports > 0 ? (
              <Alert severity="warning">
                A payment for this invoice is waiting for approval. It cannot be paid another way until that payment has been checked.
              </Alert>
            ) : data.can_pay && square?.application_id && square.location_id ? (
              <SquareCardCheckout
                applicationId={square.application_id}
                locationId={square.location_id}
                sdkUrl={square.sdk_url}
                amount={Number(data.balance_due)}
                currency={square.currency}
                payerName={data.payer_name}
                payerEmail={data.payer_email}
                processing={pay.isPending}
                idempotencyScope={scope}
                onPaymentToken={(sourceId, idempotencyKey) => pay.mutate({ sourceId, idempotencyKey })}
              />
            ) : (
              <Alert severity="info">
                {Number(data.balance_due) > 0 ? 'Card payment is not available right now.' : 'This invoice has no balance to pay.'}
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={pay.isPending}>Cancel</Button>
        {data && Number(data.balance_due) > 0 && !data.pending_reports && (
          <Button onClick={() => onOtherMethod(Boolean(data.can_pay))} disabled={pay.isPending} sx={{ fontWeight: 800 }}>
            {data.can_pay ? 'Pay by ACH or Cheque' : 'Record Payment'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}

export default ServiceInvoicePayDialog
