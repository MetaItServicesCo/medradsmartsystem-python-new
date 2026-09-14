/**
 * Add fixtures to a space by counting them, not by filling in a form each.
 *
 * Two things were wrong with the first version, both visible the first time
 * anybody used it.
 *
 * The specification opened empty. Defaults were applied only when the type
 * was *changed*, so the type selected on open — a receptacle — arrived with no
 * branch, no voltage and no amperage, and every one of those is a field the
 * catalogue knows a sensible value for.
 *
 * And nothing could be said that the catalogue had not anticipated. Branch and
 * NEMA configuration were closed lists, the fixture type was a closed list,
 * and there was nowhere to record a detail the spec did not ask for. A real
 * building has an L14-30R receptacle, a 277 V lighting circuit, a sump pump.
 * So every choice now accepts your own value, the type can be one the
 * catalogue does not know, and any fixture can carry extra details.
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Alert, Autocomplete, Box, Button, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, FormControlLabel, IconButton, MenuItem, Stack, Switch,
  TextField, Typography,
} from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { toast } from 'react-toastify'
import { fetchDisciplines } from '@/api/disciplines'
import { bulkCreateFixtures, type FixtureType, type SpecField } from '@/api/fixtures'
import { palette } from '@/theme/palette'
import { TRADE_LABEL } from './SpaceContents'

const CUSTOM = '__custom__'

const defaultsOf = (type?: FixtureType) => Object.fromEntries(
  (type?.spec ?? [])
    .filter((f) => f.default !== undefined)
    .map((f) => [f.key, f.default as unknown]),
)

/** A key safe to store in the spec: "Lamp colour temp" -> "lamp_colour_temp". */
const keyFrom = (label: string) =>
  label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

