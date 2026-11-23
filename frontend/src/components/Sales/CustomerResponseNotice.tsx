import { Alert, AlertTitle, Box, Typography } from '@mui/material'
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined'
import DoNotDisturbOnOutlinedIcon from '@mui/icons-material/DoNotDisturbOnOutlined'

import type { CustomerResponse } from '@/utils/customerResponse'

const when = (iso: string | null) => (iso
  ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  : '')

interface CustomerResponseNoticeProps {
  response: CustomerResponse
  /** A line under the comments, such as what to do next. */
  hint?: string
}

/** The customer's request for changes (or decline), in their own words. */
const CustomerResponseNotice = ({ response, hint }: CustomerResponseNoticeProps) => {
  const declined = response.action === 'declined'
  return (
    <Alert
      severity={declined ? 'error' : 'warning'}
      icon={declined ? <DoNotDisturbOnOutlinedIcon /> : <RateReviewOutlinedIcon />}
      sx={{ borderRadius: '14px', alignItems: 'flex-start', '& .MuiAlert-message': { width: '100%', minWidth: 0 } }}
    >
      <AlertTitle sx={{ fontWeight: 900, mb: 0.25 }}>
        {declined ? 'The customer declined this quotation' : 'The customer requested changes'}
      </AlertTitle>
      <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: 'text.secondary' }}>
        {response.by}{response.at ? ` · ${when(response.at)}` : ''}
      </Typography>
      {response.comments ? (
        <Box
          component="blockquote"
          sx={{
            m: 0,
            mt: 1,
            px: 1.5,
            py: 1,
            borderLeft: '3px solid',
            borderColor: declined ? 'error.light' : 'warning.light',
            bgcolor: 'rgba(255,255,255,0.65)',
            borderRadius: '0 10px 10px 0',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            color: '#1E1B4B',
            fontSize: 14,
          }}
        >
          {response.comments}
        </Box>
      ) : (
        <Typography sx={{ mt: 1, fontSize: 13.5, fontStyle: 'italic' }}>
          No comments were given.
        </Typography>
      )}
      {hint && <Typography sx={{ mt: 1, fontSize: 12.5, fontWeight: 700 }}>{hint}</Typography>}
    </Alert>
  )
}

export default CustomerResponseNotice
