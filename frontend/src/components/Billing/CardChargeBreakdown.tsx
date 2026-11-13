import { Box, Typography } from '@mui/material'
import type { CardCharge } from '@/api/cardPayments'

const money = (value?: string | number | null) =>
  `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** What a card payment charges: the amount due, the card processing fee, and the total. */
const CardChargeBreakdown = ({ charge }: { charge?: CardCharge | null }) => {
  if (!charge) return null
  return (
    <Box data-card-breakdown sx={{ p: 2, mb: 2, borderRadius: '14px', border: '1px solid #DBEAFE', bgcolor: '#F8FAFF', display: 'grid', gap: 0.75 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
        <Typography sx={{ color: '#475569', fontWeight: 700 }}>Amount due</Typography>
        <Typography sx={{ fontWeight: 800 }} data-card-base>{money(charge.base_amount)}</Typography>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
        <Typography sx={{ color: '#475569', fontWeight: 700 }}>{charge.card_fee_label}</Typography>
        <Typography sx={{ fontWeight: 800 }} data-card-fee>{money(charge.card_fee)}</Typography>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, pt: 0.75, borderTop: '1px solid #DBEAFE' }}>
        <Typography sx={{ color: '#1E1B4B', fontWeight: 900 }}>Total charged to the card</Typography>
        <Typography sx={{ color: '#1D4ED8', fontWeight: 950 }} data-card-total>{money(charge.charge_amount)}</Typography>
      </Box>
      <Typography sx={{ color: '#64748B', fontSize: 12.5, mt: 0.5 }}>
        A {charge.card_fee_percent}% processing fee applies to card payments and is added to the invoice. ACH and cheque payments have no fee.
      </Typography>
    </Box>
  )
}

export default CardChargeBreakdown