export default function AddFixturesDialog({
  open, onClose, locationId, locationName, types, loadError, onAdded,
}: {
  open: boolean
  onClose: () => void
  locationId: number
  locationName: string
  types: FixtureType[]
  loadError: boolean
  onAdded: () => void
}) {
  const [typeKey, setTypeKey] = useState(types[0]?.key || '')
  const [count, setCount] = useState('1')
  const [label, setLabel] = useState('')
  const [circuitRef, setCircuitRef] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [model, setModel] = useState('')
  const [serials, setSerials] = useState('')
  const [spec, setSpec] = useState<Record<string, unknown>>(() => defaultsOf(types[0]))
  // Details the catalogue did not ask for. Stored alongside the spec.
  const [extras, setExtras] = useState<Array<{ label: string; value: string }>>([])
  // A type the catalogue does not know.
  const [customName, setCustomName] = useState('')
  const [customTrade, setCustomTrade] = useState('')
  const [customPrefix, setCustomPrefix] = useState('')

  const { data: disciplines } = useQuery({
    queryKey: ['disciplines'],
    queryFn: fetchDisciplines,
    staleTime: 30 * 60_000,
  })

  // The catalogue loads asynchronously, so the dialog can open before it has
  // arrived. When it does, select the first type and load its defaults, rather
  // than leaving an empty form that looks like it has nothing to say.
  useEffect(() => {
    if (!typeKey && types.length) {
      setTypeKey(types[0].key)
      setSpec(defaultsOf(types[0]))
    }
  }, [types, typeKey])

  const isCustom = typeKey === CUSTOM
  const selected = types.find((t) => t.key === typeKey)

  const chooseType = (key: string) => {
    setTypeKey(key)
    setSpec(key === CUSTOM ? {} : defaultsOf(types.find((t) => t.key === key)))
  }

  const customKey = keyFrom(customName)
  const effectivePrefix = isCustom
    ? (customPrefix.trim() || customKey.slice(0, 4)).toUpperCase()
    : selected?.prefix

  const save = useMutation({
    mutationFn: () => {
      const extraSpec = Object.fromEntries(
        extras.filter((e) => e.label.trim() && e.value.trim())
          .map((e) => [keyFrom(e.label), e.value.trim()]),
      )
      return bulkCreateFixtures({
        location_id: locationId,
        fixture_type: isCustom ? customKey : typeKey,
        count: Math.max(1, Number(count) || 1),
        label: label || null,
        circuit_ref: circuitRef || null,
        manufacturer: manufacturer || null,
        model: model || null,
        serial_numbers: serials.trim() ? serials.split('\n').map((s) => s.trim()) : null,
        spec: { ...spec, ...extraSpec },
        ...(isCustom ? { discipline_code: customTrade, code_prefix: effectivePrefix } : {}),
      } as any)
    },
    onSuccess: (res) => {
      toast.success(`Added ${res.total} ${isCustom ? customName.toLowerCase() : selected?.label.toLowerCase() ?? 'fixtures'}`)
      onAdded()
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Could not add'),
  })

  const grouped = useMemo(() => {
    const out: Record<string, FixtureType[]> = {}
    for (const t of types) (out[t.discipline] ||= []).push(t)
    return Object.entries(out)
  }, [types])

  const ready = isCustom ? Boolean(customKey && customTrade) : Boolean(typeKey)

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth
            PaperProps={{ sx: { borderRadius: '18px' } }}>
      <DialogTitle sx={{ fontWeight: 900, color: palette.ink }}>
        Add fixtures to {locationName}
      </DialogTitle>
      <DialogContent dividers>
        {loadError && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: '12px', fontWeight: 700 }}>
            Could not load the fixture catalogue. You can still add a fixture of
            your own type below.
          </Alert>
        )}

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
            <Divider />
            <MenuItem value={CUSTOM} sx={{ fontWeight: 800, color: palette.brand }}>
              Something not in this list…
            </MenuItem>
          </TextField>

          {isCustom && (
            <Box sx={{ p: 1.5, borderRadius: '12px', bgcolor: palette.brandTint,
                       display: 'grid', gap: 1.5,
                       gridTemplateColumns: { xs: '1fr', sm: '2fr 1.4fr 1fr' } }}>
              <TextField size="small" label="What is it called" required value={customName}
                         onChange={(e) => setCustomName(e.target.value)}
                         placeholder="Sump pump" />
              <TextField select size="small" label="Which trade maintains it" required
                         value={customTrade} onChange={(e) => setCustomTrade(e.target.value)}
                         helperText="Routes its faults">
                {(disciplines?.items ?? []).map((d) => (
                  <MenuItem key={d.code} value={d.code}>{d.name}</MenuItem>
                ))}
              </TextField>
              <TextField size="small" label="Code prefix" value={customPrefix}
                         onChange={(e) => setCustomPrefix(e.target.value.toUpperCase())}
                         placeholder={customKey.slice(0, 4).toUpperCase() || 'SUMP'} />
            </Box>
          )}

          <Stack direction="row" spacing={1.5}>
            <TextField
              size="small" type="number" label="How many" value={count}
              onChange={(e) => setCount(e.target.value)} sx={{ width: 130 }}
              helperText={effectivePrefix ? `${effectivePrefix}-01 onward` : ' '}
            />
            <TextField
              size="small" label="Where in the space (optional)" value={label}
              onChange={(e) => setLabel(e.target.value)} fullWidth
              placeholder="head of bed, anaesthesia side"
            />
          </Stack>

          {!isCustom && selected && selected.spec.length > 0 && (
            <>
              <SectionTitle>Specification</SectionTitle>
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

          <SectionTitle>More details (optional)</SectionTitle>
          <Stack spacing={1}>
            {extras.map((row, i) => (
              <Stack key={i} direction="row" spacing={1}>
                <TextField size="small" label="Detail" value={row.label} sx={{ flex: 1 }}
                           placeholder="Colour temperature"
                           onChange={(e) => setExtras(extras.map((x, j) =>
                             j === i ? { ...x, label: e.target.value } : x))} />
                <TextField size="small" label="Value" value={row.value} sx={{ flex: 1 }}
                           placeholder="4000 K"
                           onChange={(e) => setExtras(extras.map((x, j) =>
                             j === i ? { ...x, value: e.target.value } : x))} />
                <IconButton size="small" onClick={() => setExtras(extras.filter((_, j) => j !== i))}
                            sx={{ color: palette.textFaint }}>
                  <DeleteOutlineIcon sx={{ fontSize: 19 }} />
                </IconButton>
              </Stack>
            ))}
            <Button size="small" onClick={() => setExtras([...extras, { label: '', value: '' }])}
                    sx={{ alignSelf: 'flex-start', fontWeight: 800, color: palette.brand }}>
              + Add a detail
            </Button>
          </Stack>

          <SectionTitle>Identity (optional)</SectionTitle>
          <Stack direction="row" spacing={1.5}>
            <TextField size="small" label="Manufacturer" value={manufacturer}
                       onChange={(e) => setManufacturer(e.target.value)} fullWidth />
            <TextField size="small" label="Model" value={model}
                       onChange={(e) => setModel(e.target.value)} fullWidth />
          </Stack>
          <TextField size="small" label="Circuit or feed (optional)" value={circuitRef}
                     onChange={(e) => setCircuitRef(e.target.value)}
                     placeholder="EM-3 / breaker 14" />
          <TextField
            size="small" label="Serial numbers" value={serials} multiline minRows={2}
            onChange={(e) => setSerials(e.target.value)} fullWidth
            placeholder={'One per line, in order.\nFewer than the count is fine.'}
            helperText="The first line belongs to the first fixture, and so on."
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} sx={{ fontWeight: 800, color: palette.textMuted }}>Cancel</Button>
        <Button
          variant="contained" disabled={!ready || save.isPending}
          onClick={() => save.mutate()}
          sx={{ fontWeight: 900, borderRadius: '10px' }}
        >
          {save.isPending ? 'Adding…' : `Add ${Math.max(1, Number(count) || 1)}`}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Divider textAlign="left">
      <Typography sx={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.4,
                        textTransform: 'uppercase', color: palette.textSubtle }}>
        {children}
      </Typography>
    </Divider>
  )
}

/**
 * One spec field. Choices are suggestions, not a fence: pick one of the listed
 * values or type your own, because the list is the common case and the
 * building in front of you is not obliged to be common.
 */
function SpecInput({ field, value, onChange }: {
  field: SpecField
  value: unknown
  onChange: (v: unknown) => void
}) {
  if (field.type === 'boolean') {
    return (
      <FormControlLabel
        control={<Switch size="small" checked={Boolean(value)}
                         onChange={(e) => onChange(e.target.checked)} />}
        label={<Typography sx={{ fontSize: 13, fontWeight: 700 }}>{field.label}</Typography>}
      />
    )
  }
  if (field.type === 'select') {
    return (
      <Autocomplete
        freeSolo size="small" options={field.options ?? []}
        value={(value as string) ?? ''}
        onChange={(_, v) => onChange(v ?? '')}
        onInputChange={(_, v, reason) => { if (reason === 'input') onChange(v) }}
        renderInput={(params) => (
          <TextField {...params} label={field.label} helperText="Pick one or type your own" />
        )}
      />
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
