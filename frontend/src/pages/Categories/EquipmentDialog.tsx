/**
 * Add or edit one piece of equipment in a category.
 *
 * Name, type and building are all that is required. Where exactly it is is
 * typed, not picked from a building set-up, and places already used at the site
 * are suggested so "Main block" is spelled the same way every time.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment,
  MenuItem, TextField, Typography,
} from '@mui/material'
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined'
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded'
import { toast } from 'react-toastify'
import {
  addCategoryEquipment, deleteCategoryEquipment, errorMessage, fetchPlaceSuggestions, fetchValuePreview,
  formatMoney, updateCategoryEquipment, type CategoryCode, type CategoryEquipment, type Condition,
  type ValuePreview,
} from '@/api/siteCategories'
import { CATEGORIES, CONDITION_STYLE } from '@/config/siteCategories'
import { palette } from '@/theme/palette'

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ mt: 2.25 }}>
      <Typography sx={{ mb: 1.1, fontSize: 11, fontWeight: 900, letterSpacing: 0.5,
                        textTransform: 'uppercase', color: palette.textSubtle }}>
        {title}
      </Typography>
      {children}
    </Box>
  )
}

/** A text field that suggests what has been typed before but accepts anything. */
export function Suggesting({ label, value, onChange, options, required, placeholder, autoFocus }: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
  required?: boolean
  placeholder?: string
  autoFocus?: boolean
}) {
  return (
    <Autocomplete
      freeSolo size="small" options={options} inputValue={value}
      onInputChange={(_, next) => onChange(next)}
      renderInput={(params) => (
        <TextField {...params} label={label} required={required} placeholder={placeholder} autoFocus={autoFocus} />
      )}
    />
  )
}

/**
 * What the figures come to: the total when there are several, book value today
 * and yearly depreciation, and - once it has a history - what keeping it has cost.
 */
function ValueSummary({ count, unitCost, inService, preview, item }: {
  count: number
  unitCost: number | null
  inService: string | null
  preview?: ValuePreview
  item?: CategoryEquipment | null
}) {
  const line = (label: string, value: string, strong = false) => (
    <Typography component="span" sx={{ fontSize: 13, color: palette.textMuted, fontWeight: 700, mr: 2, whiteSpace: 'nowrap' }}>
      {label}{' '}
      <Box component="span" sx={{ color: strong ? palette.ink : palette.textStrong, fontWeight: 900 }}>{value}</Box>
    </Typography>
  )
  const hint = unitCost == null
    ? 'Enter a cost to see its book value.'
    : !inService ? 'Add the date it went into service to start depreciation.'
      : preview?.message ?? null
  return (
    <Box sx={{ mt: 1.5, p: 1.5, borderRadius: '12px', bgcolor: palette.surfaceFaint, border: `1px solid ${palette.borderSoft}` }}>
      {count > 1 && unitCost != null && (
        <Box>{line('Total', `${count} × ${formatMoney(unitCost)} = ${formatMoney(unitCost * count)}`)}</Box>
      )}
      {hint ? (
        <Typography sx={{ fontSize: 13, color: palette.textMuted, fontWeight: 600 }}>{hint}</Typography>
      ) : (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', rowGap: 0.5 }}>
          {line('Book value today', formatMoney(preview?.book_value ?? null), true)}
          {line('Depreciates', `${formatMoney(preview?.annual_depreciation ?? null)} a year`)}
        </Box>
      )}
      {item && (
        <Box sx={{ mt: 0.75, display: 'flex', flexWrap: 'wrap', rowGap: 0.5 }}>
          {line('Maintenance spend', formatMoney(item.maintenance_spend))}
          {Number(item.improvements) > 0 && line('Major work', formatMoney(item.improvements))}
          {line('Cost of ownership', formatMoney(item.cost_of_ownership))}
        </Box>
      )}
      {item?.consider_replacing && (
        <Alert severity="warning" icon={<WarningAmberRoundedIcon fontSize="small" />}
               sx={{ mt: 1, py: 0, borderRadius: '10px', fontWeight: 700, fontSize: 12.5 }}>
          Maintenance spend is {item.spend_percent_of_cost}% of the purchase cost. Consider pricing a replacement.
        </Alert>
      )}
    </Box>
  )
}

