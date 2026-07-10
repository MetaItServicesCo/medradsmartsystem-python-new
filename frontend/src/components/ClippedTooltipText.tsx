import { type ReactNode } from 'react'
import { Box, Tooltip, Typography, type SxProps, type Theme } from '@mui/material'

type Props = {
  value: ReactNode
  fallback?: string
  field?: boolean
  maxWidth?: number | string
  variant?: 'caption' | 'body1' | 'body2'
  fontWeight?: number
  color?: string
  monospace?: boolean
  sx?: SxProps<Theme>
  textSx?: SxProps<Theme>
}

const renderValue = (value: ReactNode, fallback: string) => {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  return value
}

const tooltipTitle = (value: ReactNode, fallback: string) => {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  return ''
}

const ClippedTooltipText = ({
  value,
  fallback = '-',
  field = false,
  maxWidth = '100%',
  variant = 'body2',
  fontWeight = 600,
  color = '#1E1B4B',
  monospace = false,
  sx,
  textSx,
}: Props) => {
  const displayValue = renderValue(value, fallback)
  const title = tooltipTitle(value, fallback)

  return (
    <Tooltip title={title} arrow placement="top" disableHoverListener={!title || title === fallback}>
      <Box
        sx={{
          minWidth: 0,
          maxWidth,
          width: '100%',
          overflow: 'hidden',
          ...(field ? {
            border: '1px solid #E5E7EB',
            bgcolor: '#F8FAFC',
            borderRadius: '12px',
            px: 1.4,
            py: 0.9,
            height: 40,
            display: 'flex',
            alignItems: 'center',
          } : {}),
          ...sx,
        }}
      >
        <Typography
          variant={variant}
          noWrap
          sx={{
            minWidth: 0,
            width: '100%',
            color,
            fontWeight,
            fontFamily: monospace ? 'monospace' : undefined,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            ...textSx,
          }}
        >
          {displayValue}
        </Typography>
      </Box>
    </Tooltip>
  )
}

export default ClippedTooltipText
