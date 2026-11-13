import { useMutation, useQuery } from '@tanstack/react-query'
import { Alert, Box, CircularProgress, Typography } from '@mui/material'
import { toast } from 'react-toastify'
import { fetchCardPayment, payByCard, type CardPaymentTarget } from '@/api/cardPayments'
import CardChargeBreakdown from './CardChargeBreakdown'
import SquareCardCheckout, { clearSquarePaymentKey } from './SquareCardCheckout'

const money = (value?: string | number | null) =>
  `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

interface Props {
  target: CardPaymentTarget
  onPaid: () => void
}

/**
 * Pay an invoice or a service quotation by card, in full, through Square.
 *
 * The server says what is owed, the card processing fee on it and the total;
 * the payer sees all three before paying, Square charges the total, and the
 * server charges only if that is still what is owed. A retry after an
 * uncertain answer reuses its key, so it can never charge twice.
 */
const CardPaymentPanel = ({ target, onPaid }: Props) => {
  const query = useQuery({
    queryKey: ['card-payment', target.kind, target.id],
    queryFn: () => fetchCardPayment(target),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })
  const data = query.data
  const scope = data ? `${target.kind}-${target.number}-${data.charge_amount}` : ''
  const square = data?.square_payment

  const pay = useMutation({
    mutationFn: ({ sourceId, idempotencyKey }: { sourceId: string; idempotencyKey: string }) => (
      payByCard(target, { source_id: sourceId, idempotency_key: idempotencyKey, charge_amount: data!.charge_amount })
    ),
    onSuccess: () => {
      clearSquarePaymentKey(scope)
      toast.success(`Payment completed: ${money(data?.charge_amount)} charged by card. The invoice and ledger are updated.`)
      onPaid()
    },
    onError: (error: any) => {
      const detail = error.response?.data?.detail
      const message = typeof detail === 'string' ? detail : error.message || 'Square could not complete the payment'
      if (/has changed/i.test(message)) {
        // Nothing was charged: show the new amount and start a fresh payment.
        clearSquarePaymentKey(scope)
        void query.refetch()
      } else if (!(error.response?.status === 409 || /pending|verif|processed/i.test(message))) {
        // Declined: nothing was charged, so the next card gets a fresh key. An
        // uncertain result keeps its key, so a retry can never charge twice.
        clearSquarePaymentKey(scope)
      }
      toast.error(message)
    },
  })

  if (query.isLoading) {
    return <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><CircularProgress size={20} /><Typography sx={{ color: '#64748B' }}>Loading the card payment…</Typography></Box>
  }
  if (query.isError || !data) {
    const problem = (query.error as any)?.response?.data?.detail
    return <Alert severity="error">{typeof problem === 'string' ? problem : 'This cannot be paid by card right now.'}</Alert>
  }

  return (
    <Box sx={{ display: 'grid', gap: 2 }} data-card-payment>
      <CardChargeBreakdown charge={data} />
      {data.can_pay && square?.application_id && square.location_id ? (
        <SquareCardCheckout
          applicationId={square.application_id}
          locationId={square.location_id}
          sdkUrl={square.sdk_url}
          amount={Number(data.charge_amount)}
          currency={square.currency}
          payerName={data.payer_name}
          payerEmail={data.payer_email}
          processing={pay.isPending}
          idempotencyScope={scope}
          submitLabel={`Pay ${money(data.charge_amount)} by card`}
          onPaymentToken={(sourceId, idempotencyKey) => pay.mutate({ sourceId, idempotencyKey })}
        />
      ) : (
        <Alert severity="info">Card payment is not available right now. Square is not set up.</Alert>
      )}
    </Box>
  )
}

export default CardPaymentPanel
