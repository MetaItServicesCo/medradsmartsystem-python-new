import { useEffect, useRef, useState } from 'react'
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Typography } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { screenViewUrl } from '@/api/tracking'
import { useAuthStore } from '@/stores/authStore'

interface Props {
  person: { user_id: number; full_name: string } | null
  onClose: () => void
}

type Phase = 'connecting' | 'waiting' | 'viewing' | 'ended'

// Why the server closed the view (see app/api/v1/endpoints/tracking_screen.py).
const CLOSE_REASONS: Record<number, string> = {
  4401: 'Your session has ended. Sign in again to watch.',
  4403: 'Screen view is not allowed for this person right now - it is switched off, not agreed to, or they are not checked in.',
  4404: 'Their desktop app is not connected right now.',
  4410: 'Their desktop app disconnected.',
  4503: 'Live screen view is not available on this server.',
}

/**
 * Watches one person's screen live. Their desktop app captures only while this
 * is open; nothing is recorded, and the view itself goes in the audit log.
 */
const ScreenViewDialog = ({ person, onClose }: Props) => {
  const token = useAuthStore((state) => state.token)
  const [phase, setPhase] = useState<Phase>('connecting')
  const [message, setMessage] = useState('')
  const [frame, setFrame] = useState<string | null>(null)
  const frameUrl = useRef<string | null>(null)

  useEffect(() => {
    if (!person || !token) return undefined
    setPhase('connecting')
    setMessage('')
    setFrame(null)
    const socket = new WebSocket(screenViewUrl(person.user_id, token))
    socket.binaryType = 'blob'
    let closedByUs = false
    socket.onmessage = (event) => {
      if (typeof event.data === 'string') {
        setPhase((current) => (current === 'viewing' ? current : 'waiting'))
        return
      }
      const url = URL.createObjectURL(event.data as Blob)
      if (frameUrl.current) URL.revokeObjectURL(frameUrl.current)
      frameUrl.current = url
      setFrame(url)
      setPhase('viewing')
    }
    socket.onclose = (event) => {
      if (closedByUs) return
      setPhase('ended')
      setMessage(CLOSE_REASONS[event.code] || 'The live view ended.')
    }
    return () => {
      closedByUs = true
      socket.close()
      if (frameUrl.current) URL.revokeObjectURL(frameUrl.current)
      frameUrl.current = null
    }
  }, [person, token])

  return (
    <Dialog open={Boolean(person)} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle sx={{ fontWeight: 900, pr: 6 }}>
        Live screen · {person?.full_name}
        <IconButton aria-label="Close" onClick={onClose} sx={{ position: 'absolute', right: 12, top: 12 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{
          minHeight: 360, bgcolor: '#0F172A', borderRadius: '14px', display: 'flex',
          alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}>
          {phase === 'viewing' && frame ? (
            <Box component="img" src={frame} alt={`${person?.full_name}'s screen`} sx={{ maxWidth: '100%', maxHeight: '70vh', display: 'block' }} />
          ) : phase === 'ended' ? (
            <Typography sx={{ color: '#E2E8F0', p: 3, textAlign: 'center' }}>{message}</Typography>
          ) : (
            <Box sx={{ color: '#E2E8F0', display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <CircularProgress size={22} sx={{ color: '#C4B5FD' }} />
              <Typography>{phase === 'connecting' ? 'Connecting...' : 'Waiting for the first picture from their desktop...'}</Typography>
            </Box>
          )}
        </Box>
        <Typography sx={{ color: '#6B7280', fontSize: '0.8rem', mt: 1.5 }}>
          Nothing is recorded. Their screen is captured only while this window is open, and this view is written to the audit log.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}

export default ScreenViewDialog
