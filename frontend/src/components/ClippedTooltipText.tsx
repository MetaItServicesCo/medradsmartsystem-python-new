import { type MouseEventHandler, type ReactNode } from 'react'
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
  onClick?: MouseEventHandler<HTMLElement>
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
  onClick,
}: Props) => {
  const displayValue = renderValue(value, fallback)
  const title = tooltipTitle(value, fallback)
  const clickable = Boolean(onClick)

  return (
    <Tooltip title={title} arrow placement="top" disableHoverListener={!title || title === fallback}>
      <Box
        onClick={onClick}
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        onKeyDown={clickable ? (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onClick?.(event as any)
          }
        } : undefined}
        sx={{
          minWidth: 0,
          maxWidth,
          width: '100%',
          overflow: 'hidden',
          cursor: clickable ? 'pointer' : undefined,
          transition: clickable ? 'all 0.15s ease' : undefined,
          '&:hover .MuiTypography-root': clickable ? {
            color: '#7C3AED',
            textDecoration: 'underline',
            textUnderlineOffset: '3px',
          } : undefined,
          ...(field ? {
            border: '1px solid #E5E7EB',
            bgcolor: '#F8FAFC',
            borderRadius: '12px',
            px: 1.4,
            py: 0.9,
            height: 40,
            display: 'flex',
            alignItems: 'center',
            '&:hover': clickable ? {
              borderColor: '#A78BFA',
              bgcolor: '#F5F3FF',
            } : undefined,
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
