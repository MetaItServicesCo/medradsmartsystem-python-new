/**
 * The assets in a space: its chairs, tables, screens and any machinery
 * registered here, each a link to the asset itself.
 *
 * These live in the asset register, not in the room. The room is where each
 * one currently is, so this is a view of the register filtered to this space,
 * and "Add assets" opens the same registration form as the Assets page, with
 * this room already chosen — so a chair added here is the same record the
 * register lists, services and depreciates.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Box, Button, Chip, CircularProgress, Stack, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import { fetchAssetRegister, type EquipmentItem } from '@/api/equipment'
import { useActiveFacility } from '@/hooks/useActiveFacility'
import { palette } from '@/theme/palette'
import AddAssetDialog from '../Assets/AddAssetDialog'
import { assetTitle } from '../Assets/assetTitle'

const TAGS_SHOWN = 24

export default function RoomAssets({ locationId, locationName, canEdit, onContainer }: {
  locationId: number
  locationName: string
  canEdit: boolean
  /** A floor or building: list what is anywhere inside it, grouped, without every tag. */
  onContainer: boolean
}) {
  const navigate = useNavigate()
  const { facilityId } = useActiveFacility()
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

      {addOpen && facilityId && (
        <AddAssetDialog
          open onClose={() => setAddOpen(false)} facilityId={facilityId}
          initialKind="room_item" initialLocationId={locationId}
          onCreated={() => setAddOpen(false)}
        />
      )}
    </Box>
  )
}
