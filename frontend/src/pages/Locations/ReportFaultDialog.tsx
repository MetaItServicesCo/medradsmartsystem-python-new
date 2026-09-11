import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, Stack, Switch, TextField, Typography,
} from '@mui/material'
import BoltIcon from '@mui/icons-material/Bolt'
import { toast } from 'react-toastify'
import { reportFixtureFault, type Fixture } from '@/api/fixtures'
import { palette } from '@/theme/palette'
import { TRADE_LABEL } from './SpaceContents'

/**
 * One click from a broken socket to an assigned work order.
 *
 * The only question asked is what is wrong with it. The room, the trade, the
 * priority and the title are already known, and every extra field here is a
 * reason for the person who found it to tell somebody verbally instead.
 */
export default function ReportFaultDialog({ fixture, locationName, onClose, onReported }: {
  fixture: Fixture
  locationName: string
  onClose: () => void
  onReported: () => void
}) {
  const [description, setDescription] = useState('')
  const [closesRoom, setClosesRoom] = useState(false)

  const submit = useMutation({
    mutationFn: () => reportFixtureFault(fixture.id, {
      description,
      takes_out_of_service: closesRoom,
    }),
    onSuccess: (res) => {
      toast.success(`${res.request_number} raised`)
      onReported()
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Could not raise'),
  })

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth
            PaperProps={{ sx: { borderRadius: '18px' } }}>
      <DialogTitle sx={{ fontWeight: 900, color: palette.ink, pb: 0.5 }}>
        Report a fault
      </DialogTitle>
      <DialogContent>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <BoltIcon sx={{ fontSize: 18, color: palette.brand }} />
          <Box>
            <Typography sx={{ fontWeight: 900, color: palette.ink, fontSize: 14 }}>
              {fixture.code} · {locationName}
            </Typography>
            <Typography sx={{ fontSize: 12.5, color: palette.textMuted, fontWeight: 600 }}>
              {fixture.summary}
              {fixture.circuit_ref ? ` · ${fixture.circuit_ref}` : ''}
            </Typography>
          </Box>
        </Stack>

        <TextField
          autoFocus fullWidth size="small" multiline minRows={3}
          label="What is wrong with it?"
          value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="Dead — confirmed with a second device"
        />

        <FormControlLabel
          sx={{ mt: 1.5 }}
          control={
            <Switch size="small" checked={closesRoom}
                    onChange={(e) => setClosesRoom(e.target.checked)} />
          }
          label={
            <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
              This takes the whole room out of service
            </Typography>
          }
        />
        <Typography sx={{ fontSize: 11.5, color: palette.textFaint, ml: 5.5 }}>
          One dead socket of twelve usually does not. Leave this off unless the
          room genuinely cannot be used.
        </Typography>

        <Typography sx={{ mt: 2, fontSize: 12, color: palette.textMuted, fontWeight: 600 }}>
          Goes to {TRADE_LABEL[fixture.discipline_code || ''] || 'the right trade'} automatically.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} sx={{ fontWeight: 800, color: palette.textMuted }}>
          Cancel
        </Button>
        <Button
          variant="contained" disabled={description.trim().length < 3 || submit.isPending}
          onClick={() => submit.mutate()}
          sx={{ fontWeight: 900, borderRadius: '10px', bgcolor: palette.danger,
                '&:hover': { bgcolor: palette.dangerStrong } }}
        >
          {submit.isPending ? 'Raising…' : 'Raise work order'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
