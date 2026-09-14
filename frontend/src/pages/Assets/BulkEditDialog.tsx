/**
 * Set the same details on many assets: cost, in-service date, make, model, trade.
 *
 * Built for the invoice that arrives after the building setup: 120 chairs, one
 * price. Blank fields are left alone, and nothing is applied until the preview
 * has said, per field, how many will change, how many already match, and which
 * are skipped and why — so the number on the button is the number that happens.
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, CircularProgress, Collapse, Dialog, DialogActions, DialogContent,
  DialogTitle, InputAdornment, MenuItem, Stack, TextField, Typography,
} from '@mui/material'
import { toast } from 'react-toastify'
import { fetchDisciplines } from '@/api/disciplines'
import {
  bulkUpdateAssets, type AssetBulkChanges, type AssetBulkResult, type AssetSelection,
} from '@/api/equipment'
import { palette } from '@/theme/palette'

const errorText = (e: any, fallback: string) => {
  const detail = e?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg).replace(/^Value error, /, '')
  return fallback
}

const money = (v: unknown) =>
  `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

export default function BulkEditDialog({ selection, count, onClose, onDone }: {
  selection: AssetSelection
  /** How many assets the selection covers, as the register counted them. */
  count: number
  onClose: () => void
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [cost, setCost] = useState('')
  const [installed, setInstalled] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [trade, setTrade] = useState<number | ''>('')
  const [openSkipped, setOpenSkipped] = useState<string | null>(null)

  const { data: disciplines } = useQuery({
    queryKey: ['disciplines'], queryFn: fetchDisciplines, staleTime: 30 * 60_000,
  })
  const tradeName = (id: unknown) => disciplines?.items.find((d) => d.id === id)?.name ?? String(id)

  const changes = useMemo<AssetBulkChanges>(() => {
    const out: AssetBulkChanges = {}
    if (cost.trim() !== '' && Number(cost) >= 0) out.cost = Number(cost)
    if (installed) out.installation_date = installed
    if (make.trim()) out.make = make.trim()
    if (model.trim()) out.model = model.trim()
    if (trade !== '') out.discipline_id = trade
    return out
  }, [cost, installed, make, model, trade])
  const hasChanges = Object.keys(changes).length > 0

  // Preview as the form settles, not on every keystroke.
  const [settled, setSettled] = useState(changes)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(changes), 350)
    return () => clearTimeout(timer)
  }, [changes])
  const previewCurrent = JSON.stringify(settled) === JSON.stringify(changes)

  const preview = useQuery({
    queryKey: ['asset-bulk-preview', selection, settled],
    queryFn: () => bulkUpdateAssets({ selection, changes: settled, dry_run: true }),
    enabled: Object.keys(settled).length > 0,
    staleTime: 0,
    retry: false,
  })

  const apply = useMutation({
    mutationFn: () => bulkUpdateAssets({ selection, changes, dry_run: false }),
    onSuccess: (res: AssetBulkResult) => {
      toast.success(res.assets_changed === 1 ? '1 asset updated' : `${res.assets_changed} assets updated`)
      queryClient.invalidateQueries({ queryKey: ['equipment'] })
      queryClient.invalidateQueries({ queryKey: ['asset-ledger'] })
      onDone()
    },
    onError: (e: any) => toast.error(errorText(e, 'Could not update the assets')),
  })

  const shown = (field: string, value: unknown) =>
    field === 'cost' ? money(value) : field === 'discipline_id' ? tradeName(value) : String(value)

  const result = preview.data
  const ready = hasChanges && previewCurrent && !!result && !preview.isFetching && result.assets_changed > 0

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
      <DialogTitle sx={{ fontWeight: 900, color: palette.ink, pb: 0.5 }}>
        Set details on {count === 1 ? '1 asset' : `${count} assets`}
      </DialogTitle>
      <DialogContent>
        <Typography sx={{ mb: 2, fontSize: 12.5, color: palette.textMuted }}>
          Fill in only what you want to set. Anything left blank stays as it is on each asset.
        </Typography>

        <Box sx={{ display: 'grid', gap: 1.75, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
          <TextField
            size="small" type="number" label="Purchase cost, each" value={cost}
            onChange={(e) => setCost(e.target.value)} inputProps={{ min: 0, step: '0.01' }}
            InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
          />
          <TextField
            size="small" type="date" label="In service since" value={installed}
            onChange={(e) => setInstalled(e.target.value)} InputLabelProps={{ shrink: true }}
            helperText="Depreciation counts from here"
          />
          <TextField size="small" label="Make" value={make} onChange={(e) => setMake(e.target.value)} />
          <TextField size="small" label="Model" value={model} onChange={(e) => setModel(e.target.value)} />
          <TextField
            select size="small" label="Trade" value={trade}
            onChange={(e) => setTrade(e.target.value === '' ? '' : Number(e.target.value))}
            helperText="Who gets sent when one breaks"
          >
            <MenuItem value="">Leave as it is</MenuItem>
            {(disciplines?.items ?? []).map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
          </TextField>
        </Box>

        <Box sx={{ mt: 2.25, minHeight: 64 }}>
          {!hasChanges && (
            <Typography sx={{ fontSize: 12.5, color: palette.textFaint }}>
              A preview of what will change appears here.
            </Typography>
          )}
          {hasChanges && (preview.isFetching || !previewCurrent) && (
            <Stack direction="row" spacing={1} alignItems="center">
              <CircularProgress size={16} />
              <Typography sx={{ fontSize: 12.5, color: palette.textMuted }}>Checking…</Typography>
            </Stack>
          )}
          {hasChanges && previewCurrent && preview.isError && (
            <Alert severity="error" sx={{ borderRadius: '12px' }}>
              {errorText(preview.error, 'Could not check this change')}
            </Alert>
          )}
          {hasChanges && previewCurrent && result && !preview.isFetching && (
            <Stack spacing={1}>
              {result.fields.map((f) => (
                <Box key={f.field} sx={{ p: 1.25, borderRadius: '12px', border: `1px solid ${palette.borderSoft}` }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 800, color: palette.ink }}>
                    {f.label} → {shown(f.field, f.value)}
                  </Typography>
                  <Typography sx={{ fontSize: 12.5, color: palette.textMuted }}>
                    <b>{f.will_change}</b> will change
                    {f.unchanged > 0 && <> · {f.unchanged} already {f.unchanged === 1 ? 'has' : 'have'} it</>}
                    {f.skipped_count > 0 && (
                      <>
                        {' · '}
                        <Box
                          component="button" type="button"
                          onClick={() => setOpenSkipped(openSkipped === f.field ? null : f.field)}
                          sx={{ border: 0, p: 0, bgcolor: 'transparent', cursor: 'pointer', font: 'inherit',
                                color: palette.warningDeep, fontWeight: 800 }}
                        >
                          {f.skipped_count} skipped
                        </Box>
                      </>
                    )}
                  </Typography>
                  <Collapse in={openSkipped === f.field}>
                    <Box sx={{ mt: 0.75 }}>
                      {f.skipped.map((s) => (
                        <Typography key={s.id} sx={{ fontSize: 12, color: palette.textSubtle }}>
                          <b>{s.asset_tag}</b>: {s.reason}
                        </Typography>
                      ))}
                      {f.skipped_count > f.skipped.length && (
                        <Typography sx={{ fontSize: 12, color: palette.textFaint }}>
                          and {f.skipped_count - f.skipped.length} more
                        </Typography>
                      )}
                    </Box>
                  </Collapse>
                </Box>
              ))}
              {result.assets_changed === 0 && (
                <Typography sx={{ fontSize: 12.5, color: palette.textMuted }}>
                  Nothing to change: every selected asset already has these details or is skipped.
                </Typography>
              )}
            </Stack>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} sx={{ fontWeight: 800, color: palette.textMuted }}>Cancel</Button>
        <Button
          variant="contained" disabled={!ready || apply.isPending} onClick={() => apply.mutate()}
          sx={{ fontWeight: 900, borderRadius: '10px', bgcolor: palette.brand,
                '&:hover': { bgcolor: palette.brandDeep } }}
        >
          {apply.isPending
            ? 'Updating…'
            : result && ready
              ? `Apply to ${result.assets_changed} ${result.assets_changed === 1 ? 'asset' : 'assets'}`
              : 'Apply'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
