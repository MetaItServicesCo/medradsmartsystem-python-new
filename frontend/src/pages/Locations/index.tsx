/**
 * The space register — the tree, and the drawing.
 *
 * Two editors over one table. The register is for bulk work, search and the
 * spaces that are awkward to pin (risers, chases, roof areas); the plan editor
 * is for authoring from a drawing, which for a customer with no existing room
 * list is how the data arrives at all. Both write the same rows, so they
 * cannot drift.
 */
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, IconButton, InputAdornment, MenuItem,
  Stack, Tab, Tabs, TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import ApartmentIcon from '@mui/icons-material/Apartment'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import HotelIcon from '@mui/icons-material/Hotel'
import LayersIcon from '@mui/icons-material/Layers'
import MapIcon from '@mui/icons-material/Map'
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom'
import SearchIcon from '@mui/icons-material/Search'
import SettingsInputComponentIcon from '@mui/icons-material/SettingsInputComponent'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { toast } from 'react-toastify'

import {
  createLocation, deleteLocation, fetchLocation, fetchLocationMeta, fetchLocationTree,
  type LocationNode, type LocationTypeMeta,
} from '@/api/locations'
import { useActiveFacility } from '@/hooks/useActiveFacility'
import SetupBuildingWizard from './SetupBuildingWizard'
import SpaceContents from './SpaceContents'
import SpaceDetail from './SpaceDetail'
import SpaceUseField from './SpaceUseField'
import { hasPermission } from '@/config/permissions'
import { useAuthStore } from '@/stores/authStore'
import FloorPlanEditor from './FloorPlanEditor'
import { palette } from '@/theme/palette'

const BRAND = palette.brand
const INK = palette.ink

const TYPE_ICON: Record<string, JSX.Element> = {
  building: <ApartmentIcon fontSize="small" />,
  floor: <LayersIcon fontSize="small" />,
  wing: <LayersIcon fontSize="small" />,
  room: <MeetingRoomIcon fontSize="small" />,
  bed: <HotelIcon fontSize="small" />,
  mech_room: <SettingsInputComponentIcon fontSize="small" />,
  riser: <SettingsInputComponentIcon fontSize="small" />,
  shaft: <SettingsInputComponentIcon fontSize="small" />,
}

const CRITICALITY_STYLE: Record<string, { bg: string; color: string }> = {
  critical: { bg: palette.dangerTint, color: palette.danger },
  high: { bg: palette.warningPeach, color: '#C2410C' },
  standard: { bg: palette.infoTint, color: palette.info },
  low: { bg: palette.surfaceMuted, color: palette.slate600 },
}

const humanise = (value?: string | null) =>
  value ? value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : ''

interface TreeRowProps {
  node: LocationNode
  depth: number
  selectedId: number | null
  expanded: Set<number>
  filter: string
  onToggle: (id: number) => void
  onSelect: (id: number) => void
}

