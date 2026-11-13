import apiClient from './client'

/**
 * What a card payment charges: the amount being paid, the card processing fee
 * on it, and both together. Every card payment in the app is charged this way,
 * through Square; ACH, MBMTS ACH and cheque add no fee.
 */
export interface CardCharge {
  base_amount: string
  card_fee: string
  card_fee_percent: string
  card_fee_label: string
  charge_amount: string
}

export interface SquarePaymentConfig {
  enabled: boolean
  environment: string
  application_id: string | null
  location_id: string | null
  currency: string
  sdk_url: string
}

export interface CardPaymentView extends CardCharge {
  balance_due: string
  payer_name: string
  payer_email: string | null
  square_payment: SquarePaymentConfig
  can_pay: boolean
  invoice_number?: string
  quotation_number?: string
}

export type CardPaymentTarget = { kind: 'invoice' | 'quotation'; id: number; number: string }

const base = (target: CardPaymentTarget) => (
  target.kind === 'invoice'
    ? `/billing/invoices/${target.id}`
    : `/service-requests/quotations/${target.id}`
)

/** The amounts and the secure card form's settings, from the server. */
export const fetchCardPayment = async (target: CardPaymentTarget): Promise<CardPaymentView> => {
  const res = await apiClient.get(`${base(target)}/card-payment`)
  return res.data
}

/** Charge the card through Square: `charge_amount` is what the payer was shown. */
export const payByCard = async (
  target: CardPaymentTarget,
  data: { source_id: string; idempotency_key: string; charge_amount: string },
) => {
  const res = await apiClient.post(`${base(target)}/square-payment`, data)
  return res.data
}
