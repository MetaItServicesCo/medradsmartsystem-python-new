/**
 * Recurring maintenance plans and the work orders they raise.
 *
 * Generation is deliberately a visible button as well as a nightly job, so
 * that a planner can see exactly what a run produced. It is idempotent — a
 * schedule with work already open generates nothing — which is what keeps the
 * PM backlog real rather than a pile of duplicates nobody works.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, MenuItem, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import BoltIcon from '@mui/icons-material/Bolt'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import ScheduleIcon from '@mui/icons-material/Schedule'
import { toast } from 'react-toastify'

import { fetchDisciplines } from '@/api/disciplines'
import { fetchEquipment } from '@/api/equipment'
import { fetchFacilities } from '@/api/facilities'
import {
  createSchedule, fetchForecast, fetchMaintenanceMeta, fetchSchedules,
  generateWorkOrders, retireSchedule,
} from '@/api/maintenance'
import { hasPermission } from '@/config/permissions'
import { useAuthStore } from '@/stores/authStore'
import { palette } from '@/theme/palette'

const BRAND = palette.brand
const INK = palette.ink

const humanise = (v?: string | null) =>
  v ? v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—'

export default function MaintenancePage() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  const [facilityId, setFacilityId] = useState<number | ''>('')
  const [dueOnly, setDueOnly] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const canEdit = hasPermission(user, 'maintenance', 'edit')

  const { data: facilities } = useQuery({
    queryKey: ['facilities', 'for-maintenance'],
    queryFn: () => fetchFacilities({ limit: 200 }),
  })
  const effectiveFacilityId = facilityId || facilities?.items?.[0]?.id || undefined

  const { data: meta } = useQuery({ queryKey: ['maintenance-meta'], queryFn: fetchMaintenanceMeta })

  const { data: schedules, isLoading } = useQuery({
    queryKey: ['maintenance-schedules', effectiveFacilityId, dueOnly],
    queryFn: () => fetchSchedules({
      facility_id: effectiveFacilityId, due_only: dueOnly, limit: 300,
    }),
    enabled: !!effectiveFacilityId,
  })

  const { data: forecast } = useQuery({
    queryKey: ['maintenance-forecast', effectiveFacilityId],
    queryFn: () => fetchForecast({ facility_id: effectiveFacilityId, days: 90 }),
    enabled: !!effectiveFacilityId,
  })

  const generateMutation = useMutation({
    mutationFn: () => generateWorkOrders(effectiveFacilityId),
    onSuccess: (res) => {
      toast.success(
        res.generated
          ? `${res.generated} work order${res.generated > 1 ? 's' : ''} raised: ${res.request_numbers.join(', ')}`
          : 'Nothing due — everything already has work open or is not yet due',
      )
      queryClient.invalidateQueries({ queryKey: ['maintenance-schedules'] })
      queryClient.invalidateQueries({ queryKey: ['maintenance-forecast'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Could not generate'),
  })

  const retireMutation = useMutation({
    mutationFn: (id: number) => retireSchedule(id),
    onSuccess: () => {
      toast.success('Schedule retired')
      queryClient.invalidateQueries({ queryKey: ['maintenance-schedules'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Could not retire'),
  })

  const dueCount = (schedules?.items || []).filter((s) => s.is_due).length

  return (
    <Box className="page-enter" sx={{ width: '100%', minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between', gap: 1.5, mb: 2.5, flexDirection: { xs: 'column', sm: 'row' } }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" sx={{ fontWeight: 900, color: INK }}>Maintenance Plans</Typography>
          <Typography sx={{ color: palette.textMuted, fontWeight: 700 }}>
            Recurring work, by calendar or by runtime hours
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <TextField
            size="small" select label="Facility" value={effectiveFacilityId || ''}
            onChange={(e) => setFacilityId(Number(e.target.value))} sx={{ minWidth: 190 }}
          >
            {(facilities?.items || []).map((f: any) => (
              <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>
            ))}
          </TextField>
          {canEdit && (
            <>
              <Button
                variant="outlined" startIcon={<PlayArrowIcon />}
                disabled={!effectiveFacilityId || generateMutation.isPending}
                onClick={() => generateMutation.mutate()}
                sx={{ minHeight: 40, borderRadius: '10px', fontWeight: 900, whiteSpace: 'nowrap', borderColor: palette.brandBorder, color: BRAND }}
              >
                Generate due
              </Button>
              <Button
                variant="contained" startIcon={<AddIcon />} onClick={() => setAddOpen(true)}
                disabled={!effectiveFacilityId}
                sx={{ minHeight: 40, background: palette.gradientBrand, borderRadius: '10px', px: 2.25, fontWeight: 900, whiteSpace: 'nowrap' }}
              >
                New plan
              </Button>
            </>
          )}
        </Stack>
      </Box>

      <Stack direction="row" spacing={1.25} sx={{ mb: 2, flexWrap: 'wrap', gap: 1.25 }}>
        {[
          { label: 'Due now', value: dueCount, color: '#C2410C' },
          { label: 'Overdue', value: forecast?.overdue ?? 0, color: palette.danger },
          { label: 'Next 90 days', value: forecast?.scheduled ?? 0, color: palette.info },
          { label: 'Estimated hours', value: forecast?.estimated_hours ?? 0, color: palette.brandDeep },
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

      {!!dueCount && (
        <Alert severity="info" icon={<ScheduleIcon />} sx={{ mb: 2, borderRadius: '14px', fontWeight: 700 }}>
          {dueCount} plan{dueCount > 1 ? 's are' : ' is'} due. Generating raises one work order
          each — running it twice raises nothing extra.
        </Alert>
      )}

      <Card sx={{ overflow: 'hidden', borderRadius: '22px', border: `1px solid ${palette.brandBorder}`, boxShadow: palette.shadowCard }}>
        <Box sx={{ p: 1.75, borderBottom: `1px solid ${palette.borderSoft}`, display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Typography sx={{ fontWeight: 900, color: INK, flex: 1 }}>
            {dueOnly ? 'Plans due now' : 'All plans'}
          </Typography>
          <Button
            size="small" onClick={() => setDueOnly((v) => !v)}
            sx={{ fontWeight: 800, color: BRAND, textTransform: 'none' }}
          >
            {dueOnly ? 'Show all' : 'Only what is due'}
          </Button>
        </Box>

        <TableContainer sx={{ maxHeight: 560 }}>
          <Table stickyHeader size="small" sx={{ '& .MuiTableCell-root': { py: 1.15 } }}>
            <TableHead>
              <TableRow>
                {['Plan', 'Subject', 'Basis', 'Next due', 'State', ''].map((h) => (
                  <TableCell key={h} sx={{ fontWeight: 900, color: palette.textSubtle, fontSize: 12, backgroundColor: '#FCFCFD' }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 5 }}>
                    <CircularProgress size={20} thickness={5} sx={{ color: BRAND }} />
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && !(schedules?.items || []).length && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 5, color: palette.textFaint, fontWeight: 700 }}>
                    No maintenance plans yet.
                  </TableCell>
                </TableRow>
              )}
              {(schedules?.items || []).map((schedule) => (
                <TableRow key={schedule.id} hover>
                  <TableCell>
                    <Typography sx={{ fontWeight: 900, color: INK, fontSize: 13 }}>
                      {schedule.name}
                    </Typography>
                    {schedule.estimated_hours && (
                      <Typography sx={{ fontSize: 11, color: palette.textFaint }}>
                        ~{schedule.estimated_hours} hr
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ fontSize: 12, color: palette.slate600, fontWeight: 700 }}>
                    {schedule.equipment_tag || schedule.location_code || '—'}
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      {schedule.basis !== 'calendar' && (
                        <Tooltip title="Fires on runtime hours, not just dates — a generator that ran hard needs its service early">
                          <BoltIcon sx={{ fontSize: 15, color: palette.warning }} />
                        </Tooltip>
                      )}
                      <Typography sx={{ fontSize: 12, color: palette.slate600, fontWeight: 700 }}>
                        {schedule.interval_days ? `${schedule.interval_days}d` : ''}
                        {schedule.interval_runtime_hours ? ` / ${schedule.interval_runtime_hours}h` : ''}
                      </Typography>
                    </Stack>
                    {schedule.current_runtime_hours != null && (
                      <Typography sx={{ fontSize: 11, color: palette.textFaint }}>
                        now {schedule.current_runtime_hours} h
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ fontSize: 12, color: palette.slate600, fontWeight: 800 }}>
                    {schedule.next_due_date || '—'}
                  </TableCell>
                  <TableCell>
                    {schedule.open_work_order_id ? (
                      <Tooltip title="Work is already open — this plan will not generate again until it closes">
                        <Chip
                          label="Work open" size="small"
                          sx={{ height: 22, fontWeight: 800, fontSize: 10, borderRadius: '7px', backgroundColor: palette.infoTint, color: palette.info }}
                        />
                      </Tooltip>
                    ) : schedule.is_overdue ? (
                      <Chip
                        label="Overdue" size="small"
                        sx={{ height: 22, fontWeight: 800, fontSize: 10, borderRadius: '7px', backgroundColor: palette.dangerTint, color: palette.danger }}
                      />
                    ) : schedule.is_due ? (
                      <Chip
                        label="Due" size="small"
                        sx={{ height: 22, fontWeight: 800, fontSize: 10, borderRadius: '7px', backgroundColor: palette.warningTint, color: palette.warning }}
                      />
                    ) : (
                      <Chip
                        label={humanise(schedule.status)} size="small"
                        sx={{ height: 22, fontWeight: 800, fontSize: 10, borderRadius: '7px', backgroundColor: palette.surfaceMuted, color: palette.slate600 }}
                      />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {canEdit && schedule.status !== 'retired' && (
                      <Button
                        size="small" onClick={() => retireMutation.mutate(schedule.id)}
                        sx={{ fontWeight: 800, color: palette.textFaint, textTransform: 'none' }}
                      >
                        Retire
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <NewPlanDialog
        open={addOpen} onClose={() => setAddOpen(false)}
        facilityId={effectiveFacilityId} meta={meta}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ['maintenance-schedules'] })
          queryClient.invalidateQueries({ queryKey: ['maintenance-forecast'] })
          setAddOpen(false)
        }}
      />
    </Box>
  )
}

function NewPlanDialog({ open, onClose, facilityId, meta, onCreated }: {
  open: boolean
  onClose: () => void
  facilityId?: number
  meta: any
  onCreated: () => void
}) {
  const [form, setForm] = useState({
    name: '', equipment_id: '' as number | '', discipline_id: '' as number | '',
    basis: 'calendar', interval_days: 30, estimated_hours: '', lead_time_days: 7,
    takes_space_out_of_service: false,
  })

  const { data: equipment } = useQuery({
    queryKey: ['equipment', 'for-maintenance', facilityId],
    queryFn: () => fetchEquipment({ facility_id: facilityId, limit: 500 } as any),
    enabled: !!facilityId && open,
  })
  const { data: disciplines } = useQuery({ queryKey: ['disciplines'], queryFn: fetchDisciplines })

  const mutation = useMutation({
    mutationFn: () => createSchedule({
      facility_id: facilityId as number,
      name: form.name.trim(),
      equipment_id: form.equipment_id ? Number(form.equipment_id) : null,
      discipline_id: form.discipline_id ? Number(form.discipline_id) : null,
      basis: form.basis,
      interval_days: form.interval_days || null,
      estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
      lead_time_days: form.lead_time_days,
      takes_space_out_of_service: form.takes_space_out_of_service,
    }),
    onSuccess: () => { toast.success('Plan created'); onCreated() },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Could not create the plan'),
  })

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: '20px' } }}>
      <DialogTitle sx={{ fontWeight: 900, color: INK }}>New maintenance plan</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField
            size="small" label="Name" fullWidth required value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            helperText="Becomes the work order's description"
          />
          <TextField
            select size="small" label="Asset" fullWidth value={form.equipment_id}
            onChange={(e) => setForm({ ...form, equipment_id: Number(e.target.value) })}
          >
            <MenuItem value="">—</MenuItem>
            {((equipment as any)?.items || []).map((item: any) => (
              <MenuItem key={item.id} value={item.id}>
                {item.asset_tag} — {item.make} {item.model}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select size="small" label="Trade" fullWidth value={form.discipline_id}
            onChange={(e) => setForm({ ...form, discipline_id: Number(e.target.value) })}
          >
            <MenuItem value="">—</MenuItem>
            {(disciplines?.items || []).map((d) => (
              <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
            ))}
          </TextField>
          <TextField
            select size="small" label="Basis" fullWidth value={form.basis}
            onChange={(e) => setForm({ ...form, basis: e.target.value })}
          >
            {(meta?.bases || []).map((b: any) => (
              <MenuItem key={b.value} value={b.value}>{b.label}</MenuItem>
            ))}
          </TextField>
          <TextField
            size="small" label="Interval (days)" type="number" fullWidth
            value={form.interval_days}
            onChange={(e) => setForm({ ...form, interval_days: Number(e.target.value) })}
          />
          <TextField
            size="small" label="Lead time (days)" type="number" fullWidth
            value={form.lead_time_days}
            onChange={(e) => setForm({ ...form, lead_time_days: Number(e.target.value) })}
            helperText="Raise the work this far ahead, so a planner has time"
          />
          <TextField
            size="small" label="Estimated hours" type="number" fullWidth
            value={form.estimated_hours}
            onChange={(e) => setForm({ ...form, estimated_hours: e.target.value })}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} sx={{ fontWeight: 800, color: palette.textMuted }}>Cancel</Button>
        <Button
          variant="contained" disabled={!form.name.trim() || !facilityId || mutation.isPending}
          onClick={() => mutation.mutate()}
          sx={{ background: palette.gradientBrand, borderRadius: '10px', fontWeight: 900, px: 2.5 }}
        >
          Create
        </Button>
      </DialogActions>
    </Dialog>
  )
}
