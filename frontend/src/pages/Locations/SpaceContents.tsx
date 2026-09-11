/**
 * What is in this space — which means different things at different levels.
 *
 * A building contains floors. A floor contains rooms. A room contains the
 * sockets, lights and gas outlets that maintenance is actually about. Showing
 * "0 items in this room" against a building was wrong twice over: it is not a
 * room, and it is not empty — it has two floors in it.
 *
 * So a container lists what is beneath it and a room lists its fixtures, and
 * the tab means the same thing in plain English at every level.
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Chip, CircularProgress, IconButton, Stack, Tooltip,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import ReportProblemIcon from '@mui/icons-material/ReportProblem'
import { toast } from 'react-toastify'
import {
  fetchFixtureCatalog, fetchFixtures, updateFixture, type Fixture,
} from '@/api/fixtures'
import { palette } from '@/theme/palette'
import AddFixturesDialog from './AddFixturesDialog'
import ReportFaultDialog from './ReportFaultDialog'

/** Types that hold fixtures rather than other spaces. */
const HOLDS_FIXTURES = new Set([
  'room', 'bed', 'mech_room', 'plenum', 'shaft', 'riser', 'roof', 'exterior',
])

export const TRADE_LABEL: Record<string, string> = {
  electrical: 'Electrical',
  mechanical: 'Mechanical',
  plumbing: 'Plumbing',
  medical_gas: 'Medical Gas',
  fire_life_safety: 'Fire & Life Safety',
  it_low_voltage: 'IT & Low Voltage',
  building_envelope: 'Building',
}

const TRADE_COLOUR: Record<string, string> = {
  electrical: palette.warningStrong,
  mechanical: '#0EA5E9',
  plumbing: palette.infoBright,
  medical_gas: palette.brandMid,
  fire_life_safety: palette.dangerBright,
  it_low_voltage: palette.indigo,
  building_envelope: palette.textMuted,
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  working: { bg: palette.brandTint, color: palette.brandDeep },
  faulty: { bg: palette.dangerTint, color: palette.danger },
  isolated: { bg: palette.warningTint, color: palette.warningDeep },
  removed: { bg: palette.surfaceMuted, color: palette.textMuted },
}

