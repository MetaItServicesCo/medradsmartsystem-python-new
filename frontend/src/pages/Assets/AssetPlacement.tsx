/**
 * Where an asset is, what it serves, and moving it.
 *
 * Before this, an asset's room was set when it was registered and could never
 * change: a chair carried next door stayed recorded in the old room, and the
 * only way to say what an air handler feeds was an admin-only endpoint no
 * screen called.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem,
  Stack, TextField, Tooltip, Typography,
} from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { toast } from 'react-toastify'
import { fetchServiceTypes } from '@/api/disciplines'
import { addServes, fetchServes, removeServes, updateEquipment } from '@/api/equipment'
import { palette } from '@/theme/palette'
import { PlacePicker, TYPE_LABEL, usePlaces } from './PlacePicker'

const humanise = (v?: string | null) =>
  (v || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

const errorText = (e: any, fallback: string) =>
  typeof e?.response?.data?.detail === 'string' ? e.response.data.detail : fallback

/** Move an asset to another space. Its criticality follows unless somebody set it. */
export function MoveAssetDialog({ asset, onClose }: { asset: any; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [target, setTarget] = useState<number | null>(asset.location_id ?? null)
  const { places } = usePlaces(asset.facility_id)
  const from = places.find((p) => p.id === asset.location_id)
  const to = places.find((p) => p.id === target)

  const move = useMutation({
    mutationFn: () => updateEquipment(asset.id, { location_id: target } as any),
    onSuccess: () => {
      toast.success(to ? `${asset.asset_tag} moved to ${to.label}` : `${asset.asset_tag} marked not placed`)
      queryClient.invalidateQueries({ queryKey: ['equipment'] })
      onClose()
    },
    onError: (e: any) => toast.error(errorText(e, 'Could not move it')),
  })

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
      <DialogTitle sx={{ fontWeight: 900, color: palette.ink, pb: 0.5 }}>
        Move {asset.asset_tag}
      </DialogTitle>
      <DialogContent>
        <Typography sx={{ mb: 2, fontSize: 13, color: palette.textMuted }}>
          Now in <b>{from ? from.label : 'no space yet'}</b>{from?.path ? ` · ${from.path}` : ''}
        </Typography>
        <PlacePicker
          facilityId={asset.facility_id} value={target} onChange={(id) => setTarget(id)}
          label="Move it to" helperText="Any level. Clear it if it has gone to store."
        />
        <Typography sx={{ mt: 1.5, fontSize: 12, color: palette.textFaint }}>
          Its tag stays the same. Its criticality follows the new space unless it was set by hand.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} sx={{ fontWeight: 800, color: palette.textMuted }}>Cancel</Button>
        <Button
          variant="contained" onClick={() => move.mutate()}
          disabled={target === (asset.location_id ?? null) || move.isPending}
          sx={{ fontWeight: 900, borderRadius: '10px' }}
        >
          {move.isPending ? 'Moving…' : 'Move'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/** The spaces this asset supplies, with add and remove. */
export function ServesPanel({ asset, canEdit }: { asset: any; canEdit: boolean }) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [space, setSpace] = useState<number | null>(null)
  const [serviceType, setServiceType] = useState('')

  const { data: links = [] } = useQuery({
    queryKey: ['serves', asset.id], queryFn: () => fetchServes(asset.id),
  })
  const { data: serviceTypes = [] } = useQuery({
    queryKey: ['service-types'], queryFn: fetchServiceTypes, staleTime: 60 * 60_000,
    enabled: adding || links.length > 0,
  })
  const serviceLabel = (v: string) => serviceTypes.find((s) => s.value === v)?.label ?? humanise(v)

  const afterChange = (rows: unknown) => {
    queryClient.setQueryData(['serves', asset.id], rows)
    // Criticality may have followed.
    queryClient.invalidateQueries({ queryKey: ['equipment'] })
  }

  const add = useMutation({
    mutationFn: () => addServes(asset.id, { location_id: space as number, service_type: serviceType }),
    onSuccess: (rows) => {
      afterChange(rows)
      setSpace(null)
      setAdding(false)
      toast.success('Connection recorded')
    },
    onError: (e: any) => toast.error(errorText(e, 'Could not record that')),
  })
  const remove = useMutation({
    mutationFn: (linkId: number) => removeServes(asset.id, linkId),
    onSuccess: afterChange,
    onError: (e: any) => toast.error(errorText(e, 'Could not remove that')),
  })

  return (
    <Box sx={{ px: 2.25, pb: 2.25 }}>
      <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
        <Typography sx={{ fontWeight: 900, color: palette.ink, fontSize: 14 }}>
          What it serves · {links.length}
        </Typography>
        <Box sx={{ flex: 1 }} />
        {canEdit && !adding && (
          <Button size="small" onClick={() => setAdding(true)} sx={{ fontWeight: 800 }}>
            + Add a space it serves
          </Button>
        )}
      </Stack>

      {!links.length && !adding && (
        <Typography sx={{ fontSize: 12.5, color: palette.textFaint }}>
          Nothing recorded. For plant, say what it supplies — the theatres an air handler feeds,
          the rooms a panel powers — so its criticality and the impact of a shutdown are right.
        </Typography>
      )}

      <Stack spacing={0.75}>
        {links.map((l) => (
          <Stack key={l.id} direction="row" alignItems="center" spacing={1}
                 sx={{ px: 1.25, py: 0.9, borderRadius: '12px', border: `1px solid ${palette.borderSoft}` }}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography noWrap sx={{ fontSize: 13, fontWeight: 800, color: palette.ink }}>
                {l.name ? `${l.code} · ${l.name}` : l.code}
                <Box component="span" sx={{ ml: 1, fontSize: 10.5, color: palette.textFaint, fontWeight: 800,
                                             textTransform: 'uppercase' }}>
                  {TYPE_LABEL[l.location_type] ?? l.location_type}
                </Box>
              </Typography>
              <Typography sx={{ fontSize: 12, color: palette.textMuted }}>
                {serviceLabel(l.service_type)}
              </Typography>
            </Box>
            {l.criticality && l.criticality !== 'standard' && (
              <Chip size="small" label={humanise(l.criticality)}
                    sx={{ height: 19, fontSize: 10, fontWeight: 800 }} />
            )}
            {canEdit && (
              <Tooltip title="Remove">
                <IconButton size="small" onClick={() => remove.mutate(l.id)} disabled={remove.isPending}>
                  <DeleteOutlineIcon sx={{ fontSize: 18, color: palette.textFaint }} />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        ))}
      </Stack>

      {adding && (
        <Box sx={{ mt: 1, display: 'grid', gap: 1.25, alignItems: 'start',
                   gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr auto' } }}>
          <PlacePicker facilityId={asset.facility_id} value={space} onChange={(id) => setSpace(id)}
                       label="Space it serves" helperText=" " />
          <TextField select size="small" label="Supplies" value={serviceType}
                     onChange={(e) => setServiceType(e.target.value)}>
            {serviceTypes.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
          </TextField>
          <Stack direction="row" spacing={0.5}>
            <Button variant="contained" size="small" disabled={!space || !serviceType || add.isPending}
                    onClick={() => add.mutate()} sx={{ fontWeight: 900, borderRadius: '10px', mt: 0.25 }}>
              Add
            </Button>
            <Button size="small" onClick={() => setAdding(false)} sx={{ color: palette.textMuted, mt: 0.25 }}>
              Cancel
            </Button>
          </Stack>
        </Box>
      )}
    </Box>
  )
}
