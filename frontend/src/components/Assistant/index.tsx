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

interface Turn {
  role: 'user' | 'assistant'
  text: string
  citations?: AssistantCitation[]
  toolsUsed?: string[]
  isError?: boolean
}

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
  }, [turns, progress])

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

    cancelRef.current = askAssistant(trimmed, {
      onProgress: (node) => setProgress(PROGRESS_LABEL[node] || 'Working'),
      onAnswer: (answer) => {
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
        setTurns((prev) => [...prev, { role: 'assistant', text: message, isError: true }])
        setBusy(false)
        setProgress('')
      },
    })
  }

  const stop = () => {
    cancelRef.current?.()
    setBusy(false)
    setProgress('')
  }

  return (
    <>
      <Tooltip title="Ask the assistant">
        <Fab
          onClick={() => setOpen(true)}
          sx={{
            position: 'fixed', bottom: 26, right: 26, zIndex: 1250,
            color: '#fff', boxShadow: '0 16px 36px rgba(109,64,200,0.42)',
            background: 'linear-gradient(135deg, #7C3AED, #9A55B0)',
            '&:hover': { background: 'linear-gradient(135deg, #6D28D9, #8A46C2)' },
          }}
        >
          <AutoAwesomeIcon />
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
            <Typography sx={{ fontWeight: 900, fontSize: 16 }}>Super Admin Assistant</Typography>
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
              <Typography sx={{ color: '#64748B', fontSize: 13, fontWeight: 700, mb: 1.4 }}>
                Ask about facilities, service requests, inspections, rentals, sales, billing or HR.
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

          {busy && (
            <Typography sx={{ mt: 1.6, color: '#7C3AED', fontSize: 12, fontWeight: 800 }}>
              {progress}…
            </Typography>
          )}
        </Box>

        <Box sx={{ p: 1.6, borderTop: '1px solid #E9EDF5', display: 'flex', gap: 1, alignItems: 'flex-end' }}>
          <TextField
            fullWidth
            multiline
            maxRows={4}
            size="small"
            placeholder="Ask a question…"
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
