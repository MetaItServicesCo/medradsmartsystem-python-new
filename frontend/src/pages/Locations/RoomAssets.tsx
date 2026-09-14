/**
 * The assets in a space: its chairs, tables, screens and any machinery
 * registered here, each a link to the asset itself.
 *
 * These live in the asset register, not in the room. The room is where each
 * one currently is, so this is a view of the register filtered to this space,
 * and "Add assets" creates real assets with their own tags — the same records
 * the Assets page lists, services and depreciates.
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Autocomplete, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, MenuItem, Stack, TextField, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import { toast } from 'react-toastify'
import { fetchDisciplines } from '@/api/disciplines'
import {
  addRoomItems, fetchAssetRegister, fetchRoomItemTypes, type EquipmentItem, type RoomItemType,
} from '@/api/equipment'
import { palette } from '@/theme/palette'
import { assetTitle } from '../Assets/assetTitle'
import { sameItemName } from './wizardModel'

const TAGS_SHOWN = 24

export default function RoomAssets({ locationId, locationName, canEdit, onContainer }: {
  locationId: number
  locationName: string
  canEdit: boolean
  /** A floor or building: list what is anywhere inside it, grouped, without every tag. */
  onContainer: boolean
}) {
  const navigate = useNavigate()
  const [addOpen, setAddOpen] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['equipment', 'room', locationId],
    queryFn: () => fetchAssetRegister({ location_id: locationId, limit: 500 }),
    enabled: !!locationId,
  })
  const assets = data?.items ?? []
  const total = data?.total ?? 0

  const groups = useMemo(() => {
    const out = new Map<string, EquipmentItem[]>()
    for (const a of assets) {
      const key = assetTitle(a)
      out.set(key, [...(out.get(key) ?? []), a])
    }
    return [...out.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [assets])

  return (
    <Box sx={{ p: 2.25 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
        <Typography sx={{ fontWeight: 900, color: palette.ink, fontSize: 15 }}>
          {onContainer ? 'Assets anywhere inside' : `Assets in ${locationName}`} · {total}
        </Typography>
        <Box sx={{ flex: 1 }} />
        {total > 0 && (
          <Button size="small" endIcon={<OpenInNewIcon sx={{ fontSize: 15 }} />}
                  onClick={() => navigate(`/assets?room=${locationId}`)}
                  sx={{ fontWeight: 800, color: palette.brand }}>
            Open in Assets
          </Button>
        )}
        {canEdit && (
          <Button
            size="small" startIcon={<AddIcon />} variant="contained" onClick={() => setAddOpen(true)}
            sx={{ fontWeight: 900, borderRadius: '10px', bgcolor: palette.brand,
                  '&:hover': { bgcolor: palette.brandDeep } }}
          >
            Add assets
          </Button>
        )}
      </Stack>

      {isLoading && <Box sx={{ py: 3, textAlign: 'center' }}><CircularProgress size={22} /></Box>}
      {isError && (
        <Typography sx={{ fontSize: 13, color: palette.danger, fontWeight: 700 }}>
          Could not load the assets here.
        </Typography>
      )}

      {!isLoading && !isError && total === 0 && (
        <Typography sx={{ fontSize: 13, color: palette.textFaint }}>
          No assets here yet. Chairs, tables, screens and computers each become an asset with
          its own tag, labelled with this {onContainer ? 'space' : 'room'} in the asset register.
        </Typography>
      )}

      <Stack spacing={1.25}>
        {groups.map(([title, items]) => (
          <Box key={title}>
            <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: palette.textStrong, mb: 0.5 }}>
              {title} · {items.length}
            </Typography>
            {!onContainer && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {items.slice(0, TAGS_SHOWN).map((a) => {
                  const out = ['inactive', 'retired'].includes(String(a.status))
                  return (
                    <Chip
                      key={a.id} size="small" label={a.asset_tag}
                      title={out ? `${a.asset_tag} · ${a.status}` : `Open ${a.asset_tag}`}
                      onClick={() => navigate(`/assets?asset=${a.id}`)}
                      sx={{ height: 22, fontSize: 11, fontWeight: 700,
                            opacity: out ? 0.5 : 1,
                            bgcolor: palette.surfaceMuted, color: palette.textSubtle }}
                    />
                  )
                })}
                {items.length > TAGS_SHOWN && (
                  <Chip size="small" label={`+${items.length - TAGS_SHOWN} more`}
                        onClick={() => navigate(`/assets?room=${locationId}`)}
                        sx={{ height: 22, fontSize: 11, fontWeight: 800 }} />
                )}
              </Box>
            )}
          </Box>
        ))}
      </Stack>

      {addOpen && (
        <AddRoomAssetsDialog
          locationId={locationId} locationName={locationName}
          onClose={() => setAddOpen(false)}
        />
      )}
    </Box>
  )
}

