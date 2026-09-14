/**
 * Every asset at this site — machinery, clinical equipment, and the things in
 * each room — and everything you do to one.
 *
 * This did not exist. `pages/Equipment/index.tsx` was a twelve-line
 * placeholder with no route, and the only way to reach a machine was a modal
 * buried inside Sites — so the obvious question, "add the lift serving the
 * theatres and track its maintenance", had no answer anywhere in the product.
 *
 * The shape follows what somebody actually does: find the asset, then act on
 * it. Registering it, scheduling its maintenance, raising a job against it and
 * seeing what it cost are all things you do *to an asset*, so they are tabs on
 * the asset rather than four separate destinations that each ask you to find
 * it again.
 *
 * Filtering happens on the server. Once every chair is an asset a site has
 * thousands, and the first version of this page — which loaded the register
 * into the browser and filtered it there — also never sent the site at all,
 * so each hospital's register listed every hospital's assets.
 */
import { useEffect, useMemo, useState } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  Box, Checkbox, Chip, CircularProgress, InputAdornment, MenuItem, Stack, TextField,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import Button from '@mui/material/Button'
import SearchIcon from '@mui/icons-material/Search'
import MeetingRoomOutlinedIcon from '@mui/icons-material/MeetingRoomOutlined'
import { fetchAssetRegister, fetchEquipmentById } from '@/api/equipment'
import { fetchDisciplines } from '@/api/disciplines'
import { fetchLocationTree } from '@/api/locations'
import { hasPermission } from '@/config/permissions'
import { useActiveFacility } from '@/hooks/useActiveFacility'
import { useAuthStore } from '@/stores/authStore'
import { palette } from '@/theme/palette'
import AssetDetail from './AssetDetail'
import AddAssetDialog from './AddAssetDialog'
import BulkEditDialog from './BulkEditDialog'
import { assetTitle } from './assetTitle'
import { PlacePicker } from './PlacePicker'

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

const PAGE_SIZE = 100

type Kind = '' | 'room_items' | 'equipment'

interface Place { id: number; label: string; depth: number; type: string }