const humanise = (v?: string | null) =>
  (v || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

export interface ChildSpace {
  id: number
  code: string
  name?: string | null
  location_type: string
  bed_count?: number
  children?: ChildSpace[]
}

export default function SpaceContents({
  locationId, locationName, locationType, children, canEdit, onSelectChild,
}: {
  locationId: number
  locationName: string
  locationType: string
  children: ChildSpace[]
  canEdit: boolean
  onSelectChild: (id: number) => void
}) {
  const holdsFixtures = HOLDS_FIXTURES.has(locationType)
  return holdsFixtures ? (
    <FixtureList
      locationId={locationId} locationName={locationName} canEdit={canEdit}
    />
  ) : (
    <SpaceList
      locationName={locationName} locationType={locationType}
      children={children} onSelectChild={onSelectChild}
    />
  )
}

/** A building or floor: what spaces are beneath it. */
function SpaceList({ locationName, locationType, children, onSelectChild }: {
  locationName: string
  locationType: string
  children: ChildSpace[]
  onSelectChild: (id: number) => void
}) {
  const countBeneath = (nodes: ChildSpace[]): number =>
    nodes.reduce((n, c) => n + 1 + countBeneath(c.children ?? []), 0)

  if (!children.length) {
    return (
      <Box sx={{ p: 5, textAlign: 'center' }}>
        <Typography sx={{ fontWeight: 800, color: palette.textMuted }}>
          Nothing inside this {humanise(locationType).toLowerCase()} yet.
        </Typography>
        <Typography sx={{ mt: 0.5, fontSize: 13, color: palette.textFaint }}>
          Use Add location to put floors, wings or rooms inside it.
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 2.25 }}>
      <Typography sx={{ fontWeight: 900, color: palette.ink, fontSize: 15, mb: 1.5 }}>
        {children.length} {children.length === 1 ? 'space' : 'spaces'} directly inside
        {' '}{locationName}
      </Typography>

      <Box sx={{ display: 'grid', gap: 1,
                 gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' } }}>
        {children.map((child) => {
          const beneath = countBeneath(child.children ?? [])
          return (
            <Box
              key={child.id}
              onClick={() => onSelectChild(child.id)}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1.25, p: 1.4,
                borderRadius: '12px', border: `1px solid ${palette.borderSoft}`,
                cursor: 'pointer', bgcolor: palette.white,
                '&:hover': { bgcolor: palette.brandTint, borderColor: palette.brandBorder },
              }}
            >
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Stack direction="row" alignItems="center" spacing={0.75}>
                  <Typography sx={{ fontWeight: 900, color: palette.ink, fontSize: 13.5 }}>
                    {child.code}
                  </Typography>
                  <Chip
                    size="small" label={humanise(child.location_type)}
                    sx={{ height: 18, fontSize: 10, fontWeight: 800,
                          bgcolor: palette.surfaceMuted, color: palette.textSubtle }}
                  />
                </Stack>
                <Typography noWrap sx={{ fontSize: 12.5, color: palette.textMuted, fontWeight: 600 }}>
                  {child.name || '—'}
                  {beneath > 0 ? ` · ${beneath} beneath` : ''}
                  {child.bed_count ? ` · ${child.bed_count} beds` : ''}
                </Typography>
              </Box>
              <ChevronRightIcon sx={{ fontSize: 18, color: palette.textFaint }} />
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}

/** A room: the fixtures in it, grouped by trade. */
function FixtureList({ locationId, locationName, canEdit }: {
  locationId: number
  locationName: string
  canEdit: boolean
}) {
  const queryClient = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [faultFor, setFaultFor] = useState<Fixture | null>(null)

  // Errors here used to be silent: the dialog was gated on the catalogue
  // having loaded, so a failed request made the Add fixtures button do
  // nothing at all with no explanation.
  const catalogQuery = useQuery({
    queryKey: ['fixture-catalog'],
    queryFn: fetchFixtureCatalog,
    staleTime: 30 * 60_000,
    retry: 1,
  })

  const { data, isLoading, error } = useQuery({
    queryKey: ['fixtures', locationId],
    queryFn: () => fetchFixtures({ location_id: locationId, limit: 500 }),
    enabled: !!locationId,
  })

  const fixtures = data?.items ?? []

  const byTrade = useMemo(() => {
    const groups: Record<string, Fixture[]> = {}
    for (const f of fixtures) {
      const trade = f.discipline_code || 'building_envelope'
      ;(groups[trade] ||= []).push(f)
    }
    return Object.entries(groups).sort(([a], [b]) =>
      (TRADE_LABEL[a] || a).localeCompare(TRADE_LABEL[b] || b))
  }, [fixtures])

  const faultCount = fixtures.filter((f) => f.status === 'faulty').length

  const clearFault = useMutation({
    mutationFn: (id: number) => updateFixture(id, { status: 'working' }),
    onSuccess: () => {
      toast.success('Marked working')
      queryClient.invalidateQueries({ queryKey: ['fixtures', locationId] })
    },
  })

  if (isLoading) {
    return <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress size={26} /></Box>
  }

  return (
    <Box sx={{ p: 2.25 }}>
      {error != null && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: '12px', fontWeight: 700 }}>
          Could not load what is in this room. The fixtures service may not be
          running — check that the backend has been restarted since the fixtures
          migration.
        </Alert>
      )}

      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
        <Typography sx={{ fontWeight: 900, color: palette.ink, fontSize: 15 }}>
          {fixtures.length} {fixtures.length === 1 ? 'item' : 'items'} in {locationName}
        </Typography>
        {faultCount > 0 && (
          <Chip
            size="small" label={`${faultCount} faulty`}
            sx={{ height: 22, fontWeight: 800, fontSize: 11,
                  bgcolor: palette.dangerTint, color: palette.danger }}
          />
        )}
        <Box sx={{ flex: 1 }} />
        {canEdit && (
          <Button
            size="small" startIcon={<AddIcon />} variant="contained"
            onClick={() => setAddOpen(true)}
            disabled={catalogQuery.isLoading}
            sx={{ fontWeight: 900, borderRadius: '10px', bgcolor: palette.brand,
                  '&:hover': { bgcolor: palette.brandDeep } }}
          >
            {catalogQuery.isLoading ? 'Loading…' : 'Add fixtures'}
          </Button>
        )}
      </Stack>

      {!fixtures.length && error == null && (
        <Box sx={{ py: 5, textAlign: 'center' }}>
          <Typography sx={{ fontWeight: 800, color: palette.textMuted }}>
            Nothing recorded in here yet.
          </Typography>
          <Typography sx={{ mt: 0.5, fontSize: 13, color: palette.textFaint, maxWidth: 460, mx: 'auto' }}>
            Add the sockets, lights, gas outlets and data ports that are in this
            room. Once they are listed, anybody who finds one broken can raise a
            work order against it in one click, and it reaches the right trade
            without being asked which.
          </Typography>
        </Box>
      )}

      {byTrade.map(([trade, items]) => (
        <Box key={trade} sx={{ mb: 2.5 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%',
                       bgcolor: TRADE_COLOUR[trade] || palette.textMuted }} />
            <Typography sx={{ fontWeight: 900, fontSize: 12, letterSpacing: 0.4,
                              textTransform: 'uppercase', color: palette.textSubtle }}>
              {TRADE_LABEL[trade] || trade} · {items.length}
            </Typography>
          </Stack>

          <Box sx={{ display: 'grid', gap: 1,
                     gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' } }}>
            {items.map((f) => {
              const style = STATUS_STYLE[f.status] || STATUS_STYLE.working
              return (
                <Box
                  key={f.id}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1.25, p: 1.25,
                    borderRadius: '12px', border: `1px solid ${palette.borderSoft}`,
                    bgcolor: f.status === 'faulty' ? palette.dangerWash : palette.white,
                  }}
                >
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Stack direction="row" alignItems="center" spacing={0.75}>
                      <Typography sx={{ fontWeight: 900, color: palette.ink, fontSize: 13.5 }}>
                        {f.code}
                      </Typography>
                      <Chip
                        size="small" label={f.status}
                        sx={{ height: 18, fontSize: 10, fontWeight: 800, bgcolor: style.bg,
                              color: style.color, textTransform: 'capitalize' }}
                      />
                    </Stack>
                    <Typography noWrap sx={{ fontSize: 12, color: palette.textMuted, fontWeight: 600 }}>
                      {f.summary}
                      {f.label ? ` · ${f.label}` : ''}
                      {f.circuit_ref ? ` · ${f.circuit_ref}` : ''}
                    </Typography>
                    {f.serial_number && (
                      <Typography sx={{ fontSize: 11, color: palette.textFaint, fontFamily: 'monospace' }}>
                        {f.serial_number}
                      </Typography>
                    )}
                  </Box>

                  {f.status === 'faulty' ? (
                    <Tooltip title="Mark this working again">
                      <Button
                        size="small" onClick={() => clearFault.mutate(f.id)}
                        sx={{ fontWeight: 800, fontSize: 11.5, color: palette.brand }}
                      >
                        Fixed
                      </Button>
                    </Tooltip>
                  ) : (
                    <Tooltip title="Raise a work order against this">
                      <IconButton size="small" onClick={() => setFaultFor(f)}
                                  sx={{ color: palette.danger }}>
                        <ReportProblemIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              )
            })}
          </Box>
        </Box>
      ))}

      {addOpen && (
        <AddFixturesDialog
          open={addOpen}
          onClose={() => setAddOpen(false)}
          locationId={locationId}
          locationName={locationName}
          types={catalogQuery.data?.types ?? []}
          loadError={catalogQuery.error != null}
          onAdded={() => {
            queryClient.invalidateQueries({ queryKey: ['fixtures', locationId] })
            setAddOpen(false)
          }}
        />
      )}

      {faultFor && (
        <ReportFaultDialog
          fixture={faultFor}
          locationName={locationName}
          onClose={() => setFaultFor(null)}
          onReported={() => {
            queryClient.invalidateQueries({ queryKey: ['fixtures', locationId] })
            queryClient.invalidateQueries({ queryKey: ['service-requests'] })
            setFaultFor(null)
          }}
        />
      )}
    </Box>
  )
}