function AddRoomAssetsDialog({ locationId, locationName, onClose }: {
  locationId: number
  locationName: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [item, setItem] = useState<RoomItemType | string | null>(null)
  const [count, setCount] = useState('1')
  const [trade, setTrade] = useState('')

  const { data: types } = useQuery({
    queryKey: ['room-item-types'], queryFn: fetchRoomItemTypes, staleTime: 30 * 60_000,
  })
  const { data: disciplines } = useQuery({
    queryKey: ['disciplines'], queryFn: fetchDisciplines, staleTime: 30 * 60_000,
  })

  const options = types?.types ?? []
  // "Chairs" is the catalogued Chair, not a new kind of thing.
  const known = typeof item === 'string'
    ? options.find((o) => sameItemName(item, o.label, o.key)) ?? null
    : item
  const typed = typeof item === 'string' ? item.trim() : ''
  const custom = !known && typed.length > 0
  const quantity = Math.max(0, Math.floor(Number(count)) || 0)

  const add = useMutation({
    mutationFn: () => addRoomItems({
      location_id: locationId,
      asset_type: known ? known.key : typed,
      count: quantity,
      discipline_code: custom ? trade : null,
    }),
    onSuccess: (res) => {
      const tags = res.items.map((a) => a.asset_tag)
      toast.success(tags.length === 1
        ? `${tags[0]} added to ${locationName}`
        : `${tags.length} assets added: ${tags[0]} – ${tags[tags.length - 1]}`)
      queryClient.invalidateQueries({ queryKey: ['equipment'] })
      onClose()
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Could not add the assets'),
  })

  const ready = quantity > 0 && (known || (custom && trade)) && !add.isPending

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
      <DialogTitle sx={{ fontWeight: 900, color: palette.ink, pb: 0.5 }}>
        Add assets to {locationName}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.75 }}>
          <Autocomplete
            freeSolo size="small" options={options} value={item}
            getOptionLabel={(o) => (typeof o === 'string' ? o : o.label)}
            isOptionEqualToValue={(o, v) => typeof v !== 'string' && o.key === v.key}
            onChange={(_, v) => setItem(v)}
            onInputChange={(_, v, reason) => { if (reason === 'input') setItem(v) }}
            renderInput={(params) => (
              <TextField {...params} autoFocus label="What is it" placeholder="Chairs, a display, a podium…" />
            )}
          />
          <TextField
            size="small" type="number" label="How many" value={count}
            onChange={(e) => setCount(e.target.value)} onFocus={(e) => e.target.select()}
            inputProps={{ min: 1, max: 200 }}
            helperText={quantity > 1 ? `${quantity} separate assets, each with its own tag` : 'One asset, with its own tag'}
          />
          {custom && (
            <TextField
              select size="small" label="Which trade maintains it" required
              value={trade} onChange={(e) => setTrade(e.target.value)}
              helperText="Not in the list, so say who gets sent when it breaks"
            >
              {(disciplines?.items ?? []).map((d) => (
                <MenuItem key={d.code} value={d.code}>{d.name}</MenuItem>
              ))}
            </TextField>
          )}
          <Typography sx={{ fontSize: 12, color: palette.textFaint }}>
            Make, model, serial number and cost can be recorded on each asset afterwards.
            Sockets, lights and outlets are fixtures — add those under the room's fixtures.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} sx={{ fontWeight: 800, color: palette.textMuted }}>Cancel</Button>
        <Button variant="contained" disabled={!ready} onClick={() => add.mutate()}
                sx={{ fontWeight: 900, borderRadius: '10px' }}>
          {add.isPending ? 'Adding…' : quantity > 1 ? `Add ${quantity}` : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
