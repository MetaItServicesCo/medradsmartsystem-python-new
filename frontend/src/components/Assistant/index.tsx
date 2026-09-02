import { useEffect, useRef, useState } from 'react'
import {
  Avatar,
  Box,
  Chip,
  Drawer,
  Fab,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CloseIcon from '@mui/icons-material/Close'
import SendIcon from '@mui/icons-material/Send'
import StopCircleIcon from '@mui/icons-material/StopCircle'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  askAssistant,
  fetchAssistantStatus,
  type AssistantCitation,
} from '@/api/assistant'
import { useAuthStore } from '@/stores/authStore'
import { keyframes } from '@emotion/react'

interface Turn {
  role: 'user' | 'assistant'
  text: string
  citations?: AssistantCitation[]
  toolsUsed?: string[]
  isError?: boolean
}

// Kept in sync with AGENT_NAME in the agent service. The agent introduces
// itself by this name, so the header must not disagree with what it says.
const AGENT_NAME = 'Mr. Medrad'

// Motion is deliberately restrained: it signals progress, it does not decorate.
const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
`
const shimmer = keyframes`
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
`
const blink = keyframes`
  0%, 45% { opacity: 1; }
  50%, 95% { opacity: 0.15; }
  100% { opacity: 1; }
`
const bob = keyframes`
  0%, 100% { transform: translateY(0) scale(1); }
  50%      { transform: translateY(-3px) scale(1.06); }
`
const ripple = keyframes`
  0%   { transform: scale(0.85); opacity: 0.55; }
  70%  { transform: scale(1.7); opacity: 0; }
  100% { transform: scale(1.7); opacity: 0; }
