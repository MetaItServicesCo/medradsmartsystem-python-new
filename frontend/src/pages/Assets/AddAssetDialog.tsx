/**
 * Register a machine.
 *
 * The form this replaces demanded a clinical modality, so adding a lift meant
 * telling the system which kind of medical imaging it was. Plant is now
 * classified by trade, which is the thing that actually carries the routing,
 * the default book life and the maintenance programme; clinical equipment
 * keeps its modality. One or the other, never both.
 *
 * Everything else is either optional or inferred. Criticality comes from the
 * room — a chiller in a theatre inherits the theatre's — and useful life is
 * seeded from the trade, because a lift is twenty years and a monitor is
 * seven and nobody should type that four hundred times.
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { toast } from 'react-toastify'
import { createEquipment } from '@/api/equipment'
import { fetchModalities } from '@/api/modalities'
import { palette } from '@/theme/palette'

type Kind = 'plant' | 'clinical'

export default function AddAssetDialog({
  open, onClose, facilityId, tree, disciplines, onCreated,
}: {
  open: boolean
  onClose: () => void
  facilityId: number
  tree: any[]
  disciplines: Array<{ id: number; name: string; code: string }>
  onCreated: (id: number) => void
}) {
  const [kind, setKind] = useState<Kind>('plant')
  const [form, setForm] = useState({
    asset_tag: '', make: '', model: '', serial_number: '',
    discipline_id: '' as number | '', modality_id: '' as number | '',
    location_id: '' as number | '', description: '',
    cost: '', installation_date: '',
  })

  const { data: modalities } = useQuery({
    queryKey: ['modalities'],
    queryFn: () => fetchModalities(),
    enabled: kind === 'clinical',
    staleTime: 30 * 60_000,
  })

  // Flattened with indentation so the tree reads as a tree in a dropdown.
  const places = useMemo(() => {
    const out: Array<{ id: number; label: string; depth: number }> = []
    const walk = (nodes: any[], depth: number) => {
      for (const n of nodes) {
        out.push({ id: n.id, depth, label: n.name ? `${n.code} · ${n.name}` : n.code })
        walk(n.children ?? [], depth + 1)
      }
    }
    walk(tree, 0)
    return out
  }, [tree])

  const create = useMutation({
    mutationFn: () => createEquipment({
      facility_id: facilityId,
      asset_tag: form.asset_tag,
      make: form.make,
      model: form.model,
      serial_number: form.serial_number,
      discipline_id: kind === 'plant' ? (form.discipline_id as number) : null,
      modality_id: kind === 'clinical' ? (form.modality_id as number) : null,
      location_id: form.location_id === '' ? null : (form.location_id as number),
      description: form.description || null,
      cost: form.cost === '' ? null : Number(form.cost),
      installation_date: form.installation_date || null,
      status: 'active',
    } as any),
    onSuccess: (created: any) => {
      toast.success(`${created.asset_tag} registered`)
      onCreated(created.id)
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.detail?.[0]?.msg
        || e?.response?.data?.detail
        || 'Could not register the asset'),
  })

  const classified = kind === 'plant' ? form.discipline_id !== '' : form.modality_id !== ''
  const ready = form.asset_tag && form.make && form.model && form.serial_number && classified

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth
            PaperProps={{ sx: { borderRadius: '18px' } }}>
      <DialogTitle sx={{ fontWeight: 900, color: palette.ink, pb: 1 }}>
        Register an asset
      </DialogTitle>
      <DialogContent dividers>
        <ToggleButtonGroup
          exclusive size="small" value={kind} fullWidth
          onChange={(_, v) => v && setKind(v)}
          sx={{ mb: 2, '& .MuiToggleButton-root': { fontWeight: 800, textTransform: 'none' },
                '& .Mui-selected': { bgcolor: `${palette.brandTint} !important`,
                                     color: `${palette.brandDeep} !important` } }}
        >
          <ToggleButton value="plant">Plant &amp; MEP</ToggleButton>
          <ToggleButton value="clinical">Clinical equipment</ToggleButton>
        </ToggleButtonGroup>

        <Typography sx={{ mb: 2, fontSize: 12.5, color: palette.textMuted, fontWeight: 600 }}>
          {kind === 'plant'
            ? 'Chillers, air handlers, lifts, generators, pumps, panels. Classified by the trade that maintains it.'
            : 'Imaging, monitoring, laboratory and treatment devices. Classified by modality.'}
        </Typography>

        <Box sx={{ display: 'grid', gap: 1.75,
                   gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
          <TextField
            size="small" label="Asset tag" required value={form.asset_tag}
            onChange={(e) => setForm({ ...form, asset_tag: e.target.value })}
            placeholder={kind === 'plant' ? 'ELEV-3' : 'XR-014'}
          />
          <TextField
            size="small" label="Serial number" required value={form.serial_number}
            onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
          />
          <TextField size="small" label="Make" required value={form.make}
                     onChange={(e) => setForm({ ...form, make: e.target.value })}
                     placeholder={kind === 'plant' ? 'Otis' : 'Siemens'} />
          <TextField size="small" label="Model" required value={form.model}
                     onChange={(e) => setForm({ ...form, model: e.target.value })} />

          {kind === 'plant' ? (
            <TextField
              select size="small" label="Trade" required value={form.discipline_id}
              onChange={(e) => setForm({ ...form, discipline_id: Number(e.target.value) })}
              helperText="Routes its work orders and seeds its book life"
            >
              {disciplines.map((d) => (
                <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
              ))}
            </TextField>
          ) : (
            <TextField
              select size="small" label="Modality" required value={form.modality_id}
              onChange={(e) => setForm({ ...form, modality_id: Number(e.target.value) })}
            >
              {((modalities as any)?.items ?? modalities ?? []).map((m: any) => (
                <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>
              ))}
            </TextField>
          )}

          <TextField
            select size="small" label="Where is it" value={form.location_id}
            onChange={(e) => setForm({
              ...form, location_id: e.target.value === '' ? '' : Number(e.target.value),
            })}
            helperText="Criticality is inherited from the room"
          >
            <MenuItem value="">Not placed yet</MenuItem>
            {places.map((p) => (
              <MenuItem key={p.id} value={p.id} sx={{ pl: 1.5 + p.depth * 1.5 }}>
                {p.label}
              </MenuItem>
            ))}
          </TextField>

          <TextField size="small" type="number" label="Purchase cost" value={form.cost}
                     onChange={(e) => setForm({ ...form, cost: e.target.value })} />
          <TextField
            size="small" type="date" label="In service since"
            InputLabelProps={{ shrink: true }} value={form.installation_date}
            onChange={(e) => setForm({ ...form, installation_date: e.target.value })}
          />
        </Box>

        <TextField
          sx={{ mt: 1.75 }} fullWidth size="small" multiline minRows={2}
          label="Description" value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />

        <Divider sx={{ my: 2 }} />
        <Alert severity="info" sx={{ borderRadius: '12px', fontWeight: 600, fontSize: 12.5 }}>
          Once registered you can schedule its inspections, book it in for service
          and assign a technician from the asset itself.
        </Alert>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} sx={{ fontWeight: 800, color: palette.textMuted }}>Cancel</Button>
        <Button
          variant="contained" disabled={!ready || create.isPending}
          onClick={() => create.mutate()}
          sx={{ fontWeight: 900, borderRadius: '10px', bgcolor: palette.brand,
                '&:hover': { bgcolor: palette.brandDeep } }}
        >
          {create.isPending ? 'Registering…' : 'Register asset'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
