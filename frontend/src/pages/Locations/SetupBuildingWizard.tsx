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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, FormControlLabel, Stack, Step, StepLabel, Stepper,
  TextField, Typography,
} from '@mui/material'
import { toast } from 'react-toastify'
import { bulkImportLocations, type BulkLocationRow } from '@/api/locations'
import { palette } from '@/theme/palette'

/** A kind of room, with the clinical use and default size the tree needs. */
interface RoomKind {
  key: string
  label: string
  prefix: string
  spaceUse: string
  type?: string
  beds?: number
  criticality?: string
}

/**
 * What a hospital department is made of.
 *
 * The room kinds under each are what that department ordinarily contains, so
 * the third step offers Radiology an X-ray room and a CT suite rather than a
 * list of every space type in the building.
 */
interface DeptKind {
  key: string
  label: string
  prefix: string
  rooms: RoomKind[]
}

const DEPARTMENTS: DeptKind[] = [
  {
    key: 'surgery', label: 'Surgery', prefix: 'SUR', rooms: [
      { key: 'or', label: 'Operating rooms', prefix: 'OR', spaceUse: 'operating_room', criticality: 'critical' },
      { key: 'proc', label: 'Procedure rooms', prefix: 'PROC', spaceUse: 'procedure_room', criticality: 'high' },
      { key: 'recovery', label: 'Recovery bays', prefix: 'PACU', spaceUse: 'patient_room', beds: 1, criticality: 'high' },
      { key: 'sterile', label: 'Sterile store', prefix: 'STS', spaceUse: 'storage' },
    ],
  },
  {
    key: 'radiology', label: 'Radiology', prefix: 'RAD', rooms: [
      { key: 'xray', label: 'X-ray rooms', prefix: 'XR', spaceUse: 'imaging', criticality: 'high' },
      { key: 'ct', label: 'CT suites', prefix: 'CT', spaceUse: 'imaging', criticality: 'high' },
      { key: 'mri', label: 'MRI suites', prefix: 'MRI', spaceUse: 'imaging', criticality: 'high' },
      { key: 'us', label: 'Ultrasound rooms', prefix: 'US', spaceUse: 'imaging' },
      { key: 'reporting', label: 'Reporting rooms', prefix: 'RPT', spaceUse: 'office' },
    ],
  },
  {
    key: 'critical', label: 'Critical Care', prefix: 'CC', rooms: [
      { key: 'icu', label: 'ICU bays', prefix: 'ICU', spaceUse: 'icu', beds: 1, criticality: 'critical' },
      { key: 'nicu', label: 'NICU bays', prefix: 'NICU', spaceUse: 'nicu', beds: 1, criticality: 'critical' },
      { key: 'aiir', label: 'Isolation rooms', prefix: 'AIIR', spaceUse: 'aiir', beds: 1, criticality: 'critical' },
    ],
  },
  {
    key: 'emergency', label: 'Emergency', prefix: 'ED', rooms: [
      { key: 'bay', label: 'Treatment bays', prefix: 'ED', spaceUse: 'emergency', beds: 1, criticality: 'critical' },
      { key: 'triage', label: 'Triage rooms', prefix: 'TRI', spaceUse: 'emergency', criticality: 'high' },
      { key: 'resus', label: 'Resuscitation rooms', prefix: 'RES', spaceUse: 'emergency', beds: 1, criticality: 'critical' },
    ],
  },
  {
    key: 'wards', label: 'Inpatient Wards', prefix: 'WRD', rooms: [
      { key: 'patient', label: 'Patient rooms', prefix: 'PR', spaceUse: 'patient_room', beds: 2, criticality: 'high' },
      { key: 'nurse', label: 'Nurse stations', prefix: 'NS', spaceUse: 'office' },
      { key: 'clean', label: 'Clean utility', prefix: 'CU', spaceUse: 'storage' },
      { key: 'dirty', label: 'Dirty utility', prefix: 'DU', spaceUse: 'storage' },
    ],
  },
  {
    key: 'laboratory', label: 'Laboratory', prefix: 'LAB', rooms: [
      { key: 'lab', label: 'Laboratories', prefix: 'LAB', spaceUse: 'laboratory', criticality: 'high' },
      { key: 'specimen', label: 'Specimen reception', prefix: 'SPC', spaceUse: 'laboratory' },
    ],
  },
  {
    key: 'pharmacy', label: 'Pharmacy', prefix: 'PHA', rooms: [
      { key: 'dispensary', label: 'Dispensary', prefix: 'PH', spaceUse: 'pharmacy', criticality: 'high' },
      { key: 'cleanroom', label: 'Compounding cleanroom', prefix: 'CR', spaceUse: 'pharmacy', criticality: 'critical' },
      { key: 'store', label: 'Drug store', prefix: 'DS', spaceUse: 'storage', criticality: 'high' },
    ],
  },
  {
    key: 'spd', label: 'Sterile Processing', prefix: 'SPD', rooms: [
      { key: 'decon', label: 'Decontamination', prefix: 'DEC', spaceUse: 'sterile_processing', criticality: 'high' },
      { key: 'assembly', label: 'Assembly and packing', prefix: 'ASM', spaceUse: 'sterile_processing', criticality: 'high' },
      { key: 'sterile', label: 'Sterile store', prefix: 'SS', spaceUse: 'storage', criticality: 'high' },
    ],
  },
  {
    key: 'dialysis', label: 'Dialysis', prefix: 'DIA', rooms: [
      { key: 'station', label: 'Dialysis stations', prefix: 'DIA', spaceUse: 'dialysis', beds: 1, criticality: 'high' },
      { key: 'water', label: 'Water treatment', prefix: 'WTR', spaceUse: 'mechanical', criticality: 'high' },
    ],
  },
  {
    key: 'it', label: 'IT and Communications', prefix: 'IT', rooms: [
      { key: 'data', label: 'Data centre', prefix: 'DC', spaceUse: 'data', criticality: 'critical' },
      { key: 'comms', label: 'Comms rooms', prefix: 'COM', spaceUse: 'data', criticality: 'critical' },
      { key: 'office', label: 'IT offices', prefix: 'ITO', spaceUse: 'office' },
    ],
  },
  {
    key: 'admin', label: 'Administration', prefix: 'ADM', rooms: [
      { key: 'office', label: 'Offices', prefix: 'OFF', spaceUse: 'office' },
      { key: 'meeting', label: 'Meeting rooms', prefix: 'MTG', spaceUse: 'office' },
      { key: 'records', label: 'Records store', prefix: 'REC', spaceUse: 'storage' },
    ],
  },
  {
    key: 'public', label: 'Public Areas', prefix: 'PUB', rooms: [
      { key: 'reception', label: 'Reception', prefix: 'REC', spaceUse: 'public' },
      { key: 'waiting', label: 'Waiting areas', prefix: 'WAI', spaceUse: 'public' },
      { key: 'cafe', label: 'Catering', prefix: 'CAF', spaceUse: 'kitchen' },
    ],
  },
  {
    key: 'plant', label: 'Plant and Services', prefix: 'PLT', rooms: [
      { key: 'mech', label: 'Mechanical rooms', prefix: 'MR', spaceUse: 'mechanical', type: 'mech_room', criticality: 'high' },
      { key: 'elec', label: 'Electrical rooms', prefix: 'ER', spaceUse: 'electrical', criticality: 'critical' },
      { key: 'store', label: 'Stores and workshop', prefix: 'WKS', spaceUse: 'storage' },
    ],
  },
]

