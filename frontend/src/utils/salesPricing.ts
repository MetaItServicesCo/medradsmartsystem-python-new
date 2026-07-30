export const SALES_TAX_RATE = 8.25
export const SALES_TAX_FACTOR = SALES_TAX_RATE / 100

export interface SalesPricingLine {
  item_kind?: 'product' | 'trade_in' | 'refund' | string
  quantity?: number | string | null
  unit_price?: number | string | null
  shipping_fee?: number | string | null
  setup_fee?: number | string | null
  labor_fee?: number | string | null
}

export const roundSalesMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100

export const salesLineTotal = (line: SalesPricingLine) => {
  const unsignedTotal =
    Number(line.quantity || 0) * Number(line.unit_price || 0)
    + Number(line.shipping_fee || 0)
    + Number(line.setup_fee || 0)
    + Number(line.labor_fee || 0)
  return line.item_kind === 'trade_in' || line.item_kind === 'refund'
    ? -Math.abs(unsignedTotal)
    : unsignedTotal
}

export const salesLineTaxableAmount = (line: SalesPricingLine) => {
  const merchandise = Number(line.quantity || 0) * Number(line.unit_price || 0)
  if (line.item_kind === 'trade_in') return -Math.abs(merchandise)
  if (line.item_kind === 'refund') return 0
  return merchandise + Number(line.shipping_fee || 0) + Number(line.setup_fee || 0)
}

export const calculateSalesPricing = (
  lines: SalesPricingLine[],
  discountAmount = 0,
) => {
  const products = lines.filter(line => (line.item_kind || 'product') === 'product')
  const tradeIns = lines.filter(line => line.item_kind === 'trade_in')
  const refunds = lines.filter(line => line.item_kind === 'refund')
  const merchandise = products.reduce(
    (sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_price || 0),
    0,
  )
  const shippingPacking = products.reduce(
    (sum, line) => sum + Number(line.shipping_fee || 0),
    0,
  )
  const deliverySetup = products.reduce(
    (sum, line) => sum + Number(line.setup_fee || 0),
    0,
  )
  const labor = products.reduce(
    (sum, line) => sum + Number(line.labor_fee || 0),
    0,
  )
  const tradeInCredit = tradeIns.reduce(
    (sum, line) => sum + Math.abs(Number(line.quantity || 0) * Number(line.unit_price || 0)),
    0,
  )
  const refundCredit = refunds.reduce(
    (sum, line) => sum + Math.abs(salesLineTotal(line)),
    0,
  )
  const subtotal = lines.reduce((sum, line) => sum + salesLineTotal(line), 0)
  const taxableBase = Math.max(
    0,
    lines.reduce((sum, line) => sum + salesLineTaxableAmount(line), 0),
  )
  const taxAmount = roundSalesMoney(taxableBase * SALES_TAX_FACTOR)
  const total = roundSalesMoney(subtotal + taxAmount - Number(discountAmount || 0))

  return {
    merchandise: roundSalesMoney(merchandise),
    shippingPacking: roundSalesMoney(shippingPacking),
    deliverySetup: roundSalesMoney(deliverySetup),
    labor: roundSalesMoney(labor),
    tradeInCredit: roundSalesMoney(tradeInCredit),
    refundCredit: roundSalesMoney(refundCredit),
    subtotal: roundSalesMoney(subtotal),
    taxableBase: roundSalesMoney(taxableBase),
    taxAmount,
    discountAmount: roundSalesMoney(Number(discountAmount || 0)),
    total,
  }
}
