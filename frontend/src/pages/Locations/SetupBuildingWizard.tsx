/**
 * Describe a building, one level at a time.
 *
 * Adding a hospital room by room is several hundred passes through a form that
 * asks the same three questions. Adding them as a table of counts is faster but
 * still asks you to think in rows rather than in the building.
 *
 * So this asks the questions in the order somebody actually knows the answers:
 * how many floors, what is on each floor, and how many rooms in each
 * department. The tree is built from the answers, and nothing is written until
 * the last step — the import endpoint validates the whole structure first,
 * because a half-applied space register is worse than a refused one.
 *
 * Building -> Floor -> Department -> Room -> Bed, which is what the location
 * tree already permits: a wing may sit under a floor, a room under a wing.
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, Stack, Step, StepLabel, Stepper,
  TextField, Typography,
} from '@mui/material'
import { toast } from 'react-toastify'
import {
  bulkImportLocations, deleteLocation, fetchLocationMeta, fetchLocationTree, fillRoomContents,
  type BulkLocationRow,
} from '@/api/locations'
import { palette } from '@/theme/palette'
import {
  DEPARTMENTS, codesIn, defaultFloors, existingRoomsOf, fillPlan, generateRows, loadExisting,
  mergeRooms, pad, prefixFrom, removalPlan, removedOf, setRoomCount, setupValue, toggleRemoval,
  type DeptKind, type ExistingNode, type FloorSpec, type RoomKind,
} from './wizardModel'
import RoomTypeDialog from './RoomTypeDialog'

const STEPS = ['Floors', 'What is on each floor', 'Rooms', 'Review']

export default function SetupBuildingWizard({
  open, onClose, facilityId, building, existing = [], onCreated,
}: {
  open: boolean
  onClose: () => void
  facilityId: number
  building: { id: number; code: string; name?: string | null }
  /** The building's current children. Non-empty means this run edits. */
  existing?: ExistingNode[]
  onCreated: () => void
}) {
  const queryClient = useQueryClient()
  // Loaded once when the wizard opens. Re-running it against a building that
  // has already been set up has to start from what is there, not from a blank
  // "how many floors?" that would describe a second copy of the building.
  const [loaded] = useState(() => loadExisting(building.code, existing))
  const editing = loaded.floors.length > 0

  const [step, setStep] = useState(0)
  const [above, setAbove] = useState(editing ? '0' : '4')
  const [below, setBelow] = useState(editing ? '0' : '1')
  const [floors, setFloors] = useState<FloorSpec[]>(loaded.floors)
  // One date for the whole run: a fit-out usually goes into service together.
  const [installedOn, setInstalledOn] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  // Departments and room kinds the preset list does not cover. Oncology,
  // maternity, endoscopy, a mortuary — a fixed vocabulary would push those
  // into "Administration" or leave them out of the register entirely.
  const [customDepts, setCustomDepts] = useState<DeptKind[]>(loaded.customDepts)
  const [customRooms, setCustomRooms] = useState<Record<string, RoomKind[]>>(loaded.customRooms)
  const [asking, setAsking] = useState<
    null | { kind: 'dept' } | { kind: 'room'; deptKey: string; room?: RoomKind }
  >(null)

  const { data: meta } = useQuery({
    queryKey: ['location-meta'],
    queryFn: fetchLocationMeta,
    staleTime: 10 * 60_000,
  })

  const allDepartments = useMemo(
    () => [...DEPARTMENTS, ...customDepts], [customDepts])

  /** A department's room kinds, including any added by hand. */
  const roomsOf = (dept: DeptKind) => mergeRooms(dept.rooms, customRooms[dept.key])

  const addDept = (label: string) => {
    const taken = new Set(allDepartments.map((d) => d.prefix))
    const key = `custom-${Date.now()}`
    setCustomDepts((rows) => [...rows, {
      key, label, prefix: prefixFrom(label, taken),
      // Nothing preset: a department nobody anticipated has no typical rooms,
      // so the next step asks rather than guessing.
      rooms: [],
    }])
    setAsking(null)
  }

  const addRoom = (deptKey: string, room: RoomKind) => {
    setCustomRooms((rows) => {
      const current = rows[deptKey] ?? []
      const replaced = current.some((r) => r.key === room.key)
        ? current.map((r) => (r.key === room.key ? room : r))
        : [...current, room]
      return { ...rows, [deptKey]: replaced }
    })
    setAsking(null)
  }

  const buildFloors = () => {
    const up = Math.max(0, Number(above) || 0)
    const down = Math.max(0, Number(below) || 0)
    if (!editing) {
      setFloors(defaultFloors(building.code, up, down))
      setStep(1)
      return
    }
    // Continue from the highest level and basement already there, so a second
    // run adds Level 3 rather than a second Ground Floor.
    const added: FloorSpec[] = []
    for (let i = down; i >= 1; i -= 1) {
      const n = loaded.nextBasement + i - 1
      added.push({ code: `${building.code}-B${n}`, name: `Basement ${n}`, depts: [], counts: {} })
    }
    for (let i = 0; i < up; i += 1) {
      const n = loaded.nextLevel + i
      added.push({ code: `${building.code}-${pad(n)}`,
                   name: n === 0 ? 'Ground Floor' : `Level ${n}`, depts: [], counts: {} })
    }
    const known = new Set(loaded.floors.map((f) => f.code))
    setFloors([
      ...added.filter((f) => f.code.includes('-B') && !known.has(f.code)),
      ...loaded.floors,
      ...added.filter((f) => !f.code.includes('-B') && !known.has(f.code)),
    ])
    setStep(1)
  }

  const toggleDept = (floorCode: string, deptKey: string) =>
    setFloors((rows) => rows.map((f) => {
      if (f.code !== floorCode) return f
      // The wizard only adds. A department that exists may hold rooms with
      // fixtures and work orders against them; removing it is a decision made
      // on the department itself, not a side effect of unticking a chip.
      if (f.existingDepts?.includes(deptKey)) return f
      const has = f.depts.includes(deptKey)
      return {
        ...f,
        depts: has ? f.depts.filter((d) => d !== deptKey) : [...f.depts, deptKey],
        // Dropping a department drops the room counts that belonged to it,
        // rather than leaving orphans that reappear if it is ticked again.
        counts: has
          ? Object.fromEntries(Object.entries(f.counts)
              .filter(([k]) => !k.startsWith(`${deptKey}:`)))
          : f.counts,
      }
    }))

  // A count below what is there marks rooms for removal rather than being
  // refused. It used to snap back to the existing number without saying why.
  const setCount = (floorCode: string, key: string, value: number) =>
    setFloors((rows) => rows.map((f) => (f.code === floorCode ? setRoomCount(f, key, value) : f)))

  const toggleRoom = (floorCode: string, key: string, id: number) =>
    setFloors((rows) => rows.map((f) => (f.code === floorCode ? toggleRemoval(f, key, id) : f)))

  // Codes of spaces removed earlier. The tree the wizard opens with leaves them
  // out, and a new room given one of them would update the hidden room instead
  // of appearing.
  const { data: fullTree } = useQuery({
    queryKey: ['location-tree', facilityId, building.id, 'with-removed'],
    queryFn: () => fetchLocationTree(facilityId, building.id, true),
    enabled: open,
    staleTime: 0,
  })
  const taken = useMemo(
    () => new Set([...loaded.taken, ...codesIn(fullTree?.items ?? [])]),
    [loaded.taken, fullTree],
  )

  /**
   * What will be sent: only the spaces that do not exist yet.
   *
   * Existing floors, departments and rooms are never re-sent. The import would
   * update them in place, and that would overwrite a room somebody renamed to
   * "Hybrid OR" back to "Operating room 3". New rooms number on from the
   * highest already there and skip any code already taken, so they cannot
   * collide with rooms added by hand under a different scheme.
   */
  const rows = useMemo<BulkLocationRow[]>(
    () => generateRows(floors, building.code, allDepartments, customRooms, taken, { installedOn }),
    [floors, building.code, allDepartments, customRooms, taken, installedOn],
  )

  // Rooms already there whose type now lists contents: topped up, not recreated.
  const fills = useMemo(
    () => fillPlan(floors, allDepartments, customRooms, { installedOn }),
    [floors, allDepartments, customRooms, installedOn],
  )
  const roomsToFill = fills.reduce((n, g) => n + g.location_ids.length, 0)
  const removals = useMemo(() => removalPlan(floors), [floors])
  const changes = [rows.length > 0, roomsToFill > 0, removals.length > 0].filter(Boolean).length

  const create = useMutation({
    mutationFn: async () => {
      let created = 0
      if (rows.length) {
        // Validate everything before writing anything. The endpoint defaults to
        // a dry run for exactly this reason.
        const check = await bulkImportLocations({
          facility_id: facilityId, rows, dry_run: true,
        })
        const bad = check.issues.filter((i) => i.severity === 'error')
        if (bad.length) {
          setErrors(bad.map((e) => `${e.code}: ${e.message}`))
          throw new Error('validation')
        }
        created = (await bulkImportLocations({ facility_id: facilityId, rows, dry_run: false })).created
      }
      let items = 0
      for (const group of fills) {
        const filled = await fillRoomContents({
          location_ids: group.location_ids, fixtures: group.fixtures, assets: group.assets,
        })
        items += filled.fixtures_created + filled.assets_created
      }
      // Soft removal: out of the register and every picker, history kept.
      for (const room of removals) {
        await deleteLocation(room.id)
      }
      return { created, items, removed: removals.length }
    },
    onSuccess: (res) => {
      toast.success([
        res.created ? `${res.created} spaces created` : '',
        res.items ? `${res.items} assets and fixtures added to existing rooms` : '',
        res.removed ? `${res.removed} ${res.removed === 1 ? 'room' : 'rooms'} removed` : '',
      ].filter(Boolean).join(' · ') || 'Nothing needed adding')
      queryClient.invalidateQueries({ queryKey: ['location'] })
      queryClient.invalidateQueries({ queryKey: ['fixtures'] })
      queryClient.invalidateQueries({ queryKey: ['fixture-summary'] })
      queryClient.invalidateQueries({ queryKey: ['location-tree'] })
      queryClient.invalidateQueries({ queryKey: ['site-overview'] })
      onCreated()
    },
    onError: (e: any) => {
      if (e?.message !== 'validation') {
        toast.error(e?.response?.data?.detail || 'Could not create the structure')
      }
    },
  })

  const value = setupValue(rows)
  const counts = {
    floors: rows.filter((r) => r.location_type === 'floor').length,
    depts: rows.filter((r) => r.location_type === 'wing').length,
    rooms: rows.filter((r) => !['floor', 'wing', 'bed'].includes(r.location_type)).length,
    beds: rows.filter((r) => r.location_type === 'bed').length,
    fixtures: rows.reduce((n, r) => n + (r.fixtures ?? []).reduce((m, f) => m + f.count, 0), 0),
    assets: rows.reduce((n, r) => n + (r.assets ?? []).reduce((m, a) => m + a.count, 0), 0),
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth
            PaperProps={{ sx: { borderRadius: '18px' } }}>
      <DialogTitle sx={{ fontWeight: 900, color: palette.ink, pb: 1 }}>
        {editing ? 'Edit' : 'Set up'} {building.name || building.code}
      </DialogTitle>
      <DialogContent dividers>
        <Stepper activeStep={step} sx={{ mb: 3 }}>
          {STEPS.map((label) => (
            <Step key={label}><StepLabel>{label}</StepLabel></Step>
          ))}
        </Stepper>

        {step === 0 && (
          <Box>
            <Typography sx={{ mb: 2, fontWeight: 800, color: palette.ink }}>
              {editing
                ? `This building has ${loaded.floors.length} ${loaded.floors.length === 1 ? 'floor' : 'floors'}. Add more?`
                : 'How many floors does this building have?'}
            </Typography>
            {editing && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
                {loaded.floors.map((f) => (
                  <Chip key={f.code} size="small" label={`${f.code} · ${f.name}`}
                        sx={{ height: 24, fontWeight: 800, fontSize: 11.5,
                              bgcolor: palette.surfaceMuted, color: palette.textSubtle }} />
                ))}
              </Box>
            )}
            <Stack direction="row" spacing={2}>
              <TextField
                size="small" type="number" value={above}
                label={editing ? 'Add floors above' : 'Floors above ground'}
                onChange={(e) => setAbove(e.target.value)} sx={{ width: 200 }}
                helperText={editing ? `Starts at level ${loaded.nextLevel}` : 'Ground counts as one'}
              />
              <TextField
                size="small" type="number" value={below}
                label={editing ? 'Add basement levels' : 'Basement levels'}
                onChange={(e) => setBelow(e.target.value)} sx={{ width: 190 }}
                helperText={editing ? `Starts at B${loaded.nextBasement}` : ' '}
              />
            </Stack>
            <Typography sx={{ mt: 2, fontSize: 12.5, color: palette.textMuted, fontWeight: 600 }}>
              {editing
                ? 'Leave both at zero to add departments or rooms to the floors already there. '
                  + 'This only adds — rename or remove an existing space from its own Detail tab.'
                : 'You can rename any of them on the next step.'}
            </Typography>
          </Box>
        )}

        {step === 1 && (
          <Box>
            <Typography sx={{ mb: 2, fontWeight: 800, color: palette.ink }}>
              What is on each floor?
            </Typography>
            <Stack spacing={2}>
              {floors.map((floor) => (
                <Box key={floor.code} sx={{ p: 1.75, borderRadius: '14px',
                                            border: `1px solid ${palette.borderSoft}` }}>
                  <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.25 }}>
                    <Chip size="small" label={floor.code}
                          sx={{ height: 22, fontWeight: 900, fontSize: 11,
                                bgcolor: palette.brandTint, color: palette.brandDeep }} />
                    <TextField
                      size="small" variant="standard" value={floor.name}
                      onChange={(e) => setFloors((rows2) => rows2.map((f) =>
                        f.code === floor.code ? { ...f, name: e.target.value } : f))}
                      sx={{ maxWidth: 220 }}
                    />
                  </Stack>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {allDepartments.map((dept) => {
                      const on = floor.depts.includes(dept.key)
                      const locked = floor.existingDepts?.includes(dept.key)
                      return (
                        <Chip
                          key={dept.key} size="small" clickable={!locked}
                          label={locked ? `${dept.label} ✓` : dept.label}
                          title={locked ? 'Already on this floor' : undefined}
                          onClick={() => toggleDept(floor.code, dept.key)}
                          sx={{
                            height: 26, fontWeight: 800, fontSize: 11.5,
                            bgcolor: locked ? palette.brandDeep : on ? palette.brand : palette.surfaceFaint,
                            color: on ? palette.white : palette.textSubtle,
                            '&:hover': { bgcolor: locked ? palette.brandDeep
                              : on ? palette.brandDeep : palette.brandTint },
                          }}
                        />
                      )
                    })}
                    <Chip
                      size="small" label="+ Add your own" clickable variant="outlined"
                      onClick={() => setAsking({ kind: 'dept' })}
                      sx={{ height: 26, fontWeight: 800, fontSize: 11.5,
                            color: palette.brand, borderColor: palette.brandBorder,
                            borderStyle: 'dashed' }}
                    />
                  </Box>
                </Box>
              ))}
            </Stack>
          </Box>
        )}

        {step === 2 && (
          <Box>
            <Typography sx={{ mb: 2, fontWeight: 800, color: palette.ink }}>
              How many rooms in each department?
            </Typography>
            {!floors.some((f) => f.depts.length) && (
              <Alert severity="info" sx={{ borderRadius: '12px' }}>
                No departments chosen. Go back and pick what is on each floor,
                or continue to create the floors on their own.
              </Alert>
            )}
            <Stack spacing={2.5}>
              {floors.filter((f) => f.depts.length).map((floor) => (
                <Box key={floor.code}>
                  <Typography sx={{ mb: 1, fontSize: 11, fontWeight: 900, letterSpacing: 0.4,
                                    textTransform: 'uppercase', color: palette.textSubtle }}>
                    {floor.name} · {floor.code}
                  </Typography>
                  <Stack spacing={1.5}>
                    {floor.depts.map((deptKey) => {
                      const dept = allDepartments.find((d) => d.key === deptKey)!
                      return (
                        <Box key={deptKey} sx={{ p: 1.5, borderRadius: '12px',
                                                 border: `1px solid ${palette.borderSoft}` }}>
                          <Typography sx={{ mb: 1, fontWeight: 900, fontSize: 13,
                                            color: palette.ink }}>
                            {dept.label}
                          </Typography>
                          <Box sx={{ display: 'grid', gap: 1,
                                     gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
                            {roomsOf(dept).map((room) => {
                              const key = `${deptKey}:${room.key}`
                              const have = floor.existingCounts?.[key] ?? 0
                              const going = removedOf(floor, key)
                              return (
                              <Box key={room.key}>
                              <TextField
                                size="small" type="number" fullWidth
                                label={room.label}
                                value={floor.counts[key] ?? 0}
                                onChange={(e) => setCount(floor.code, key, Number(e.target.value))}
                                inputProps={{ min: 0 }}
                                error={going.length > 0}
                                helperText={
                                  <Box component="span">
                                    {[
                                      have ? `${have} already` : '',
                                      going.length ? `${going.length} will be removed` : '',
                                      describeContents(room),
                                    ].filter(Boolean).join(' · ') || 'Nothing inside yet'}
                                    {' '}
                                    <Box
                                      component="button" type="button"
                                      onClick={() => setAsking({ kind: 'room', deptKey, room })}
                                      sx={{ border: 0, p: 0, bgcolor: 'transparent', cursor: 'pointer',
                                            color: palette.brand, fontWeight: 800, fontSize: 'inherit' }}
                                    >
                                      Edit
                                    </Box>
                                  </Box>
                                }
                              />
                              {going.length > 0 && (
                                <Box sx={{ mt: 0.75 }}>
                                  <Typography sx={{ fontSize: 11, color: palette.textMuted, mb: 0.5 }}>
                                    Click a room to choose which {going.length === 1 ? 'one goes' : 'ones go'}:
                                  </Typography>
                                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                    {(floor.existingRooms?.[key] ?? []).map((r) => {
                                      const off = going.some((g) => g.id === r.id)
                                      return (
                                        <Chip
                                          key={r.id} size="small" title={r.name}
                                          label={off ? `${r.code} · remove` : r.code}
                                          color={off ? 'error' : 'default'}
                                          variant={off ? 'filled' : 'outlined'}
                                          onClick={() => toggleRoom(floor.code, key, r.id)}
                                          sx={{ fontWeight: 700,
                                                textDecoration: off ? 'line-through' : 'none' }}
                                        />
                                      )
                                    })}
                                  </Box>
                                </Box>
                              )}
                              </Box>
                              )
                            })}
                          </Box>
                          {!roomsOf(dept).length && (
                            <Typography sx={{ fontSize: 12.5, color: palette.textFaint }}>
                              No room types yet — add the kinds of room this
                              department contains.
                            </Typography>
                          )}
                          <Button
                            size="small"
                            onClick={() => setAsking({ kind: 'room', deptKey })}
                            sx={{ mt: 0.75, fontWeight: 800, fontSize: 12, color: palette.brand }}
                          >
                            + Add a room type
                          </Button>
                        </Box>
                      )
                    })}
                  </Stack>
                </Box>
              ))}
            </Stack>
          </Box>
        )}

        {step === 3 && (
          <Box>
            <Typography sx={{ mb: 2, fontWeight: 800, color: palette.ink }}>
              {changes === 0
                ? 'Nothing to change yet'
                : [
                    rows.length ? `This will ${editing ? 'add' : 'create'} ${rows.length} ${rows.length === 1 ? 'space' : 'spaces'}` : '',
                    roomsToFill ? `${rows.length ? 'and top up' : 'This will top up'} ${roomsToFill} existing ${roomsToFill === 1 ? 'room' : 'rooms'}` : '',
                    removals.length ? `${rows.length || roomsToFill ? 'and remove' : 'This will remove'} ${removals.length} ${removals.length === 1 ? 'room' : 'rooms'}` : '',
                  ].filter(Boolean).join(' ')}
            </Typography>
            {removals.length > 0 && (
              <Alert severity="warning" sx={{ mb: 2, borderRadius: '12px' }}>
                <Typography sx={{ fontWeight: 800, fontSize: 13, mb: 0.5 }}>
                  {removals.length === 1 ? 'This room will be removed' : 'These rooms will be removed'}
                </Typography>
                {removals.map((r) => (
                  <Typography key={r.id} sx={{ fontSize: 12.5 }}>
                    <b>{r.code}</b> {r.name !== r.code ? `· ${r.name}` : ''} · {r.floor}
                  </Typography>
                ))}
                <Typography sx={{ fontSize: 12, mt: 0.75 }}>
                  Removed rooms leave the register and every picker, with everything inside
                  them: beds and fixtures. Their work orders and history stay readable, and
                  their codes are not given to new rooms.
                </Typography>
              </Alert>
            )}
            {fills.length > 0 && (
              <Alert severity="info" sx={{ mb: 2, borderRadius: '12px' }}>
                {fills.map((g) => (
                  <Typography key={g.label} sx={{ fontSize: 12.5 }}>
                    <b>{g.label}</b> ({g.location_ids.length} existing):{' '}
                    up to {[
                      ...g.assets.map((a) => `${a.count} ${a.asset_type.replace(/_/g, ' ')}`),
                      ...g.fixtures.map((f) => `${f.count} ${f.fixture_type.replace(/_/g, ' ')}`),
                    ].join(', ')} each.
                  </Typography>
                ))}
                <Typography sx={{ fontSize: 12, mt: 0.5, color: palette.textMuted }}>
                  Only what a room is short of is added. Nothing is removed.
                </Typography>
              </Alert>
            )}
            {(counts.assets > 0 || fills.some((g) => g.assets.length > 0)) && (
              <Box sx={{ mb: 2, p: 1.5, borderRadius: '12px', border: `1px solid ${palette.borderSoft}` }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
                  <TextField
                    size="small" type="date" label="In service since" value={installedOn}
                    onChange={(e) => setInstalledOn(e.target.value)}
                    InputLabelProps={{ shrink: true }} sx={{ width: 200 }}
                  />
                  <Typography sx={{ fontSize: 12.5, color: palette.textMuted }}>
                    {value.priced > 0
                      ? <>New assets worth <b>{formatMoney(value.value)}</b>{value.priced < value.total ? ` (${value.priced} of ${value.total} priced)` : ''}. </>
                      : 'No costs given. '}
                    Optional: cost and this date are what depreciation needs. They apply to the
                    assets this creates; anything already in a room keeps its own. Costs can also
                    be added later for many assets at once from Assets.
                  </Typography>
                </Stack>
              </Box>
            )}
            <Stack direction="row" spacing={1.5} sx={{ mb: 2, flexWrap: 'wrap', gap: 1.5 }}>
              {[
                ['Floors', counts.floors], ['Departments', counts.depts],
                ['Rooms', counts.rooms], ['Beds', counts.beds], ['Assets', counts.assets], ['Fixtures', counts.fixtures],
              ].map(([label, value]) => (
                <Box key={String(label)} sx={{ px: 2, py: 1.25, borderRadius: '12px',
                                               bgcolor: palette.surfaceFaint,
                                               border: `1px solid ${palette.surfaceMuted}` }}>
                  <Typography sx={{ fontSize: 20, fontWeight: 900, color: palette.ink }}>
                    {value}
                  </Typography>
                  <Typography sx={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.3,
                                    textTransform: 'uppercase', color: palette.textFaint }}>
                    {label}
                  </Typography>
                </Box>
              ))}
            </Stack>

            <Divider sx={{ my: 2 }} />
            <Box sx={{ maxHeight: 240, overflowY: 'auto' }}>
              {floors.map((floor) => (
                <Box key={floor.code} sx={{ mb: 1.25 }}>
                  <Typography sx={{ fontWeight: 900, fontSize: 13, color: palette.ink }}>
                    {floor.code} · {floor.name}
                  </Typography>
                  {floor.depts.map((deptKey) => {
                    const dept = allDepartments.find((d) => d.key === deptKey)!
                    const total = roomsOf(dept).reduce(
                      (n, r) => n + (floor.counts[`${deptKey}:${r.key}`] ?? 0), 0)
                    return (
                      <Typography key={deptKey}
                                  sx={{ pl: 2, fontSize: 12.5, color: palette.textMuted,
                                        fontWeight: 600 }}>
                        {dept.label} — {total} {total === 1 ? 'room' : 'rooms'}
                      </Typography>
                    )
                  })}
                </Box>
              ))}
            </Box>

            {errors.length > 0 && (
              <Alert severity="error" sx={{ mt: 2, borderRadius: '12px' }}>
                <Typography sx={{ fontWeight: 800, fontSize: 13, mb: 0.5 }}>
                  Nothing was created. Fix these first:
                </Typography>
                {errors.slice(0, 6).map((e) => (
                  <Typography key={e} sx={{ fontSize: 12.5 }}>{e}</Typography>
                ))}
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>

      {asking?.kind === 'room' && (
        <RoomTypeDialog
          initial={asking.room}
          existingRooms={asking.room ? existingRoomsOf(floors, asking.deptKey, asking.room.key) : 0}
          spaceUses={meta?.space_uses ?? []}
          existingPrefixes={new Set(
            allDepartments.flatMap((d) => roomsOf(d).map((r) => r.prefix)),
          )}
          onCancel={() => setAsking(null)}
          onSave={(room) => addRoom(asking.deptKey, room)}
        />
      )}

      {asking?.kind === 'dept' && (
        <AskForCustom
          what={asking}
          spaceUses={meta?.space_uses ?? []}
          existingPrefixes={new Set([
            ...allDepartments.map((d) => d.prefix),
            ...allDepartments.flatMap((d) => roomsOf(d).map((r) => r.prefix)),
          ])}
          onCancel={() => setAsking(null)}
          onAddDept={addDept}
          onAddRoom={addRoom}
        />
      )}

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} sx={{ fontWeight: 800, color: palette.textMuted }}>
          Cancel
        </Button>
        <Box sx={{ flex: 1 }} />
        {step > 0 && (
          <Button onClick={() => setStep(step - 1)}
                  sx={{ fontWeight: 800, color: palette.textMuted }}>
            Back
          </Button>
        )}
        {step === 0 && (
          <Button variant="contained" onClick={buildFloors}
                  sx={{ fontWeight: 900, borderRadius: '10px', bgcolor: palette.brand,
                        '&:hover': { bgcolor: palette.brandDeep } }}>
            Next
          </Button>
        )}
        {(step === 1 || step === 2) && (
          <Button variant="contained" onClick={() => setStep(step + 1)}
                  sx={{ fontWeight: 900, borderRadius: '10px', bgcolor: palette.brand,
                        '&:hover': { bgcolor: palette.brandDeep } }}>
            Next
          </Button>
        )}
        {step === 3 && (
          <Button
            variant="contained" disabled={changes === 0 || !fullTree || create.isPending}
            onClick={() => { setErrors([]); create.mutate() }}
            sx={{ fontWeight: 900, borderRadius: '10px', bgcolor: palette.brand,
                  '&:hover': { bgcolor: palette.brandDeep } }}
          >
            {create.isPending ? 'Saving…'
              : changes > 1 ? 'Save changes'
              : removals.length ? `Remove ${removals.length} ${removals.length === 1 ? 'room' : 'rooms'}`
              : roomsToFill ? `Top up ${roomsToFill} ${roomsToFill === 1 ? 'room' : 'rooms'}`
              : `${editing ? 'Add' : 'Create'} ${rows.length} ${rows.length === 1 ? 'space' : 'spaces'}`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}

/**
 * Name a department or a kind of room the presets do not cover.
 *
 * One dialog for both because they ask nearly the same thing: what it is
 * called, and — for a room — what it is used for and whether it holds beds.
 * The space use matters more than the name: it is what decides the air,
 * pressure and power rules that apply to the room afterwards.
 */
/** Name a department the presets do not cover. */
function AskForCustom({ onCancel, onAddDept, existingPrefixes }: {
  what: { kind: 'dept' }
  spaceUses?: unknown
  existingPrefixes: Set<string>
  onCancel: () => void
  onAddDept: (label: string) => void
  onAddRoom?: unknown
}) {
  const [label, setLabel] = useState('')
  const prefix = label.trim() ? prefixFrom(label, existingPrefixes) : ''
  return (
    <Dialog open onClose={onCancel} maxWidth="xs" fullWidth
            PaperProps={{ sx: { borderRadius: '16px' } }}>
      <DialogTitle sx={{ fontWeight: 900, color: palette.ink, pb: 0.5 }}>
        Add a department
      </DialogTitle>
      <DialogContent>
        <TextField
          autoFocus fullWidth size="small" label="Department name" sx={{ mt: 0.5 }}
          value={label} onChange={(e) => setLabel(e.target.value)}
          placeholder="Oncology"
          helperText={prefix ? `Codes will start ${prefix}-` : ' '}
          onKeyDown={(e) => { if (e.key === 'Enter' && label.trim()) onAddDept(label.trim()) }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onCancel} sx={{ fontWeight: 800, color: palette.textMuted }}>
          Cancel
        </Button>
        <Button
          variant="contained" disabled={!label.trim()} onClick={() => onAddDept(label.trim())}
          sx={{ fontWeight: 900, borderRadius: '10px' }}
        >
          Add
        </Button>
      </DialogActions>
    </Dialog>
  )
}

const formatMoney = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

/** "12 chairs at $180, 2 tables" — what a room kind puts in each room. */
function describeContents(room: RoomKind): string {
  const parts: string[] = []
  if (room.beds) parts.push(`${room.beds} bed${room.beds > 1 ? 's' : ''}`)
  for (const c of room.contents ?? []) {
    const priced = c.kind === 'asset' && c.costEach != null ? ` at ${formatMoney(c.costEach)}` : ''
    parts.push(`${c.count} ${c.label.toLowerCase()}${priced}`)
  }
  return parts.length ? `each has ${parts.join(', ')}` : ''
}
