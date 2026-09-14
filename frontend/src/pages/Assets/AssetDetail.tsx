/**
 * Everything about one machine, and the two things you actually do to it:
 * book it in for service, or put it on a schedule.
 *
 * Both used to be unreachable. Raising a job meant finding the asset again in
 * a different screen; scheduling an inspection meant the Maintenance Plans
 * page and picking the asset from a dropdown. Neither is how anybody thinks
 * about it — you are looking at the X-ray in Radiology 1 and you want *this
 * one* inspected.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, MenuItem, Stack, Switch, FormControlLabel, Tab, Tabs,
  TextField, Tooltip, Typography,
} from '@mui/material'
import BuildIcon from '@mui/icons-material/Build'
import EventRepeatIcon from '@mui/icons-material/EventRepeat'
import OpenWithIcon from '@mui/icons-material/OpenWith'
import { toast } from 'react-toastify'
import { fetchAssetLedger } from '@/api/assetLedger'
import { fetchTechnicianCandidates } from '@/api/disciplines'
import { createSchedule, fetchSchedules } from '@/api/maintenance'
import { createServiceRequest, fetchServiceRequests } from '@/api/serviceRequests'
import { palette } from '@/theme/palette'
import { assetTitle } from './assetTitle'
import { MoveAssetDialog, ServesPanel } from './AssetPlacement'

const humanise = (v?: string | null) =>
  (v || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

const money = (v?: string | number | null) =>
  v == null ? '—' : `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

export default function AssetDetail({ asset, tradeName, placeName, canEdit }: {
  asset: any
  tradeName: Record<number, string>
  placeName: Record<number, string>
  canEdit: boolean
}) {
  const [tab, setTab] = useState(0)
  const [serviceOpen, setServiceOpen] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)

  const { data: schedules } = useQuery({
    queryKey: ['schedules', 'asset', asset.id],
    queryFn: () => fetchSchedules({ equipment_id: asset.id, limit: 100 }),
  })
  const { data: history } = useQuery({
    queryKey: ['service-requests', 'asset', asset.id],
    queryFn: () => fetchServiceRequests({ equipment_id: asset.id, limit: 100 }),
  })
  const { data: ledger } = useQuery({
    queryKey: ['asset-ledger', asset.id],
    queryFn: () => fetchAssetLedger(asset.id),
    enabled: tab === 3,
  })

  const plans = schedules?.items ?? []
  const jobs = (history as any)?.items ?? []
  const openJobs = jobs.filter((j: any) =>
    !['completed', 'cancelled'].includes(String(j.status).toLowerCase()))

  return (
    <Box sx={{ border: `1px solid ${palette.borderSoft}`, borderRadius: '18px',
               bgcolor: palette.white, overflow: 'hidden' }}>
      <Box sx={{ p: 2.25, pb: 1.5 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}
               sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 900, color: palette.ink, fontSize: 20 }}>
              {asset.asset_tag}
            </Typography>
            <Typography sx={{ color: palette.textMuted, fontWeight: 700, fontSize: 13.5 }}>
              {assetTitle(asset)}
              {asset.serial_number ? ` · ${asset.serial_number}` : ''}
            </Typography>
            <Typography sx={{ color: palette.textFaint, fontSize: 12.5, fontWeight: 600 }}>
              {tradeName[asset.discipline_id] || 'Clinical equipment'}
              {asset.location_id && placeName[asset.location_id]
                ? ` · ${placeName[asset.location_id]}`
                : asset.location ? ` · ${asset.location}` : ''}
            </Typography>
          </Box>

          {canEdit && (
            <Stack direction="row" spacing={1}>
              <Button
                size="small" variant="contained" startIcon={<BuildIcon />}
                onClick={() => setServiceOpen(true)}
                sx={{ fontWeight: 900, borderRadius: '10px', bgcolor: palette.brand,
                      '&:hover': { bgcolor: palette.brandDeep } }}
              >
                Book service
              </Button>
              <Button
                size="small" variant="outlined" startIcon={<EventRepeatIcon />}
                onClick={() => setPlanOpen(true)}
                sx={{ fontWeight: 900, borderRadius: '10px', color: palette.brand,
                      borderColor: palette.brandBorder }}
              >
                Schedule inspection
              </Button>
              <Button
                size="small" variant="outlined" startIcon={<OpenWithIcon />}
                onClick={() => setMoveOpen(true)}
                sx={{ fontWeight: 900, borderRadius: '10px', color: palette.brand,
                      borderColor: palette.brandBorder }}
              >
                Move
              </Button>
            </Stack>
          )}
        </Stack>

        {openJobs.length > 0 && (
          <Chip
            size="small" label={`${openJobs.length} open ${openJobs.length === 1 ? 'job' : 'jobs'}`}
            sx={{ mt: 1.25, height: 22, fontWeight: 800, fontSize: 11,
                  bgcolor: palette.warningTint, color: palette.warningDeep }}
          />
        )}
      </Box>

      <Tabs
        value={tab} onChange={(_, v) => setTab(v)}
        sx={{ px: 2, borderBottom: `1px solid ${palette.borderSoft}`,
              '& .MuiTab-root': { fontWeight: 800, textTransform: 'none' },
              '& .Mui-selected': { color: `${palette.brand} !important` },
              '& .MuiTabs-indicator': { backgroundColor: palette.brand } }}
      >
        <Tab label="Overview" />
        <Tab label={`Inspections & plans (${plans.length})`} />
        <Tab label={`Service history (${jobs.length})`} />
        <Tab label="Value" />
      </Tabs>

      {tab === 0 && (
        <Box sx={{ p: 2.25, display: 'grid', gap: 1.5,
                   gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
          {[
            { label: 'Status', value: humanise(asset.status), hint: 'Whether it is in service.' },
            { label: 'How critical', value: humanise(asset.criticality) || 'Not set',
              hint: 'The most critical of where it is and what it serves, unless set. Drives how fast a fault is answered.' },
            { label: 'Installed', value: asset.installation_date || asset.acquisition_date || '—',
              hint: 'When it entered service. Depreciation counts from here.' },
            { label: 'Warranty ends', value: asset.warranty_expiration || '—',
              hint: 'Check before raising a chargeable job.' },
            { label: 'Purchase cost', value: money(asset.cost), hint: 'What it cost to buy and install.' },
            { label: 'Useful life', value: asset.useful_life_years ? `${asset.useful_life_years} years` : '—',
              hint: 'Seeded from the trade, editable on the Value tab.' },
            { label: 'Power branch', value: humanise(asset.electrical_branch) || '—',
              hint: 'Which NFPA 99 branch feeds it.' },
            { label: 'Last serviced', value: asset.last_pm_date || '—', hint: 'Most recent completed maintenance.' },
          ].map((f) => (
            <Tooltip key={f.label} title={f.hint} placement="top" arrow>
              <Box sx={{ p: 1.4, borderRadius: '14px', bgcolor: palette.surfaceFaint,
                         border: `1px solid ${palette.surfaceMuted}` }}>
                <Typography sx={{ fontSize: 11, fontWeight: 800, color: palette.textFaint,
                                  textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  {f.label}
                </Typography>
                <Typography sx={{ fontWeight: 900, color: palette.ink, fontSize: 15 }}>
                  {f.value}
                </Typography>
              </Box>
            </Tooltip>
          ))}
        </Box>
      )}
      {/* Room items sit in a room; plant and clinical equipment also supply spaces. */}
      {tab === 0 && !asset.asset_type && <ServesPanel asset={asset} canEdit={canEdit} />}

      {tab === 1 && (
        <Box sx={{ p: 2.25 }}>
          {!plans.length && (
            <Empty
              title="No maintenance or inspection scheduled"
              body="Schedule inspection puts this asset on a recurring plan — every 90 days, every 8,000 running hours, or both. The scheduler raises the work order when it falls due, so nobody has to remember."
            />
          )}
          {plans.map((s: any) => (
            <Row key={s.id}
                 title={s.name}
                 sub={`${humanise(s.basis)}${s.interval_days ? ` · every ${s.interval_days} days` : ''}${s.interval_runtime_hours ? ` · every ${s.interval_runtime_hours} hrs` : ''}`}
                 right={s.next_due_date ? `Due ${s.next_due_date}` : humanise(s.status)} />
          ))}
        </Box>
      )}

      {tab === 2 && (
        <Box sx={{ p: 2.25 }}>
          {!jobs.length && (
            <Empty
              title="Nothing has been done to this asset yet"
              body="Every job raised against it appears here, with who did it and what it cost."
            />
          )}
          {jobs.map((j: any) => (
            <Row key={j.id}
                 title={j.request_number}
                 sub={j.problem_description}
                 right={humanise(j.status)} />
          ))}
        </Box>
      )}

      {tab === 3 && (
        <Box sx={{ p: 2.25 }}>
          {!ledger && <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress size={22} /></Box>}
          {ledger && (
            <Box sx={{ display: 'grid', gap: 1.5,
                       gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
              {[
                { label: 'Cost', value: money(ledger.summary.depreciation?.cost) },
                { label: 'Book value', value: money(ledger.summary.depreciation?.net_book_value) },
                { label: 'Method', value: humanise(ledger.summary.depreciation?.method) },
                { label: 'Spent on service', value: money(ledger.summary.service?.total_service_cost) },
              ].map((f) => (
                <Box key={f.label} sx={{ p: 1.4, borderRadius: '14px', bgcolor: palette.surfaceFaint,
                                         border: `1px solid ${palette.surfaceMuted}` }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 800, color: palette.textFaint,
                                    textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    {f.label}
                  </Typography>
                  <Typography sx={{ fontWeight: 900, color: palette.ink, fontSize: 15 }}>
                    {f.value}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
          <Typography sx={{ mt: 2, fontSize: 12.5, color: palette.textMuted, fontWeight: 600 }}>
            The full ledger, depreciation schedule and settings are on Assets &amp; Value.
          </Typography>
        </Box>
      )}

      {serviceOpen && (
        <BookServiceDialog asset={asset} onClose={() => setServiceOpen(false)} />
      )}
      {planOpen && (
        <SchedulePlanDialog asset={asset} onClose={() => setPlanOpen(false)} />
      )}
      {moveOpen && <MoveAssetDialog asset={asset} onClose={() => setMoveOpen(false)} />}
    </Box>
  )
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <Box sx={{ py: 4, textAlign: 'center' }}>
      <Typography sx={{ fontWeight: 800, color: palette.textMuted }}>{title}</Typography>
      <Typography sx={{ mt: 0.5, fontSize: 13, color: palette.textFaint, maxWidth: 460, mx: 'auto' }}>
        {body}
      </Typography>
    </Box>
  )
}

function Row({ title, sub, right }: { title: string; sub?: string; right?: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, p: 1.35, mb: 1,
               borderRadius: '12px', border: `1px solid ${palette.borderSoft}` }}>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontWeight: 900, color: palette.ink, fontSize: 13.5 }}>{title}</Typography>
        {sub && (
          <Typography noWrap sx={{ fontSize: 12.5, color: palette.textMuted, fontWeight: 600 }}>
            {sub}
          </Typography>
        )}
      </Box>
      {right && (
        <Chip size="small" label={right}
              sx={{ height: 20, fontSize: 10.5, fontWeight: 800,
                    bgcolor: palette.surfaceMuted, color: palette.textSubtle }} />
      )}
    </Box>
  )
}

/** Book this machine in for service, and hand it to somebody. */
function BookServiceDialog({ asset, onClose }: { asset: any; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [technicianId, setTechnicianId] = useState<number | ''>('')

  // Qualified for this trade first, then whoever is least buried.
  const { data: technicians } = useQuery({
    queryKey: ['technicians', asset.facility_id, asset.discipline_id],
    queryFn: () => fetchTechnicianCandidates({
      facility_id: asset.facility_id,
      discipline_id: asset.discipline_id ?? undefined,
    }),
    enabled: !!asset.facility_id,
  })

  const submit = useMutation({
    mutationFn: async () => {
      const created = await createServiceRequest({
        facility_id: asset.facility_id,
        equipment_id: asset.id,
        location_id: asset.location_id ?? null,
        discipline_id: asset.discipline_id ?? null,
        work_order_type: 'corrective',
        problem_description: description,
        service_required: description,
        priority: priority as any,
      })
      if (technicianId !== '') {
        const { updateServiceRequest } = await import('@/api/serviceRequests')
        await updateServiceRequest(created.id, {
          assigned_technician_id: technicianId as number,
          status: 'assigned' as any,
        })
      }
      return created
    },
    onSuccess: (created) => {
      toast.success(`${created.request_number} raised`)
      queryClient.invalidateQueries({ queryKey: ['service-requests'] })
      onClose()
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Could not raise the job'),
  })

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth
            PaperProps={{ sx: { borderRadius: '18px' } }}>
      <DialogTitle sx={{ fontWeight: 900, color: palette.ink, pb: 0.5 }}>
        Book service · {asset.asset_tag}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gap: 1.75, mt: 0.5 }}>
          <TextField
            autoFocus fullWidth size="small" multiline minRows={3}
            label="What needs doing?" value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Annual inspection, or describe the fault"
          />
          <TextField select size="small" label="Priority" value={priority}
                     onChange={(e) => setPriority(e.target.value)}>
            {['low', 'medium', 'high', 'critical'].map((p) => (
              <MenuItem key={p} value={p} sx={{ textTransform: 'capitalize' }}>{p}</MenuItem>
            ))}
          </TextField>
          <TextField
            select size="small" label="Assign to" value={technicianId}
            onChange={(e) => setTechnicianId(e.target.value === '' ? '' : Number(e.target.value))}
            helperText="Qualified for this trade first, then least busy"
          >
            <MenuItem value="">Leave unassigned</MenuItem>
            {(technicians ?? []).map((t) => (
              <MenuItem key={t.id} value={t.id}>
                {t.full_name}
                {t.is_primary_discipline ? ' · primary trade' : t.holds_discipline ? ' · qualified' : ''}
                {` · ${t.open_work_orders} open`}
              </MenuItem>
            ))}
          </TextField>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} sx={{ fontWeight: 800, color: palette.textMuted }}>Cancel</Button>
        <Button
          variant="contained" disabled={description.trim().length < 3 || submit.isPending}
          onClick={() => submit.mutate()}
          sx={{ fontWeight: 900, borderRadius: '10px', bgcolor: palette.brand,
                '&:hover': { bgcolor: palette.brandDeep } }}
        >
          {submit.isPending ? 'Raising…' : 'Raise job'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/** Put it on a recurring plan so nobody has to remember. */
function SchedulePlanDialog({ asset, onClose }: { asset: any; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [task, setTask] = useState('')
  const [basis, setBasis] = useState('calendar')
  const [intervalDays, setIntervalDays] = useState('365')
  const [runtimeHours, setRuntimeHours] = useState('')
  const [priority, setPriority] = useState('medium')
  const [outOfService, setOutOfService] = useState(false)
  const [technicianId, setTechnicianId] = useState<number | ''>('')

  const { data: technicians } = useQuery({
    queryKey: ['technicians', asset.facility_id, asset.discipline_id],
    queryFn: () => fetchTechnicianCandidates({
      facility_id: asset.facility_id,
      discipline_id: asset.discipline_id ?? undefined,
    }),
    enabled: !!asset.facility_id,
  })

  const usesRuntime = basis !== 'calendar'
  const usesCalendar = basis !== 'runtime_hours'

  const submit = useMutation({
    mutationFn: () => createSchedule({
      facility_id: asset.facility_id,
      equipment_id: asset.id,
      location_id: asset.location_id ?? null,
      discipline_id: asset.discipline_id ?? null,
      name,
      task_description: task || null,
      basis,
      interval_days: usesCalendar && intervalDays ? Number(intervalDays) : null,
      interval_runtime_hours: usesRuntime && runtimeHours ? Number(runtimeHours) : null,
      priority,
      lead_time_days: 7,
      assigned_technician_id: technicianId === '' ? null : (technicianId as number),
      takes_space_out_of_service: outOfService,
    }),
    onSuccess: () => {
      toast.success('Scheduled')
      queryClient.invalidateQueries({ queryKey: ['schedules'] })
      onClose()
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Could not schedule'),
  })

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth
            PaperProps={{ sx: { borderRadius: '18px' } }}>
      <DialogTitle sx={{ fontWeight: 900, color: palette.ink, pb: 0.5 }}>
        Schedule inspection · {asset.asset_tag}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gap: 1.75, mt: 0.5 }}>
          <TextField
            autoFocus size="small" label="What is this plan called" value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Annual inspection and certification"
          />
          <TextField
            size="small" label="What the technician does" value={task} multiline minRows={2}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Full load test, safety circuit check, log readings"
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField select size="small" label="Falls due by" value={basis}
                       onChange={(e) => setBasis(e.target.value)} fullWidth>
              <MenuItem value="calendar">Calendar</MenuItem>
              <MenuItem value="runtime_hours">Running hours</MenuItem>
              <MenuItem value="calendar_or_runtime">Whichever comes first</MenuItem>
            </TextField>
            {usesCalendar && (
              <TextField size="small" type="number" label="Every (days)" value={intervalDays}
                         onChange={(e) => setIntervalDays(e.target.value)} sx={{ width: 160 }} />
            )}
            {usesRuntime && (
              <TextField size="small" type="number" label="Every (hours)" value={runtimeHours}
                         onChange={(e) => setRuntimeHours(e.target.value)} sx={{ width: 160 }} />
            )}
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField select size="small" label="Priority" value={priority}
                       onChange={(e) => setPriority(e.target.value)} sx={{ width: 160 }}>
              {['low', 'medium', 'high', 'critical'].map((p) => (
                <MenuItem key={p} value={p} sx={{ textTransform: 'capitalize' }}>{p}</MenuItem>
              ))}
            </TextField>
            <TextField
              select size="small" label="Usually done by" value={technicianId} fullWidth
              onChange={(e) => setTechnicianId(e.target.value === '' ? '' : Number(e.target.value))}
            >
              <MenuItem value="">Decide when it falls due</MenuItem>
              {(technicians ?? []).map((t) => (
                <MenuItem key={t.id} value={t.id}>{t.full_name}</MenuItem>
              ))}
            </TextField>
          </Stack>
          <FormControlLabel
            control={<Switch size="small" checked={outOfService}
                             onChange={(e) => setOutOfService(e.target.checked)} />}
            label={
              <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
                This takes the room out of service while it runs
              </Typography>
            }
          />
          <Divider />
          <Typography sx={{ fontSize: 12.5, color: palette.textMuted, fontWeight: 600 }}>
            The scheduler raises the work order when it falls due, a week ahead, and
            will not raise a second one while the first is still open.
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} sx={{ fontWeight: 800, color: palette.textMuted }}>Cancel</Button>
        <Button
          variant="contained" disabled={!name.trim() || submit.isPending}
          onClick={() => submit.mutate()}
          sx={{ fontWeight: 900, borderRadius: '10px', bgcolor: palette.brand,
                '&:hover': { bgcolor: palette.brandDeep } }}
        >
          {submit.isPending ? 'Saving…' : 'Schedule it'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
