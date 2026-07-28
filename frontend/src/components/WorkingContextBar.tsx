import { Box, Button, Chip, IconButton, Typography } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import MyLocationIcon from '@mui/icons-material/MyLocation'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import { useListContext } from '@/contexts/ListContext'

const WorkingContextBar = () => {
  const { focusedRecord, clearFocusedRecord, locateFocusedRecord } = useListContext()
  if (!focusedRecord) return null

  return (
    <Box
      role="status"
      aria-live={focusedRecord.announce ? 'polite' : 'off'}
      sx={{
        mx: { xs: 2, md: 3 },
        mt: 1.5,
        px: 1.5,
        py: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        borderRadius: '14px',
        bgcolor: focusedRecord.announce ? '#F0FDF4' : '#F5F3FF',
        border: `1px solid ${focusedRecord.announce ? '#A7F3D0' : '#DDD6FE'}`,
        boxShadow: '0 8px 24px rgba(49,46,129,0.06)',
      }}
    >
      <CheckCircleOutlineIcon sx={{ color: focusedRecord.announce ? '#059669' : '#7C3AED', fontSize: 20 }} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography noWrap sx={{ color: '#1E1B4B', fontSize: 13, fontWeight: 900 }}>
          {focusedRecord.announce ? 'Recently updated' : 'Working context'}: {focusedRecord.label}
        </Typography>
        {focusedRecord.message && (
          <Typography noWrap sx={{ color: '#64748B', fontSize: 12, fontWeight: 650 }}>
            {focusedRecord.message}
          </Typography>
        )}
      </Box>
      {focusedRecord.announce && (
        <Chip size="small" label="Updated" sx={{ bgcolor: '#D1FAE5', color: '#047857', fontWeight: 900 }} />
      )}
      <Button
        size="small"
        startIcon={<MyLocationIcon />}
        onClick={locateFocusedRecord}
        sx={{ display: { xs: 'none', sm: 'inline-flex' }, borderRadius: '10px', textTransform: 'none', fontWeight: 900 }}
      >
        Locate
      </Button>
      <IconButton size="small" aria-label="Clear working context" onClick={clearFocusedRecord}>
        <CloseIcon fontSize="small" />
      </IconButton>
    </Box>
  )
}

export default WorkingContextBar
