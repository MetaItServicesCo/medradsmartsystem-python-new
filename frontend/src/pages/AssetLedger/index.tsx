/**
 * The asset ledger.
 *
 * Two views of the same estate: what it is all worth, and what has happened to
 * one particular thing. The fleet valuation leads because that is the number
 * somebody opens this page to find; the per-asset ledger is where they go once
 * a figure looks wrong.
 *
 * Everything on the timeline is derived from the tables that already own it —
 * service requests, inspections, compliance tasks, readings — so nothing here
 * can show a stale copy of a record that was edited elsewhere.
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Autocomplete, Box, Button, Card, Chip, CircularProgress, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider, LinearProgress, MenuItem,
  Stack, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Tabs, TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import BuildIcon from '@mui/icons-material/Build'
import EventAvailableIcon from '@mui/icons-material/EventAvailable'
import FactCheckIcon from '@mui/icons-material/FactCheck'
import InventoryIcon from '@mui/icons-material/Inventory2'
import PaymentsIcon from '@mui/icons-material/Payments'
import PlaceIcon from '@mui/icons-material/Place'
import ShieldIcon from '@mui/icons-material/Shield'
import ShowChartIcon from '@mui/icons-material/ShowChart'
import UndoIcon from '@mui/icons-material/Undo'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { toast } from 'react-toastify'

import {
  createLedgerEntry, fetchAssetLedger, fetchFleetValuation, fetchLedgerMeta,
  reverseLedgerEntry, type LedgerEntry, type TimelineEvent,
} from '@/api/assetLedger'
import { fetchEquipment } from '@/api/equipment'
import { useActiveFacility } from '@/hooks/useActiveFacility'
import DepreciationSettings from './DepreciationSettings'
import { hasPermission } from '@/config/permissions'
import { useAuthStore } from '@/stores/authStore'
import { palette } from '@/theme/palette'

const BRAND = palette.brand
const INK = palette.ink

const KIND_STYLE: Record<string, { bg: string; color: string; icon: JSX.Element }> = {
  // One hue per kind of event. Emerald is the brand, so it is reserved here for
  // planned work — the thing the system itself generates — and the money and
  // compliance events take the hues the brand vacated.
  acquisition: { bg: palette.violetTint, color: palette.violet, icon: <InventoryIcon sx={{ fontSize: 15 }} /> },
  // Lime, not green: emerald is now the brand and sits on 'preventive' two
  // rows below. Eighty degrees of hue between them beats twenty.
  installation: { bg: palette.limeTint, color: palette.lime, icon: <EventAvailableIcon sx={{ fontSize: 15 }} /> },
  warranty: { bg: palette.infoTint, color: palette.info, icon: <ShieldIcon sx={{ fontSize: 15 }} /> },
  service: { bg: palette.warningTint, color: palette.warning, icon: <BuildIcon sx={{ fontSize: 15 }} /> },
  preventive: { bg: palette.brandTint, color: palette.brandDeep, icon: <BuildIcon sx={{ fontSize: 15 }} /> },
  inspection: { bg: palette.cyanTint, color: palette.cyan, icon: <FactCheckIcon sx={{ fontSize: 15 }} /> },
  compliance: { bg: palette.indigoTint, color: palette.indigo, icon: <FactCheckIcon sx={{ fontSize: 15 }} /> },
  reading: { bg: palette.dangerTint, color: palette.danger, icon: <WarningAmberIcon sx={{ fontSize: 15 }} /> },
  financial: { bg: palette.surfaceMuted, color: palette.slate600, icon: <PaymentsIcon sx={{ fontSize: 15 }} /> },
  custody: { bg: palette.surfaceMuted, color: palette.slate600, icon: <PlaceIcon sx={{ fontSize: 15 }} /> },
  disposal: { bg: palette.dangerTint, color: palette.danger, icon: <UndoIcon sx={{ fontSize: 15 }} /> },
}

const humanise = (v?: string | null) =>
  v ? v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—'

const money = (value?: string | number | null) => {
  if (value === null || value === undefined || value === '') return '—'
  const n = Number(value)
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

export default function AssetLedgerPage() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  const [assetId, setAssetId] = useState<number | null>(null)
  const [tab, setTab] = useState(0)
  const [addOpen, setAddOpen] = useState(false)

  const canEdit = hasPermission(user, 'facility-inventory', 'edit')

  // The hospital is context, not a question asked on every screen.
  const { facilityId: effectiveFacilityId } = useActiveFacility()

  const { data: meta } = useQuery({ queryKey: ['ledger-meta'], queryFn: fetchLedgerMeta })

  const { data: valuation, isLoading: valuationLoading } = useQuery({
    queryKey: ['fleet-valuation', effectiveFacilityId],
    queryFn: () => fetchFleetValuation({ facility_id: effectiveFacilityId }),
    enabled: !!effectiveFacilityId,
  })

  const { data: assets } = useQuery({
    queryKey: ['equipment', 'for-ledger', effectiveFacilityId],
    queryFn: () => fetchEquipment({ facility_id: effectiveFacilityId, limit: 500 } as any),
    enabled: !!effectiveFacilityId,
  })

  const { data: ledger, isLoading: ledgerLoading } = useQuery({
    queryKey: ['asset-ledger', assetId],
    queryFn: () => fetchAssetLedger(assetId as number),
    enabled: !!assetId,
  })

  const assetOptions = ((assets as any)?.items || []) as any[]
  const selectedAsset = assetOptions.find((a) => a.id === assetId)

  const reverseMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => reverseLedgerEntry(id, reason),
    onSuccess: () => {
      toast.success('Reversing entry posted')
      queryClient.invalidateQueries({ queryKey: ['asset-ledger'] })
      queryClient.invalidateQueries({ queryKey: ['fleet-valuation'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Could not reverse'),
  })

  const dep = ledger?.summary.depreciation

  return (
    <Box className="page-enter" sx={{ width: '100%', minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between', gap: 1.5, mb: 2.5, flexDirection: { xs: 'column', sm: 'row' } }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" sx={{ fontWeight: 900, color: INK }}>Asset Ledger</Typography>
          <Typography sx={{ color: palette.textMuted, fontWeight: 700 }}>
            What it cost, what it is worth, and everything done to it
          </Typography>
        </Box>
      </Box>

      {/* ── Fleet valuation ──────────────────────────────────────────────── */}
      <Card sx={{ borderRadius: '22px', border: `1px solid ${palette.brandBorder}`, boxShadow: palette.shadowCard, mb: 2, overflow: 'hidden' }}>
        <Box sx={{ px: 2.25, py: 1.5, borderBottom: `1px solid ${palette.borderSoft}`, display: 'flex', alignItems: 'center', gap: 1 }}>
          <ShowChartIcon sx={{ color: BRAND, fontSize: 20 }} />
          <Typography sx={{ fontWeight: 900, color: INK, flex: 1 }}>Book value across the estate</Typography>
          {valuationLoading && <CircularProgress size={16} thickness={5} sx={{ color: BRAND }} />}
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' } }}>
          {[
            { label: 'Assets', value: valuation?.asset_count ?? 0, accent: INK, raw: true },
            { label: 'Original cost', value: money(valuation?.total_cost), accent: palette.info },
            { label: 'Accumulated depreciation', value: money(valuation?.accumulated_depreciation), accent: '#C2410C' },
            { label: 'Net book value', value: money(valuation?.net_book_value), accent: palette.success },
            {
              label: 'Fully depreciated',
              value: valuation?.fully_depreciated_count ?? 0,
              accent: palette.danger,
              raw: true,
              hint: 'Still in service with no book value left — replacements nobody has budgeted for',
            },
          ].map((stat, index) => (
            <Tooltip key={stat.label} title={(stat as any).hint || ''} placement="bottom">
              <Box sx={{ p: 2, borderRight: { md: index < 4 ? `1px solid ${palette.surfaceMuted}` : 'none' }, borderBottom: { xs: `1px solid ${palette.surfaceMuted}`, md: 'none' } }}>
                <Typography sx={{ fontSize: 11, fontWeight: 800, color: palette.textFaint, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  {stat.label}
                </Typography>
                <Typography sx={{ fontWeight: 900, fontSize: 22, color: stat.accent, lineHeight: 1.3 }}>
                  {(stat as any).raw ? Number(stat.value).toLocaleString() : stat.value}
                </Typography>
              </Box>
            </Tooltip>
          ))}
        </Box>

        {!!valuation && Object.keys(valuation.by_discipline).length > 0 && (
          <Box sx={{ px: 2.25, py: 1.5, borderTop: `1px solid ${palette.borderSoft}`, backgroundColor: '#FCFCFD' }}>
            <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75 }}>
              {Object.entries(valuation.by_discipline).map(([name, row]) => (
                <Chip
                  key={name}
                  label={`${name} · ${money(row.net_book_value)} (${row.asset_count})`}
                  size="small"
                  sx={{ height: 24, fontWeight: 800, fontSize: 11, borderRadius: '8px', backgroundColor: palette.white, border: `1px solid ${palette.border}`, color: palette.slate600 }}
                />
              ))}
            </Stack>
          </Box>
        )}
      </Card>

      {/* ── Per-asset ────────────────────────────────────────────────────── */}
      <Card sx={{ borderRadius: '22px', border: `1px solid ${palette.brandBorder}`, boxShadow: palette.shadowCard, overflow: 'hidden' }}>
        <Box sx={{ p: 1.75, borderBottom: `1px solid ${palette.borderSoft}`, display: 'flex', gap: 1.25, alignItems: 'center', flexWrap: 'wrap' }}>
          <Autocomplete
            size="small"
            sx={{ minWidth: 320, flex: 1 }}
            options={assetOptions}
            getOptionLabel={(o: any) => `${o.asset_tag} — ${o.make} ${o.model}`}
            onChange={(_, value: any) => setAssetId(value?.id ?? null)}
            renderInput={(params) => <TextField {...params} label="Find an asset" />}
          />
          {canEdit && assetId && (
            <Button
              variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}
              sx={{ minHeight: 40, background: palette.gradientBrand, borderRadius: '10px', px: 2.25, fontWeight: 900, whiteSpace: 'nowrap' }}
            >
              Post entry
            </Button>
          )}
        </Box>

        {!assetId && (
          <Box sx={{ p: 6, textAlign: 'center' }}>
            <InventoryIcon sx={{ fontSize: 46, color: palette.brandBorder, mb: 1 }} />
            <Typography sx={{ fontWeight: 800, color: INK }}>Select an asset</Typography>
            <Typography sx={{ fontSize: 13, color: palette.textMuted }}>
              Its whole life — acquisition, installation, every service visit, inspection
              and regulatory test — plus what it is worth today.
            </Typography>
          </Box>
        )}

        {assetId && ledgerLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={22} thickness={5} sx={{ color: BRAND }} />
          </Box>
        )}

        {assetId && ledger && dep && (
          <>
            {dep.message && (
              <Alert severity="info" sx={{ m: 2, borderRadius: '12px', fontWeight: 700 }}>
                {dep.message}
              </Alert>
            )}

            <Box sx={{ p: 2.25, display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.5 }}>
              {[
                { label: 'Original cost', value: money(dep.cost) },
                { label: 'Net book value', value: money(dep.net_book_value) },
                { label: 'Annual depreciation', value: money(dep.annual_depreciation) },
                { label: 'In service', value: ledger.summary.in_service_date || '—' },
                { label: 'Age', value: ledger.summary.age_months != null ? `${Math.floor(ledger.summary.age_months / 12)}y ${ledger.summary.age_months % 12}m` : '—' },
                { label: 'Service spend', value: money(ledger.summary.service.total_service_cost) },
                { label: 'Work orders', value: String(ledger.summary.service.completed_work_orders) },
                { label: 'Labour hours', value: Number(ledger.summary.service.total_labour_hours).toLocaleString() },
              ].map((stat) => (
                <Box key={stat.label} sx={{ p: 1.4, borderRadius: '14px', backgroundColor: '#FAFAFB', border: `1px solid ${palette.surfaceMuted}` }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 800, color: palette.textFaint, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    {stat.label}
                  </Typography>
                  <Typography sx={{ fontWeight: 900, color: INK, fontSize: 15 }}>{stat.value}</Typography>
                </Box>
              ))}
            </Box>

            <Box sx={{ px: 2.25, pb: 2 }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 800, color: palette.textSubtle }}>
                  {Math.round(dep.percent_depreciated)}% depreciated
                </Typography>
                {dep.is_fully_depreciated && (
                  <Chip
                    label="Fully depreciated" size="small"
                    sx={{ height: 20, fontSize: 10, fontWeight: 800, borderRadius: '6px', backgroundColor: palette.dangerTint, color: palette.danger }}
                  />
                )}
                {ledger.summary.disposed_on && (
                  <Chip
                    label={`Disposed ${ledger.summary.disposed_on}`} size="small"
                    sx={{ height: 20, fontSize: 10, fontWeight: 800, borderRadius: '6px', backgroundColor: palette.surfaceMuted, color: palette.slate600 }}
                  />
                )}
                <Box sx={{ flex: 1 }} />
                {ledger.summary.service_cost_as_percent_of_cost != null && (
                  <Tooltip title="Cumulative repair cost against what the asset cost. Approaching 100% is a replacement argument.">
                    <Chip
                      label={`Spend ${ledger.summary.service_cost_as_percent_of_cost}% of cost`}
                      size="small"
                      sx={{
                        height: 22, fontSize: 11, fontWeight: 800, borderRadius: '7px',
                        backgroundColor: ledger.summary.service_cost_as_percent_of_cost > 60 ? palette.dangerTint : palette.brandTint,
                        color: ledger.summary.service_cost_as_percent_of_cost > 60 ? palette.danger : palette.brandDeep,
                      }}
                    />
                  </Tooltip>
                )}
              </Stack>
              <LinearProgress
                variant="determinate"
                value={Math.min(100, dep.percent_depreciated)}
                sx={{
                  height: 8, borderRadius: 4, backgroundColor: palette.surfaceMuted,
                  '& .MuiLinearProgress-bar': { backgroundColor: dep.is_fully_depreciated ? palette.danger : BRAND, borderRadius: 4 },
                }}
              />
            </Box>

            <Tabs
              value={tab} onChange={(_, v) => setTab(v)}
              sx={{ px: 2, borderBottom: `1px solid ${palette.borderSoft}`, '& .MuiTab-root': { fontWeight: 800, textTransform: 'none' }, '& .Mui-selected': { color: `${BRAND} !important` }, '& .MuiTabs-indicator': { backgroundColor: BRAND } }}
            >
              <Tab label={`History (${ledger.timeline.length})`} />
              <Tab label="Depreciation schedule" />
              <Tab label={`Ledger entries (${ledger.entries.length})`} />
            </Tabs>

            {tab === 0 && <Timeline events={ledger.timeline} />}

            {tab === 1 && (
              <>
              {selectedAsset && (
                <DepreciationSettings
                  equipmentId={selectedAsset.id}
                  canEdit={canEdit}
                  current={{
                    cost: selectedAsset.cost ?? dep?.cost ?? null,
                    salvage_value: selectedAsset.salvage_value ?? dep?.salvage_value ?? null,
                    useful_life_years: selectedAsset.useful_life_years ?? dep?.useful_life_years ?? null,
                    depreciation_method: selectedAsset.depreciation_method ?? dep?.method ?? null,
                    total_expected_units: selectedAsset.total_expected_units ?? null,
                    installation_date: selectedAsset.installation_date ?? null,
                    acquisition_date: selectedAsset.acquisition_date ?? null,
                  }}
                />
              )}
              <TableContainer sx={{ maxHeight: 460 }}>
                <Table stickyHeader size="small" sx={{ '& .MuiTableCell-root': { py: 1.1 } }}>
                  <TableHead>
                    <TableRow>
                      {['Year', 'Opening', 'Depreciation', 'Accumulated', 'Closing', ''].map((h) => (
                        <TableCell key={h} sx={{ fontWeight: 900, color: palette.textSubtle, fontSize: 12, backgroundColor: '#FCFCFD' }}>
                          {h}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {!dep.schedule.length && (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ py: 4, color: palette.textFaint, fontWeight: 700 }}>
                          {dep.message || 'No schedule.'}
                        </TableCell>
                      </TableRow>
                    )}
                    {dep.schedule.map((row) => (
                      <TableRow key={row.year} hover>
                        <TableCell sx={{ fontWeight: 900, color: INK, fontSize: 13 }}>{row.year}</TableCell>
                        <TableCell sx={{ fontSize: 12, color: palette.slate600 }}>{money(row.opening_book_value)}</TableCell>
                        <TableCell sx={{ fontSize: 12, color: '#C2410C', fontWeight: 800 }}>{money(row.depreciation)}</TableCell>
                        <TableCell sx={{ fontSize: 12, color: palette.slate600 }}>{money(row.accumulated)}</TableCell>
                        <TableCell sx={{ fontSize: 12, color: palette.success, fontWeight: 800 }}>{money(row.closing_book_value)}</TableCell>
                        <TableCell sx={{ fontSize: 11, color: palette.brandDeep, fontWeight: 700 }}>
                          {Number(row.basis_change) !== 0 && `${money(row.basis_change)} · `}{row.note}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              </>
            )}

            {tab === 2 && (
              <TableContainer sx={{ maxHeight: 460 }}>
                <Table stickyHeader size="small" sx={{ '& .MuiTableCell-root': { py: 1.1 } }}>
                  <TableHead>
                    <TableRow>
                      {['Date', 'Type', 'Description', 'Amount', ''].map((h) => (
                        <TableCell key={h} sx={{ fontWeight: 900, color: palette.textSubtle, fontSize: 12, backgroundColor: '#FCFCFD' }}>
                          {h}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {!ledger.entries.length && (
                      <TableRow>
                        <TableCell colSpan={5} align="center" sx={{ py: 4, color: palette.textFaint, fontWeight: 700 }}>
                          No financial or custody entries posted.
                        </TableCell>
                      </TableRow>
                    )}
                    {ledger.entries.map((entry) => (
                      <TableRow key={entry.id} hover sx={{ opacity: entry.is_reversed ? 0.5 : 1 }}>
                        <TableCell sx={{ fontSize: 12, fontWeight: 800, color: palette.slate600 }}>
                          {entry.effective_date}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={humanise(entry.entry_type)} size="small"
                            sx={{ height: 21, fontWeight: 800, fontSize: 10, borderRadius: '6px', backgroundColor: palette.brandTint, color: palette.brandDeep }}
                          />
                        </TableCell>
                        <TableCell sx={{ fontSize: 12, color: INK, fontWeight: 700 }}>
                          {entry.description}
                          {entry.is_reversed && (
                            <Typography component="span" sx={{ fontSize: 11, color: palette.danger, ml: 0.75 }}>
                              (reversed)
                            </Typography>
                          )}
                          {entry.gain_loss != null && (
                            <Typography sx={{ fontSize: 11, color: Number(entry.gain_loss) >= 0 ? palette.success : palette.danger }}>
                              {Number(entry.gain_loss) >= 0 ? 'Gain' : 'Loss'} {money(Math.abs(Number(entry.gain_loss)))}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ fontSize: 12, fontWeight: 800, color: palette.slate600 }}>
                          {money(entry.amount)}
                        </TableCell>
                        <TableCell align="right">
                          {canEdit && !entry.is_reversed && entry.entry_type !== 'reversal' && (
                            <Button
                              size="small" startIcon={<UndoIcon sx={{ fontSize: 15 }} />}
                              onClick={() => {
                                const reason = window.prompt('Why is this entry being reversed?')
                                if (reason) reverseMutation.mutate({ id: entry.id, reason })
                              }}
                              sx={{ fontWeight: 800, color: palette.textFaint, textTransform: 'none' }}
                            >
                              Reverse
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </>
        )}
      </Card>

      <PostEntryDialog
        open={addOpen} onClose={() => setAddOpen(false)}
        equipmentId={assetId} meta={meta}
        onPosted={() => {
          queryClient.invalidateQueries({ queryKey: ['asset-ledger'] })
          queryClient.invalidateQueries({ queryKey: ['fleet-valuation'] })
          setAddOpen(false)
        }}
      />
    </Box>
  )
}

function Timeline({ events }: { events: TimelineEvent[] }) {
  if (!events.length) {
    return (
      <Box sx={{ p: 4, textAlign: 'center', color: palette.textFaint, fontWeight: 700 }}>
        Nothing recorded against this asset yet.
      </Box>
    )
  }

  return (
    <Box sx={{ maxHeight: 460, overflowY: 'auto', p: 2 }}>
      {events.map((event, index) => {
        const style = KIND_STYLE[event.kind] || KIND_STYLE.financial
        return (
          <Stack
            key={`${event.source}-${event.source_id}-${index}`}
            direction="row" spacing={1.5}
            sx={{ position: 'relative', pb: 2 }}
          >
            {/* The connecting rail, omitted on the last row so it does not
                dangle past the final event. */}
            {index < events.length - 1 && (
              <Box sx={{ position: 'absolute', left: 15, top: 30, bottom: 0, width: '2px', backgroundColor: palette.surfaceMuted }} />
            )}
            <Box sx={{
              width: 32, height: 32, borderRadius: '10px', flexShrink: 0,
              display: 'grid', placeItems: 'center', zIndex: 1,
              backgroundColor: style.bg, color: style.color,
            }}>
              {style.icon}
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Stack direction="row" spacing={1} alignItems="baseline" sx={{ flexWrap: 'wrap' }}>
                <Typography sx={{ fontWeight: 800, color: INK, fontSize: 13 }}>
                  {event.title}
                </Typography>
                {event.outcome && (
                  <Chip
                    label={humanise(event.outcome)} size="small"
                    sx={{ height: 18, fontSize: 10, fontWeight: 800, borderRadius: '5px', backgroundColor: style.bg, color: style.color }}
                  />
                )}
                <Box sx={{ flex: 1 }} />
                {event.amount != null && (
                  <Typography sx={{ fontSize: 12, fontWeight: 900, color: palette.slate600 }}>
                    {money(event.amount)}
                  </Typography>
                )}
                <Typography sx={{ fontSize: 11, fontWeight: 700, color: palette.textFaint, whiteSpace: 'nowrap' }}>
                  {event.occurred_on || 'undated'}
                </Typography>
              </Stack>
              {event.detail && (
                <Typography sx={{ fontSize: 12, color: palette.textMuted }}>{event.detail}</Typography>
              )}
              {event.reference && (
                <Typography sx={{ fontSize: 11, color: palette.textFaint }}>{event.reference}</Typography>
              )}
            </Box>
          </Stack>
        )
      })}
    </Box>
  )
}

function PostEntryDialog({ open, onClose, equipmentId, meta, onPosted }: {
  open: boolean
  onClose: () => void
  equipmentId: number | null
  meta: any
  onPosted: () => void
}) {
  const [form, setForm] = useState({
    entry_type: 'improvement',
    effective_date: new Date().toISOString().slice(0, 10),
    description: '',
    amount: '',
    proceeds: '',
    extends_useful_life_years: '',
    reference: '',
  })

  const isDisposal = form.entry_type === 'disposal' || form.entry_type === 'write_off'
  const isImprovement = ['improvement', 'revaluation', 'impairment'].includes(form.entry_type)

  const mutation = useMutation({
    mutationFn: () => createLedgerEntry({
      equipment_id: equipmentId as number,
      entry_type: form.entry_type,
      effective_date: form.effective_date,
      description: form.description.trim(),
      amount: form.amount ? Number(form.amount) : null,
      proceeds: form.proceeds ? Number(form.proceeds) : null,
      extends_useful_life_years: form.extends_useful_life_years
        ? Number(form.extends_useful_life_years) : null,
      reference: form.reference || null,
    }),
    onSuccess: () => { toast.success('Entry posted'); onPosted() },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Could not post the entry'),
  })

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: '20px' } }}>
      <DialogTitle sx={{ fontWeight: 900, color: INK }}>Post a ledger entry</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField
            select size="small" label="Type" fullWidth value={form.entry_type}
            onChange={(e) => setForm({ ...form, entry_type: e.target.value })}
          >
            {(meta?.entry_types || [])
              .filter((t: any) => t.value !== 'reversal')
              .map((t: any) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
          </TextField>

          <TextField
            size="small" type="date" label="Effective date" fullWidth
            InputLabelProps={{ shrink: true }}
            value={form.effective_date}
            onChange={(e) => setForm({ ...form, effective_date: e.target.value })}
            helperText="When it happened, not when it was recorded"
          />

          <TextField
            size="small" label="Description" fullWidth required value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />

          {isImprovement && (
            <>
              <TextField
                size="small" type="number" label="Amount" fullWidth value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                helperText="Positive adds to the basis, negative reduces it"
              />
              <TextField
                size="small" type="number" label="Extends useful life (years)" fullWidth
                value={form.extends_useful_life_years}
                onChange={(e) => setForm({ ...form, extends_useful_life_years: e.target.value })}
                helperText="A re-roof or a lift modernisation buys more life"
              />
            </>
          )}

          {isDisposal && (
            <>
              <TextField
                size="small" type="number" label="Proceeds" fullWidth value={form.proceeds}
                onChange={(e) => setForm({ ...form, proceeds: e.target.value })}
                helperText="Gain or loss is calculated against book value on that date"
              />
              <Alert severity="warning" sx={{ borderRadius: '12px', fontSize: 13 }}>
                This retires the asset and stops depreciation from the effective date.
              </Alert>
            </>
          )}

          <TextField
            size="small" label="Reference" fullWidth value={form.reference}
            onChange={(e) => setForm({ ...form, reference: e.target.value })}
            helperText="PO, invoice, or disposal certificate"
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} sx={{ fontWeight: 800, color: palette.textMuted }}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!form.description.trim() || !equipmentId || mutation.isPending}
          onClick={() => mutation.mutate()}
          sx={{ background: palette.gradientBrand, borderRadius: '10px', fontWeight: 900, px: 2.5 }}
        >
          Post
        </Button>
      </DialogActions>
    </Dialog>
  )
}
