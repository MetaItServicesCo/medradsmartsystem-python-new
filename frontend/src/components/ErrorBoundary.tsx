import React from 'react'
import { Box, Button, Typography } from '@mui/material'

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
    console.error('Application render error:', error, errorInfo)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: '#EEF2FF',
          p: 3,
        }}
      >
        <Box
          sx={{
            width: 'min(560px, 100%)',
            p: 3,
            borderRadius: '22px',
            bgcolor: '#fff',
            border: '1px solid #E5E7EB',
            boxShadow: '0 24px 60px rgba(49,46,129,0.12)',
          }}
        >
          <Typography variant="h5" sx={{ color: '#1E1B4B', fontWeight: 900, mb: 1 }}>
            Something went wrong
          </Typography>
          <Typography sx={{ color: '#64748B', mb: 2 }}>
            The page hit a runtime error. Refresh once; if it happens again, share this message.
          </Typography>
          <Box sx={{ p: 1.5, borderRadius: '12px', bgcolor: '#FEF2F2', color: '#991B1B', fontFamily: 'monospace', fontSize: 13, mb: 2, wordBreak: 'break-word' }}>
            {this.state.error.message}
          </Box>
          <Button variant="contained" onClick={() => window.location.reload()} sx={{ bgcolor: '#7C3AED' }}>
            Reload
          </Button>
        </Box>
      </Box>
    )
  }
}

export default ErrorBoundary
