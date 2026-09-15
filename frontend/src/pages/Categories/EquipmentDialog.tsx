/**
 * Add or edit one piece of equipment in a category.
 *
 * Name, type and building are all that is required. Where exactly it is is
 * typed, not picked from a building set-up, and places already used at the site
 * are suggested so "Main block" is spelled the same way every time.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem,
  TextField, Typography,
} from '@mui/material'
import { toast } from 'react-toastify'
import {
  addCategoryEquipment, deleteCategoryEquipment, errorMessage, fetchPlaceSuggestions,
  updateCategoryEquipment, type CategoryCode, type CategoryEquipment, type Condition,
} from '@/api/siteCategories'
import { CATEGORIES, CONDITION_STYLE } from '@/config/siteCategories'
import { palette } from '@/theme/palette'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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
function Suggesting({ label, value, onChange, options, required, placeholder, autoFocus }: {
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

export default function EquipmentDialog({
  facilityId, category, types, item, canDelete, onClose,
}: {
  facilityId: number
  category: CategoryCode
  types: string[]
  /** Editing when given, adding when not. */
  item?: CategoryEquipment | null
  canDelete: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
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
  const [confirmDelete, setConfirmDelete] = useState(false)

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
  const ready = name.trim() && type.trim() && building.trim() && count >= 1

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(), type: type.trim(), building: building.trim(),
        floor: floor.trim() || null, spot: spot.trim() || null,
        quantity: count, condition,
        make: make.trim() || null, model: model.trim() || null, notes: notes.trim() || null,
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
          <TextField
            sx={{ mt: 1.75 }} fullWidth size="small" multiline minRows={2}
            label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)}
          />
        </Section>
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
