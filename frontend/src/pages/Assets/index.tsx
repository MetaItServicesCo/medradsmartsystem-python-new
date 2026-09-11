/**
 * Every machine in the hospital, and everything you do to one.
 *
 * This did not exist. `pages/Equipment/index.tsx` was a twelve-line
 * placeholder with no route, and the only way to reach a machine was a modal
 * buried inside Sites — so the obvious question, "add the lift serving the
 * theatres and track its maintenance", had no answer anywhere in the product.
 *
 * The shape follows what somebody actually does: find the machine, then act on
 * it. Registering it, scheduling its maintenance, raising a job against it and
 * seeing what it cost are all things you do *to an asset*, so they are tabs on
 * the asset rather than four separate destinations that each ask you to find
 * it again.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Box, Chip, CircularProgress, InputAdornment, MenuItem, Stack, TextField,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import Button from '@mui/material/Button'
import SearchIcon from '@mui/icons-material/Search'
import { fetchEquipment } from '@/api/equipment'
import { fetchDisciplines } from '@/api/disciplines'
import { fetchLocationTree } from '@/api/locations'
import { hasPermission } from '@/config/permissions'
import { useActiveFacility } from '@/hooks/useActiveFacility'
import { useAuthStore } from '@/stores/authStore'
import { palette } from '@/theme/palette'
import AssetDetail from './AssetDetail'
import AddAssetDialog from './AddAssetDialog'

const CRITICALITY_STYLE: Record<string, { bg: string; color: string }> = {
  critical: { bg: palette.dangerTint, color: palette.danger },
  high: { bg: palette.warningTint, color: palette.warningDeep },
  standard: { bg: palette.surfaceMuted, color: palette.textSubtle },
  low: { bg: palette.surfaceMuted, color: palette.textFaint },
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  active: { bg: palette.brandTint, color: palette.brandDeep },
  in_maintenance: { bg: palette.warningTint, color: palette.warningDeep },
  inactive: { bg: palette.surfaceMuted, color: palette.textMuted },
  retired: { bg: palette.surfaceMuted, color: palette.textFaint },
  rented: { bg: palette.infoTint, color: palette.info },
}

const humanise = (v?: string | null) =>
  (v || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export default function AssetsPage() {
  const user = useAuthStore((s) => s.user)
  const { facilityId } = useActiveFacility()
  const canEdit = hasPermission(user, 'facility-inventory', 'edit')

  const [search, setSearch] = useState('')
  const [trade, setTrade] = useState<number | ''>('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const { data: disciplines } = useQuery({
    queryKey: ['disciplines'],
    queryFn: fetchDisciplines,
    staleTime: 30 * 60_000,
  })

  const { data: tree } = useQuery({
    queryKey: ['location-tree', facilityId],
    queryFn: () => fetchLocationTree(facilityId as number),
    enabled: !!facilityId,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['equipment', 'register', facilityId],
    queryFn: () => fetchEquipment({ facility_id: facilityId, limit: 1000 } as any),
    enabled: !!facilityId,
  })

  const assets = ((data as any)?.items ?? []) as any[]

  const tradeName = useMemo(() => {
    const out: Record<number, string> = {}
    for (const d of disciplines?.items ?? []) out[d.id] = d.name
    return out
  }, [disciplines])

  const placeName = useMemo(() => {
    const out: Record<number, string> = {}
    const walk = (nodes: any[]) => {
      for (const n of nodes) {
        out[n.id] = n.name ? `${n.code} · ${n.name}` : n.code
        walk(n.children ?? [])
      }
    }
    walk((tree as any)?.items ?? [])
    return out
  }, [tree])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return assets.filter((a) => {
      if (trade !== '' && a.discipline_id !== trade) return false
      if (!needle) return true
      return [a.asset_tag, a.make, a.model, a.serial_number, a.description]
        .some((v) => String(v ?? '').toLowerCase().includes(needle))
    })
  }, [assets, search, trade])

  const selected = assets.find((a) => a.id === selectedId)

  return (
    <Box className="page-enter" sx={{ width: '100%', minWidth: 0 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, gap: 1.5, mb: 2.5 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" sx={{ fontWeight: 900, color: palette.ink }}>Assets</Typography>
          <Typography sx={{ color: palette.textMuted, fontWeight: 700 }}>
            Plant and clinical equipment — everything with a maintenance history
          </Typography>
        </Box>
        {canEdit && (
          <Button
            variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}
            sx={{ fontWeight: 900, borderRadius: '12px', px: 2.5,
                  bgcolor: palette.brand, '&:hover': { bgcolor: palette.brandDeep } }}
          >
            Add asset
          </Button>
        )}
      </Stack>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '380px 1fr' } }}>
        <Box sx={{ border: `1px solid ${palette.borderSoft}`, borderRadius: '18px',
                   bgcolor: palette.white, overflow: 'hidden', alignSelf: 'start' }}>
          <Box sx={{ p: 1.5, display: 'grid', gap: 1.25 }}>
            <TextField
              size="small" placeholder="Find an asset…" value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 18, color: palette.textFaint }} />
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              select size="small" label="Trade" value={trade}
              onChange={(e) => setTrade(e.target.value === '' ? '' : Number(e.target.value))}
            >
              <MenuItem value="">All trades</MenuItem>
              {(disciplines?.items ?? []).map((d) => (
                <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
              ))}
            </TextField>
          </Box>

          <Box sx={{ maxHeight: 620, overflowY: 'auto', borderTop: `1px solid ${palette.borderSoft}` }}>
            {isLoading && (
              <Box sx={{ p: 5, textAlign: 'center' }}><CircularProgress size={24} /></Box>
            )}
            {!isLoading && !filtered.length && (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography sx={{ fontWeight: 800, color: palette.textMuted }}>
                  {assets.length ? 'Nothing matches' : 'No assets registered yet'}
                </Typography>
                {!assets.length && (
                  <Typography sx={{ mt: 0.5, fontSize: 13, color: palette.textFaint }}>
                    Add the chillers, air handlers, lifts, generators and clinical
                    equipment you maintain. Each one gets its own maintenance plan,
                    service history and book value.
                  </Typography>
                )}
              </Box>
            )}
            {filtered.map((a) => {
              const crit = CRITICALITY_STYLE[a.criticality] || CRITICALITY_STYLE.standard
              const active = a.id === selectedId
              return (
                <Box
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  sx={{
                    px: 1.75, py: 1.25, cursor: 'pointer', display: 'flex',
                    alignItems: 'center', gap: 1,
                    borderLeft: `3px solid ${active ? palette.brand : 'transparent'}`,
                    bgcolor: active ? palette.brandTint : 'transparent',
                    '&:hover': { bgcolor: active ? palette.brandTint : palette.surfaceFaint },
                  }}
                >
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Stack direction="row" alignItems="center" spacing={0.75}>
                      <Typography noWrap sx={{ fontWeight: 900, color: palette.ink, fontSize: 13.5 }}>
                        {a.asset_tag}
                      </Typography>
                      {a.criticality && (
                        <Chip size="small" label={humanise(a.criticality)}
                              sx={{ height: 17, fontSize: 9.5, fontWeight: 800,
                                    bgcolor: crit.bg, color: crit.color }} />
                      )}
                    </Stack>
                    <Typography noWrap sx={{ fontSize: 12, color: palette.textMuted, fontWeight: 600 }}>
                      {[a.make, a.model].filter(Boolean).join(' ') || '—'}
                    </Typography>
                    <Typography noWrap sx={{ fontSize: 11, color: palette.textFaint }}>
                      {tradeName[a.discipline_id] || 'Clinical'}
                      {a.location_id && placeName[a.location_id] ? ` · ${placeName[a.location_id]}` : ''}
                    </Typography>
                  </Box>
                </Box>
              )
            })}
          </Box>

          <Box sx={{ px: 1.75, py: 1.25, borderTop: `1px solid ${palette.borderSoft}` }}>
            <Typography sx={{ fontSize: 12, fontWeight: 800, color: palette.textFaint }}>
              {filtered.length} of {assets.length}
            </Typography>
          </Box>
        </Box>

        {selected ? (
          <AssetDetail
            asset={selected}
            tradeName={tradeName}
            placeName={placeName}
            canEdit={canEdit}
          />
        ) : (
          <Box sx={{ border: `1px solid ${palette.borderSoft}`, borderRadius: '18px',
                     bgcolor: palette.white, p: 6, textAlign: 'center' }}>
            <Typography sx={{ fontWeight: 800, color: palette.textMuted }}>
              Pick an asset
            </Typography>
            <Typography sx={{ mt: 0.5, fontSize: 13, color: palette.textFaint, maxWidth: 420, mx: 'auto' }}>
              Its maintenance plans, service history, book value and the jobs
              raised against it all live on the asset itself.
            </Typography>
          </Box>
        )}
      </Box>

      {addOpen && facilityId && (
        <AddAssetDialog
          open={addOpen}
          onClose={() => setAddOpen(false)}
          facilityId={facilityId}
          tree={(tree as any)?.items ?? []}
          disciplines={disciplines?.items ?? []}
          onCreated={(id) => { setSelectedId(id); setAddOpen(false) }}
        />
      )}
    </Box>
  )
}

export { CRITICALITY_STYLE, STATUS_STYLE, humanise }
