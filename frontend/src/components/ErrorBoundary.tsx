import React from 'react'
import { Box, Button, Typography } from '@mui/material'
import { isChunkLoadError, reloadOnceForChunkError } from '../utils/lazyWithReload'
import { palette } from '@/theme/palette'

interface Props {
  children: React.ReactNode
}

interface State {
  error: Error | null
}

class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // A stale-deploy chunk error is transient — reload once to self-heal instead
    // of stranding the user on the error screen.
    if (isChunkLoadError(error) && reloadOnceForChunkError()) return
    console.error('Application render error:', error, errorInfo)
  }

  render() {
    if (!this.state.error) return this.props.children

    const chunkError = isChunkLoadError(this.state.error)

    return (
      <Box
        sx={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: palette.indigoTint,
          p: { xs: 2, sm: 3 },
        }}
      >
        <Box
          sx={{
            width: 'min(560px, 100%)',
            p: { xs: 2.25, sm: 3 },
            borderRadius: '22px',
            bgcolor: '#fff',
            border: `1px solid ${palette.border}`,
            boxShadow: '0 24px 60px rgba(6,78,59,0.12)',
          }}
        >
          <Typography variant="h5" sx={{ color: palette.ink, fontWeight: 900, mb: 1 }}>
            {chunkError ? 'A new version is available' : 'Something went wrong'}
          </Typography>
          <Typography sx={{ color: palette.textSubtle, mb: 2 }}>
            {chunkError
              ? 'The app was just updated. Reload to load the latest version.'
              : 'The page hit a runtime error. Refresh once; if it happens again, share this message.'}
          </Typography>
          {!chunkError && (
            <Box sx={{ p: 1.5, borderRadius: '12px', bgcolor: palette.dangerWash, color: '#991B1B', fontFamily: 'monospace', fontSize: 13, mb: 2, wordBreak: 'break-word' }}>
              {this.state.error.message}
            </Box>
          )}
          <Button variant="contained" onClick={() => window.location.reload()} sx={{ bgcolor: palette.brand }}>
            Reload
          </Button>
        </Box>
      </Box>
    )
  }
}

export default ErrorBoundary
