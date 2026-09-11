/**
 * Space availability — the board, and the number it exists to produce.
 *
 * PHI boundary: this screen shows the *state* of a space and never the
 * identity of anyone in it. No name, no record number, no dates of care. See
 * the docstring at the top of backend/app/models/space_status.py before adding
 * a field here.
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, MenuItem, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material'
import EventBusyIcon from '@mui/icons-material/EventBusy'
import HistoryToggleOffIcon from '@mui/icons-material/HistoryToggleOff'
import { toast } from 'react-toastify'

import { useActiveFacility } from '@/hooks/useActiveFacility'
import {
  fetchBoardSummary, fetchDowntimeReport, fetchSpaceMeta, fetchSpaceStatuses,
  fetchStaleSpaces, setSpaceStatus, type SpaceStatus,
} from '@/api/spaces'
import { hasPermission } from '@/config/permissions'
import { useAuthStore } from '@/stores/authStore'
import { palette } from '@/theme/palette'

const BRAND = palette.brand
const INK = palette.ink

const AVAILABILITY_STYLE: Record<string, { bg: string; color: string }> = {
  available: { bg: palette.successTint, color: palette.success },
  vacant_clean: { bg: palette.successTint, color: palette.success },
  occupied: { bg: palette.infoTint, color: palette.info },
  in_procedure: { bg: palette.infoTint, color: palette.info },
  vacant_dirty: { bg: palette.warningTint, color: palette.warning },
  turnover: { bg: palette.warningTint, color: palette.warning },
  terminal_clean: { bg: palette.warningTint, color: palette.warning },
  // Violet, freed up by the brand moving to emerald. Reserved is not available.
  reserved: { bg: palette.violetTint, color: palette.violet },
  blocked: { bg: palette.dangerTint, color: palette.danger },
  out_of_service: { bg: palette.dangerTint, color: palette.danger },
}

const humanise = (value?: string | null) =>
  value ? value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—'

const isoDaysAgo = (days: number) =>
  new Date(Date.now() - days * 86400000).toISOString()

export default function SpacesPage() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  const [windowDays, setWindowDays] = useState(30)
  const [unavailableOnly, setUnavailableOnly] = useState(true)
  const [editing, setEditing] = useState<SpaceStatus | null>(null)

  const canEdit = hasPermission(user, 'spaces', 'edit')

  // The hospital is context, not a question asked on every screen.
  const { facilityId: effectiveFacilityId } = useActiveFacility()

  const { data: summary } = useQuery({
    queryKey: ['space-board', effectiveFacilityId],
    queryFn: () => fetchBoardSummary({ facility_id: effectiveFacilityId }),
    enabled: !!effectiveFacilityId,
  })

  const { data: statuses, isLoading } = useQuery({
    queryKey: ['space-statuses', effectiveFacilityId, unavailableOnly],
    queryFn: () => fetchSpaceStatuses({
      facility_id: effectiveFacilityId,
      unavailable_only: unavailableOnly,
      limit: 300,
    }),
    enabled: !!effectiveFacilityId,
  })

  const { data: stale } = useQuery({
    queryKey: ['stale-spaces', effectiveFacilityId],
    queryFn: () => fetchStaleSpaces({ facility_id: effectiveFacilityId, older_than_hours: 72 }),
    enabled: !!effectiveFacilityId,
  })

  const { data: downtime } = useQuery({
    queryKey: ['downtime', effectiveFacilityId, windowDays],
    queryFn: () => fetchDowntimeReport({
      facility_id: effectiveFacilityId,
      start: isoDaysAgo(windowDays),
      facilities_attributable_only: true,
    }),
    enabled: !!effectiveFacilityId,
  })

  const topReasons = useMemo(() => {
    const entries = Object.entries(downtime?.minutes_by_reason || {})
    return entries.sort((a, b) => b[1] - a[1]).slice(0, 4)
  }, [downtime])

  return (
    <Box className="page-enter" sx={{ width: '100%', minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between', gap: 1.5, mb: 2.5, flexDirection: { xs: 'column', sm: 'row' } }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" sx={{ fontWeight: 900, color: INK }}>Space Status</Typography>
          <Typography sx={{ color: palette.textMuted, fontWeight: 700 }}>
            What is available, what is down, and what that has cost
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <TextField
            size="small" select label="Window" value={windowDays}
            onChange={(e) => setWindowDays(Number(e.target.value))}
            sx={{ minWidth: 130 }}
          >
            <MenuItem value={7}>Last 7 days</MenuItem>
            <MenuItem value={30}>Last 30 days</MenuItem>
            <MenuItem value={90}>Last quarter</MenuItem>
          </TextField>
        </Stack>
      </Box>

      {/* ── The capacity number ──────────────────────────────────────────── */}
      <Card sx={{ borderRadius: '22px', border: `1px solid ${palette.brandBorder}`, boxShadow: palette.shadowCard, mb: 2, overflow: 'hidden' }}>
        <Box sx={{ px: 2.25, py: 1.5, borderBottom: `1px solid ${palette.borderSoft}`, display: 'flex', alignItems: 'center', gap: 1 }}>
          <EventBusyIcon sx={{ color: BRAND, fontSize: 20 }} />
          <Typography sx={{ fontWeight: 900, color: INK }}>Capacity lost to facility failures</Typography>
          <Tooltip title="Counts only causes the plant answers for — maintenance, equipment failure, utility outage and environmental excursions. Capacity lost to staffing or infection control is excluded.">
            <Chip
              label="Facilities-attributable" size="small"
              sx={{ height: 22, fontWeight: 800, fontSize: 11, borderRadius: '7px', backgroundColor: palette.brandTint, color: palette.brandDeep }}
            />
          </Tooltip>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 0 }}>
          {[
            { label: 'Bed-days lost', value: downtime?.bed_days_lost ?? 0, accent: palette.danger },
            { label: 'Procedure-room hours lost', value: downtime?.procedure_room_hours_lost ?? 0, accent: '#C2410C' },
            { label: 'Other space hours', value: downtime?.other_space_hours_lost ?? 0, accent: palette.info },
            { label: 'Incidents', value: downtime?.incidents ?? 0, accent: palette.brandDeep },
          ].map((stat, index) => (
            <Box
              key={stat.label}
              sx={{
                p: 2.25,
                borderRight: { md: index < 3 ? `1px solid ${palette.surfaceMuted}` : 'none' },
                borderBottom: { xs: index < 2 ? `1px solid ${palette.surfaceMuted}` : 'none', md: 'none' },
              }}
            >
              <Typography sx={{ fontSize: 11, fontWeight: 800, color: palette.textFaint, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {stat.label}
              </Typography>
              <Typography sx={{ fontWeight: 900, fontSize: 30, color: stat.accent, lineHeight: 1.2 }}>
                {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
              </Typography>
            </Box>
          ))}
        </Box>

        {!!topReasons.length && (
          <Box sx={{ px: 2.25, py: 1.5, borderTop: `1px solid ${palette.borderSoft}`, backgroundColor: '#FCFCFD' }}>
            <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75 }}>
              {topReasons.map(([reason, minutes]) => (
                <Chip
                  key={reason}
                  label={`${humanise(reason)} · ${(minutes / 60).toFixed(1)} hr`}
                  size="small"
                  sx={{ height: 24, fontWeight: 800, fontSize: 11, borderRadius: '8px', backgroundColor: palette.white, border: `1px solid ${palette.border}`, color: palette.slate600 }}
                />
              ))}
            </Stack>
          </Box>
        )}
      </Card>

      {/* ── Live board ───────────────────────────────────────────────────── */}
      <Stack direction="row" spacing={1.25} sx={{ mb: 2, flexWrap: 'wrap', gap: 1.25 }}>
        {[
          { label: 'Available', value: summary?.available ?? 0, bg: palette.successTint, color: palette.success },
          { label: 'Unavailable', value: summary?.unavailable ?? 0, bg: palette.dangerTint, color: palette.danger },
          { label: 'Tracked spaces', value: summary?.total ?? 0, bg: palette.brandTint, color: palette.brandDeep },
        ].map((tile) => (
          <Card key={tile.label} sx={{ px: 2.25, py: 1.5, borderRadius: '16px', border: `1px solid ${palette.borderSoft}`, boxShadow: 'none', minWidth: 150 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 800, color: palette.textFaint, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              {tile.label}
            </Typography>
            <Typography sx={{ fontWeight: 900, fontSize: 24, color: tile.color }}>
              {tile.value.toLocaleString()}
            </Typography>
          </Card>
        ))}
      </Stack>

      {!!stale?.total && (
        <Alert
          severity="warning" icon={<HistoryToggleOffIcon />}
          sx={{ mb: 2, borderRadius: '14px', fontWeight: 700 }}
        >
          {stale.total} space{stale.total > 1 ? 's have' : ' has'} been down for more than three days.
          A room taken out for a two-hour job and then forgotten quietly corrupts every capacity
          number above until somebody walks past it.
        </Alert>
      )}

      <Card sx={{ borderRadius: '22px', border: `1px solid ${palette.brandBorder}`, boxShadow: palette.shadowCard, overflow: 'hidden' }}>
        <Box sx={{ p: 1.75, borderBottom: `1px solid ${palette.borderSoft}`, display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Typography sx={{ fontWeight: 900, color: INK, flex: 1 }}>
            {unavailableOnly ? 'Spaces currently down' : 'All tracked spaces'}
          </Typography>
          <Button
            size="small" onClick={() => setUnavailableOnly((v) => !v)}
            sx={{ fontWeight: 800, color: BRAND, textTransform: 'none' }}
          >
            {unavailableOnly ? 'Show everything' : 'Only what is down'}
          </Button>
        </Box>

        <TableContainer sx={{ maxHeight: 520 }}>
          <Table stickyHeader size="small" sx={{ '& .MuiTableCell-root': { py: 1.15 } }}>
            <TableHead>
              <TableRow>
                {['Space', 'Use', 'State', 'Reason', 'Down for', 'Work order', ''].map((head) => (
                  <TableCell key={head} sx={{ fontWeight: 900, color: palette.textSubtle, fontSize: 12, backgroundColor: '#FCFCFD' }}>
                    {head}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 5 }}>
                    <CircularProgress size={20} thickness={5} sx={{ color: BRAND }} />
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && !(statuses?.items || []).length && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 5, color: palette.textFaint, fontWeight: 700 }}>
                    {unavailableOnly ? 'Everything is in service.' : 'No spaces are being tracked yet.'}
                  </TableCell>
                </TableRow>
              )}
              {(statuses?.items || []).map((row) => {
                const style = AVAILABILITY_STYLE[row.availability] || AVAILABILITY_STYLE.available
                return (
                  <TableRow key={row.id} hover>
                    <TableCell>
                      <Typography sx={{ fontWeight: 900, color: INK, fontSize: 13 }}>
                        {row.location_code}
                      </Typography>
                      {row.location_name && (
                        <Typography sx={{ fontSize: 12, color: palette.textFaint }}>{row.location_name}</Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: palette.slate600, fontWeight: 700 }}>
                      {humanise(row.space_use)}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={humanise(row.availability)} size="small"
                        sx={{ height: 24, fontWeight: 800, fontSize: 11, borderRadius: '8px', backgroundColor: style.bg, color: style.color }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: palette.slate600, fontWeight: 700 }}>
                      {humanise(row.oos_reason)}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: palette.slate600, fontWeight: 800 }}>
                      {row.hours_in_state != null ? `${row.hours_in_state.toFixed(1)} hr` : '—'}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: palette.slate600, fontWeight: 700 }}>
                      {row.work_order_id ? `#${row.work_order_id}` : '—'}
                    </TableCell>
                    <TableCell align="right">
                      {canEdit && (
                        <Button
                          size="small" onClick={() => setEditing(row)}
                          sx={{ fontWeight: 800, color: BRAND, textTransform: 'none' }}
                        >
                          Change
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <ChangeStatusDialog
        status={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['space-statuses'] })
          queryClient.invalidateQueries({ queryKey: ['space-board'] })
          queryClient.invalidateQueries({ queryKey: ['downtime'] })
          setEditing(null)
        }}
      />
    </Box>
  )
}

