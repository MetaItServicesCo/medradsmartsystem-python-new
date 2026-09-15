/**
 * A change the assistant has prepared, waiting for the person to confirm it.
 *
 * The card shows exactly what will happen, from the proposal the backend stored,
 * not from the answer text. Confirm runs it once, as this person, through the
 * same code the screens use; Cancel discards it. The outcome replaces the
 * buttons, with a link to the record, so nobody has to wonder whether it took.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Button, Chip, CircularProgress, Stack, Typography } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import { cancelAssistantAction, confirmAssistantAction, type AssistantActionCard } from '@/api/assistant'
import { palette } from '@/theme/palette'

const STATUS_LABEL: Record<AssistantActionCard['status'], string> = {
  proposed: 'Waiting', executed: 'Done', failed: 'Not done', cancelled: 'Cancelled', expired: 'Expired',
}

export default function ActionCard({ card, onChange, onNavigate }: {
  card: AssistantActionCard
  onChange: (card: AssistantActionCard) => void
  onNavigate?: () => void
}) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState<'confirm' | 'cancel' | null>(null)
  const [problem, setProblem] = useState('')

  const decide = async (choice: 'confirm' | 'cancel') => {
    setBusy(choice)
    setProblem('')
    try {
      const next = choice === 'confirm'
        ? await confirmAssistantAction(card.action_id)
        : await cancelAssistantAction(card.action_id)
      onChange(next)
    } catch (error: any) {
      const status = error?.response?.status
      const detail = error?.response?.data?.detail
      if (status === 410) onChange({ ...card, status: 'expired' })
      setProblem(typeof detail === 'string' ? detail : 'That did not go through. Try again.')
    } finally {
      setBusy(null)
    }
  }

  const pending = card.status === 'proposed'
  const tone = card.status === 'executed' ? palette.brand
    : card.status === 'failed' ? palette.danger : palette.textFaint

  return (
    <Box sx={{
      mt: 1.2, p: 1.4, borderRadius: '14px', bgcolor: '#fff',
      border: `1.5px solid ${pending ? palette.brandBorder : '#E9EDF5'}`,
    }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.8 }}>
        <Typography sx={{ fontWeight: 900, fontSize: 13.5, color: palette.ink, flex: 1 }}>
          {card.title}
        </Typography>
        {!pending && (
          <Chip size="small" label={STATUS_LABEL[card.status] ?? card.status}
            sx={{ height: 20, fontSize: 10.5, fontWeight: 900, color: tone, bgcolor: palette.surfaceMuted }} />
        )}
      </Stack>

      <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'minmax(90px, auto) 1fr',
                                 columnGap: 1.2, rowGap: 0.4 }}>
        {card.lines.map((line) => (
          <Box key={line.label} sx={{ display: 'contents' }}>
            <Typography component="dt" sx={{ fontSize: 11.5, fontWeight: 800, color: palette.textFaint }}>
              {line.label}
            </Typography>
            <Typography component="dd" sx={{ m: 0, fontSize: 12.5, fontWeight: 700, color: palette.textStrong,
                                               wordBreak: 'break-word' }}>
              {line.value}
            </Typography>
          </Box>
        ))}
      </Box>

      {card.warnings?.map((warning) => (
        <Typography key={warning} sx={{ mt: 0.8, fontSize: 12, fontWeight: 700, color: palette.warningDeep }}>
          {warning}
        </Typography>
      ))}

      {pending && (
        <>
          <Stack direction="row" spacing={1} sx={{ mt: 1.2 }}>
            <Button
              size="small" variant="contained" disabled={!!busy} onClick={() => decide('confirm')}
              startIcon={busy === 'confirm' ? <CircularProgress size={14} color="inherit" /> : undefined}
              sx={{ fontWeight: 900, borderRadius: '10px', bgcolor: palette.brand,
                    '&:hover': { bgcolor: palette.brandDeep } }}
            >
              Confirm
            </Button>
            <Button size="small" disabled={!!busy} onClick={() => decide('cancel')}
                    sx={{ fontWeight: 800, color: palette.textMuted }}>
              Cancel
            </Button>
          </Stack>
          <Typography sx={{ mt: 0.6, fontSize: 11, color: palette.textFaint }}>
            Nothing happens until you confirm. This expires in 10 minutes.
          </Typography>
        </>
      )}

      {card.status === 'executed' && card.result && (
        <Stack direction="row" alignItems="center" spacing={0.8} sx={{ mt: 1 }}>
          <CheckCircleIcon sx={{ fontSize: 17, color: palette.brand }} />
          <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: palette.brandDeep, flex: 1 }}>
            {card.result.message}
          </Typography>
          {card.result.route && (
            <Button size="small" onClick={() => { navigate(card.result!.route!); onNavigate?.() }}
                    sx={{ fontWeight: 900, minWidth: 0 }}>
              Open
            </Button>
          )}
        </Stack>
      )}

      {(card.status === 'failed' || problem) && (
        <Stack direction="row" alignItems="flex-start" spacing={0.8} sx={{ mt: 1 }}>
          <ErrorOutlineIcon sx={{ fontSize: 17, color: palette.danger, mt: '1px' }} />
          <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: palette.danger }}>
            {problem || card.error}
          </Typography>
        </Stack>
      )}
      {card.status === 'expired' && !problem && (
        <Typography sx={{ mt: 1, fontSize: 12, color: palette.textFaint }}>
          This expired before it was confirmed. Ask again to prepare it afresh.
        </Typography>
      )}
    </Box>
  )
}
