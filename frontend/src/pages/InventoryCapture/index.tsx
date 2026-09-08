import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, IconButton, Stack, TextField, Typography,
} from '@mui/material'
import CameraAltIcon from '@mui/icons-material/CameraAlt'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import EditIcon from '@mui/icons-material/Edit'
import ReplayIcon from '@mui/icons-material/Replay'
import { toast } from 'react-toastify'

import useCaptureCamera from '@/hooks/useCaptureCamera'
import {
  captureParts, listDefinitions, matchPhoto, updateDefinition,
  type MatchCandidate, type MatchResult, type PartDefinition,
} from '@/api/inventoryCapture'

/**
 * Capture parts by photographing them.
 *
 * Built for someone standing in a store room holding a phone in one hand and
 * a part in the other. The shutter never waits for anything, quantity is two
 * taps, and the describing happens afterwards -- once per kind of part, not
 * once per object.
 *
 * The recogniser offers candidates and never decides. A wrong match inherited
 * silently would mislabel stock, and nobody would find out until it mattered.
 */

type Stage = 'idle' | 'matching' | 'choosing' | 'saved'

const CaptureScreen = () => {
  const queryClient = useQueryClient()
  const camera = useCaptureCamera()

  const [stage, setStage] = useState<Stage>('idle')
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [preview, setPreview] = useState<string>('')
  const [match, setMatch] = useState<MatchResult | null>(null)
  const [chosen, setChosen] = useState<MatchCandidate | PartDefinition | null>(null)
  const [newName, setNewName] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [lastSaved, setLastSaved] = useState<{ name: string; codes: string[]; total: number } | null>(null)
  const [editing, setEditing] = useState<PartDefinition | null>(null)

  // Revoke the previous preview rather than letting object URLs accumulate
  // over a long capture session.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const reset = useCallback(() => {
    setPhoto(null)
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return '' })
    setMatch(null)
    setChosen(null)
    setNewName('')
    setQuantity(1)
    setStage('idle')
  }, [])

  const takePhoto = useCallback(async () => {
    const blob = await camera.capture()
    if (!blob) {
      toast.error('The camera is not ready yet.')
      return
    }
    setPhoto(blob)
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob) })
    setStage('matching')
    try {
      const result = await matchPhoto(blob)
      setMatch(result)
      // Pre-select only when the best candidate stands out. Otherwise the list
      // is shown with nothing chosen, so accepting is a decision rather than
      // the path of least resistance.
      setChosen(result.confident && result.candidates.length ? result.candidates[0] : null)
    } catch {
      // Recognition failing must not stop the capture: the part can still be
      // recorded as something new and described later.
      setMatch({ candidates: [], confident: false, readable: true })
      setChosen(null)
    } finally {
      setStage('choosing')
    }
  }, [camera])

  const save = useMutation({
    mutationFn: async () => {
      const known = chosen as PartDefinition | null
      if (!known && !newName.trim()) {
        throw new Error('Give this part a name, or pick one of the matches.')
      }
      return captureParts({
        photo,
        quantity,
        definitionId: known?.id ?? null,
        label: known ? undefined : newName.trim(),
      })
    },
    onSuccess: (result) => {
      setLastSaved({
        name: result.definition.name,
        codes: result.captured.map((c) => c.code),
        total: result.definition.unit_count,
      })
      queryClient.invalidateQueries({ queryKey: ['part-definitions'] })
      reset()
      setStage('saved')
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.detail || error?.message || 'Could not save the capture.')
    },
  })

  const { data: definitions = [] } = useQuery({
    queryKey: ['part-definitions'],
    queryFn: () => listDefinitions(),
    staleTime: 30_000,
  })

  const saveDetails = useMutation({
    mutationFn: async (changes: Partial<PartDefinition>) => {
      if (!editing) throw new Error('Nothing is being edited.')
      return updateDefinition(editing.id, changes as any)
    },
    onSuccess: (updated) => {
      toast.success(`Updated ${updated.name}. All ${updated.unit_count} items carry this.`)
      queryClient.invalidateQueries({ queryKey: ['part-definitions'] })
      setEditing(null)
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.detail || 'Could not save the details.')
    },
  })

  return (
    <Box sx={{ p: { xs: 1.5, md: 3 }, maxWidth: 780, mx: 'auto' }}>
      <Typography sx={{ fontWeight: 900, fontSize: 22, mb: 0.5 }}>Capture parts</Typography>
      <Typography sx={{ color: '#64748B', fontSize: 13.5, mb: 2 }}>
        Photograph a part, set how many there are, and describe it later. Each item
        gets its own code; the description is shared by all of them.
      </Typography>

      {camera.error && <Alert severity="error" sx={{ mb: 2 }}>{camera.error}</Alert>}

      <Card sx={{ p: 0, overflow: 'hidden', borderRadius: 3, mb: 2 }}>
        <Box sx={{ position: 'relative', bgcolor: '#0F172A', aspectRatio: '4 / 3' }}>
          <video
            ref={camera.videoRef}
            playsInline
            muted
            style={{
              width: '100%', height: '100%', objectFit: 'cover',
              display: camera.ready && !preview ? 'block' : 'none',
            }}
          />
          {preview && (
            <img
              src={preview}
              alt="The part just photographed"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
          {!camera.ready && !preview && (
            <Stack alignItems="center" justifyContent="center" sx={{ height: '100%', color: '#fff', gap: 1.5 }}>
              <CameraAltIcon sx={{ fontSize: 44, opacity: 0.65 }} />
              <Button
                variant="contained"
                onClick={() => void camera.start()}
                disabled={camera.starting || !camera.supported}
              >
                {camera.starting ? 'Opening…' : 'Start camera'}
              </Button>
              {!camera.supported && (
                <Typography sx={{ fontSize: 12, opacity: 0.8, px: 3, textAlign: 'center' }}>
                  Open this page on a phone, over HTTPS.
                </Typography>
              )}
            </Stack>
          )}
        </Box>

        <Box sx={{ p: 2 }}>
          {stage === 'idle' && (
            <Button
              fullWidth size="large" variant="contained" startIcon={<CameraAltIcon />}
              onClick={() => void takePhoto()} disabled={!camera.ready}
              sx={{ py: 1.6, fontWeight: 800 }}
            >
              Capture
            </Button>
          )}

          {stage === 'matching' && (
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ py: 1 }}>
              <CircularProgress size={20} />
              <Typography sx={{ fontSize: 14 }}>Looking for a match…</Typography>
            </Stack>
          )}

          {stage === 'choosing' && (
            <Stack spacing={2}>
              {match && match.candidates.length > 0 ? (
                <>
                  <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#475569' }}>
                    {match.confident ? 'This looks like:' : 'Might be one of these:'}
                  </Typography>
                  <Stack spacing={1}>
                    {match.candidates.map((candidate) => {
                      const selected = (chosen as any)?.id === candidate.id
                      return (
                        <Card
                          key={candidate.id}
                          onClick={() => { setChosen(candidate); setNewName('') }}
                          sx={{
                            p: 1.5, cursor: 'pointer', display: 'flex', alignItems: 'center',
                            gap: 1.5, borderRadius: 2,
                            border: selected ? '2px solid #7C3AED' : '1px solid #E2E8F0',
                            bgcolor: selected ? '#F5F3FF' : '#fff',
                          }}
                        >
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography sx={{ fontWeight: 800, fontSize: 15 }} noWrap>
                              {candidate.name}
                            </Typography>
                            <Typography sx={{ fontSize: 12.5, color: '#64748B' }}>
                              {candidate.unit_count} item{candidate.unit_count === 1 ? '' : 's'} stored
                              {candidate.part_number ? ` · ${candidate.part_number}` : ''}
                            </Typography>
                          </Box>
                          <Chip
                            size="small"
                            label={`${Math.round(candidate.score * 100)}%`}
                            sx={{ fontWeight: 800 }}
                          />
                          {selected && <CheckCircleIcon sx={{ color: '#7C3AED' }} />}
                        </Card>
                      )
                    })}
                  </Stack>
                  <Divider>or</Divider>
                </>
              ) : (
                <Alert severity="info" sx={{ py: 0.5 }}>
                  {match && !match.readable
                    ? 'That photograph could not be read, but the part can still be recorded.'
                    : 'Nothing like this has been captured before.'}
                </Alert>
              )}

              <TextField
                label="New part name"
                placeholder="e.g. Philips MX40 pump"
                size="small"
                value={newName}
                onChange={(event) => { setNewName(event.target.value); setChosen(null) }}
                fullWidth
              />

              <Box>
                <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#475569', mb: 0.75 }}>
                  How many of these?
                </Typography>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <IconButton
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    sx={{ border: '1px solid #E2E8F0' }}
                  >
                    <RemoveIcon />
                  </IconButton>
                  <TextField
                    value={quantity}
                    onChange={(event) => {
                      const next = parseInt(event.target.value.replace(/\D/g, ''), 10)
                      setQuantity(Number.isFinite(next) ? Math.min(Math.max(next, 1), 500) : 1)
                    }}
                    inputProps={{ inputMode: 'numeric', style: { textAlign: 'center', fontWeight: 800 } }}
                    sx={{ width: 88 }}
                    size="small"
                  />
                  <IconButton
                    onClick={() => setQuantity((q) => Math.min(500, q + 1))}
                    sx={{ border: '1px solid #E2E8F0' }}
                  >
                    <AddIcon />
                  </IconButton>
                </Stack>
              </Box>

              <Stack direction="row" spacing={1}>
                <Button variant="outlined" onClick={reset} startIcon={<ReplayIcon />}>
                  Retake
                </Button>
                <Button
                  fullWidth variant="contained" size="large"
                  onClick={() => save.mutate()}
                  disabled={save.isPending || (!chosen && !newName.trim())}
                  sx={{ fontWeight: 800 }}
                >
                  {save.isPending
                    ? 'Saving…'
                    : `Save ${quantity} item${quantity === 1 ? '' : 's'}`}
                </Button>
              </Stack>
            </Stack>
          )}

          {stage === 'saved' && lastSaved && (
            <Stack spacing={1.5}>
              <Alert severity="success" sx={{ py: 0.5 }}>
                <strong>{lastSaved.name}</strong> — {lastSaved.codes.length} recorded,
                {' '}{lastSaved.total} stored in total.
              </Alert>
              <Typography sx={{ fontSize: 12, color: '#64748B', wordBreak: 'break-all' }}>
                {lastSaved.codes.slice(0, 6).join('  ')}
                {lastSaved.codes.length > 6 ? `  +${lastSaved.codes.length - 6} more` : ''}
              </Typography>
              <Button
                fullWidth size="large" variant="contained" startIcon={<CameraAltIcon />}
                onClick={() => setStage('idle')} sx={{ py: 1.5, fontWeight: 800 }}
              >
                Capture the next one
              </Button>
            </Stack>
          )}
        </Box>
      </Card>

      <Typography sx={{ fontWeight: 900, fontSize: 16, mb: 1 }}>
        Captured so far
      </Typography>
      <Stack spacing={1}>
        {definitions.length === 0 && (
          <Typography sx={{ color: '#94A3B8', fontSize: 13.5 }}>
            Nothing captured yet.
          </Typography>
        )}
        {definitions.map((definition) => (
          <Card key={definition.id} sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, borderRadius: 2 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 800, fontSize: 15 }} noWrap>{definition.name}</Typography>
              <Typography sx={{ fontSize: 12.5, color: '#64748B' }} noWrap>
                {definition.unit_count} item{definition.unit_count === 1 ? '' : 's'}
                {definition.description ? ` · ${definition.description}` : ' · not described yet'}
              </Typography>
            </Box>
            <IconButton onClick={() => setEditing(definition)} aria-label="Edit details">
              <EditIcon />
            </IconButton>
          </Card>
        ))}
      </Stack>

      <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 900 }}>
          {editing?.name}
          <Typography sx={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>
            Saved here once and carried by all {editing?.unit_count} items.
          </Typography>
        </DialogTitle>
        <DialogContent>
          {editing && (
            <Stack spacing={2} sx={{ pt: 1 }}>
              {(
                [
                  ['name', 'Name'],
                  ['part_number', 'Part number'],
                  ['part_type', 'Part type'],
                  ['make', 'Make'],
                  ['model', 'Model'],
                  ['description', 'Description'],
                ] as const
              ).map(([field, label]) => (
                <TextField
                  key={field}
                  label={label}
                  size="small"
                  fullWidth
                  multiline={field === 'description'}
                  minRows={field === 'description' ? 2 : undefined}
                  value={(editing as any)[field] ?? ''}
                  onChange={(event) =>
                    setEditing({ ...editing, [field]: event.target.value } as PartDefinition)
                  }
                />
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditing(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={saveDetails.isPending}
            onClick={() => {
              if (!editing) return
              saveDetails.mutate({
                name: editing.name,
                part_number: editing.part_number,
                part_type: editing.part_type,
                make: editing.make,
                model: editing.model,
                description: editing.description,
              })
            }}
          >
            {saveDetails.isPending ? 'Saving…' : 'Save for all items'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default CaptureScreen
