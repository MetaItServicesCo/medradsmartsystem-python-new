import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'

import {
  calculateSalesPricing,
  roundSalesMoney,
  SALES_TAX_FACTOR,
  SALES_TAX_RATE,
} from '@/utils/salesPricing'

type SalesPricing = ReturnType<typeof calculateSalesPricing>

interface SalesPricingBreakdownProps {
  pricing: SalesPricing
}

const money = (value: number) => `$${Math.abs(Number(value || 0)).toFixed(2)}`
const signedMoney = (value: number) => (
  Number(value || 0) < 0 ? `−${money(value)}` : money(value)
)

const SalesPricingBreakdown = ({ pricing }: SalesPricingBreakdownProps) => {
  const taxableParts = Math.max(0, pricing.merchandise - pricing.tradeInCredit)
  let partsTax = roundSalesMoney(taxableParts * SALES_TAX_FACTOR)
  let shippingTax = roundSalesMoney(pricing.shippingPacking * SALES_TAX_FACTOR)
  let deliveryTax = roundSalesMoney(pricing.deliverySetup * SALES_TAX_FACTOR)
  // Allocate any one-cent rounding remainder to the final populated taxable
  // category so the visible component taxes reconcile to the authoritative total.
  const taxRemainder = roundSalesMoney(
    pricing.taxAmount - partsTax - shippingTax - deliveryTax,
  )
  if (pricing.deliverySetup > 0) deliveryTax = roundSalesMoney(deliveryTax + taxRemainder)
  else if (pricing.shippingPacking > 0) shippingTax = roundSalesMoney(shippingTax + taxRemainder)
  else partsTax = roundSalesMoney(partsTax + taxRemainder)
  const preTaxAfterDiscount = roundSalesMoney(pricing.subtotal - pricing.discountAmount)
  const hasTradeIn = pricing.tradeInCredit > 0

  const cellSx = {
    py: 1,
    px: 1.5,
    borderRight: '1px solid #CBD5E1',
    borderBottom: '1px solid #CBD5E1',
  }

  return (
    <TableContainer
      sx={{
        width: '100%',
        maxWidth: 620,
        ml: 'auto',
        border: '1px solid #CBD5E1',
        borderRadius: '10px',
        overflow: 'hidden',
        bgcolor: '#FFFFFF',
      }}
    >
      <Table size="small" aria-label="Quotation price calculation">
        <TableHead>
          <TableRow sx={{ bgcolor: '#F8FAFC' }}>
            <TableCell sx={{ ...cellSx, fontWeight: 950 }}>Description</TableCell>
            <TableCell align="right" sx={{ ...cellSx, fontWeight: 950 }}>Cost</TableCell>
            <TableCell align="right" sx={{ ...cellSx, fontWeight: 950 }}>Tax {SALES_TAX_RATE}%</TableCell>
            <TableCell align="right" sx={{ ...cellSx, borderRight: 0, fontWeight: 950 }}>Total</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {pricing.labor > 0 && (
            <TableRow>
              <TableCell sx={cellSx}>Labor</TableCell>
              <TableCell align="right" sx={cellSx}>{money(pricing.labor)}</TableCell>
              <TableCell align="right" sx={cellSx}>{money(0)}</TableCell>
              <TableCell sx={{ ...cellSx, borderRight: 0 }} />
            </TableRow>
          )}
          {pricing.merchandise > 0 && (
            <TableRow>
              <TableCell sx={{ ...cellSx, color: '#DC2626', fontWeight: 900 }}>Parts</TableCell>
              <TableCell align="right" sx={cellSx}>{money(pricing.merchandise)}</TableCell>
              <TableCell align="right" sx={cellSx}>{hasTradeIn ? '—' : money(partsTax)}</TableCell>
              <TableCell sx={{ ...cellSx, borderRight: 0 }} />
            </TableRow>
          )}
          {hasTradeIn && (
            <>
              <TableRow>
                <TableCell sx={{ ...cellSx, color: '#059669', fontWeight: 900 }}>Trade-In Credit</TableCell>
                <TableCell align="right" sx={{ ...cellSx, color: '#059669', fontWeight: 850 }}>
                  −{money(pricing.tradeInCredit)}
                </TableCell>
                <TableCell sx={cellSx} />
                <TableCell sx={{ ...cellSx, borderRight: 0 }} />
              </TableRow>
              <TableRow sx={{ bgcolor: '#F0F9FF' }}>
                <TableCell sx={{ ...cellSx, color: '#0284C7', fontWeight: 950 }}>Taxable Parts Amount</TableCell>
                <TableCell align="right" sx={{ ...cellSx, color: '#0284C7', fontWeight: 950 }}>{money(taxableParts)}</TableCell>
                <TableCell align="right" sx={{ ...cellSx, color: '#0284C7', fontWeight: 950 }}>{money(partsTax)}</TableCell>
                <TableCell sx={{ ...cellSx, borderRight: 0 }} />
              </TableRow>
            </>
          )}
          {pricing.shippingPacking > 0 && (
            <TableRow>
              <TableCell sx={cellSx}>Shipping &amp; Packing</TableCell>
              <TableCell align="right" sx={cellSx}>{money(pricing.shippingPacking)}</TableCell>
              <TableCell align="right" sx={cellSx}>{money(shippingTax)}</TableCell>
              <TableCell sx={{ ...cellSx, borderRight: 0 }} />
            </TableRow>
          )}
          {pricing.deliverySetup > 0 && (
            <TableRow>
              <TableCell sx={cellSx}>Delivery &amp; Setup</TableCell>
              <TableCell align="right" sx={cellSx}>{money(pricing.deliverySetup)}</TableCell>
              <TableCell align="right" sx={cellSx}>{money(deliveryTax)}</TableCell>
              <TableCell sx={{ ...cellSx, borderRight: 0 }} />
            </TableRow>
          )}
          {pricing.refundCredit > 0 && (
            <TableRow>
              <TableCell sx={{ ...cellSx, color: '#DC2626', fontWeight: 900 }}>Refund Payment</TableCell>
              <TableCell align="right" sx={{ ...cellSx, color: '#DC2626', fontWeight: 850 }}>
                −{money(pricing.refundCredit)}
              </TableCell>
              <TableCell align="right" sx={cellSx}>{money(0)}</TableCell>
              <TableCell sx={{ ...cellSx, borderRight: 0 }} />
            </TableRow>
          )}
          <TableRow sx={{ bgcolor: '#F8FAFC' }}>
            <TableCell sx={{ ...cellSx, fontWeight: 950 }}>Total Tax</TableCell>
            <TableCell sx={cellSx} />
            <TableCell align="right" sx={{ ...cellSx, fontWeight: 950 }}>{money(pricing.taxAmount)}</TableCell>
            <TableCell align="right" sx={{ ...cellSx, borderRight: 0, fontWeight: 950 }}>{money(pricing.taxAmount)}</TableCell>
          </TableRow>
          {pricing.discountAmount > 0 ? (
            <TableRow>
              <TableCell sx={{ ...cellSx, fontWeight: 900 }}>Discount</TableCell>
              <TableCell align="right" sx={{ ...cellSx, color: '#DC2626', fontWeight: 850 }}>
                −{money(pricing.discountAmount)}
              </TableCell>
              <TableCell sx={cellSx} />
              <TableCell align="right" sx={{ ...cellSx, borderRight: 0, fontWeight: 950 }}>{signedMoney(preTaxAfterDiscount)}</TableCell>
            </TableRow>
          ) : (
            <TableRow>
              <TableCell sx={{ ...cellSx, fontWeight: 900 }}>Pre-Tax Total</TableCell>
              <TableCell sx={cellSx} />
              <TableCell sx={cellSx} />
              <TableCell align="right" sx={{ ...cellSx, borderRight: 0, fontWeight: 950 }}>{signedMoney(preTaxAfterDiscount)}</TableCell>
            </TableRow>
          )}
          <TableRow sx={{ bgcolor: '#EEF2FF' }}>
            <TableCell sx={{ ...cellSx, borderBottom: 0 }}>
              <Typography sx={{ color: '#1E1B4B', fontWeight: 950, fontSize: 17 }}>Grand Total</Typography>
            </TableCell>
            <TableCell sx={{ ...cellSx, borderBottom: 0 }} />
            <TableCell sx={{ ...cellSx, borderBottom: 0 }} />
            <TableCell align="right" sx={{ ...cellSx, borderRight: 0, borderBottom: 0 }}>
              <Typography sx={{ color: pricing.total < 0 ? '#DC2626' : '#059669', fontWeight: 950, fontSize: 17 }}>{signedMoney(pricing.total)}</Typography>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>
  )
}

export default SalesPricingBreakdown
