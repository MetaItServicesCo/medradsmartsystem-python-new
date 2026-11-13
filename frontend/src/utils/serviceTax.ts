/**
 * Sales tax on service work, worked out the way the server does
 * (backend/app/utils/service_tax.py), so a preview shows what is charged.
 *
 * A quotation paid on its own: tax on its part and other lines, not labor.
 *   Part $150 + Labor $100 = $250 + 8.25% of $150 ($12.38) = $262.38
 * A service invoice that includes a quotation: tax on the whole invoice but
 * travel. Without a quotation: no tax.
 *   Service Fee $150 + Labor $150 + quotation $150 = $450 + 8.25% ($37.13)
 */

export const DEFAULT_SERVICE_TAX_RATE = 8.25

const cents = (value: unknown) => Math.round((Number(value) || 0) * 100)

/** `rate` percent of `amount`, to the cent, half up: 8.25% of $450 is $37.13. */
export const serviceTaxOn = (amount: unknown, rate: unknown = DEFAULT_SERVICE_TAX_RATE): number => {
  const base = cents(amount)
  if (base <= 0) return 0
  // In whole cents and basis points, so $450 × 8.25% is exactly 3712.5 cents.
  const basisPoints = Math.round((Number(rate) || 0) * 100)
  return Math.round((base * basisPoints) / 10000) / 100
}

export const isTaxableQuotationLine = (itemType: unknown) =>
  String(itemType || '').trim().toLowerCase() !== 'labor'

export interface QuotationTaxLine {
  item_type?: string | null
  total?: number | string | null
}

/** The subtotal, the taxable part and the tax of a quotation's lines. */
export const quotationTax = (lines: QuotationTaxLine[], rate: unknown = DEFAULT_SERVICE_TAX_RATE) => {
  let subtotal = 0
  let taxable = 0
  for (const line of lines) {
    const total = cents(line.total)
    subtotal += total
    if (isTaxableQuotationLine(line.item_type)) taxable += total
  }
  const tax = serviceTaxOn(taxable / 100, rate)
  return { subtotal: subtotal / 100, taxable: taxable / 100, tax, total: (subtotal + cents(tax)) / 100 }
}

/** A quotation's amount before its own tax: what a service invoice includes. */
export const quotationBeforeTax = (quotation: { amount?: number | string | null; tax_amount?: number | string | null }) =>
  (cents(quotation.amount) - cents(quotation.tax_amount)) / 100

/** What a new service invoice is taxed on: nothing without a quotation. */
export const serviceInvoiceTaxable = (
  serviceFee: unknown, labor: unknown, quotationsBeforeTax: unknown, includesQuotation: boolean,
) => (includesQuotation ? (cents(serviceFee) + cents(labor) + cents(quotationsBeforeTax)) / 100 : 0)
