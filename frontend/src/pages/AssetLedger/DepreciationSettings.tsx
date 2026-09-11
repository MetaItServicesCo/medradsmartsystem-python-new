/**
 * The five inputs a depreciation schedule is computed from, made editable.
 *
 * The schedule was being rendered from values that nothing in the application
 * could set — the columns existed, the API accepted them, and no form asked
 * for them. So every asset depreciated on defaults and the answer to "how do I
 * change this?" was that you could not.
 *
 * It sits beside the schedule rather than in a settings screen because the
 * numbers only mean anything next to their effect: changing useful life from
 * ten years to fifteen should visibly redraw the table underneath.
 */
import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Box, Button, Collapse, Divider, MenuItem, TextField, Tooltip, Typography,
} from '@mui/material'
import TuneIcon from '@mui/icons-material/Tune'
import { toast } from 'react-toastify'
import { updateEquipment } from '@/api/equipment'
import { palette } from '@/theme/palette'

export interface DepreciationInputs {
  cost: string | number | null
  salvage_value: string | number | null
  useful_life_years: string | number | null
  depreciation_method: string | null
  total_expected_units: string | number | null
  installation_date: string | null
  acquisition_date: string | null
}

const METHODS = [
  { value: 'straight_line', label: 'Straight line',
    hint: 'Equal charge every year. The default for most plant and the easiest to defend.' },
  { value: 'declining_balance', label: 'Declining balance',
    hint: 'A fixed percentage of the falling book value. Heavier early, never quite reaches zero.' },
  { value: 'double_declining', label: 'Double declining',
    hint: 'Twice the straight-line rate against book value. For assets that lose most value early.' },
  { value: 'sum_of_years_digits', label: 'Sum of years digits',
    hint: 'Accelerated, but on a fixed schedule that does reach salvage.' },
  { value: 'units_of_production', label: 'Units of production',
    hint: 'Charged by use rather than time. Needs total expected units — good for generators by runtime hour.' },
  { value: 'none', label: 'Do not depreciate',
    hint: 'Land, or anything expensed rather than capitalised.' },
]

const asText = (v: unknown) => (v === null || v === undefined ? '' : String(v))