`

const SUGGESTIONS = [
  'How much business have we done with Grace Ambulatory?',
  'How many inspections were completed this month?',
  'Which invoices are overdue?',
  'How do I add a facility?',
]

// Node names map to what the user should understand is happening.
const PROGRESS_LABEL: Record<string, string> = {
  classify: 'Understanding the question',
  use_tools: 'Reading live data',
  retrieve: 'Searching documentation',
  gather: 'Reading live data and documentation',
  synthesize: 'Composing the answer',
}

const AssistantWidget = () => {
  const navigate = useNavigate()
  const currentUser = useAuthStore((state) => state.user)
  const isSuperAdmin = currentUser?.role === 'superadmin'

  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  // Tokens land here as they arrive and are promoted to a turn on completion.
  const [streaming, setStreaming] = useState('')
  const cancelRef = useRef<(() => void) | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const { data: status } = useQuery({
    queryKey: ['assistant-status', currentUser?.id],
    queryFn: fetchAssistantStatus,
    enabled: Boolean(isSuperAdmin),
    staleTime: 5 * 60_000,
  })

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns, progress, streaming])

  // Abort any in-flight run if the widget unmounts.
  useEffect(() => () => cancelRef.current?.(), [])

  if (!isSuperAdmin || !status?.enabled || !status?.available_to_user) return null

  const submit = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    setTurns((prev) => [...prev, { role: 'user', text: trimmed }])
    setQuestion('')
    setBusy(true)
    setProgress('Understanding the question')
    setStreaming('')

    // Last few turns give the assistant continuity: without them it treats
    // every question as the first and re-introduces itself each reply.
    const history = turns.slice(-8).map((turn) => ({
      role: turn.role,
      text: turn.text,
    }))

    cancelRef.current = askAssistant(trimmed, {
      onProgress: (node) => setProgress(PROGRESS_LABEL[node] || 'Working'),
      onToken: (text) => setStreaming((prev) => prev + text),
      onAnswer: (answer) => {
        setStreaming('')
        setTurns((prev) => [...prev, {
          role: 'assistant',
          text: answer.answer,
          citations: answer.citations,
          toolsUsed: answer.tools_used,
        }])
        setBusy(false)
        setProgress('')
      },
      onError: (message) => {
        setStreaming('')
        setTurns((prev) => [...prev, { role: 'assistant', text: message, isError: true }])
        setBusy(false)
        setProgress('')
      },
    }, history)
  }

  const stop = () => {
    cancelRef.current?.()
    // Keep whatever streamed so far rather than discarding a partial answer.
    if (streaming.trim()) {
      setTurns((prev) => [...prev, { role: 'assistant', text: streaming.trim() }])
    }
    setStreaming('')
    setBusy(false)
    setProgress('')
  }

  return (
    <>
      <Tooltip title={`Ask ${AGENT_NAME}`}>
        <Fab
          onClick={() => setOpen(true)}
          sx={{
            position: 'fixed', bottom: 26, right: 26, zIndex: 1250,
            color: '#fff', boxShadow: '0 16px 36px rgba(109,64,200,0.42)',
            background: 'linear-gradient(135deg, #7C3AED, #9A55B0)',
            transition: 'transform 0.25s ease',
            '&:hover': {
              background: 'linear-gradient(135deg, #6D28D9, #8A46C2)',
              transform: 'scale(1.06) rotate(-6deg)',
            },
            // A ring pulses out of the button while a run is in flight, so the
            // user can tell it is still working with the panel closed.
            '&::after': busy ? {
              content: '""', position: 'absolute', inset: -4, borderRadius: '50%',
              border: '2px solid rgba(124,58,237,0.55)',
              animation: `${ripple} 1.6s ease-out infinite`,
            } : {},
          }}
        >
          <Box sx={{ display: 'inline-flex', animation: busy ? `${bob} 1.4s ease-in-out infinite` : 'none' }}>
            <AutoAwesomeIcon />
          </Box>
        </Fab>
      </Tooltip>

      <Drawer
        anchor="right"
        open={open}
        onClose={() => setOpen(false)}
        PaperProps={{ sx: { width: { xs: '100%', sm: 460 }, display: 'flex', flexDirection: 'column' } }}
      >
        <Box sx={{
          p: 2, color: '#fff', display: 'flex', alignItems: 'center', gap: 1.4,
          background: 'linear-gradient(135deg, #7C3AED 0%, #8A46C2 54%, #9A55B0 100%)',
        }}>
          <Avatar sx={{ bgcolor: 'rgba(255,255,255,0.18)' }}><AutoAwesomeIcon /></Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 900, fontSize: 16 }}>Ask {AGENT_NAME}</Typography>
            <Typography sx={{ fontSize: 11.5, fontWeight: 700, opacity: 0.82 }}>
              Read-only · answers cite live data and documentation
            </Typography>
          </Box>
          {turns.length > 0 && (
            <Tooltip title="New conversation">
              <IconButton size="small" onClick={() => { stop(); setTurns([]) }} sx={{ color: '#fff' }}>
                <RestartAltIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <IconButton size="small" onClick={() => setOpen(false)} sx={{ color: '#fff' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        <Box ref={scrollRef} sx={{ flex: 1, overflowY: 'auto', p: 2, bgcolor: '#F8FAFC' }}>
          {turns.length === 0 && (
            <Box>
              <Typography sx={{ color: '#1E1B4B', fontSize: 15, fontWeight: 900, mb: 0.4 }}>
                Hi, I'm {AGENT_NAME}.
              </Typography>
              <Typography sx={{ color: '#64748B', fontSize: 13, fontWeight: 700, mb: 1.4 }}>
                Ask me about facilities, service requests, inspections, rentals, sales, billing or HR — or how to do something in the app.
              </Typography>
              <Stack spacing={1}>
                {SUGGESTIONS.map((suggestion) => (
                  <Box
                    key={suggestion}
                    onClick={() => submit(suggestion)}
                    sx={{
                      p: 1.3, borderRadius: '14px', bgcolor: '#fff', cursor: 'pointer',
                      border: '1px solid #E9EDF5', color: '#475569', fontSize: 13, fontWeight: 700,
                      '&:hover': { borderColor: '#C4B5FD', bgcolor: '#FBFAFF' },
                    }}
                  >
                    {suggestion}
                  </Box>
                ))}
              </Stack>
            </Box>
          )}

          <Stack spacing={1.6}>
            {turns.map((turn, index) => (
              <Box
                key={index}
                sx={{
                  alignSelf: turn.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '92%',
                  p: 1.5,
                  borderRadius: '16px',
                  bgcolor: turn.role === 'user' ? '#EEEAFE' : turn.isError ? '#FEF2F2' : '#fff',
                  border: `1px solid ${turn.isError ? '#FECACA' : '#E9EDF5'}`,
                  animation: `${fadeUp} 0.28s ease both`,
                  boxShadow: turn.role === 'user' ? 'none' : '0 2px 10px rgba(30,27,75,0.05)',
                }}
              >
                <Typography sx={{
                  whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.6, fontWeight: 600,
                  color: turn.isError ? '#991B1B' : '#1E293B',
                }}>
                  {turn.text}
                </Typography>

                {!!turn.citations?.length && (
                  <Stack direction="row" sx={{ mt: 1.2, flexWrap: 'wrap', gap: 0.7 }}>
                    {turn.citations.map((citation, position) => (
                      <Chip
                        key={`${citation.label}-${position}`}
                        size="small"
                        icon={citation.type === 'knowledge'
                          ? <MenuBookIcon sx={{ fontSize: 15 }} />
                          : <OpenInNewIcon sx={{ fontSize: 15 }} />}
                        label={citation.label?.slice(0, 44)}
                        onClick={citation.route ? () => { navigate(citation.route!); setOpen(false) } : undefined}
                        sx={{
                          maxWidth: '100%', fontWeight: 800, fontSize: 11,
                          bgcolor: citation.type === 'knowledge' ? '#F1F5F9' : '#F0EDFF',
                          color: citation.type === 'knowledge' ? '#475569' : '#5B42C5',
                          cursor: citation.route ? 'pointer' : 'default',
                        }}
                      />
                    ))}
                  </Stack>
                )}
              </Box>
            ))}
          </Stack>

          {/* Live answer: tokens render as they arrive, with a blinking caret. */}
          {streaming && (
            <Box sx={{
              mt: 1.6, maxWidth: '92%', p: 1.5, borderRadius: '16px', bgcolor: '#fff',
              border: '1px solid #E9EDF5', boxShadow: '0 2px 10px rgba(30,27,75,0.05)',
              animation: `${fadeUp} 0.28s ease both`,
            }}>
              <Typography component="span" sx={{
                whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.6,
                fontWeight: 600, color: '#1E293B',
              }}>
                {streaming}
              </Typography>
              <Box component="span" sx={{
                display: 'inline-block', width: 7, height: 15, ml: '2px',
                verticalAlign: 'text-bottom', borderRadius: '2px', bgcolor: '#7C3AED',
                animation: `${blink} 1s steps(1) infinite`,
              }} />
            </Box>
          )}

          {busy && !streaming && (
            <Box sx={{ mt: 1.6, display: 'flex', alignItems: 'center', gap: 1.1 }}>
              <Stack direction="row" spacing={0.5}>
                {[0, 1, 2].map((dot) => (
                  <Box key={dot} sx={{
                    width: 7, height: 7, borderRadius: '50%', bgcolor: '#7C3AED',
                    animation: `${bob} 1s ease-in-out ${dot * 0.15}s infinite`,
                  }} />
                ))}
              </Stack>
              <Typography sx={{
                fontSize: 12, fontWeight: 800,
                // Shimmer sweeps across the label so a slow step still looks alive.
                background: 'linear-gradient(90deg,#A78BFA 25%,#4C1D95 50%,#A78BFA 75%)',
                backgroundSize: '200% 100%',
                WebkitBackgroundClip: 'text', backgroundClip: 'text',
                color: 'transparent',
                animation: `${shimmer} 2s linear infinite`,
              }}>
                {progress}…
              </Typography>
            </Box>
          )}
        </Box>

        <Box sx={{ p: 1.6, borderTop: '1px solid #E9EDF5', display: 'flex', gap: 1, alignItems: 'flex-end' }}>
          <TextField
            fullWidth
            multiline
            maxRows={4}
            size="small"
            placeholder={`Ask ${AGENT_NAME} anything…`}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submit(question)
              }
            }}
          />
          {busy ? (
            <Tooltip title="Stop">
              <IconButton onClick={stop} sx={{ color: '#DC2626' }}><StopCircleIcon /></IconButton>
            </Tooltip>
          ) : (
            <IconButton
              onClick={() => submit(question)}
              disabled={!question.trim()}
              sx={{ color: '#7C3AED' }}
            >
              <SendIcon />
            </IconButton>
          )}
        </Box>
      </Drawer>
    </>
  )
}

export default AssistantWidget