export default function EquipmentDialog({
  facilityId, category, types, defaultLife, item, canDelete, onClose,
}: {
  facilityId: number
  category: CategoryCode
  types: string[]
  /** Useful life offered for new equipment in this category. */
  defaultLife: number
  /** Editing when given, adding when not. */
  item?: CategoryEquipment | null
  canDelete: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const editing = Boolean(item)
  const [code, setCode] = useState<CategoryCode>(item?.category ?? category)
  const [name, setName] = useState(item?.name ?? '')
  const [type, setType] = useState(item?.type ?? '')
  const [building, setBuilding] = useState(item?.building ?? '')
  const [floor, setFloor] = useState(item?.floor ?? '')
  const [spot, setSpot] = useState(item?.spot ?? '')
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 1))
  const [condition, setCondition] = useState<Condition>(item?.condition ?? 'working')
  const [make, setMake] = useState(item?.make ?? '')
  const [model, setModel] = useState(item?.model ?? '')
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [unitCost, setUnitCost] = useState(item?.unit_cost != null ? String(Number(item.unit_cost)) : '')
  const [inService, setInService] = useState(item?.in_service_on ?? '')
  const [life, setLife] = useState(String(item?.useful_life_years != null ? Number(item.useful_life_years) : defaultLife))
  const [confirmDelete, setConfirmDelete] = useState(false)

  // The value is worked out by the same engine as Assets & Value, a moment
  // after typing stops, so the form never shows a figure the ledger disagrees with.
  const figures = {
    unit_cost: unitCost === '' ? null : Number(unitCost),
    quantity: Math.max(1, Math.floor(Number(quantity)) || 1),
    in_service_on: inService || null,
    useful_life_years: life === '' ? null : Number(life),
    equipment_id: item?.id ?? null,
  }
  const [settled, setSettled] = useState(figures)
  const figuresKey = JSON.stringify(figures)
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(JSON.parse(figuresKey)), 350)
    return () => window.clearTimeout(timer)
  }, [figuresKey])
  const { data: preview } = useQuery({
    queryKey: ['value-preview', settled],
    queryFn: () => fetchValuePreview(settled),
    enabled: settled.unit_cost != null,
    placeholderData: (previous) => previous,
  })

  const { data: places } = useQuery({
    queryKey: ['place-suggestions', facilityId],
    queryFn: () => fetchPlaceSuggestions(facilityId),
    staleTime: 60_000,
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['category-equipment'] })
    queryClient.invalidateQueries({ queryKey: ['category-overview'] })
    queryClient.invalidateQueries({ queryKey: ['place-suggestions'] })
    queryClient.invalidateQueries({ queryKey: ['equipment'] })
  }

  const count = Math.floor(Number(quantity))
  const costValid = unitCost === '' || Number(unitCost) >= 0
  const lifeValid = life === '' || (Number(life) > 0 && Number(life) <= 100)
  const ready = name.trim() && type.trim() && building.trim() && count >= 1 && costValid && lifeValid

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(), type: type.trim(), building: building.trim(),
        floor: floor.trim() || null, spot: spot.trim() || null,
        quantity: count, condition,
        make: make.trim() || null, model: model.trim() || null, notes: notes.trim() || null,
        unit_cost: figures.unit_cost, in_service_on: figures.in_service_on,
        useful_life_years: figures.useful_life_years,
      }
      return item
        ? updateCategoryEquipment(item.id, { ...payload, category: code })
        : addCategoryEquipment(category, facilityId, payload)
    },
    onSuccess: (saved) => {
      toast.success(item ? `${saved.name} saved` : `${saved.name} added · ${saved.asset_tag}`)
      refresh()
      onClose()
    },
    onError: (e) => toast.error(errorMessage(e, 'Could not save the equipment')),
  })

  const remove = useMutation({
    mutationFn: () => deleteCategoryEquipment(item!.id),
    onSuccess: () => {
      toast.success(`${item!.name} removed`)
      refresh()
      onClose()
    },
    onError: (e) => {
      setConfirmDelete(false)
      toast.error(errorMessage(e, 'Could not remove the equipment'))
    },
  })

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '18px', maxWidth: 640 } }}>
      <DialogTitle sx={{ fontWeight: 900, color: palette.ink, pb: 1 }}>
        {editing ? 'Edit equipment' : 'Add equipment'}
        <Typography component="span" sx={{ ml: 1, fontSize: 13, fontWeight: 800, color: palette.textFaint }}>
          {editing ? item!.asset_tag : CATEGORIES.find((c) => c.code === category)?.name}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'grid', gap: 1.75, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
          <TextField
            size="small" label="Name" required autoFocus value={name}
            onChange={(e) => setName(e.target.value)} placeholder="Generator 1"
          />
          <Suggesting label="Type" required value={type} onChange={setType} options={types}
                      placeholder="Pick or type your own" />
          {editing && (
            <TextField
              select size="small" label="Category" value={code}
              onChange={(e) => setCode(e.target.value as CategoryCode)}
              helperText={code !== item!.category ? 'It will move to this category' : ' '}
            >
              {CATEGORIES.map((c) => <MenuItem key={c.code} value={c.code}>{c.name}</MenuItem>)}
            </TextField>
          )}
        </Box>

        <Section title="Where is it?">
          <Box sx={{ display: 'grid', gap: 1.75, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
            <Suggesting label="Building" required value={building} onChange={setBuilding}
                        options={places?.buildings ?? []} placeholder="Main block" />
            <Suggesting label="Floor" value={floor} onChange={setFloor}
                        options={places?.floors ?? []} placeholder="Basement" />
          </Box>
          <Box sx={{ mt: 1.75 }}>
            <Suggesting label="Room / exact spot" value={spot} onChange={setSpot}
                        options={places?.spots ?? []} placeholder="Plant room 2, north wall" />
          </Box>
        </Section>

        <Section title="Details">
          <Box sx={{ display: 'grid', gap: 1.75, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
            <TextField
              size="small" type="number" label="Quantity" required value={quantity}
              onChange={(e) => setQuantity(e.target.value)} onFocus={(e) => e.target.select()}
              inputProps={{ min: 1 }}
            />
            <TextField
              select size="small" label="Status" value={condition}
              onChange={(e) => setCondition(e.target.value as Condition)}
            >
              {(Object.keys(CONDITION_STYLE) as Condition[]).map((key) => (
                <MenuItem key={key} value={key}>{CONDITION_STYLE[key].label}</MenuItem>
              ))}
            </TextField>
            <TextField size="small" label="Make" value={make} onChange={(e) => setMake(e.target.value)}
                       placeholder="Optional" />
            <TextField size="small" label="Model" value={model} onChange={(e) => setModel(e.target.value)}
                       placeholder="Optional" />
          </Box>
        </Section>

        <Section title="Cost & value">
          <Box sx={{ display: 'grid', gap: 1.75, gridTemplateColumns: { xs: '1fr', sm: '1.2fr 1.2fr 1fr' } }}>
            <TextField
              size="small" type="number" label={count > 1 ? 'Cost of one item' : 'Purchase cost'}
              value={unitCost} onChange={(e) => setUnitCost(e.target.value)} error={!costValid}
              inputProps={{ min: 0, step: '0.01' }}
              InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
            />
            <TextField
              size="small" type="date" label="In service since" InputLabelProps={{ shrink: true }}
              value={inService} onChange={(e) => setInService(e.target.value)}
            />
            <TextField
              size="small" type="number" label="Useful life" value={life} error={!lifeValid}
              onChange={(e) => setLife(e.target.value)} inputProps={{ min: 1, max: 100 }}
              InputProps={{ endAdornment: <InputAdornment position="end">years</InputAdornment> }}
            />
          </Box>
          <ValueSummary
            count={count} unitCost={figures.unit_cost} inService={figures.in_service_on}
            preview={figures.unit_cost != null ? preview : undefined} item={item}
          />
          {item && (
            <Button
              size="small" startIcon={<AccountBalanceOutlinedIcon />}
              onClick={() => { onClose(); navigate(`/assets?asset=${item.id}`) }}
              sx={{ mt: 1, fontWeight: 800, textTransform: 'none', color: palette.brand }}
            >
              View asset & value history
            </Button>
          )}
        </Section>

        <TextField
          sx={{ mt: 2.25 }} fullWidth size="small" multiline minRows={2}
          label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        {editing && canDelete && (
          confirmDelete ? (
            <Button
              color="error" disabled={remove.isPending} onClick={() => remove.mutate()}
              sx={{ fontWeight: 900, mr: 'auto' }}
            >
              {remove.isPending ? 'Removing…' : 'Yes, remove it'}
            </Button>
          ) : (
            <Button color="error" onClick={() => setConfirmDelete(true)} sx={{ fontWeight: 800, mr: 'auto' }}>
              Remove
            </Button>
          )
        )}
        <Button onClick={onClose} sx={{ fontWeight: 800, color: palette.textMuted }}>Cancel</Button>
        <Button
          variant="contained" disabled={!ready || save.isPending} onClick={() => save.mutate()}
          sx={{ fontWeight: 900, borderRadius: '10px', bgcolor: palette.brand, '&:hover': { bgcolor: palette.brandDeep },
                '&.Mui-disabled': { bgcolor: palette.surfaceMuted, color: palette.textFaint } }}
        >
          {save.isPending ? 'Saving…' : editing ? 'Save' : 'Add equipment'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
