/**
 * What is in this room, and what is wrong with it.
 *
 * The panel this replaces showed eight tiles of database columns — space use,
 * direct children, everything beneath — which answer questions nobody standing
 * in a room asks. What they ask is "what is in here" and "how do I report that
 * one of them is broken", and neither had an answer anywhere in the product.
 *
 * Grouped by trade, because that is how the building is maintained and how the
 * ticket is routed: a receptacle is electrical, a diffuser is mechanical, a
 * scrub sink is plumbing.
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, FormControlLabel, IconButton, MenuItem, Stack, Switch,
  TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import BoltIcon from '@mui/icons-material/Bolt'
import ReportProblemIcon from '@mui/icons-material/ReportProblem'
import { toast } from 'react-toastify'
import {
  bulkCreateFixtures, fetchFixtureCatalog, fetchFixtures, reportFixtureFault,
  updateFixture, type Fixture, type FixtureType, type SpecField,
} from '@/api/fixtures'
import { palette } from '@/theme/palette'

const TRADE_LABEL: Record<string, string> = {
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

export default function RoomContents({
  locationId, locationName, canEdit,
}: {
  locationId: number
  locationName: string
  canEdit: boolean
}) {
  const queryClient = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [faultFor, setFaultFor] = useState<Fixture | null>(null)

  const { data: catalog } = useQuery({
    queryKey: ['fixture-catalog'],
    queryFn: fetchFixtureCatalog,
    staleTime: 30 * 60_000,
  })

  const { data, isLoading } = useQuery({
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
    return (
      <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress size={26} /></Box>
    )
  }

  return (
    <Box sx={{ p: 2.25 }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
        <Typography sx={{ fontWeight: 900, color: palette.ink, fontSize: 15 }}>
          {fixtures.length} {fixtures.length === 1 ? 'item' : 'items'} in this room
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
            sx={{ fontWeight: 900, borderRadius: '10px', bgcolor: palette.brand,
                  '&:hover': { bgcolor: palette.brandDeep } }}
          >
            Add fixtures
          </Button>
        )}
      </Stack>

      {!fixtures.length && (
        <Box sx={{ py: 5, textAlign: 'center' }}>
          <Typography sx={{ fontWeight: 800, color: palette.textMuted }}>
            Nothing recorded in this room yet.
          </Typography>
          <Typography sx={{ mt: 0.5, fontSize: 13, color: palette.textFaint, maxWidth: 460, mx: 'auto' }}>
            Add the sockets, lights, gas outlets and data ports that are in here.
            Once they are listed, anybody who finds one broken can raise a work
            order against it in one click, and it reaches the right trade without
            being asked which.
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
                        sx={{ height: 18, fontSize: 10, fontWeight: 800,
                              bgcolor: style.bg, color: style.color, textTransform: 'capitalize' }}
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
                      <IconButton
                        size="small" onClick={() => setFaultFor(f)}
                        sx={{ color: palette.danger }}
                      >
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

      {addOpen && catalog && (
        <AddFixturesDialog
          open={addOpen}
          onClose={() => setAddOpen(false)}
          locationId={locationId}
          locationName={locationName}
          types={catalog.types}
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

/** Inventory a room by counting, not by filling in a form per socket. */
function AddFixturesDialog({
  open, onClose, locationId, locationName, types, onAdded,
}: {
  open: boolean
  onClose: () => void
  locationId: number
  locationName: string
  types: FixtureType[]
  onAdded: () => void
}) {
  const [typeKey, setTypeKey] = useState(types[0]?.key || '')
  const [count, setCount] = useState('1')
  const [label, setLabel] = useState('')
  const [circuitRef, setCircuitRef] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [model, setModel] = useState('')
  const [serials, setSerials] = useState('')
  const [spec, setSpec] = useState<Record<string, unknown>>({})

  const selected = types.find((t) => t.key === typeKey)

  const chooseType = (key: string) => {
    setTypeKey(key)
    const next = types.find((t) => t.key === key)
    setSpec(Object.fromEntries(
      (next?.spec ?? [])
        .filter((f) => f.default !== undefined)
        .map((f) => [f.key, f.default as unknown]),
    ))
  }

  const save = useMutation({
    mutationFn: () => bulkCreateFixtures({
      location_id: locationId,
      fixture_type: typeKey,
      count: Math.max(1, Number(count) || 1),
      label: label || null,
      circuit_ref: circuitRef || null,
      manufacturer: manufacturer || null,
      model: model || null,
      // One serial per line, in the order the fixtures are created.
      serial_numbers: serials.trim()
        ? serials.split('\n').map((s) => s.trim())
        : null,
      spec,
    }),
    onSuccess: (res) => {
      toast.success(`Added ${res.total} ${selected?.label.toLowerCase() ?? 'fixtures'}`)
      onAdded()
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Could not add'),
  })

  const grouped = useMemo(() => {
    const out: Record<string, FixtureType[]> = {}
    for (const t of types) (out[t.discipline] ||= []).push(t)
    return Object.entries(out)
  }, [types])

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth
            PaperProps={{ sx: { borderRadius: '18px' } }}>
      <DialogTitle sx={{ fontWeight: 900, color: palette.ink }}>
        Add fixtures to {locationName}
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'grid', gap: 1.75 }}>
          <TextField select size="small" label="What are you adding" value={typeKey}
                     onChange={(e) => chooseType(e.target.value)} fullWidth>
            {grouped.map(([trade, items]) => [
              <MenuItem key={trade} disabled
                        sx={{ fontWeight: 900, fontSize: 11, opacity: 1,
                              color: palette.textSubtle, textTransform: 'uppercase' }}>
                {TRADE_LABEL[trade] || trade}
              </MenuItem>,
              ...items.map((t) => (
                <MenuItem key={t.key} value={t.key} sx={{ pl: 3 }}>{t.label}</MenuItem>
              )),
            ])}
          </TextField>

          <Stack direction="row" spacing={1.5}>
            <TextField
              size="small" type="number" label="How many" value={count}
              onChange={(e) => setCount(e.target.value)} sx={{ width: 130 }}
              helperText={selected ? `${selected.prefix}-01 onward` : ' '}
            />
            <TextField
              size="small" label="Where in the room (optional)" value={label}
              onChange={(e) => setLabel(e.target.value)} fullWidth
              placeholder="head of bed, anaesthesia side"
            />
          </Stack>

          {selected && selected.spec.length > 0 && (
            <>
              <Divider textAlign="left">
                <Typography sx={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.4,
                                  textTransform: 'uppercase', color: palette.textSubtle }}>
                  Specification
                </Typography>
              </Divider>
              <Box sx={{ display: 'grid', gap: 1.5,
                         gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
                {selected.spec.map((field) => (
                  <SpecInput
                    key={field.key} field={field} value={spec[field.key]}
                    onChange={(v) => setSpec({ ...spec, [field.key]: v })}
                  />
                ))}
              </Box>
            </>
          )}

          <Divider textAlign="left">
            <Typography sx={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.4,
                              textTransform: 'uppercase', color: palette.textSubtle }}>
              Identity (optional)
            </Typography>
          </Divider>
          <Stack direction="row" spacing={1.5}>
            <TextField size="small" label="Manufacturer" value={manufacturer}
                       onChange={(e) => setManufacturer(e.target.value)} fullWidth />
            <TextField size="small" label="Model" value={model}
                       onChange={(e) => setModel(e.target.value)} fullWidth />
          </Stack>
          <TextField
            size="small" label="Serial numbers" value={serials} multiline minRows={2}
            onChange={(e) => setSerials(e.target.value)} fullWidth
            placeholder={'One per line, in order.\nFewer than the count is fine.'}
            helperText="The first line belongs to the first fixture, and so on."
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} sx={{ fontWeight: 800, color: palette.textMuted }}>
          Cancel
        </Button>
        <Button
          variant="contained" disabled={!typeKey || save.isPending}
          onClick={() => save.mutate()}
          sx={{ fontWeight: 900, borderRadius: '10px', bgcolor: palette.brand,
                '&:hover': { bgcolor: palette.brandDeep } }}
        >
          {save.isPending ? 'Adding…' : `Add ${Math.max(1, Number(count) || 1)}`}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function SpecInput({ field, value, onChange }: {
  field: SpecField
  value: unknown
  onChange: (v: unknown) => void
}) {
  if (field.type === 'boolean') {
    return (
      <FormControlLabel
        control={
          <Switch size="small" checked={Boolean(value)}
                  onChange={(e) => onChange(e.target.checked)} />
        }
        label={<Typography sx={{ fontSize: 13, fontWeight: 700 }}>{field.label}</Typography>}
      />
    )
  }
  if (field.type === 'select') {
    return (
      <TextField select size="small" label={field.label}
                 value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)}>
        {(field.options ?? []).map((o) => (
          <MenuItem key={o} value={o} sx={{ textTransform: 'capitalize' }}>{o}</MenuItem>
        ))}
      </TextField>
    )
  }
  return (
    <TextField
      size="small"
      type={field.type === 'number' ? 'number' : 'text'}
      label={field.unit ? `${field.label} (${field.unit})` : field.label}
      value={(value as string | number) ?? ''}
      onChange={(e) => onChange(
        field.type === 'number'
          ? (e.target.value === '' ? null : Number(e.target.value))
          : e.target.value,
      )}
    />
  )
}