function TreeRow({ node, depth, selectedId, expanded, filter, onToggle, onSelect }: TreeRowProps) {
  const isOpen = expanded.has(node.id)
  const hasChildren = node.children.length > 0

  // Filtering keeps a branch whose descendant matches, so typing a room number
  // does not hide the floor it sits on.
  const matches = useMemo(() => {
    if (!filter) return true
    const needle = filter.toLowerCase()
    const hit = (n: LocationNode): boolean =>
      n.code.toLowerCase().includes(needle)
      || (n.name || '').toLowerCase().includes(needle)
      || n.children.some(hit)
    return hit(node)
  }, [filter, node])

  if (!matches) return null

  const selected = selectedId === node.id
  const criticality = CRITICALITY_STYLE[node.criticality || ''] || null

  return (
    <>
      <Box
        onClick={() => onSelect(node.id)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.75,
          pl: `${8 + depth * 18}px`, pr: 1, py: 0.7, cursor: 'pointer',
          borderRadius: '10px',
          backgroundColor: selected ? palette.brandTint : 'transparent',
          boxShadow: selected ? `inset 3px 0 0 ${BRAND}` : 'none',
          '&:hover': { backgroundColor: selected ? palette.brandTint : '#FAFAFB' },
        }}
      >
        <IconButton
          size="small"
          disabled={!hasChildren}
          onClick={(e) => { e.stopPropagation(); onToggle(node.id) }}
          sx={{ width: 22, height: 22, opacity: hasChildren ? 1 : 0.15 }}
        >
          {isOpen ? <ExpandMoreIcon sx={{ fontSize: 17 }} /> : <ChevronRightIcon sx={{ fontSize: 17 }} />}
        </IconButton>

        <Box sx={{ color: selected ? BRAND : palette.textFaint, display: 'flex' }}>
          {TYPE_ICON[node.location_type] || <MeetingRoomIcon fontSize="small" />}
        </Box>

        <Typography sx={{ fontWeight: 800, fontSize: 13, color: INK, minWidth: 0 }} noWrap>
          {node.code}
        </Typography>
        {node.name && (
          <Typography sx={{ fontSize: 12, color: palette.textFaint, minWidth: 0 }} noWrap>
            {node.name}
          </Typography>
        )}

        <Box sx={{ flex: 1 }} />

        {node.is_provisional && (
          <Tooltip title="Created from the field — needs reconciling">
            <WarningAmberIcon sx={{ fontSize: 15, color: palette.warningStrong }} />
          </Tooltip>
        )}
        {node.bed_count > 0 && (
          <Chip
            label={`${node.bed_count} bed${node.bed_count > 1 ? 's' : ''}`}
            size="small"
            sx={{ height: 19, fontSize: 10, fontWeight: 800, borderRadius: '6px', backgroundColor: palette.successTint, color: palette.success }}
          />
        )}
        {criticality && node.criticality === 'critical' && (
          <Chip
            label="Critical" size="small"
            sx={{ height: 19, fontSize: 10, fontWeight: 800, borderRadius: '6px', backgroundColor: criticality.bg, color: criticality.color }}
          />
        )}
      </Box>

      {isOpen && node.children.map((child) => (
        <TreeRow
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          expanded={expanded}
          filter={filter}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}
    </>
  )
}

export default function LocationsPage() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  const [selectedId, setSelectedId] = useState<number | null>(null)
  // The tree is already in memory; a container's contents are its children.
  const findNode = (nodes: any[], id: number): any => {
    for (const node of nodes) {
      if (node.id === id) return node
      const hit = findNode(node.children ?? [], id)
      if (hit) return hit
    }
    return null
  }
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [filter, setFilter] = useState('')
  const [tab, setTab] = useState(0)
  const [addOpen, setAddOpen] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)

  const canEdit = hasPermission(user, 'locations', 'add')

  const { data: meta } = useQuery({
    queryKey: ['location-meta'],
    queryFn: fetchLocationMeta,
    staleTime: 10 * 60 * 1000,
  })

  // The hospital is context, not a question asked on every screen.
  const { facilityId: effectiveFacilityId } = useActiveFacility()

  const { data: tree, isLoading } = useQuery({
    queryKey: ['location-tree', effectiveFacilityId],
    queryFn: () => fetchLocationTree(effectiveFacilityId as number),
    enabled: !!effectiveFacilityId,
  })

  // Opened from a link - an assistant citation, or a shared URL - with a space
  // named: select it and open every level above it so it is visible in the tree.
  const [searchParams] = useSearchParams()
  const linkedSpace = Number(searchParams.get('space')) || null
  useEffect(() => {
    if (!linkedSpace || !tree?.items?.length) return
    const trail: number[] = []
    const walk = (nodes: any[], above: number[]): boolean => {
      for (const node of nodes) {
        if (node.id === linkedSpace) { trail.push(...above); return true }
        if (walk(node.children ?? [], [...above, node.id])) return true
      }
      return false
    }
    if (!walk(tree.items, [])) return
    setSelectedId(linkedSpace)
    setExpanded((prev) => new Set([...prev, ...trail]))
  }, [linkedSpace, tree])

  const { data: detail } = useQuery({
    queryKey: ['location', selectedId],
    queryFn: () => fetchLocation(selectedId as number),
    enabled: !!selectedId,
  })

  // A building that already has floors gets the wizard in edit mode.
  const buildingHasFloors = !!detail && (findNode(tree?.items ?? [], detail.id)?.children ?? [])
    .some((c: any) => c.location_type === 'floor')

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandAll = () => {
    const ids = new Set<number>()
    const walk = (nodes: LocationNode[]) => nodes.forEach((n) => { ids.add(n.id); walk(n.children) })
    walk(tree?.items || [])
    setExpanded(ids)
  }

  const selectedTypeMeta: LocationTypeMeta | undefined = useMemo(
    () => meta?.location_types.find((t) => t.value === detail?.location_type),
    [meta, detail],
  )

  const removeMutation = useMutation({
    mutationFn: (id: number) => deleteLocation(id),
    onSuccess: (res: any) => {
      toast.success(res?.detail || 'Location deactivated')
      queryClient.invalidateQueries({ queryKey: ['location-tree'] })
      setSelectedId(null)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Could not remove location'),
  })

  return (
    <Box className="page-enter" sx={{ width: '100%', minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between', gap: 1.5, mb: 2.5, flexDirection: { xs: 'column', sm: 'row' } }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" sx={{ fontWeight: 900, color: INK }}>Locations</Typography>
          <Typography sx={{ color: palette.textMuted, fontWeight: 700 }}>
            Buildings, floors, rooms and beds — the register work orders are filed against
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }}>
          {canEdit && (
            <Button
              variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}
              disabled={!effectiveFacilityId}
              sx={{ minHeight: 40, background: palette.gradientBrand, borderRadius: '10px', px: 2.25, fontWeight: 900, whiteSpace: 'nowrap' }}
            >
              Add location
            </Button>
          )}
        </Stack>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '380px 1fr' }, gap: 2, alignItems: 'start' }}>
        {/* ── Register ───────────────────────────────────────────────────── */}
        <Card sx={{ borderRadius: '22px', border: `1px solid ${palette.brandBorder}`, boxShadow: palette.shadowCard, overflow: 'hidden' }}>
          <Box sx={{ p: 1.5, borderBottom: `1px solid ${palette.borderSoft}`, display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField
              size="small" placeholder="Find a room…" fullWidth
              value={filter} onChange={(e) => setFilter(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: palette.textDisabled }} /></InputAdornment> }}
            />
            <Button size="small" onClick={expandAll} sx={{ fontWeight: 800, whiteSpace: 'nowrap', color: BRAND }}>
              Expand
            </Button>
          </Box>

          <Box sx={{ maxHeight: 620, overflowY: 'auto', p: 1 }}>
            {isLoading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
                <CircularProgress size={22} thickness={5} sx={{ color: BRAND }} />
              </Box>
            )}
            {!isLoading && !(tree?.items || []).length && (
              <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography sx={{ fontWeight: 800, color: INK, mb: 0.5 }}>No locations yet</Typography>
                <Typography sx={{ fontSize: 13, color: palette.textMuted }}>
                  Start with a building, add its floors, then trace the rooms on a floor plan.
                </Typography>
              </Box>
            )}
            {(tree?.items || []).map((node) => (
              <TreeRow
                key={node.id} node={node} depth={0}
                selectedId={selectedId} expanded={expanded} filter={filter}
                onToggle={toggle} onSelect={setSelectedId}
              />
            ))}
          </Box>

          <Box sx={{ px: 1.75, py: 1.1, borderTop: `1px solid ${palette.borderSoft}`, backgroundColor: '#FCFCFD' }}>
            <Typography sx={{ fontSize: 12, fontWeight: 800, color: palette.textSubtle }}>
              {tree?.total ?? 0} spaces
            </Typography>
          </Box>
        </Card>

        {/* ── Detail ─────────────────────────────────────────────────────── */}
        <Card sx={{ borderRadius: '22px', border: `1px solid ${palette.brandBorder}`, boxShadow: palette.shadowCard, minHeight: 420 }}>
          {!detail && (
            <Box sx={{ p: 6, textAlign: 'center' }}>
              <MapIcon sx={{ fontSize: 46, color: palette.brandBorder, mb: 1 }} />
              <Typography sx={{ fontWeight: 800, color: INK }}>Select a space</Typography>
              <Typography sx={{ fontSize: 13, color: palette.textMuted }}>
                Pick a floor to upload and trace its plan, or a room to see its detail.
              </Typography>
            </Box>
          )}

          {detail && (
            <>
              <Box sx={{ p: 2.25, borderBottom: `1px solid ${palette.borderSoft}` }}>
                <Stack direction="row" spacing={0.5} sx={{ mb: 0.75, flexWrap: 'wrap' }}>
                  {detail.breadcrumbs.map((crumb) => (
                    <Typography key={crumb.id} sx={{ fontSize: 12, fontWeight: 700, color: palette.textFaint }}>
                      {crumb.code} <span style={{ opacity: 0.5 }}>/</span>&nbsp;
                    </Typography>
                  ))}
                </Stack>

                <Stack direction="row" alignItems="center" spacing={1.25} sx={{ flexWrap: 'wrap' }}>
                  <Typography variant="h5" sx={{ fontWeight: 900, color: INK }}>{detail.code}</Typography>
                  {detail.name && (
                    <Typography sx={{ fontWeight: 700, color: palette.textMuted }}>{detail.name}</Typography>
                  )}
                  <Chip
                    label={humanise(detail.location_type)} size="small"
                    sx={{ height: 22, fontSize: 11, fontWeight: 800, borderRadius: '7px', backgroundColor: palette.brandTint, color: palette.brandDeep }}
                  />
                  {detail.criticality && (
                    <Chip
                      label={humanise(detail.criticality)} size="small"
                      sx={{
                        height: 22, fontSize: 11, fontWeight: 800, borderRadius: '7px',
                        backgroundColor: (CRITICALITY_STYLE[detail.criticality] || CRITICALITY_STYLE.standard).bg,
                        color: (CRITICALITY_STYLE[detail.criticality] || CRITICALITY_STYLE.standard).color,
                      }}
                    />
                  )}
                </Stack>

                {detail.is_provisional && (
                  <Alert severity="warning" sx={{ mt: 1.5, borderRadius: '12px', fontWeight: 700 }}>
                    Created from the field by someone who could not find this space in the picker.
                    Confirm the code and placement, then clear the provisional flag.
                  </Alert>
                )}
              </Box>

              <Tabs
                value={tab} onChange={(_, v) => setTab(v)}
                sx={{ px: 2, borderBottom: `1px solid ${palette.borderSoft}`, '& .MuiTab-root': { fontWeight: 800, textTransform: 'none' }, '& .Mui-selected': { color: `${BRAND} !important` }, '& .MuiTabs-indicator': { backgroundColor: BRAND } }}
              >
                <Tab label="What's in here" />
                <Tab label="Detail" />
                <Tab label="Floor plan" disabled={!selectedTypeMeta?.can_hold_plan} />
              </Tabs>

              {tab === 0 && detail.location_type === 'building' && canEdit && (
                <Box sx={{ px: 2.25, pt: 2 }}>
                  <Button
                    variant="contained" fullWidth onClick={() => setSetupOpen(true)}
                    sx={{ fontWeight: 900, borderRadius: '12px', py: 1.1,
                          bgcolor: palette.brand, '&:hover': { bgcolor: palette.brandDeep } }}
                  >
                    {buildingHasFloors ? 'Edit building setup' : 'Set up this building'}
                  </Button>
                  <Typography sx={{ mt: 0.75, fontSize: 12, color: palette.textFaint,
                                    textAlign: 'center' }}>
                    {buildingHasFloors
                      ? 'Add floors, departments or rooms to what is already here.'
                      : 'Answer how many floors, what is on each, and how many rooms per department — the structure is built from that.'}
                  </Typography>
                </Box>
              )}

              {tab === 0 && (
                <SpaceContents
                  locationId={detail.id}
                  locationName={detail.name || detail.code}
                  locationType={detail.location_type}
                  children={findNode(tree?.items ?? [], detail.id)?.children ?? []}
                  canEdit={canEdit}
                  onSelectChild={setSelectedId}
                  // Adds inside the space being looked at, which is what the dialog
                  // already takes as its parent.
                  onAddSpace={() => setAddOpen(true)}
                />
              )}

              {tab === 1 && (
                <SpaceDetail
                  detail={detail}
                  meta={meta}
                  canEdit={canEdit}
                  onDeactivate={() => removeMutation.mutate(detail.id)}
                />
              )}

              {tab === 2 && selectedTypeMeta?.can_hold_plan && (
                <FloorPlanEditor
                  location={detail}
                  canEdit={canEdit}
                  spaceUses={meta?.space_uses || []}
                />
              )}
            </>
          )}
        </Card>
      </Box>

      {setupOpen && detail && effectiveFacilityId && (
        <SetupBuildingWizard
          open={setupOpen}
          onClose={() => setSetupOpen(false)}
          facilityId={effectiveFacilityId}
          building={{ id: detail.id, code: detail.code, name: detail.name }}
          // What is already there, so a second run edits instead of describing
          // a second copy of the building from a blank "how many floors?".
          existing={findNode(tree?.items ?? [], detail.id)?.children ?? []}
          onCreated={() => setSetupOpen(false)}
        />
      )}

      <AddLocationDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        facilityId={effectiveFacilityId ?? null}
        parent={detail || null}
        meta={meta}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ['location-tree'] })
          setAddOpen(false)
        }}
      />
    </Box>
  )
}

