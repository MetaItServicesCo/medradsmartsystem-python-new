import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography,
} from '@mui/material'
import { toast } from 'react-toastify'
import { bulkCreateFixtures, type FixtureType, type SpecField } from '@/api/fixtures'
import { palette } from '@/theme/palette'
import { TRADE_LABEL } from './SpaceContents'

/** Inventory a room by counting, not by filling in a form per socket. */
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
        {loadError && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: '12px', fontWeight: 700 }}>
            Could not load the fixture catalogue, so there is nothing to choose
            from. The backend may not have been restarted since the fixtures
            migration was applied.
          </Alert>
        )}
        {!loadError && !types.length && (
          <Alert severity="info" sx={{ mb: 2, borderRadius: '12px', fontWeight: 700 }}>
            Still loading the catalogue.
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