/**
 * One click from a broken socket to an assigned work order.
 *
 * The only question asked is what is wrong with it. The room, the trade, the
 * priority and the title are already known, and every extra field here is a
 * reason for the person who found it to tell somebody verbally instead.
 */
function ReportFaultDialog({ fixture, locationName, onClose, onReported }: {
  fixture: Fixture
  locationName: string
  onClose: () => void
  onReported: () => void
}) {
  const [description, setDescription] = useState('')
  const [closesRoom, setClosesRoom] = useState(false)

  const submit = useMutation({
    mutationFn: () => reportFixtureFault(fixture.id, {
      description,
      takes_out_of_service: closesRoom,
    }),
    onSuccess: (res) => {
      toast.success(`${res.request_number} raised`)
      onReported()
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Could not raise'),
  })

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth
            PaperProps={{ sx: { borderRadius: '18px' } }}>
      <DialogTitle sx={{ fontWeight: 900, color: palette.ink, pb: 0.5 }}>
        Report a fault
      </DialogTitle>
      <DialogContent>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <BoltIcon sx={{ fontSize: 18, color: palette.brand }} />
          <Box>
            <Typography sx={{ fontWeight: 900, color: palette.ink, fontSize: 14 }}>
              {fixture.code} · {locationName}
            </Typography>
            <Typography sx={{ fontSize: 12.5, color: palette.textMuted, fontWeight: 600 }}>
              {fixture.summary}
              {fixture.circuit_ref ? ` · ${fixture.circuit_ref}` : ''}
            </Typography>
          </Box>
        </Stack>

        <TextField
          autoFocus fullWidth size="small" multiline minRows={3}
          label="What is wrong with it?"
          value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="Dead — confirmed with a second device"
        />

        <FormControlLabel
          sx={{ mt: 1.5 }}
          control={
            <Switch size="small" checked={closesRoom}
                    onChange={(e) => setClosesRoom(e.target.checked)} />
          }
          label={
            <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
              This takes the whole room out of service
            </Typography>
          }
        />
        <Typography sx={{ fontSize: 11.5, color: palette.textFaint, ml: 5.5 }}>
          One dead socket of twelve usually does not. Leave this off unless the
          room genuinely cannot be used.
        </Typography>

        <Typography sx={{ mt: 2, fontSize: 12, color: palette.textMuted, fontWeight: 600 }}>
          Goes to {TRADE_LABEL[fixture.discipline_code || ''] || 'the right trade'} automatically.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} sx={{ fontWeight: 800, color: palette.textMuted }}>
          Cancel
        </Button>
        <Button
          variant="contained" disabled={description.trim().length < 3 || submit.isPending}
          onClick={() => submit.mutate()}
          sx={{ fontWeight: 900, borderRadius: '10px', bgcolor: palette.danger,
                '&:hover': { bgcolor: palette.dangerStrong } }}
        >
          {submit.isPending ? 'Raising…' : 'Raise work order'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