export default function DepreciationSettings({
  equipmentId, current, canEdit,
}: {
  equipmentId: number
  current: DepreciationInputs
  canEdit: boolean
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const [form, setForm] = useState({
    cost: asText(current.cost),
    salvage_value: asText(current.salvage_value),
    useful_life_years: asText(current.useful_life_years),
    depreciation_method: current.depreciation_method || 'straight_line',
    total_expected_units: asText(current.total_expected_units),
    // The service takes installation date first and falls back to acquisition,
    // so that is the field to offer: editing acquisition would look like it
    // should move the schedule and then not.
    installation_date: current.installation_date || current.acquisition_date || '',
  })

  // The panel stays mounted while you switch assets, so it has to follow.
  useEffect(() => {
    setForm({
      cost: asText(current.cost),
      salvage_value: asText(current.salvage_value),
      useful_life_years: asText(current.useful_life_years),
      depreciation_method: current.depreciation_method || 'straight_line',
      total_expected_units: asText(current.total_expected_units),
      installation_date: current.installation_date || current.acquisition_date || '',
    })
  }, [equipmentId, current])

  const save = useMutation({
    mutationFn: () => updateEquipment(equipmentId, {
      cost: form.cost === '' ? null : Number(form.cost),
      salvage_value: form.salvage_value === '' ? null : Number(form.salvage_value),
      useful_life_years: form.useful_life_years === '' ? null : Number(form.useful_life_years),
      depreciation_method: form.depreciation_method,
      total_expected_units: form.total_expected_units === '' ? null : Number(form.total_expected_units),
      installation_date: form.installation_date || null,
    } as any),
    onSuccess: () => {
      toast.success('Depreciation settings saved')
      queryClient.invalidateQueries({ queryKey: ['asset-ledger'] })
      queryClient.invalidateQueries({ queryKey: ['fleet-valuation'] })
      queryClient.invalidateQueries({ queryKey: ['equipment'] })
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.detail || 'Could not save depreciation settings'),
  })

  const method = METHODS.find((m) => m.value === form.depreciation_method)
  const needsUnits = form.depreciation_method === 'units_of_production'
  const inert = form.depreciation_method === 'none'

  // Named so the empty state says which input is missing. "No schedule" on its
  // own sends people looking for a bug in the calculation.
  const missing = [
    !form.cost && 'purchase cost',
    !form.installation_date && 'in-service date',
    !inert && !form.useful_life_years && 'useful life',
    needsUnits && !form.total_expected_units && 'total expected units',
  ].filter(Boolean) as string[]

  return (
    <Box sx={{ borderBottom: `1px solid ${palette.borderSoft}` }}>
      <Box
        onClick={() => setOpen((v) => !v)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.4,
          cursor: 'pointer', '&:hover': { bgcolor: palette.brandTint },
        }}
      >
        <TuneIcon sx={{ fontSize: 18, color: palette.brand }} />
        <Typography sx={{ fontWeight: 800, color: palette.ink, fontSize: 14 }}>
          Depreciation settings
        </Typography>
        <Typography sx={{ color: palette.textMuted, fontSize: 12.5, fontWeight: 600 }}>
          {method?.label}
          {!inert && form.useful_life_years ? ` · ${form.useful_life_years} years` : ''}
        </Typography>
        <Box sx={{ flex: 1 }} />
        {missing.length > 0 && (
          <Typography sx={{ color: palette.warningDeep, fontSize: 12, fontWeight: 800 }}>
            Needs {missing.join(', ')}
          </Typography>
        )}
        <Typography sx={{ color: palette.brand, fontSize: 12.5, fontWeight: 800 }}>
          {open ? 'Hide' : 'Edit'}
        </Typography>
      </Box>

      <Collapse in={open} unmountOnExit>
        <Box sx={{ px: 2, pb: 2 }}>
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' } }}>
            <TextField
              select size="small" label="Method" value={form.depreciation_method}
              onChange={(e) => setForm({ ...form, depreciation_method: e.target.value })}
              disabled={!canEdit}
            >
              {METHODS.map((m) => (
                <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
              ))}
            </TextField>

            <Tooltip title="What it cost to buy and install. The schedule starts here.">
              <TextField
                size="small" type="number" label="Purchase cost" value={form.cost}
                onChange={(e) => setForm({ ...form, cost: e.target.value })}
                disabled={!canEdit}
              />
            </Tooltip>

            <Tooltip title="The date it entered service. Depreciation is counted in completed months from here, not from the invoice date.">
              <TextField
                size="small" type="date" label="In-service date"
                InputLabelProps={{ shrink: true }}
                value={form.installation_date}
                onChange={(e) => setForm({ ...form, installation_date: e.target.value })}
                disabled={!canEdit}
              />
            </Tooltip>

            <Tooltip title="What it will still be worth at the end of its life. Depreciation never takes book value below this.">
              <TextField
                size="small" type="number" label="Salvage value" value={form.salvage_value}
                onChange={(e) => setForm({ ...form, salvage_value: e.target.value })}
                disabled={!canEdit || inert}
              />
            </Tooltip>

            <TextField
              size="small" type="number" label="Useful life (years)"
              value={form.useful_life_years}
              onChange={(e) => setForm({ ...form, useful_life_years: e.target.value })}
              disabled={!canEdit || inert}
              helperText={!form.useful_life_years ? 'Defaults by trade if left empty' : ' '}
            />

            {needsUnits && (
              <Tooltip title="Total lifetime output — runtime hours for a generator, cycles for a lift.">
                <TextField
                  size="small" type="number" label="Total expected units"
                  value={form.total_expected_units}
                  onChange={(e) => setForm({ ...form, total_expected_units: e.target.value })}
                  disabled={!canEdit}
                />
              </Tooltip>
            )}
          </Box>

          {method?.hint && (
            <Typography sx={{ mt: 1.5, color: palette.textMuted, fontSize: 12.5, fontWeight: 600 }}>
              {method.hint}
            </Typography>
          )}

          <Divider sx={{ my: 1.75 }} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography sx={{ flex: 1, color: palette.textMuted, fontSize: 12, fontWeight: 600 }}>
              Improvements posted to the ledger adjust the schedule on top of this — these are
              the opening terms, not the final word.
            </Typography>
            <Button size="small" onClick={() => setOpen(false)} sx={{ fontWeight: 800, color: palette.textMuted }}>
              Cancel
            </Button>
            <Button
              size="small" variant="contained" disabled={!canEdit || save.isPending}
              onClick={() => save.mutate()}
              sx={{ fontWeight: 900, bgcolor: palette.brand, '&:hover': { bgcolor: palette.brandDeep } }}
            >
              {save.isPending ? 'Saving…' : 'Save settings'}
            </Button>
          </Box>
        </Box>
      </Collapse>
    </Box>
  )
}
