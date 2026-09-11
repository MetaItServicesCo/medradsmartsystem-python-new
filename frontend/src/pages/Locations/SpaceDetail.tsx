/**
 * The facts about a space, showing only the ones that apply to it, and letting
 * you change them.
 *
 * The panel this replaces printed the same eight database columns whatever you
 * had selected, so a building showed Space Use, Area, Ceiling and Electrical
 * Branch as four dashes — fields a building does not have. It also had no way
 * to edit anything: the backend has accepted a full update since the register
 * was built, and no form ever called it. The only button was Deactivate.
 *
 * Each field now says what it is for rather than what the column is called.
 * "Volume" means nothing on its own; "used to check air changes per hour"
 * explains why anybody would fill it in.
 */
import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Box, Button, Divider, MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material'
import { toast } from 'react-toastify'
import { updateLocation } from '@/api/locations'
import { palette } from '@/theme/palette'

const humanise = (v?: string | null) =>
  (v || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

/** Which fields make sense for which kind of space. */
const ROOMLIKE = new Set(['room', 'bed', 'mech_room', 'plenum'])
const CONTAINER = new Set(['building', 'floor', 'wing'])

export default function SpaceDetail({ detail, meta, canEdit, onDeactivate }: {
  detail: any
  meta: any
  canEdit: boolean
  onDeactivate: () => void
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)

  const isRoom = ROOMLIKE.has(detail.location_type)
  const isContainer = CONTAINER.has(detail.location_type)

  const [form, setForm] = useState({
    code: detail.code ?? '',
    name: detail.name ?? '',
    description: detail.description ?? '',
    space_use: detail.space_use ?? '',
    criticality: detail.criticality ?? '',
    electrical_branch: detail.electrical_branch ?? '',
    area_sqft: detail.area_sqft ?? '',
    ceiling_height_ft: detail.ceiling_height_ft ?? '',
    external_ref: detail.external_ref ?? '',
  })

  useEffect(() => {
    setForm({
      code: detail.code ?? '',
      name: detail.name ?? '',
      description: detail.description ?? '',
      space_use: detail.space_use ?? '',
      criticality: detail.criticality ?? '',
      electrical_branch: detail.electrical_branch ?? '',
      area_sqft: detail.area_sqft ?? '',
      ceiling_height_ft: detail.ceiling_height_ft ?? '',
      external_ref: detail.external_ref ?? '',
    })
    setEditing(false)
  }, [detail.id])

  const save = useMutation({
    mutationFn: () => updateLocation(detail.id, {
      code: form.code,
      name: form.name || null,
      description: form.description || null,
      space_use: isRoom ? (form.space_use || null) : null,
      criticality: form.criticality || null,
      electrical_branch: isRoom ? (form.electrical_branch || null) : null,
      area_sqft: form.area_sqft === '' ? null : Number(form.area_sqft),
      ceiling_height_ft: form.ceiling_height_ft === '' ? null : Number(form.ceiling_height_ft),
      external_ref: form.external_ref || null,
    } as any),
    onSuccess: () => {
      toast.success('Saved')
      queryClient.invalidateQueries({ queryKey: ['location', detail.id] })
      queryClient.invalidateQueries({ queryKey: ['location-tree'] })
      setEditing(false)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Could not save'),
  })

  // Volume is derived from area and ceiling height rather than entered, so it
  // is shown but never editable — and it exists because an ASHRAE 170 air
  // change check needs it, which is worth saying out loud.
  const facts = [
    isRoom && {
      label: 'What it is used for',
      value: humanise(detail.space_use) || 'Not set',
      hint: 'The clinical use. Drives the air, pressure and power rules that apply.',
    },
    {
      label: 'How critical',
      value: humanise(detail.criticality) || 'Not set',
      hint: 'How fast a fault in here has to be answered.',
    },
    isContainer && {
      label: 'Directly inside',
      value: String(detail.child_count),
      hint: 'Spaces one level down — the floors in a building, the rooms on a floor.',
    },
    {
      label: 'Everything beneath',
      value: String(detail.descendant_count),
      hint: 'Every space below this one, at any depth.',
    },
    (isRoom || detail.bed_count > 0) && {
      label: 'Beds',
      value: String(detail.bed_count),
      hint: 'Counted from the bed records inside it, not typed in.',
    },
    {
      label: 'Floor area',
      value: detail.area_sqft ? `${Number(detail.area_sqft).toLocaleString()} sq ft` : 'Not set',
      hint: 'Used for air change and coverage calculations.',
    },
    isRoom && {
      label: 'Ceiling height',
      value: detail.ceiling_height_ft ? `${detail.ceiling_height_ft} ft` : 'Not set',
      hint: 'With floor area, gives the volume an air change check needs.',
    },
    isRoom && {
      label: 'Volume',
      value: detail.volume_cuft ? `${Number(detail.volume_cuft).toLocaleString()} cu ft` : 'Not set',
      hint: 'Area times ceiling height. ASHRAE 170 air changes per hour are computed from it.',
    },
    isRoom && {
      label: 'Power branch',
      value: humanise(detail.electrical_branch) || 'Not set',
      hint: 'Which NFPA 99 branch feeds it — that is what stays live on the generator.',
    },
  ].filter(Boolean) as Array<{ label: string; value: string; hint: string }>

  if (editing) {
    return (
      <Box sx={{ p: 2.25 }}>
        <Box sx={{ display: 'grid', gap: 1.75,
                   gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
          <TextField size="small" label="Code" value={form.code} required
                     onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <TextField size="small" label="Name" value={form.name}
                     onChange={(e) => setForm({ ...form, name: e.target.value })} />

          {isRoom && (
            <TextField select size="small" label="What it is used for" value={form.space_use}
                       onChange={(e) => setForm({ ...form, space_use: e.target.value })}>
              <MenuItem value="">Not set</MenuItem>
              {(meta?.space_uses ?? []).map((u: any) => (
                <MenuItem key={u.value ?? u} value={u.value ?? u}>
                  {u.label ?? humanise(u)}
                </MenuItem>
              ))}
            </TextField>
          )}

          <TextField select size="small" label="How critical" value={form.criticality}
                     onChange={(e) => setForm({ ...form, criticality: e.target.value })}>
            <MenuItem value="">Not set</MenuItem>
            {(meta?.criticalities ?? ['critical', 'high', 'standard', 'low']).map((c: any) => (
              <MenuItem key={c.value ?? c} value={c.value ?? c}>
                {c.label ?? humanise(c)}
              </MenuItem>
            ))}
          </TextField>

          {isRoom && (
            <TextField select size="small" label="Power branch" value={form.electrical_branch}
                       onChange={(e) => setForm({ ...form, electrical_branch: e.target.value })}>
              <MenuItem value="">Not set</MenuItem>
              {(meta?.electrical_branches ?? ['normal', 'critical', 'life_safety', 'equipment'])
                .map((b: any) => (
                  <MenuItem key={b.value ?? b} value={b.value ?? b}>
                    {b.label ?? humanise(b)}
                  </MenuItem>
                ))}
            </TextField>
          )}

          <TextField
            size="small" type="number" label="Floor area (sq ft)" value={form.area_sqft}
            onChange={(e) => setForm({ ...form, area_sqft: e.target.value })}
          />
          {isRoom && (
            <TextField
              size="small" type="number" label="Ceiling height (ft)"
              value={form.ceiling_height_ft}
              onChange={(e) => setForm({ ...form, ceiling_height_ft: e.target.value })}
              helperText="Volume is recalculated from this"
            />
          )}

          <TextField size="small" label="Reference in another system" value={form.external_ref}
                     onChange={(e) => setForm({ ...form, external_ref: e.target.value })} />
        </Box>

        <TextField
          sx={{ mt: 1.75 }} fullWidth size="small" multiline minRows={2}
          label="Description" value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />

        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Button
            variant="contained" size="small" disabled={!form.code || save.isPending}
            onClick={() => save.mutate()}
            sx={{ fontWeight: 900, borderRadius: '10px', bgcolor: palette.brand,
                  '&:hover': { bgcolor: palette.brandDeep } }}
          >
            {save.isPending ? 'Saving…' : 'Save changes'}
          </Button>
          <Button size="small" onClick={() => setEditing(false)}
                  sx={{ fontWeight: 800, color: palette.textMuted }}>
            Cancel
          </Button>
        </Stack>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 2.25 }}>
      <Box sx={{ display: 'grid', gap: 1.5, mb: 2,
                 gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
        {facts.map((fact) => (
          <Tooltip key={fact.label} title={fact.hint} placement="top" arrow>
            <Box sx={{ p: 1.4, borderRadius: '14px', backgroundColor: palette.surfaceFaint,
                       border: `1px solid ${palette.surfaceMuted}` }}>
              <Typography sx={{ fontSize: 11, fontWeight: 800, color: palette.textFaint,
                                textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {fact.label}
              </Typography>
              <Typography sx={{ fontWeight: 900, color: palette.ink, fontSize: 15 }}>
                {fact.value}
              </Typography>
            </Box>
          </Tooltip>
        ))}
      </Box>

      {detail.description && (
        <Typography sx={{ mb: 2, fontSize: 13.5, color: palette.textStrong }}>
          {detail.description}
        </Typography>
      )}

      <Divider sx={{ my: 2 }} />
      <Stack direction="row" spacing={1}>
        {canEdit && (
          <Button
            variant="contained" size="small" onClick={() => setEditing(true)}
            sx={{ fontWeight: 900, borderRadius: '10px', bgcolor: palette.brand,
                  '&:hover': { bgcolor: palette.brandDeep } }}
          >
            Edit
          </Button>
        )}
        {canEdit && (
          <Button variant="outlined" color="error" size="small" onClick={onDeactivate}
                  sx={{ fontWeight: 800, borderRadius: '10px' }}>
            Deactivate
          </Button>
        )}
      </Stack>
      <Typography sx={{ mt: 1.25, fontSize: 12, color: palette.textFaint }}>
        Deactivating takes this space and everything beneath it out of every picker
        and leaves its work-order history readable.
      </Typography>
    </Box>
  )
}