function AddLocationDialog({ open, onClose, facilityId, parent, meta, onCreated }: {
  open: boolean
  onClose: () => void
  facilityId: number | null
  parent: any
  meta: any
  onCreated: () => void
}) {
  const [form, setForm] = useState({ location_type: 'building', code: '', name: '', space_use: '' })

  // Only offer types that may legally sit where the user is adding, so an
  // impossible choice never reaches the API.
  const allowedTypes: LocationTypeMeta[] = useMemo(() => {
    if (!meta) return []
    if (!parent) return meta.location_types.filter((t: LocationTypeMeta) => t.can_be_root)
    return meta.location_types.filter((t: LocationTypeMeta) =>
      t.allowed_parents.includes(parent.location_type))
  }, [meta, parent])

  const mutation = useMutation({
    mutationFn: () => createLocation({
      facility_id: facilityId as number,
      parent_id: parent?.id ?? null,
      location_type: form.location_type,
      code: form.code.trim(),
      name: form.name || null,
      space_use: form.space_use || null,
    }),
    onSuccess: () => {
      toast.success('Location added')
      setForm({ location_type: allowedTypes[0]?.value || 'building', code: '', name: '', space_use: '' })
      onCreated()
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Could not add location'),
  })

  const typeValue = allowedTypes.some((t) => t.value === form.location_type)
    ? form.location_type
    : allowedTypes[0]?.value || ''

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: '20px' } }}>
      <DialogTitle sx={{ fontWeight: 900, color: INK }}>
        Add location
        <Typography sx={{ fontSize: 13, color: palette.textMuted, fontWeight: 600 }}>
          {parent ? `Inside ${parent.code}` : 'At the top level of this facility'}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField
            select size="small" label="Type" value={typeValue} fullWidth
            onChange={(e) => setForm({ ...form, location_type: e.target.value })}
          >
            {allowedTypes.map((t) => (
              <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
            ))}
          </TextField>
          <TextField
            size="small" label="Code" fullWidth required value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            helperText="What is painted on the door — OR-3, 4W-12"
          />
          <TextField
            size="small" label="Name" fullWidth value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <SpaceUseField
            label="Space use"
            value={form.space_use}
            onChange={(v) => setForm({ ...form, space_use: v })}
            uses={meta?.space_uses || []}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} sx={{ fontWeight: 800, color: palette.textMuted }}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!form.code.trim() || !facilityId || mutation.isPending}
          onClick={() => mutation.mutate()}
          sx={{ background: palette.gradientBrand, borderRadius: '10px', fontWeight: 900, px: 2.5 }}
        >
          Add
        </Button>
      </DialogActions>
    </Dialog>
  )
}