function ChangeStatusDialog({ status, onClose, onSaved }: {
  status: SpaceStatus | null
  onClose: () => void
  onSaved: () => void
}) {
  const [availability, setAvailability] = useState('')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')

  // Ask the server which states are legal for *this* space, so the picker
  // cannot offer something that will come back a 400: a bed never enters
  // in-procedure, an operating room never sits vacant-dirty.
  const { data: meta } = useQuery({
    queryKey: ['space-meta', status?.location_id],
    queryFn: () => fetchSpaceMeta(status?.location_id),
    enabled: !!status,
  })

  const options = useMemo(() => {
    const legal = meta?.applicable_availabilities
    if (!legal) return meta?.availabilities || []
    return (meta?.availabilities || []).filter((option) => legal.includes(option.value))
  }, [meta])

  const mutation = useMutation({
    mutationFn: () => setSpaceStatus(status!.location_id, {
      availability: availability || status!.availability,
      oos_reason: availability === 'out_of_service' ? reason : null,
      notes: notes || null,
    }),
    onSuccess: () => { toast.success('Space status updated'); onSaved() },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Could not update status'),
  })

  const needsReason = availability === 'out_of_service'

  return (
    <Dialog
      open={!!status} onClose={onClose} fullWidth maxWidth="xs"
      PaperProps={{ sx: { borderRadius: '20px' } }}
    >
      <DialogTitle sx={{ fontWeight: 900, color: INK }}>
        {status?.location_code}
        <Typography sx={{ fontSize: 13, color: palette.textMuted, fontWeight: 600 }}>
          Currently {humanise(status?.availability)}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField
            select size="small" label="New state" fullWidth
            value={availability} onChange={(e) => setAvailability(e.target.value)}
          >
            {options.map((option) => (
              <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
            ))}
          </TextField>

          {needsReason && (
            <TextField
              select size="small" label="Reason" fullWidth required
              value={reason} onChange={(e) => setReason(e.target.value)}
              helperText="Separates capacity the plant lost from capacity lost elsewhere"
            >
              {(meta?.out_of_service_reasons || []).map((option) => (
                <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
              ))}
            </TextField>
          )}

          <TextField
            size="small" label="Notes" fullWidth multiline rows={2}
            value={notes} onChange={(e) => setNotes(e.target.value)}
            helperText="Facilities notes only — never patient detail"
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} sx={{ fontWeight: 800, color: palette.textMuted }}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!availability || (needsReason && !reason) || mutation.isPending}
          onClick={() => mutation.mutate()}
          sx={{ background: palette.gradientBrand, borderRadius: '10px', fontWeight: 900, px: 2.5 }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  )
}
