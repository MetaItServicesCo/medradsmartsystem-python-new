/**
 * Define a kind of room: what it is called, what it is used for, and what
 * each one contains.
 *
 * This used to ask for "Beds in each", which assumed every room is a ward. A
 * conference room contains chairs, tables and a display; an office contains
 * desks; a theatre contains sockets and gas outlets. So the question is now
 * what each room contains, and beds are one possible answer among many.
 *
 * Every choice here accepts something typed. The lists are the common case, not
 * a boundary, and a hospital is not obliged to be common.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Alert, Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, IconButton, MenuItem, Stack, TextField, Typography,
} from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { fetchDisciplines } from '@/api/disciplines'
import { fetchFixtureCatalog } from '@/api/fixtures'
import { palette } from '@/theme/palette'
import { prefixFrom, sameItemName, type RoomContent, type RoomKind } from './wizardModel'

/** The pseudo-item that means "bed spaces", not a fixture. */
const BEDS = '__beds__'

interface ItemOption {
  value: string
  label: string
  group: string
}

const keyFrom = (label: string) =>
  label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

interface Row {
  item: ItemOption | string | null
  count: string
  trade: string
}

export default function RoomTypeDialog({
  initial, existingRooms = 0, spaceUses, existingPrefixes, onCancel, onSave,
}: {
  /** An existing kind to edit, or undefined to define a new one. */
  initial?: RoomKind
  /** How many rooms of this kind are already in the register. */
  existingRooms?: number
  spaceUses: Array<{ value: string; label: string }>
  existingPrefixes: Set<string>
  onCancel: () => void
  onSave: (room: RoomKind) => void
}) {
  const editing = Boolean(initial)
  const [label, setLabel] = useState(initial?.label ?? '')
  const [spaceUse, setSpaceUse] = useState<string>(initial?.spaceUse ?? 'office')

  const { data: catalog } = useQuery({
    queryKey: ['fixture-catalog'], queryFn: fetchFixtureCatalog, staleTime: 30 * 60_000,
  })
  const { data: disciplines } = useQuery({
    queryKey: ['disciplines'], queryFn: fetchDisciplines, staleTime: 30 * 60_000,
  })

  const options = useMemo<ItemOption[]>(() => [
    { value: BEDS, label: 'Beds', group: 'Bed spaces' },
    ...(catalog?.types ?? []).map((t) => ({
      value: t.key, label: t.label, group: t.discipline.replace(/_/g, ' '),
    })),
  ], [catalog])
  const tradeName = (value: string) => {
    const code = catalog?.types.find((t) => t.key === value)?.discipline
    return disciplines?.items.find((d) => d.code === code)?.name ?? code?.replace(/_/g, ' ') ?? ''
  }

  const byValue = useMemo(() => new Map(options.map((o) => [o.value, o])), [options])

  // Existing contents come back as rows, beds first since they are the
  // difference between a ward and everything else.
  const [rows, setRows] = useState<Row[]>(() => {
    const seed: Row[] = []
    if (initial?.beds) seed.push({ item: { value: BEDS, label: 'Beds', group: 'Bed spaces' },
                                   count: String(initial.beds), trade: '' })
    for (const c of initial?.contents ?? []) {
      seed.push({
        item: c.disciplineCode ? c.label : { value: c.fixtureType, label: c.label, group: '' },
        count: String(c.count), trade: c.disciplineCode ?? '',
      })
    }
    return seed.length ? seed : [{ item: null, count: '1', trade: '' }]
  })

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)))

  // The typed-in version of an option counts as that option, so "Chairs" picks
  // the catalogued Chair rather than creating a second, custom kind of chair.
  const resolve = (item: Row['item']): ItemOption | null => {
    if (!item) return null
    if (typeof item !== 'string') return item
    return options.find((o) => sameItemName(item, o.label, o.value === BEDS ? undefined : o.value))
      ?? null
  }

  const isCustom = (item: Row['item']) =>
    typeof item === 'string' && item.trim().length > 0 && !resolve(item)

  const prefix = label.trim() ? (initial?.prefix ?? prefixFrom(label, existingPrefixes)) : ''

  const save = () => {
    let beds = 0
    const contents: RoomContent[] = []
    // Custom items get a prefix of their own, so "Ceiling speaker" and
    // "Ceiling light" are CSPE-01 and CLIG-01 rather than sharing one sequence.
    const codesTaken = new Set((catalog?.types ?? []).map((t) => t.prefix))
    const customPrefix = (name: string) => {
      const words = name.replace(/[^A-Za-z ]/g, ' ').trim().split(/\s+/).filter(Boolean)
      const base = (words.length > 1 ? words[0][0] + words[1].slice(0, 3) : (words[0] ?? 'ITEM').slice(0, 4))
        .toUpperCase() || 'ITEM'
      let candidate = base
      for (let n = 2; codesTaken.has(candidate); n += 1) candidate = `${base}${n}`
      codesTaken.add(candidate)
      return candidate
    }
    for (const row of rows) {
      const count = Math.max(0, Number(row.count) || 0)
      if (!row.item || count === 0) continue
      const known = resolve(row.item)
      if (known?.value === BEDS) { beds += count; continue }
      if (known) {
        contents.push({ fixtureType: known.value, label: known.label, count })
      } else if (typeof row.item === 'string' && row.trade) {
        const name = row.item.trim()
        contents.push({
          fixtureType: keyFrom(name), label: name, count,
          disciplineCode: row.trade, prefix: customPrefix(name),
        })
      }
    }
    onSave({
      key: initial?.key ?? `custom-${Date.now()}`,
      label: label.trim(),
      prefix,
      spaceUse: spaceUse.trim() || 'other',
      type: initial?.type,
      criticality: initial?.criticality,
      beds,
      contents,
    })
  }

  // A custom item without a trade cannot be saved: nothing would know who to
  // send when it breaks.
  const missingTrade = rows.some((r) => isCustom(r.item) && !r.trade)
  const knownUse = spaceUses.some((u) => u.value === spaceUse || u.label === spaceUse)
  const renamed = editing && label.trim() !== initial!.label

  return (
    <Dialog open onClose={onCancel} maxWidth="sm" fullWidth
            PaperProps={{ sx: { borderRadius: '16px' } }}>
      <DialogTitle sx={{ fontWeight: 900, color: palette.ink, pb: 0.5 }}>
        {editing ? `Edit ${initial!.label}` : 'Add a room type'}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField
            autoFocus size="small" label="What are these rooms called" required
            value={label} onChange={(e) => setLabel(e.target.value)}
            placeholder="Conference rooms"
            helperText={renamed && existingRooms
              ? `New rooms get this name. The ${existingRooms} already there keep theirs; rename those on the room itself.`
              : (prefix ? `Codes start ${prefix}-` : ' ')}
          />

          <Autocomplete
            freeSolo size="small"
            options={spaceUses.map((u) => u.label)}
            value={spaceUses.find((u) => u.value === spaceUse)?.label ?? spaceUse}
            onChange={(_, v) => {
              const match = spaceUses.find((u) => u.label === v)
              setSpaceUse(match ? match.value : (v ?? ''))
            }}
            onInputChange={(_, v, reason) => { if (reason === 'input') setSpaceUse(v) }}
            renderInput={(params) => (
              <TextField
                {...params} label="What is it used for"
                helperText={knownUse || !spaceUse
                  ? 'Listed uses carry air, pressure and power rules'
                  : 'Your own use is recorded, but carries no building rules'}
              />
            )}
          />

          <Divider textAlign="left">
            <Typography sx={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.4,
                              textTransform: 'uppercase', color: palette.textSubtle }}>
              What each room contains
            </Typography>
          </Divider>

          {existingRooms > 0 && (
            <Alert severity="info" sx={{ borderRadius: '12px', py: 0.25 }}>
              {existingRooms === 1 ? '1 of these rooms already exists' : `${existingRooms} of these rooms already exist`}.
              Saving the setup tops each one up to these quantities. Nothing is removed,
              and a room that already has enough is left as it is.
            </Alert>
          )}

          {rows.map((row, i) => {
            const custom = isCustom(row.item)
            const known = resolve(row.item)
            return (
              <Box key={i}>
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <Autocomplete
                    freeSolo size="small" sx={{ flex: 1 }}
                    options={options}
                    groupBy={(o) => (typeof o === 'string' ? '' : o.group)}
                    getOptionLabel={(o) => (typeof o === 'string' ? o : o.label)}
                    value={row.item}
                    isOptionEqualToValue={(o, v) =>
                      typeof o !== 'string' && typeof v !== 'string' && o.value === v.value}
                    onChange={(_, v) => setRow(i, { item: v })}
                    onInputChange={(_, v, reason) => { if (reason === 'input') setRow(i, { item: v }) }}
                    renderInput={(params) => (
                      <TextField {...params} label="Item" placeholder="Chairs, tables, a display…" />
                    )}
                  />
                  <TextField
                    size="small" type="number" label="Quantity" value={row.count}
                    onChange={(e) => setRow(i, { count: e.target.value })}
                    onFocus={(e) => e.target.select()}
                    inputProps={{ min: 0, max: 200 }}
                    helperText="in each room"
                    sx={{ width: 120 }}
                  />
                  <IconButton size="small" sx={{ mt: 0.5, color: palette.textFaint }}
                              onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                    <DeleteOutlineIcon sx={{ fontSize: 19 }} />
                  </IconButton>
                </Stack>
                {custom && (
                  <TextField
                    select size="small" label="Which trade maintains it" required
                    value={row.trade} onChange={(e) => setRow(i, { trade: e.target.value })}
                    sx={{ mt: 1, width: '60%' }}
                    helperText="Not in the catalogue, so say who gets sent when it breaks"
                  >
                    {(disciplines?.items ?? []).map((d) => (
                      <MenuItem key={d.code} value={d.code}>{d.name}</MenuItem>
                    ))}
                  </TextField>
                )}
                {known && known.value !== BEDS && (
                  <Typography sx={{ mt: 0.5, fontSize: 11.5, color: palette.textFaint }}>
                    From the catalogue: {known.label}
                    {tradeName(known.value) ? ` · faults go to ${tradeName(known.value)}` : ''}
                  </Typography>
                )}
                {known?.value === BEDS && (
                  <Typography sx={{ mt: 0.5, fontSize: 11.5, color: palette.textFaint }}>
                    Beds become spaces of their own, with a status of occupied or available.
                    {existingRooms > 0 && ' They are added to new rooms only.'}
                  </Typography>
                )}
              </Box>
            )
          })}

          <Button size="small" onClick={() => setRows([...rows, { item: null, count: '1', trade: '' }])}
                  sx={{ alignSelf: 'flex-start', fontWeight: 800 }}>
            + Add an item
          </Button>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onCancel} sx={{ fontWeight: 800, color: palette.textMuted }}>Cancel</Button>
        <Button
          variant="contained" disabled={!label.trim() || missingTrade} onClick={save}
          sx={{ fontWeight: 900, borderRadius: '10px' }}
        >
          {editing ? 'Save' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
