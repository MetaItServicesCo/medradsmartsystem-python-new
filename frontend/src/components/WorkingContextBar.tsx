import { useEffect } from 'react'
import { Box, Button, IconButton, Typography } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import MyLocationIcon from '@mui/icons-material/MyLocation'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import SearchOffIcon from '@mui/icons-material/SearchOff'
import { useListContext } from '@/contexts/ListContext'

const WorkingContextBar = () => {
  const { noticeActivity, locateFeedback, showActivity, dismissNotice } = useListContext()

  useEffect(() => {
    if (!noticeActivity || locateFeedback?.state === 'opening' || locateFeedback?.state === 'missing') return undefined
    const timer = window.setTimeout(dismissNotice, locateFeedback?.state === 'found' ? 3500 : 10000)
    return () => window.clearTimeout(timer)
  }, [dismissNotice, locateFeedback?.state, noticeActivity])

  if (!noticeActivity) return null

  const missing = locateFeedback?.activityId === noticeActivity.id && locateFeedback.state === 'missing'
  const opening = locateFeedback?.activityId === noticeActivity.id && locateFeedback.state === 'opening'
  const found = locateFeedback?.activityId === noticeActivity.id && locateFeedback.state === 'found'

  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        position: 'fixed',
        right: { xs: 12, sm: 24 },
        bottom: { xs: 'calc(76px + env(safe-area-inset-bottom))', sm: 24 },
        zIndex: 1450,
        width: { xs: 'calc(100vw - 24px)', sm: 440 },
        px: { xs: 1.25, sm: 2 },
        py: { xs: 1.1, sm: 1.5 },
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 0.75, sm: 1.25 },
        borderRadius: '16px',
        bgcolor: missing ? '#FFF7ED' : '#FFFFFF',
        border: `1px solid ${missing ? '#FED7AA' : '#D1FAE5'}`,
        boxShadow: '0 20px 55px rgba(30,27,75,0.18)',
      }}
    >
      {missing
        ? <SearchOffIcon sx={{ color: '#EA580C', fontSize: 22 }} />
        : <CheckCircleOutlineIcon sx={{ color: '#059669', fontSize: 22 }} />}
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography noWrap sx={{ color: '#1E1B4B', fontSize: { xs: 12, sm: 13 }, fontWeight: 900 }}>
          {found ? 'Record located' : missing ? 'Record is not in the loaded list' : noticeActivity.label}
        </Typography>
        <Typography sx={{ color: '#64748B', fontSize: { xs: 11, sm: 12 }, fontWeight: 650, lineHeight: 1.35 }}>
          {missing
            ? 'It may be filtered, unavailable, or outside your permissions.'
            : opening
              ? 'Opening the correct list and finding the record…'
              : noticeActivity.message || 'Update completed successfully.'}
        </Typography>
      </Box>
      {!found && !opening && (
        <Button
          size="small"
          startIcon={<MyLocationIcon />}
          onClick={() => showActivity(noticeActivity)}
          sx={{ flexShrink: 0, minWidth: { xs: 40, sm: 'auto' }, px: { xs: 1, sm: 2 }, borderRadius: '10px', textTransform: 'none', fontWeight: 900 }}
        >
          Show
        </Button>
      )}
      <IconButton size="small" aria-label="Dismiss recent activity" onClick={dismissNotice}>
        <CloseIcon fontSize="small" />
      </IconButton>
    </Box>
  )
}

export default WorkingContextBar
