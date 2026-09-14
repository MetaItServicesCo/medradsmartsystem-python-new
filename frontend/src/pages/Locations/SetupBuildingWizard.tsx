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
  bulkImportLocations, fetchLocationMeta, type BulkLocationRow,
} from '@/api/locations'
import { palette } from '@/theme/palette'
import {
  DEPARTMENTS, defaultFloors, generateRows, loadExisting, mergeRooms, pad, prefixFrom,
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

  const setCount = (floorCode: string, key: string, value: number) =>
    setFloors((rows) => rows.map((f) => {
      if (f.code !== floorCode) return f
      const floor = f.existingCounts?.[key] ?? 0
      return { ...f, counts: { ...f.counts, [key]: Math.max(floor, value) } }
    }))

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
    () => generateRows(floors, building.code, allDepartments, customRooms, loaded.taken),
    [floors, building.code, allDepartments, customRooms, loaded.taken],
  )

  const create = useMutation({
    mutationFn: async () => {
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
      return bulkImportLocations({ facility_id: facilityId, rows, dry_run: false })
    },
    onSuccess: (res) => {
      toast.success(`${res.created} spaces created`)
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

  const counts = {
    floors: rows.filter((r) => r.location_type === 'floor').length,
    depts: rows.filter((r) => r.location_type === 'wing').length,
    rooms: rows.filter((r) => !['floor', 'wing', 'bed'].includes(r.location_type)).length,
    beds: rows.filter((r) => r.location_type === 'bed').length,
    fixtures: rows.reduce((n, r) => n + (r.fixtures ?? []).reduce((m, f) => m + f.count, 0), 0),
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
                            {roomsOf(dept).map((room) => (
                              <TextField
                                key={room.key} size="small" type="number"
                                label={room.label}
                                value={floor.counts[`${deptKey}:${room.key}`] ?? 0}
                                onChange={(e) => setCount(
                                  floor.code, `${deptKey}:${room.key}`,
                                  Math.max(0, Number(e.target.value) || 0),
                                )}
                                inputProps={{ min: floor.existingCounts?.[`${deptKey}:${room.key}`] ?? 0 }}
                                helperText={
                                  <Box component="span">
                                    {[
                                      floor.existingCounts?.[`${deptKey}:${room.key}`]
                                        ? `${floor.existingCounts[`${deptKey}:${room.key}`]} already` : '',
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
                            ))}
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
              {rows.length === 0
                ? 'Nothing new to add yet'
                : `This will ${editing ? 'add' : 'create'} ${rows.length} ${rows.length === 1 ? 'space' : 'spaces'}`}
            </Typography>
            <Stack direction="row" spacing={1.5} sx={{ mb: 2, flexWrap: 'wrap', gap: 1.5 }}>
              {[
                ['Floors', counts.floors], ['Departments', counts.depts],
                ['Rooms', counts.rooms], ['Beds', counts.beds], ['Fixtures', counts.fixtures],
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
            variant="contained" disabled={!rows.length || create.isPending}
            onClick={() => { setErrors([]); create.mutate() }}
            sx={{ fontWeight: 900, borderRadius: '10px', bgcolor: palette.brand,
                  '&:hover': { bgcolor: palette.brandDeep } }}
          >
            {create.isPending ? 'Saving…' : `${editing ? 'Add' : 'Create'} ${rows.length} ${rows.length === 1 ? 'space' : 'spaces'}`}
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

/** "12 chairs, 2 tables" — what a room kind puts in each room. */
function describeContents(room: RoomKind): string {
  const parts: string[] = []
  if (room.beds) parts.push(`${room.beds} bed${room.beds > 1 ? 's' : ''}`)
  for (const c of room.contents ?? []) parts.push(`${c.count} ${c.label.toLowerCase()}`)
  return parts.length ? `each has ${parts.join(', ')}` : ''
}
