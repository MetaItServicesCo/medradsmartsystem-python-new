/**
 * The ACH Authorization Form: Mr. BioMed Tech Services' bank details for paying
 * by MBMTS ACH. One copy, shown wherever MBMTS ACH is chosen -- in Billing, on a
 * service quotation, and on every invoice link a customer pays through -- so
 * the details are the same everywhere and are changed in one place.
 */
import { Box, Divider, Typography } from '@mui/material'

export const MBMTS_ACH_DETAILS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'Business Name', value: 'Mr. Biomed Tech Services' },
  { label: 'Owner Name', value: 'Omar Ahmad' },
  { label: 'Address', value: '555 N. 5th Street Suite 109B' },
  { label: 'City, State, Zip', value: 'Garland, TX 75040' },
  { label: 'Name of Bank', value: 'Chase Business Banking' },
  { label: 'Account #', value: '818388071' },
  { label: '9-Digit Routing #', value: '111000614' },
  { label: 'Type of Account', value: 'Checking' },
]

const MbmtsAchForm = () => (
  <Box
    data-mbmts-ach-form
    sx={{ p: 2.5, bgcolor: '#FDF4FF', borderRadius: '14px', border: '1px solid rgba(162,28,175,0.15)' }}
  >
    <Typography sx={{ fontWeight: 900, color: '#A21CAF', mb: 0.5, textAlign: 'center' }}>ACH Authorization Form</Typography>
    <Typography sx={{ fontSize: 12, color: '#9CA3AF', mb: 2, textAlign: 'center' }}>Use the listed information for MBMTS ACH payment.</Typography>
    <Divider sx={{ mb: 2 }} />
    {MBMTS_ACH_DETAILS.map(row => (
      <Box key={row.label} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.8, borderBottom: '1px solid #F3E8FF', gap: 2 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#6B7280' }}>{row.label}</Typography>
        <Typography sx={{ fontSize: 13, fontWeight: 900, color: '#1E1B4B', textAlign: 'right', overflowWrap: 'anywhere' }}>{row.value}</Typography>
      </Box>
    ))}
    <Typography sx={{ mt: 1.5, fontSize: 11.5, color: '#9CA3AF', textAlign: 'center', fontStyle: 'italic' }}>
      Only authorized authority can use the information listed above.
    </Typography>
  </Box>
)

export default MbmtsAchForm