export default function AssetsPage() {
  const user = useAuthStore((s) => s.user)
  const { facilityId } = useActiveFacility()
  const canEdit = hasPermission(user, 'facility-inventory', 'edit')
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [trade, setTrade] = useState<number | ''>('')
  const [kind, setKind] = useState<Kind>('')
  // Arriving from a room ("open in Assets") filters to that room; arriving
  // from a tag opens that asset.
  const [roomId, setRoomId] = useState<number | null>(Number(searchParams.get('room')) || null)
  const [selectedId, setSelectedId] = useState<number | null>(Number(searchParams.get('asset')) || null)
  const [addOpen, setAddOpen] = useState(false)
  // Several assets at once: ticked ones, or everything the filters match —
  // including the pages not loaded yet.
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [allMatching, setAllMatching] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  // Keep the address in step, so a filtered register or an open asset can be
  // linked to and survives a refresh.
  useEffect(() => {
    const next = new URLSearchParams()
    if (roomId) next.set('room', String(roomId))
    if (selectedId) next.set('asset', String(selectedId))
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true })
  }, [roomId, selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const register = useInfiniteQuery({
    queryKey: ['equipment', 'register', facilityId, debounced, trade, kind, roomId],
    queryFn: ({ pageParam }) => fetchAssetRegister({
      facility_id: facilityId as number,
      search: debounced,
      discipline_id: trade === '' ? null : trade,
      kind: kind || null,
      location_id: roomId,
      skip: pageParam,
      limit: PAGE_SIZE,
    }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0)
      return loaded < last.total ? loaded : undefined
    },
    enabled: !!facilityId,
  })

  const assets = useMemo(() => register.data?.pages.flatMap((p) => p.items) ?? [], [register.data])
  const total = register.data?.pages[0]?.total ?? 0

  const tradeName = useMemo(() => {
    const out: Record<number, string> = {}
    for (const d of disciplines?.items ?? []) out[d.id] = d.name
    return out
  }, [disciplines])

  const { placeName, places } = useMemo(() => {
    const names: Record<number, string> = {}
    const list: Place[] = []
    const walk = (nodes: any[], depth: number) => {
      for (const n of nodes) {
        const label = n.name ? `${n.code} · ${n.name}` : n.code
        names[n.id] = label
        if (n.location_type !== 'bed') list.push({ id: n.id, label, depth, type: n.location_type })
        walk(n.children ?? [], depth + 1)
      }
    }
    walk((tree as any)?.items ?? [], 0)
    return { placeName: names, places: list }
  }, [tree])

  // An asset opened by link may not be on the first page of the list.
  const listed = assets.find((a) => a.id === selectedId)
  const { data: fetched } = useQuery({
    queryKey: ['equipment', 'one', selectedId],
    queryFn: () => fetchEquipmentById(selectedId as number),
    enabled: !!selectedId && !listed,
  })
  const selected = listed
    ?? (fetched && fetched.id === selectedId && fetched.facility_id === facilityId ? fetched : undefined)

  const room = places.find((p) => p.id === roomId) ?? null
  const filtering = Boolean(debounced || trade !== '' || kind || roomId)

  // A selection belongs to the filter it was made under; change the filter and
  // "all matching" would silently mean something else.
  useEffect(() => {
    setPicked(new Set())
    setAllMatching(false)
  }, [facilityId, debounced, trade, kind, roomId])

  const selectedCount = allMatching ? total : picked.size
  const allShownPicked = assets.length > 0 && assets.every((a) => picked.has(a.id))
  const toggle = (id: number) => {
    setAllMatching(false)
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleShown = () => {
    setAllMatching(false)
    setPicked(allShownPicked ? new Set() : new Set(assets.map((a) => a.id)))
  }
  const clearSelection = () => { setPicked(new Set()); setAllMatching(false) }
  const selection = allMatching
    ? { facility_id: facilityId as number, search: debounced, location_id: roomId,
        kind: kind || null, discipline_id: trade === '' ? null : trade }
    : { ids: [...picked] }

  return (
    <Box className="page-enter" sx={{ width: '100%', minWidth: 0 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, gap: 1.5, mb: 2.5 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" sx={{ fontWeight: 900, color: palette.ink }}>Assets</Typography>
          <Typography sx={{ color: palette.textMuted, fontWeight: 700 }}>
            Machinery, clinical equipment and the things in each room — each with its own tag
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
                   bgcolor: palette.white, overflow: 'hidden', alignSelf: 'start', minWidth: 0 }}>
          <Box sx={{ p: 1.5, display: 'grid', gap: 1.25 }}>
            <TextField
              size="small" placeholder="Tag, type, make, serial…" value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 18, color: palette.textFaint }} />
                  </InputAdornment>
                ),
              }}
            />
            <PlacePicker
              facilityId={facilityId as number} value={roomId}
              onChange={(id) => setRoomId(id)}
              label="Room, floor or building"
              helperText={room && room.type !== 'room' ? 'Includes everything inside it' : ' '}
            />
            <Stack direction="row" spacing={1}>
              <TextField
                select size="small" label="Kind" value={kind} sx={{ flex: 1 }}
                onChange={(e) => setKind(e.target.value as Kind)}
              >
                <MenuItem value="">Everything</MenuItem>
                <MenuItem value="equipment">Machinery & equipment</MenuItem>
                <MenuItem value="room_items">Room items</MenuItem>
              </TextField>
              <TextField
                select size="small" label="Trade" value={trade} sx={{ flex: 1 }}
                onChange={(e) => setTrade(e.target.value === '' ? '' : Number(e.target.value))}
              >
                <MenuItem value="">All trades</MenuItem>
                {(disciplines?.items ?? []).map((d) => (
                  <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
                ))}
              </TextField>
            </Stack>
          </Box>

          {canEdit && assets.length > 0 && (
            <Stack
              direction="row" alignItems="center" spacing={0.5}
              sx={{ px: 0.75, py: 0.5, borderTop: `1px solid ${palette.borderSoft}`, flexWrap: 'wrap', rowGap: 0.5,
                    bgcolor: selectedCount ? palette.brandTint : 'transparent' }}
            >
              <Checkbox
                size="small" checked={allMatching || allShownPicked}
                indeterminate={!allMatching && picked.size > 0 && !allShownPicked}
                onChange={toggleShown} inputProps={{ 'aria-label': 'Select the assets shown' }}
              />
              <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: selectedCount ? palette.brandDeep : palette.textFaint }}>
                {allMatching
                  ? `All ${total} matching selected`
                  : picked.size ? `${picked.size} selected` : 'Select several to set details at once'}
              </Typography>
              {!allMatching && allShownPicked && total > assets.length && (
                <Button size="small" onClick={() => setAllMatching(true)} sx={{ fontWeight: 800, minWidth: 0 }}>
                  Select all {total}
                </Button>
              )}
              <Box sx={{ flex: 1 }} />
              {selectedCount > 0 && (
                <>
                  <Button size="small" onClick={clearSelection} sx={{ color: palette.textMuted, minWidth: 0 }}>
                    Clear
                  </Button>
                  <Button size="small" variant="contained" onClick={() => setBulkOpen(true)}
                          sx={{ fontWeight: 900, borderRadius: '9px', bgcolor: palette.brand,
                                '&:hover': { bgcolor: palette.brandDeep } }}>
                    Set details
                  </Button>
                </>
              )}
            </Stack>
          )}
          <Box sx={{ maxHeight: 620, overflowY: 'auto', borderTop: `1px solid ${palette.borderSoft}` }}>
            {register.isLoading && (
              <Box sx={{ p: 5, textAlign: 'center' }}><CircularProgress size={24} /></Box>
            )}
            {register.isError && (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography sx={{ fontWeight: 800, color: palette.danger }}>
                  Could not load the asset register
                </Typography>
              </Box>
            )}
            {!register.isLoading && !register.isError && !assets.length && (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography sx={{ fontWeight: 800, color: palette.textMuted }}>
                  {filtering ? 'Nothing matches' : 'No assets registered yet'}
                </Typography>
                {!filtering && (
                  <Typography sx={{ mt: 0.5, fontSize: 13, color: palette.textFaint }}>
                    Add the chillers, lifts, generators and clinical equipment you maintain.
                    Chairs, tables and screens arrive here when you set up a building's
                    rooms, or add them from the room itself.
                  </Typography>
                )}
              </Box>
            )}
            {assets.map((a) => {
              const crit = CRITICALITY_STYLE[a.criticality ?? ''] || CRITICALITY_STYLE.standard
              const active = a.id === selectedId
              const where = a.location_id ? placeName[a.location_id] : null
              const retired = ['inactive', 'retired'].includes(String(a.status))
              return (
                <Box
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  sx={{
                    px: 1.75, py: 1.25, cursor: 'pointer', display: 'flex',
                    alignItems: 'center', gap: 1, opacity: retired ? 0.6 : 1,
                    borderLeft: `3px solid ${active ? palette.brand : 'transparent'}`,
                    bgcolor: active ? palette.brandTint : 'transparent',
                    '&:hover': { bgcolor: active ? palette.brandTint : palette.surfaceFaint },
                  }}
                >
                  {canEdit && (
                    <Checkbox
                      size="small" sx={{ ml: -1, mr: -0.5 }}
                      checked={allMatching || picked.has(a.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => {
                        // Unticking one out of "all matching" turns it into the loaded ids minus that one.
                        if (allMatching) {
                          setAllMatching(false)
                          setPicked(new Set(assets.map((x) => x.id).filter((id) => id !== a.id)))
                        } else {
                          toggle(a.id)
                        }
                      }}
                      inputProps={{ 'aria-label': `Select ${a.asset_tag}` }}
                    />
                  )}
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Stack direction="row" alignItems="center" spacing={0.75}>
                      <Typography noWrap sx={{ fontWeight: 900, color: palette.ink, fontSize: 13.5 }}>
                        {a.asset_tag}
                      </Typography>
                      {a.criticality && a.criticality !== 'standard' && (
                        <Chip size="small" label={humanise(a.criticality)}
                              sx={{ height: 17, fontSize: 9.5, fontWeight: 800,
                                    bgcolor: crit.bg, color: crit.color }} />
                      )}
                      {retired && (
                        <Chip size="small" label={humanise(String(a.status))}
                              sx={{ height: 17, fontSize: 9.5, fontWeight: 800 }} />
                      )}
                    </Stack>
                    <Typography noWrap sx={{ fontSize: 12, color: palette.textMuted, fontWeight: 600 }}>
                      {assetTitle(a)}
                    </Typography>
                    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 0.25, minWidth: 0 }}>
                      <Typography noWrap sx={{ fontSize: 11, color: palette.textFaint, flexShrink: 0 }}>
                        {(a.discipline_id && tradeName[a.discipline_id]) || 'Clinical'}
                      </Typography>
                      {where && (
                        <Chip
                          size="small" icon={<MeetingRoomOutlinedIcon sx={{ fontSize: '13px !important' }} />}
                          label={where}
                          onClick={(e) => { e.stopPropagation(); setRoomId(a.location_id ?? null) }}
                          sx={{ height: 19, fontSize: 10.5, fontWeight: 700, maxWidth: 220,
                                bgcolor: palette.surfaceMuted, color: palette.textSubtle }}
                        />
                      )}
                    </Stack>
                  </Box>
                </Box>
              )
            })}
            {register.hasNextPage && (
              <Box sx={{ p: 1.5, textAlign: 'center' }}>
                <Button size="small" onClick={() => register.fetchNextPage()}
                        disabled={register.isFetchingNextPage} sx={{ fontWeight: 800 }}>
                  {register.isFetchingNextPage ? 'Loading…' : 'Show more'}
                </Button>
              </Box>
            )}
          </Box>

          <Box sx={{ px: 1.75, py: 1.25, borderTop: `1px solid ${palette.borderSoft}` }}>
            <Typography sx={{ fontSize: 12, fontWeight: 800, color: palette.textFaint }}>
              {assets.length} of {total}{filtering ? ' matching' : ''}
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

      {bulkOpen && selectedCount > 0 && (
        <BulkEditDialog
          selection={selection} count={selectedCount}
          onClose={() => setBulkOpen(false)}
          onDone={() => { setBulkOpen(false); clearSelection() }}
        />
      )}

      {addOpen && facilityId && (
        <AddAssetDialog
          open={addOpen}
          onClose={() => setAddOpen(false)}
          facilityId={facilityId}
          initialKind={kind === 'room_items' ? 'room_item' : 'plant'}
          initialLocationId={roomId}
          onCreated={(ids) => {
            queryClient.invalidateQueries({ queryKey: ['equipment'] })
            setSelectedId(ids[0] ?? null)
            setAddOpen(false)
          }}
        />
      )}
    </Box>
  )
}

export { CRITICALITY_STYLE, STATUS_STYLE, humanise }
