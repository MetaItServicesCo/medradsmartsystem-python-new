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
import { useQueryClient } from '@tanstack/react-query'
import { Box, Button, Chip, CircularProgress, Stack, Typography } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import { cancelAssistantAction, confirmAssistantAction, type AssistantActionCard } from '@/api/assistant'
import { useFacilityStore } from '@/hooks/useActiveFacility'
import { palette } from '@/theme/palette'

const STATUS_LABEL: Record<AssistantActionCard['status'], string> = {
  proposed: 'Waiting', executed: 'Done', failed: 'Not done', cancelled: 'Cancelled', expired: 'Expired',
}

/** Confirm or cancel a card, from its buttons or from "yes" said in the conversation. */
export function useDecideAction() {
  const queryClient = useQueryClient()
  return async (card: AssistantActionCard, choice: 'confirm' | 'cancel') => {
    try {
      const next = choice === 'confirm'
        ? await confirmAssistantAction(card.action_id)
        : await cancelAssistantAction(card.action_id)
      if (next.status === 'executed') {
        // The screen behind the panel was loaded before the change and kept
        // showing it from cache, so a change that had been made looked as if
        // it never happened.
        void queryClient.invalidateQueries()
      }
      return { card: next, problem: '' }
    } catch (error: any) {
      const status = error?.response?.status
      const detail = error?.response?.data?.detail
      return {
        card: status === 410 ? { ...card, status: 'expired' as const } : card,
        problem: typeof detail === 'string' ? detail : 'That did not go through. Try again.',
      }
    }
  }
}

/** What the conversation says once a card has been decided. */
export function outcomeText(card: AssistantActionCard, problem: string): string {
  if (problem) return problem
  if (card.status === 'executed') return card.result?.message || 'Done.'
  if (card.status === 'failed') return `It was not done: ${card.error || 'something went wrong.'}`
  if (card.status === 'cancelled') return 'Cancelled. Nothing was changed.'
  if (card.status === 'expired') return 'That expired before it was confirmed. Ask again to prepare it afresh.'
  return ''
}

export default function ActionCard({ card, onChange, onNavigate }: {
  card: AssistantActionCard
  onChange: (card: AssistantActionCard) => void
  onNavigate?: () => void
}) {
  const navigate = useNavigate()
  const decideAction = useDecideAction()
  const [busy, setBusy] = useState<'confirm' | 'cancel' | null>(null)
  const [problem, setProblem] = useState('')

  const decide = async (choice: 'confirm' | 'cancel') => {
    setBusy(choice)
    setProblem('')
    const outcome = await decideAction(card, choice)
    if (outcome.card !== card) onChange(outcome.card)
    setProblem(outcome.problem)
    setBusy(null)
  }

  const open = (route: string) => {
    // Equipment and job lists show one site: open the one the change was made in.
    const site = card.result?.facility_id ?? card.facility_id
    if (site) useFacilityStore.getState().setFacilityId(site)
    navigate(route)
    onNavigate?.()
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
            Nothing happens until you confirm, or say yes. This expires in 10 minutes.
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
            <Button size="small" onClick={() => open(card.result!.route!)}
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