interface FloorSpec {
  code: string
  name: string
  depts: string[]
  /** Keyed `${deptKey}:${roomKey}` so a count belongs to one floor's department. */
  counts: Record<string, number>
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Basement, ground, then levels — how a building is actually numbered. */
function defaultFloors(buildingCode: string, above: number, below: number): FloorSpec[] {
  const floors: FloorSpec[] = []
  for (let i = below; i >= 1; i -= 1) {
    floors.push({ code: `${buildingCode}-B${i}`, name: i === 1 ? 'Basement' : `Basement ${i}`,
                  depts: [], counts: {} })
  }
  for (let i = 0; i < above; i += 1) {
    floors.push({
      code: `${buildingCode}-${pad(i)}`,
      name: i === 0 ? 'Ground Floor' : `Level ${i}`,
      depts: [], counts: {},
    })
  }
  return floors
}

const STEPS = ['Floors', 'What is on each floor', 'Rooms', 'Review']

export default function SetupBuildingWizard({
  open, onClose, facilityId, building, onCreated,
}: {
  open: boolean
  onClose: () => void
  facilityId: number
  building: { id: number; code: string; name?: string | null }
  onCreated: () => void
}) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState(0)
  const [above, setAbove] = useState('4')
  const [below, setBelow] = useState('1')
  const [floors, setFloors] = useState<FloorSpec[]>([])
  const [errors, setErrors] = useState<string[]>([])

  const buildFloors = () => {
    setFloors(defaultFloors(building.code, Math.max(0, Number(above) || 0),
                            Math.max(0, Number(below) || 0)))
    setStep(1)
  }

  const toggleDept = (floorCode: string, deptKey: string) =>
    setFloors((rows) => rows.map((f) => {
      if (f.code !== floorCode) return f
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
    setFloors((rows) => rows.map((f) =>
      f.code === floorCode ? { ...f, counts: { ...f.counts, [key]: value } } : f))

  /** The whole structure, as rows the import endpoint understands. */
  const rows = useMemo<BulkLocationRow[]>(() => {
    const out: BulkLocationRow[] = []
    for (const floor of floors) {
      out.push({
        parent_code: building.code, location_type: 'floor',
        code: floor.code, name: floor.name,
      } as BulkLocationRow)

      for (const deptKey of floor.depts) {
        const dept = DEPARTMENTS.find((d) => d.key === deptKey)
        if (!dept) continue
        // The department is a wing so it is a node you can open, not a label.
        const deptCode = `${floor.code}-${dept.prefix}`
        out.push({
          parent_code: floor.code, location_type: 'wing',
          code: deptCode, name: dept.label,
        } as BulkLocationRow)

        for (const room of dept.rooms) {
          const count = floor.counts[`${deptKey}:${room.key}`] ?? 0
          for (let i = 1; i <= count; i += 1) {
            const code = `${room.prefix}-${floor.code.split('-').pop()}${pad(i)}`
            out.push({
              parent_code: deptCode,
              location_type: room.type ?? 'room',
              code,
              name: `${room.label.replace(/s$/, '')} ${i}`,
              space_use: room.spaceUse,
              criticality: room.criticality ?? null,
              bed_count: room.beds ?? null,
            } as BulkLocationRow)
            for (let b = 0; b < (room.beds ?? 0); b += 1) {
              out.push({
                parent_code: code, location_type: 'bed',
                code: `${code}-${String.fromCharCode(65 + b)}`,
                name: `Bed ${String.fromCharCode(65 + b)}`,
              } as BulkLocationRow)
            }
          }
        }
      }
    }
    return out
  }, [floors, building.code])

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
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth
            PaperProps={{ sx: { borderRadius: '18px' } }}>
      <DialogTitle sx={{ fontWeight: 900, color: palette.ink, pb: 1 }}>
        Set up {building.name || building.code}
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
              How many floors does this building have?
            </Typography>
            <Stack direction="row" spacing={2}>
              <TextField
                size="small" type="number" label="Floors above ground" value={above}
                onChange={(e) => setAbove(e.target.value)} sx={{ width: 200 }}
                helperText="Ground counts as one"
              />
              <TextField
                size="small" type="number" label="Basement levels" value={below}
                onChange={(e) => setBelow(e.target.value)} sx={{ width: 180 }}
              />
            </Stack>
            <Typography sx={{ mt: 2, fontSize: 12.5, color: palette.textMuted, fontWeight: 600 }}>
              You can rename any of them on the next step.
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
                    {DEPARTMENTS.map((dept) => {
                      const on = floor.depts.includes(dept.key)
                      return (
                        <Chip
                          key={dept.key} size="small" label={dept.label} clickable
                          onClick={() => toggleDept(floor.code, dept.key)}
                          sx={{
                            height: 26, fontWeight: 800, fontSize: 11.5,
                            bgcolor: on ? palette.brand : palette.surfaceFaint,
                            color: on ? palette.white : palette.textSubtle,
                            '&:hover': { bgcolor: on ? palette.brandDeep : palette.brandTint },
                          }}
                        />
                      )
                    })}
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
                      const dept = DEPARTMENTS.find((d) => d.key === deptKey)!
                      return (
                        <Box key={deptKey} sx={{ p: 1.5, borderRadius: '12px',
                                                 border: `1px solid ${palette.borderSoft}` }}>
                          <Typography sx={{ mb: 1, fontWeight: 900, fontSize: 13,
                                            color: palette.ink }}>
                            {dept.label}
                          </Typography>
                          <Box sx={{ display: 'grid', gap: 1,
                                     gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
                            {dept.rooms.map((room) => (
                              <TextField
                                key={room.key} size="small" type="number"
                                label={room.label}
                                value={floor.counts[`${deptKey}:${room.key}`] ?? 0}
                                onChange={(e) => setCount(
                                  floor.code, `${deptKey}:${room.key}`,
                                  Math.max(0, Number(e.target.value) || 0),
                                )}
                                helperText={room.beds ? `${room.beds} bed${room.beds > 1 ? 's' : ''} each` : ' '}
                              />
                            ))}
                          </Box>
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
              This will create {rows.length} spaces
            </Typography>
            <Stack direction="row" spacing={1.5} sx={{ mb: 2, flexWrap: 'wrap', gap: 1.5 }}>
              {[
                ['Floors', counts.floors], ['Departments', counts.depts],
                ['Rooms', counts.rooms], ['Beds', counts.beds],
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
                    const dept = DEPARTMENTS.find((d) => d.key === deptKey)!
                    const total = dept.rooms.reduce(
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
            {create.isPending ? 'Creating…' : `Create ${rows.length} spaces`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
